// Dominio LIBROS — catálogo: listar, editar, agregar, eliminar.
// Extraído de js/modules/db.js el 22 de agosto de 2026 (división por
// dominio, ver pendientes-checklist.md). Sin cambios de lógica: es el mismo
// código, solo movido.
//
// agregarLibro() vive en js/modules/db.js, no aquí — usa la cola de
// sincronización sin conexión (SyncQueue), igual que reservarLibro()/
// retirarReserva() en db/reservas.js (ver el comentario ahí).

import { supabase, conTiempoLimite, ESPERA, limpiarBusqueda, esFuncionInexistente, MENSAJE_TIMEOUT } from './compartido.js';
import persistencia from '../persistencia.js';

export const libros = {
    /**
     * Lista libros con búsqueda y paginación.
     *
     * Usa el RPC buscar_libros (migración 005), que ignora acentos y devuelve
     * el total de coincidencias en la misma consulta. Si ese RPC todavía no
     * existe, cae automáticamente a una consulta simple para que la aplicación
     * siga funcionando.
     *
     * Devuelve { libros, total }.
     */
    async obtenerLibros(busqueda = '', pagina = 0, porPagina = 25, esBibliomovil = null, filtroStock = 'todos') {
        if (!navigator.onLine) {
            return await persistencia.buscarLibrosLocales(busqueda, pagina, porPagina, esBibliomovil, filtroStock);
        }

        const desplazamiento = pagina * porPagina;

        try {
            const { data, error } = await conTiempoLimite(supabase.rpc('buscar_libros', {
                p_busqueda: busqueda || '',
                p_limite: porPagina,
                p_desplazamiento: desplazamiento,
                p_es_bibliomovil: esBibliomovil,
                p_filtro_stock: filtroStock
            }), ESPERA);

            if (!error) {
                const libros = data || [];
                return {
                    libros,
                    total: libros.length ? Number(libros[0].total_coincidencias) : 0
                };
            }

            // Respaldo: la migración 005 no se ha ejecutado todavía.
            // 42883 = la función no existe; PGRST202 = PostgREST no la encuentra.
            if (!esFuncionInexistente(error)) throw error;

            let q = supabase
                .from('libros')
                .select('*', { count: 'exact' })
                .order('titulo')
                .range(desplazamiento, desplazamiento + porPagina - 1);

            
            if (esBibliomovil === true) q = q.eq('es_bibliomovil', true);
            else if (esBibliomovil === false) q = q.eq('es_bibliomovil', false);

            if (filtroStock === 'disponibles') q = q.gt('ejemplares_disponibles', 0);
            else if (filtroStock === 'prestados') q = q.eq('ejemplares_disponibles', 0);

            const limpia = limpiarBusqueda(busqueda);

            if (limpia) {
                q = q.or(`titulo.ilike.%${limpia}%,autor.ilike.%${limpia}%,isbn.ilike.%${limpia}%`);
            }

            const { data: filas, error: err2, count } = await conTiempoLimite(q, ESPERA);
            if (err2) throw err2;
            return { libros: filas || [], total: count || 0 };
        } catch (err) {
            if (err.message === MENSAJE_TIMEOUT || String(err).includes('fetch') || !navigator.onLine) {
                return await persistencia.buscarLibrosLocales(busqueda, pagina, porPagina);
            }
            throw err;
        }
    },

    async actualizarLibro(id, cambios) {
        const { error } = await conTiempoLimite(supabase.from('libros').update({
            titulo: cambios.titulo,
            autor: cambios.autor,
            isbn: cambios.isbn,
            genero: cambios.genero || null,
            ubicacion: cambios.ubicacion || null,
            portada_url: cambios.portada_url || null,
            // null = usa el plazo global (dias_prestamo); 0 = no circula
            // (material de referencia); un número = plazo propio de este
            // libro. Ver 017_plazo_prestamo_por_libro.sql.
            dias_prestamo_override: cambios.diasPrestamoOverride ?? null
            // El número de ejemplares NO se toca aquí: pasa por ajustar_copias,
            // que recalcula las copias disponibles según los préstamos activos.
        }).eq('id', id), ESPERA);
        if (error) throw new Error(error.code === '23505' ? 'Ese ISBN ya pertenece a otro libro.' : 'No se pudo guardar el libro.');
    },

    /**
     * Pasa por el RPC eliminar_libro (migración 020), no un `delete` directo:
     * la función distingue si el rechazo es por un préstamo ACTIVO (el único
     * caso que de verdad bloquea el borrado) de un libro con historial ya
     * devuelto (que sí se puede eliminar — el título y autor quedan
     * archivados en cada préstamo cerrado, para que los reportes de períodos
     * pasados sigan siendo legibles). Antes, cualquier error de un `delete`
     * directo se convertía en el mismo mensaje genérico ("revise si tiene
     * préstamos activos"), aunque el motivo real fuera otro.
     */
    async eliminarLibro(id) {
        const { error } = await conTiempoLimite(supabase.rpc('eliminar_libro', { p_libro_id: id }), ESPERA);
        if (error) {
            if (esFuncionInexistente(error)) throw new Error('Falta ejecutar la migración 020 en Supabase.');
            throw new Error(error.message || 'No se pudo eliminar el libro.');
        }
    },

    /**
     * Papelera de libros (migración 021): lista los que se eliminaron y
     * todavía no se restauraron. No hace falta ninguna tabla de respaldo
     * propia — lee la foto que ya guarda `auditoria` de cada borrado.
     * Devuelve `null` si la migración 021 no se ha ejecutado (mismo patrón
     * que el resto de `db.*`, para que la pantalla explique qué falta en
     * vez de mostrar un error genérico).
     */
    async listarLibrosEliminados() {
        const { data, error } = await conTiempoLimite(supabase.rpc('listar_libros_eliminados'), ESPERA);
        if (error) {
            if (esFuncionInexistente(error)) return null;
            throw new Error(error.message || 'No se pudieron listar los libros eliminados.');
        }
        return data || [];
    },

    async restaurarLibro(libroId) {
        const { error } = await conTiempoLimite(supabase.rpc('restaurar_libro', { p_libro_id: libroId }), ESPERA);
        if (error) {
            if (esFuncionInexistente(error)) throw new Error('Falta ejecutar la migración 021 en Supabase.');
            throw new Error(error.message || 'No se pudo restaurar el libro.');
        }
    }
};
