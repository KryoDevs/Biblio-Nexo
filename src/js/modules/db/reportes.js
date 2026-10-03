// Dominio REPORTES — las estadísticas del panel principal y el reporte por
// rango de fechas (migración 004). Extraído de js/modules/db.js el 22 de
// agosto de 2026 (división por dominio, ver pendientes-checklist.md). Sin
// cambios de lógica: es el mismo código, solo movido.

import { supabase, conTiempoLimite, ESPERA, hoyEnChile, traerTodasLasFilas } from './compartido.js';

/**
 * Devuelve el desfase horario de Chile para una fecha dada, en formato ±HH:MM.
 * Se calcula por fecha porque Chile cambia entre UTC-4 y UTC-3 con el horario
 * de verano, así que un valor fijo daría resultados incorrectos medio año.
 */
function desfaseChile(fechaISO) {
    const instante = new Date(`${fechaISO}T12:00:00Z`); // mediodía UTC, dentro del día en cualquier caso
    const enUtc = new Date(instante.toLocaleString('en-US', { timeZone: 'UTC' }));
    const enSantiago = new Date(instante.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
    const minutos = Math.round((enSantiago - enUtc) / 60000);
    const signo = minutos <= 0 ? '-' : '+';
    const abs = Math.abs(minutos);
    return `${signo}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export const reportes = {
    async obtenerEstadisticas() {
        try {
            const hoy = hoyEnChile();

            // Los cinco conteos usan { count: 'exact', head: true }: PostgREST hace
            // un COUNT(*) del lado del servidor y no devuelve filas, así que no les
            // aplica el tope de 1000 — el único que sí traía filas de verdad era el
            // de stock, de ahí el bug (ver traerTodasLasFilas en compartido.js).
            const [libros, lectores, activos, devueltos, vencidos] = await conTiempoLimite(Promise.all([
                supabase.from('libros').select('*', { count: 'exact', head: true }),
                supabase.from('lectores').select('*', { count: 'exact', head: true }),
                supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'activo'),
                supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'devuelto'),
                supabase.from('prestamos').select('*', { count: 'exact', head: true }).eq('estado', 'activo').lt('fecha_devolucion_esperada', hoy)
            ]), ESPERA);

            // Aparte, sin envolverla también en el conTiempoLimite de arriba:
            // traerTodasLasFilas pagina sola y ya aplica su propio límite de tiempo
            // por bloque (ESPERA_RESPALDO) — un catálogo que de verdad necesite
            // varias páginas puede tardar, legítimamente, más que ESPERA.
            const stockRows = await traerTodasLasFilas((desde, hasta) =>
                supabase.from('libros').select('stock').range(desde, hasta)
            );
            if (stockRows.error) throw stockRows.error;

            // "En estante" = suma del stock disponible de todos los libros (copias que no están prestadas ahora mismo)
            const enEstante = (stockRows.data || []).reduce((sum, b) => sum + (b.stock || 0), 0);

            // Obtener conteo por parada para el mapa de calor
            const { data: paradasData } = await conTiempoLimite(supabase.rpc('estadisticas_paradas'), ESPERA).catch(() => ({ data: [] }));

            return {
                libros: libros.count || 0,
                lectores: lectores.count || 0,
                prestamos: activos.count || 0,
                devueltos: devueltos.count || 0,
                noDevueltos: vencidos.count || 0,
                enEstante,
                paradas: paradasData || []
            };
        } catch (e) {
            return { libros: 0, lectores: 0, prestamos: 0, devueltos: 0, noDevueltos: 0, enEstante: 0 };
        }
    },

    /**
     * Reúne todo el movimiento de la biblioteca entre dos fechas (inclusive).
     * Ambas en formato 'YYYY-MM-DD'.
     *
     * Requiere la migración 004 (columnas fecha_prestamo y created_at). Si esas
     * columnas no existen todavía, se devuelve un objeto con `faltaMigracion`
     * en vez de lanzar un error, para que la aplicación siga funcionando y
     * pueda explicarle al usuario qué le falta.
     */
    async obtenerReporte(desde, hasta) {
        // Cada una pagina sola en bloques de 1000 (traerTodasLasFilas, en
        // compartido.js): sin esto, un período con más de 1000 préstamos,
        // devoluciones o lectores nuevos —un "Anual" con suficiente movimiento,
        // por ejemplo— devolvía el ranking y los totales truncados en silencio.
        // No se envuelven en un conTiempoLimite extra por fuera: cada bloque ya
        // trae su propio límite de tiempo (ESPERA_RESPALDO), y un período grande
        // que de verdad necesite varias páginas puede tardar más que ESPERA.
        const [prestamosRes, devolucionesRes, lectoresRes] = await Promise.all([
            traerTodasLasFilas((rDesde, rHasta) => supabase.from('prestamos')
                .select('id, fecha_prestamo, fecha_devolucion_esperada, fecha_devolucion_real, estado, libros(id, titulo, autor), libro_titulo_archivado, libro_autor_archivado, lectores(id, nombre, rut)')
                .gte('fecha_prestamo', desde)
                .lte('fecha_prestamo', hasta)
                .range(rDesde, rHasta)),
            traerTodasLasFilas((rDesde, rHasta) => supabase.from('prestamos')
                .select('id, fecha_devolucion_real, fecha_devolucion_esperada, libros(id, titulo)')
                .gte('fecha_devolucion_real', desde)
                .lte('fecha_devolucion_real', hasta)
                .range(rDesde, rHasta)),
            traerTodasLasFilas((rDesde, rHasta) => supabase.from('lectores')
                .select('id, nombre, rut, created_at')
                // Con el desfase explícito, Postgres no tiene que suponer la zona:
                // el rango cubre exactamente los días de Chile solicitados.
                .gte('created_at', `${desde}T00:00:00${desfaseChile(desde)}`)
                .lte('created_at', `${hasta}T23:59:59${desfaseChile(hasta)}`)
                .range(rDesde, rHasta))
        ]);

        // 42703 = columna inexistente en Postgres
        const errores = [prestamosRes.error, devolucionesRes.error, lectoresRes.error].filter(Boolean);
        const faltaColumna = errores.some(e => e.code === '42703' || /column .* does not exist/i.test(e.message || ''));
        if (faltaColumna) {
            return { faltaMigracion: true };
        }
        if (errores.length) throw new Error(errores[0].message || 'No se pudo generar el reporte.');

        // Si el libro se eliminó del catálogo (eliminar_libro(), migración 020),
        // la relación libros(...) vuelve null: se rearma con lo que quedó
        // archivado en el propio préstamo, para que un reporte de un período
        // pasado no muestre una fila vacía donde antes había un título. Así
        // ningún consumidor de `prestamos` (el ranking de abajo, o el CSV en
        // js/vistas/reportes.js) necesita saber que el libro pudo eliminarse.
        const prestamos = (prestamosRes.data || []).map(p => ({
            ...p,
            libros: p.libros || (p.libro_titulo_archivado
                ? { id: null, titulo: p.libro_titulo_archivado, autor: p.libro_autor_archivado }
                : null)
        }));
        const devoluciones = devolucionesRes.data || [];
        const nuevosLectores = lectoresRes.data || [];

        // Devoluciones que llegaron después de la fecha comprometida
        const devolucionesAtrasadas = devoluciones.filter(
            d => d.fecha_devolucion_real && d.fecha_devolucion_esperada &&
                 d.fecha_devolucion_real > d.fecha_devolucion_esperada
        ).length;

        // Rankings: se cuentan en memoria sobre el arreglo ya completo (todas las
        // páginas juntas, no solo la primera) — razonable para el volumen de un
        // período, aunque ya no truncado como antes de paginar arriba.
        const contar = (items, claveFn, etiquetaFn) => {
            const mapa = new Map();
            items.forEach(i => {
                const clave = claveFn(i);
                if (clave === null || clave === undefined) return;
                const actual = mapa.get(clave) || { etiqueta: etiquetaFn(i), total: 0 };
                actual.total++;
                mapa.set(clave, actual);
            });
            return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 5);
        };

        return {
            faltaMigracion: false,
            desde,
            hasta,
            totalPrestamos: prestamos.length,
            totalDevoluciones: devoluciones.length,
            totalNuevosLectores: nuevosLectores.length,
            devolucionesAtrasadas,
            // Si el libro se eliminó, p.libros.id queda en null (ver el mapeo de
            // arriba): se agrupa por título en ese caso, para que dos libros
            // eliminados distintos no se junten bajo la misma clave "null".
            topLibros: contar(prestamos, p => p.libros?.id ?? p.libros?.titulo, p => p.libros?.titulo || 'Sin título'),
            topLectores: contar(prestamos, p => p.lectores?.id, p => p.lectores?.nombre || 'Sin nombre'),
            prestamos,
            nuevosLectores
        };
    }
};
