import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lectores } from '../db/lectores.js';
import { supabase } from '../db/compartido.js';

describe('db.lectores - eliminarLector', () => {
    beforeEach(() => {
        vi.spyOn(supabase, 'rpc');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('debe llamar a supabase.rpc con eliminar_lector y sus parámetros', async () => {
        supabase.rpc.mockResolvedValueOnce({ data: null, error: null });

        await lectores.eliminarLector('123-uuid', 'Por motivo personal');

        expect(supabase.rpc).toHaveBeenCalledWith('eliminar_lector', {
            p_id: '123-uuid',
            p_motivo: 'Por motivo personal'
        });
    });

    it('debe lanzar un error si supabase rechaza la acción (ej. falta permiso de admin)', async () => {
        const errorSimulado = { message: 'new row violates row-level security policy' };
        supabase.rpc.mockResolvedValueOnce({ data: null, error: errorSimulado });

        await expect(lectores.eliminarLector('123-uuid'))
            .rejects
            .toThrow('new row violates row-level security policy');
    });

    it('debe propagar el error si ocurre una violación de llave foránea u otro error no capturado por RLS', async () => {
        const errorSimulado = { message: 'No se pudo anonimizar al lector.' };
        supabase.rpc.mockResolvedValueOnce({ data: null, error: errorSimulado });

        await expect(lectores.eliminarLector('123-uuid'))
            .rejects
            .toThrow('No se pudo anonimizar al lector.');
    });
});
