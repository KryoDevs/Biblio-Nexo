// Dominio PRÉSTAMOS — listado y conteo por vencimiento. El registro,
// devolución y renovación de un préstamo se quedan en js/modules/db.js: usan
// la cola de sincronización sin conexión (SyncQueue) y varias pruebas de
// pruebas/probar-interfaz.mjs esperan encontrar ese código ahí (ver el
// comentario al final de ese archivo, sección "PRÉSTAMOS Y CIRCULACIÓN").
//
// Extraído el 22 de agosto de 2026 (división por dominio, ver
// pendientes-checklist.md). Sin cambios de lógica: es el mismo código, solo
// movido.

import { supabase, conTiempoLimite, ESPERA, hoyEnChile, traerTodasLasFilas } from './compartido.js';

export const prestamos = {
    /**
     * Préstamos activos, filtrados y paginados.
     *
     * El filtro y el conteo se hacen en la base de datos, no en el navegador.
     * Antes se traía todo y se contaba en memoria: Supabase corta en 1000 filas
     * en silencio, así que con muchos préstamos los contadores de "Atrasados" y
     * "Por vencer" mostraban números falsos sin ningún aviso.
     *
     * `filtro` puede ser 'todos', 'vencidos' o 'porVencer'.
     */
    async obtenerTodosActivosSinPaginar() {
        // Sin `.range()`, PostgREST puede truncar al máximo configurado (1000)
        // sin emitir error. El paginador y un desempate estable por id conservan
        // la semántica de "todos" también en bibliotecas con mucho historial.
        const { data, error } = await traerTodasLasFilas((desde, hasta) =>
            supabase
                .from('prestamos')
                .select('id, fecha_prestamo, fecha_devolucion_esperada, libros(titulo), lectores(nombre, rut, telefono)')
                .is('fecha_devolucion_real', null)
                .order('fecha_devolucion_esperada', { ascending: true })
                .order('id', { ascending: true })
                .range(desde, hasta)
        );
        if (error) throw new Error(error.message);
        return data || [];
    },

    async obtenerPrestamos(filtro = 'todos', pagina = 0, porPagina = 25, diasAviso = 3) {
        const hoy = hoyEnChile();
        const limite = new Date(`${hoy}T12:00:00`);
        limite.setDate(limite.getDate() + diasAviso);
        const hastaAviso = limite.toISOString().split('T')[0];

        const campos = 'id, fecha_prestamo, fecha_devolucion_esperada, estado, renovaciones, libros(id, titulo, stock), lectores(id, nombre, rut, email, telefono)';

        const aplicarFiltro = q => {
            if (filtro === 'vencidos') return q.lt('fecha_devolucion_esperada', hoy);
            if (filtro === 'porVencer') return q.gte('fecha_devolucion_esperada', hoy).lte('fecha_devolucion_esperada', hastaAviso);
            return q;
        };

        const desplazamiento = pagina * porPagina;
        let consulta = supabase.from('prestamos')
            .select(campos, { count: 'exact' })
            .eq('estado', 'activo');
        consulta = aplicarFiltro(consulta)
            .order('fecha_devolucion_esperada')
            .range(desplazamiento, desplazamiento + porPagina - 1);

        // Los conteos usan head: true, así que la base de datos devuelve solo el
        // número y no transfiere ninguna fila.
        const contar = f => {
            let q = supabase.from('prestamos')
                .select('id', { count: 'exact', head: true })
                .eq('estado', 'activo');
            if (f === 'vencidos') q = q.lt('fecha_devolucion_esperada', hoy);
            if (f === 'porVencer') q = q.gte('fecha_devolucion_esperada', hoy).lte('fecha_devolucion_esperada', hastaAviso);
            return q;
        };

        const [lista, cTodos, cVencidos, cPorVencer] = await conTiempoLimite(Promise.all([
            consulta, contar('todos'), contar('vencidos'), contar('porVencer')
        ]), ESPERA);

        if (lista.error) throw lista.error;

        return {
            prestamos: lista.data || [],
            total: lista.count || 0,
            conteos: {
                todos: cTodos.count || 0,
                vencidos: cVencidos.count || 0,
                porVencer: cPorVencer.count || 0
            }
        };
    },

    /**
     * Todos los préstamos pendientes de aviso (atrasados y por vencer), sin
     * paginar. Se usa para el envío masivo, donde hace falta la lista completa.
     * Se limita a 500 para no bloquear el navegador con una lista enorme.
     */
    async obtenerPendientesDeAviso(diasAviso = 3) {
        const hoy = hoyEnChile();
        const limite = new Date(`${hoy}T12:00:00`);
        limite.setDate(limite.getDate() + diasAviso);

        const { data, error } = await conTiempoLimite(supabase.from('prestamos')
            .select('id, fecha_devolucion_esperada, renovaciones, libros(id, titulo), lectores(id, nombre, rut, email, telefono)')
            .eq('estado', 'activo')
            .lte('fecha_devolucion_esperada', limite.toISOString().split('T')[0])
            .order('fecha_devolucion_esperada')
            .limit(500), ESPERA);
        if (error) throw error;
        return data || [];
    }
};
