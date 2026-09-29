import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { libros } from '../db/libros.js';
import persistencia from '../persistencia.js';

describe('db.libros - Modo offline', () => {
    let originalOnLine;

    beforeEach(() => {
        originalOnLine = navigator.onLine;
        // Mockear persistencia
        vi.spyOn(persistencia, 'buscarLibrosLocales').mockResolvedValue({ libros: [{ id: 1, titulo: 'Libro Offline' }], total: 1 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        // Restaurar navigator
        Object.defineProperty(navigator, 'onLine', { value: originalOnLine, writable: true });
    });

    it('debe caer a persistencia.buscarLibrosLocales si navigator.onLine es false', async () => {
        // Simular pérdida de conexión
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
        
        const resultado = await libros.obtenerLibros('Papelucho', 0, 25);
        
        expect(persistencia.buscarLibrosLocales).toHaveBeenCalledWith('Papelucho', 0, 25, null, 'todos');
        expect(resultado.libros.length).toBe(1);
        expect(resultado.libros[0].titulo).toBe('Libro Offline');
    });
});
