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
     * `esBibliomovil` separa las dos colecciones (migración 030):
     *   · `false` → catálogo de la biblioteca (sede).
     *   · `true`  → catálogo del Bibliomóvil.
     *   · `null`  → todas (solo lo usan las herramientas internas que necesitan
     *               ver el universo completo de libros).
     *
     * Un libro sin marcar cuenta como de sede: `coalesce(..., false)` en el RPC
     * y el `or` explícito sobre NULL en el respaldo PostgREST cubren las bases
     * donde la migración 030 todavía no se ejecutó. Sin eso, un libro con
     * `es_bibliomovil` en NULL no aparecería en ninguna vista.
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

            
            // `.or(...)` en vez de `.eq(..., false)`: en Postgres `NULL = false`
            // no es verdadero, así que un libro sin marcar (bases anteriores a
            // la migración 030) quedaría fuera de las dos colecciones.
            if (esBibliomovil === true) q = q.eq('es_bibliomovil', true);
            else if (esBibliomovil === false) q = q.or('es_bibliomovil.is.null,es_bibliomovil.is.false');

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
                return await persistencia.buscarLibrosLocales(busqueda, pagina, porPagina, esBibliomovil, filtroStock);
            }
            throw err;
        }
    },

    /**
     * Guarda los datos descriptivos de un libro.
     *
     * `esBibliomovil` se actualiza SOLO si viene en `cambios`: el update de
     * Supabase manda las columnas que se le indican, así que incluirla siempre
     * con `?? null` borraría la colección cada vez que alguien corrige un
     * título. Con el spread condicional, quien no la envía no la toca.
     */
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
            dias_prestamo_override: cambios.diasPrestamoOverride ?? null,
            ...(cambios.esBibliomovil === undefined ? {} : { es_bibliomovil: !!cambios.esBibliomovil })
            // El número de ejemplares NO se toca aquí: pasa por ajustar_copias,
            // que recalcula las copias disponibles según los préstamos activos.
        }).eq('id', id), ESPERA);
        if (error) throw new Error(error.code === '23505' ? 'Ese ISBN ya pertenece a otro libro.' : 'No se pudo guardar el libro.');
    },

    /**
     * Mueve un ejemplar entre las dos colecciones (migración 030): sede
     * (false) ↔ Bibliomóvil (true).
     *
     * Va aparte de actualizarLibro() a propósito: un `update` parcial de una
     * sola columna no puede pisar por accidente el título, el autor o el plazo
     * de préstamo del libro, y deja claro en el código que la operación es
     * exactamente «cambiar de colección».
     */
    async cambiarColeccionLibro(id, esBibliomovil) {
        const { error } = await conTiempoLimite(
            supabase.from('libros').update({ es_bibliomovil: !!esBibliomovil }).eq('id', id),
            ESPERA
        );
        if (error) {
            if (esFuncionInexistente(error)) throw new Error('Falta ejecutar la migración 030 en Supabase.');
            throw new Error('No se pudo cambiar la colección del libro.');
        }
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
