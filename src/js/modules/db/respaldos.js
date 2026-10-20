// Dominio RESPALDOS — exportación manual completa y el estado del respaldo
// automático (migración 018). Extraído de js/modules/db.js el 22 de agosto
// de 2026 (división por dominio, ver pendientes-checklist.md). Sin cambios
// de lógica: es el mismo código, solo movido.

import { supabase, conTiempoLimite, ESPERA, esFuncionInexistente, traerTodasLasFilas } from './compartido.js';

export const respaldos = {
    /**
     * Descarga una copia completa de las tablas, para respaldo.
     * Se pagina de a 1000 filas (traerTodasLasFilas, en compartido.js) porque
     * ese es el tope por consulta de Supabase: pedir todo de una vez devolvería
     * silenciosamente un resultado incompleto. Este era el único lugar que hacía
     * esto hasta el 23 de agosto de 2026; ahora también lo usa db/reportes.js,
     * que tenía el mismo problema sin el arreglo.
     */
    async exportarTodo() {
        const tablas = ['libros', 'lectores', 'prestamos', 'reservas', 'parametros', 'usuarios'];
        const respaldo = { generado: new Date().toISOString(), version: 1, tablas: {} };

        // Orden estable al paginar, como ya hace obtenerTodosActivosSinPaginar
        // (db/prestamos.js): sin ORDER BY, Postgres no garantiza el mismo
        // orden entre páginas si la tabla cambia mientras se exporta, y el
        // respaldo podría repetir o saltarse filas en silencio. Todas estas
        // tablas tienen `id` salvo `parametros`, cuya llave es `clave`.
        const ordenDe = tabla => (tabla === 'parametros' ? 'clave' : 'id');
        for (const tabla of tablas) {
            const { data, error } = await traerTodasLasFilas((desde, hasta) =>
                supabase.from(tabla).select('*').order(ordenDe(tabla), { ascending: true }).range(desde, hasta)
            );
            if (error) throw new Error(`No se pudo respaldar la tabla ${tabla}: ${error.message}`);
            respaldo.tablas[tabla] = data || [];
        }
        return respaldo;
    },

    /** Últimas corridas del respaldo automático. Devuelve [] si falta la migración 018. */
    async obtenerRespaldos(limite = 5) {
        const { data, error } = await conTiempoLimite(
            supabase.from('respaldos_log').select('*').order('ejecutado_en', { ascending: false }).limit(limite),
            ESPERA
        );
        if (error) {
            if (error.code === '42P01' || esFuncionInexistente(error)) return [];
            throw new Error(error.message || 'No se pudo consultar el estado de los respaldos.');
        }
        return data || [];
    }
};
