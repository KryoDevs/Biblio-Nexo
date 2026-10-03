import { describe, expect, it } from 'vitest';
import {
    MAX_PARADAS_RUTA,
    CLAVE_PLAN_RUTA,
    cargarPlanRuta,
    distanciaEnKm,
    distanciaRectaTotal,
    guardarPlanRuta,
    leerRutaOsrm,
    normalizarCoordenada,
    normalizarPlanRuta,
    ordenarParadasPorCercania,
    urlCalculoVial,
    urlGoogleMaps,
    urlOpenStreetMap
} from '../bibliomovil-ruta.js';
import { filtrarLibrosLocales } from '../persistencia.js';

describe('planificación de ruta del Bibliomóvil', () => {
    it('valida coordenadas geográficas y acepta lng como alias de lon', () => {
        expect(normalizarCoordenada({ lat: -40.1, lng: -72.4 })).toEqual({ lat: -40.1, lon: -72.4 });
        expect(normalizarCoordenada({ lat: 91, lon: 0 })).toBeNull();
        expect(normalizarCoordenada({ lat: 0, lon: 181 })).toBeNull();
        expect(normalizarCoordenada(null)).toBeNull();
    });

    it('limpia localStorage corrupto, puntos inválidos e ids duplicados', () => {
        const plan = normalizarPlanRuta({
            origen: { lat: -40, lon: -72, nombre: '<b>Inicio</b>' },
            paradas: [
                { id: 'mala id', lat: -40.1, lon: -72.1, nombre: '  Llifén  ' },
                { id: 'mala id', lat: 100, lon: 0, nombre: 'Fuera del mapa' },
                { id: 'mala id', lat: -40.2, lon: -72.2, nombre: 'Isla Huapi' }
            ]
        });

        expect(plan.origen.nombre).toBe('<b>Inicio</b>');
        expect(plan.paradas.map(p => p.id)).toEqual(['malaid', 'malaid-2']);
        expect(plan.paradas.map(p => p.nombre)).toEqual(['Llifén', 'Isla Huapi']);
        expect(normalizarPlanRuta(null)).toEqual({ version: 1, origen: null, paradas: [] });
    });

    it('limita el plan a una cantidad razonable de paradas', () => {
        const paradas = Array.from({ length: MAX_PARADAS_RUTA + 3 }, (_, i) => ({
            id: `p-${i}`, nombre: `Parada ${i}`, lat: -40 + i / 100, lon: -72
        }));
        expect(normalizarPlanRuta({ paradas }).paradas).toHaveLength(MAX_PARADAS_RUTA);
    });

    it('guarda y vuelve a leer el plan sin depender del servidor', () => {
        const valores = new Map();
        const storage = {
            getItem: key => valores.get(key) ?? null,
            setItem: (key, value) => valores.set(key, value)
        };
        const plan = { origen: { lat: -40, lon: -72 }, paradas: [{ id: 'p1', lat: -40.1, lon: -72.1 }] };

        expect(guardarPlanRuta(plan, storage)).toBe(true);
        expect(valores.has(CLAVE_PLAN_RUTA)).toBe(true);
        expect(cargarPlanRuta(storage).paradas).toHaveLength(1);
        expect(cargarPlanRuta({ getItem: () => '{' }).paradas).toEqual([]);
        expect(guardarPlanRuta(plan, { setItem: () => { throw new Error('quota'); } })).toBe(false);
    });

    it('calcula distancias rectas y sugiere una secuencia por cercanía', () => {
        const salida = { lat: -40, lon: -72 };
        const lejos = { id: 'lejos', lat: -40.2, lon: -72.2 };
        const cerca = { id: 'cerca', lat: -40.01, lon: -72.01 };
        const medio = { id: 'medio', lat: -40.1, lon: -72.1 };

        expect(distanciaEnKm(salida, salida)).toBe(0);
        expect(distanciaEnKm(salida, cerca)).toBeGreaterThan(0);
        expect(Number.isNaN(distanciaEnKm(null, cerca))).toBe(true);
        expect(distanciaRectaTotal([salida, cerca])).toBeCloseTo(distanciaEnKm(salida, cerca));
        expect(ordenarParadasPorCercania([lejos, medio, cerca], salida).map(p => p.id))
            .toEqual(['cerca', 'medio', 'lejos']);
        // Sin origen se conserva la primera parada como punto inicial.
        expect(ordenarParadasPorCercania([lejos, medio, cerca]).map(p => p.id)[0]).toBe('lejos');
    });

    it('genera enlaces de navegación y llamadas de OSRM solo con coordenadas', () => {
        const plan = {
            origen: { nombre: 'Casa confidencial', lat: -40, lon: -72 },
            paradas: [
                { id: '1', nombre: 'Dirección privada', lat: -40.1, lon: -72.1 },
                { id: '2', nombre: 'Biblioteca', lat: -40.2, lon: -72.2 }
            ]
        };
        const google = urlGoogleMaps(plan);
        const osm = urlOpenStreetMap(plan);
        const osrm = urlCalculoVial(plan);

        expect(google).toContain('google.com/maps/dir');
        expect(osm).toContain('openstreetmap.org/directions');
        expect(osrm).toContain('router.project-osrm.org/route/v1/driving/-72,-40');
        for (const url of [google, osm, osrm]) {
            expect(url).not.toContain('Casa confidencial');
            expect(url).not.toContain('Dirección privada');
        }
        expect(urlGoogleMaps({ paradas: [{ lat: -40, lon: -72 }] })).toBeNull();
    });

    it('valida la geometría y convierte las coordenadas GeoJSON de OSRM', () => {
        expect(leerRutaOsrm({
            code: 'Ok',
            routes: [{
                distance: 2500,
                duration: 900,
                geometry: { coordinates: [[-72.1, -40.1], [-72.2, -40.2]] }
            }]
        })).toEqual({
            latLngs: [[-40.1, -72.1], [-40.2, -72.2]],
            distanciaKm: 2.5,
            duracionMin: 15
        });
        expect(leerRutaOsrm({ code: 'NoRoute', routes: [] })).toBeNull();
        expect(leerRutaOsrm({ code: 'Ok', routes: [{ geometry: { coordinates: [[0, 100]] } }] })).toBeNull();
    });
});

describe('filtros offline del catálogo', () => {
    const libros = [
        { id: 1, titulo: 'Árboles del sur', es_bibliomovil: true, stock: 2 },
        { id: 2, titulo: 'Cuentos', es_bibliomovil: true, stock: 0 },
        { id: 3, titulo: 'Historia local', es_bibliomovil: false, stock: 1 },
        { id: 4, titulo: 'Sin clasificar', es_bibliomovil: null, stock: 3 }
    ];

    it('usa la forma real de la tabla (stock) y busca ignorando tildes', () => {
        expect(filtrarLibrosLocales(libros, 'arbol', true, 'disponibles').map(l => l.id)).toEqual([1]);
        expect(filtrarLibrosLocales(libros, '', true, 'prestados').map(l => l.id)).toEqual([2]);
    });

    // Cambio deliberado de semántica (3 de octubre de 2026), en las dos vías a
    // la vez: un libro SIN marcar (`es_bibliomovil` en NULL, como quedaron las
    // filas anteriores a la migración 026 en las bases que todavía no aplican
    // la 030) pertenece a la sede, no a «ninguna colección».
    //
    // Antes esta prueba fijaba lo contrario —NULL fuera de las dos—, que era
    // fiel a `l.es_bibliomovil = false` en SQL. Con el catálogo ya separado en
    // dos, esa semántica tenía un costo silencioso: un libro sin marcar
    // desaparecía del catálogo de la biblioteca Y del del Bibliomóvil, sin
    // ningún error en pantalla. Ahora `buscar_libros()` usa
    // `coalesce(l.es_bibliomovil, false)` y `filtrarLibrosLocales()` la misma
    // regla, así que la copia sin conexión y el servidor siguen coincidiendo
    // —que es lo que esta prueba vigila—, solo que con NULL del lado de sede.
    it('coincide con el filtro SQL para falso, incluyendo valores nulos', () => {
        expect(filtrarLibrosLocales(libros, '', false, 'todos').map(l => l.id)).toEqual([3, 4]);
        expect(filtrarLibrosLocales(libros, '', true, 'todos').map(l => l.id)).toEqual([1, 2]);
        expect(filtrarLibrosLocales(libros, '', null, 'todos').map(l => l.id)).toEqual([1, 2, 3, 4]);
    });
});
