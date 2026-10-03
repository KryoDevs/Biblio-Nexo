import { describe, it, expect } from 'vitest';
// Se importa la función REAL, no una copia escrita en la prueba. La versión
// anterior de este archivo reimplementaba los filtros dentro del test
// ("aplicarFiltros") y comparaba esa copia consigo misma: podía pasar en verde
// mientras filtrarLibrosLocales() —la que se ejecuta sin conexión— estuviera
// mal. Y lo estaba: usaba los campos `ejemplares_disponibles` en vez de
// `stock` (la forma real de la tabla) y trataba NULL como «ninguna colección».
import { filtrarLibrosLocales } from '../persistencia.js';

describe('persistencia.filtrarLibrosLocales — filtros del catálogo sin conexión', () => {
    // Forma real de la tabla `libros` replicada en IndexedDB: `stock`, no
    // `ejemplares_disponibles` (ese nombre solo existe en el RPC del servidor).
    const libros = [
        { id: 1, titulo: 'Libro A', es_bibliomovil: true, stock: 2 },
        { id: 2, titulo: 'Libro B', es_bibliomovil: true, stock: 0 },
        { id: 3, titulo: 'Libro C', es_bibliomovil: false, stock: 1 },
        { id: 4, titulo: 'Libro D', es_bibliomovil: false, stock: 0 },
        { id: 5, titulo: 'Árboles del sur', stock: 3 } // sin marcar (NULL en bases anteriores a la 030)
    ];

    it('separa las colecciones igual que buscar_libros() en el servidor', () => {
        expect(filtrarLibrosLocales(libros, '', true, 'todos').map(l => l.id)).toEqual([1, 2]);
        expect(filtrarLibrosLocales(libros, '', false, 'todos').map(l => l.id)).toEqual([3, 4, 5]);
    });

    it('un libro sin marcar cuenta como de sede, no como de ninguna colección', () => {
        const sede = filtrarLibrosLocales(libros, '', false, 'todos').map(l => l.id);
        const movil = filtrarLibrosLocales(libros, '', true, 'todos').map(l => l.id);
        expect(sede).toContain(5);
        expect(movil).not.toContain(5);
        // Y ninguna fila se pierde entre las dos vistas.
        expect([...sede, ...movil].sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it('sin colección pedida devuelve todo (herramientas internas)', () => {
        expect(filtrarLibrosLocales(libros, '', null, 'todos').map(l => l.id)).toEqual([1, 2, 3, 4, 5]);
    });

    it('filtra por disponibilidad usando `stock`, la columna real', () => {
        expect(filtrarLibrosLocales(libros, '', null, 'disponibles').map(l => l.id)).toEqual([1, 3, 5]);
        expect(filtrarLibrosLocales(libros, '', null, 'prestados').map(l => l.id)).toEqual([2, 4]);
    });

    it('busca ignorando tildes y mayúsculas', () => {
        expect(filtrarLibrosLocales(libros, 'arboles', null, 'todos').map(l => l.id)).toEqual([5]);
        expect(filtrarLibrosLocales(libros, 'LIBRO c', null, 'todos').map(l => l.id)).toEqual([3]);
    });

    it('tolera entradas que no son una lista', () => {
        expect(filtrarLibrosLocales(null)).toEqual([]);
        expect(filtrarLibrosLocales(undefined, 'x', true)).toEqual([]);
    });
});
