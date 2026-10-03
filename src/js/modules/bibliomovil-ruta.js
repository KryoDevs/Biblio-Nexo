export const CLAVE_PLAN_RUTA = 'biblionexo-bibliomovil-plan-v1';
export const MAX_PARADAS_RUTA = 20;

// Solo centra la primera carga del mapa. No representa el punto oficial de la
// biblioteca ni se usa como origen de una ruta: el personal debe elegir el
// inicio en el mapa o autorizar la ubicación del dispositivo.
export const CENTRO_INICIAL_FUTRONO = Object.freeze({ lat: -40.133, lon: -72.4 });

const MAX_LARGO_NOMBRE = 100;
const crearPlanVacio = () => ({ version: 1, origen: null, paradas: [] });

/** Devuelve coordenadas válidas en formato { lat, lon }, o null. */
export function normalizarCoordenada(punto) {
    if (!punto || typeof punto !== 'object') return null;
    const valorLat = punto.lat;
    const valorLon = punto.lon ?? punto.lng;
    if (valorLat === null || valorLat === undefined || valorLon === null || valorLon === undefined) return null;
    if ((typeof valorLat === 'string' && !valorLat.trim()) || (typeof valorLon === 'string' && !valorLon.trim())) return null;
    const lat = Number(valorLat);
    const lon = Number(valorLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
}

function normalizarNombre(valor, predeterminado) {
    const nombre = typeof valor === 'string' ? valor.trim().slice(0, MAX_LARGO_NOMBRE) : '';
    return nombre || predeterminado;
}

function normalizarId(valor, indice, usados) {
    const candidato = typeof valor === 'string'
        ? valor.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
        : '';
    let id = candidato || `parada-${indice + 1}`;
    let sufijo = 2;
    while (usados.has(id)) id = `${candidato || `parada-${indice + 1}`}-${sufijo++}`;
    usados.add(id);
    return id;
}

/** Normaliza y limita lo leído desde localStorage para tolerar datos dañados. */
export function normalizarPlanRuta(plan) {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return crearPlanVacio();

    const origenCrudo = plan.origen ?? plan.origin;
    const coordenadasOrigen = normalizarCoordenada(origenCrudo);
    const origen = coordenadasOrigen
        ? {
            ...coordenadasOrigen,
            nombre: normalizarNombre(origenCrudo.nombre ?? origenCrudo.label, 'Punto de partida')
        }
        : null;

    const paradasCrudas = Array.isArray(plan.paradas)
        ? plan.paradas
        : Array.isArray(plan.stops) ? plan.stops : [];
    const idsUsados = new Set();
    const paradas = paradasCrudas
        .map((parada, indice) => {
            const coordenadas = normalizarCoordenada(parada);
            if (!coordenadas) return null;
            return {
                id: normalizarId(parada.id, indice, idsUsados),
                nombre: normalizarNombre(parada.nombre ?? parada.label, `Parada ${indice + 1}`),
                ...coordenadas
            };
        })
        .filter(Boolean)
        .slice(0, MAX_PARADAS_RUTA);

    return { version: 1, origen, paradas };
}

/** Lee el plan local sin dejar que JSON o localStorage dañados rompan la vista. */
export function cargarPlanRuta(storage = globalThis.localStorage) {
    try {
        const texto = storage?.getItem(CLAVE_PLAN_RUTA);
        return texto ? normalizarPlanRuta(JSON.parse(texto)) : crearPlanVacio();
    } catch {
        return crearPlanVacio();
    }
}

/** Guarda únicamente coordenadas y nombres de paradas en este navegador. */
export function guardarPlanRuta(plan, storage = globalThis.localStorage) {
    try {
        const normalizado = normalizarPlanRuta(plan);
        if (!storage?.setItem) return false;
        storage.setItem(CLAVE_PLAN_RUTA, JSON.stringify(normalizado));
        return true;
    } catch {
        return false;
    }
}

/** El origen (si existe) seguido por las paradas en el orden elegido. */
export function puntosDeRuta(plan) {
    const normalizado = normalizarPlanRuta(plan);
    return [normalizado.origen, ...normalizado.paradas].filter(Boolean);
}

export function distanciaEnKm(a, b) {
    const inicio = normalizarCoordenada(a);
    const fin = normalizarCoordenada(b);
    if (!inicio || !fin) return NaN;

    const rad = grados => grados * Math.PI / 180;
    const deltaLat = rad(fin.lat - inicio.lat);
    const deltaLon = rad(fin.lon - inicio.lon);
    const lat1 = rad(inicio.lat);
    const lat2 = rad(fin.lat);
    const h = Math.sin(deltaLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Suma la distancia en línea recta entre los puntos (estimación, no carretera). */
export function distanciaRectaTotal(puntos) {
    let total = 0;
    for (let indice = 1; indice < (puntos || []).length; indice++) {
        const tramo = distanciaEnKm(puntos[indice - 1], puntos[indice]);
        if (!Number.isFinite(tramo)) return NaN;
        total += tramo;
    }
    return total;
}

/**
 * Ordena por cercanía con heurística de vecino más próximo, sin consultar la
 * ubicación de nadie. Mantiene el primer punto como inicio si no hay origen;
 * es una sugerencia geométrica, no una optimización vial.
 */
export function ordenarParadasPorCercania(paradas, origen = null) {
    const pendientes = (Array.isArray(paradas) ? paradas : [])
        .map((parada, indice) => ({ parada, indice, coordenadas: normalizarCoordenada(parada) }))
        .filter(item => item.coordenadas);
    if (pendientes.length < 2) return pendientes.map(item => item.parada);

    const ordenadas = [];
    let actual = normalizarCoordenada(origen);

    if (!actual) {
        const primero = pendientes.shift();
        ordenadas.push(primero);
        actual = primero.coordenadas;
    }

    while (pendientes.length) {
        let cercano = 0;
        let mejorDistancia = distanciaEnKm(actual, pendientes[0].coordenadas);
        for (let indice = 1; indice < pendientes.length; indice++) {
            const distancia = distanciaEnKm(actual, pendientes[indice].coordenadas);
            if (distancia < mejorDistancia) {
                cercano = indice;
                mejorDistancia = distancia;
            }
        }
        const siguiente = pendientes.splice(cercano, 1)[0];
        ordenadas.push(siguiente);
        actual = siguiente.coordenadas;
    }

    return ordenadas.map(item => item.parada);
}

/** Construye el enlace de Google Maps solo con coordenadas, nunca con etiquetas. */
export function urlGoogleMaps(plan) {
    const puntos = puntosDeRuta(plan);
    if (puntos.length < 2) return null;

    const parametros = new URLSearchParams({
        api: '1',
        origin: `${puntos[0].lat},${puntos[0].lon}`,
        destination: `${puntos.at(-1).lat},${puntos.at(-1).lon}`,
        travelmode: 'driving'
    });
    const paradasIntermedias = puntos.slice(1, -1);
    if (paradasIntermedias.length) {
        parametros.set('waypoints', paradasIntermedias.map(p => `${p.lat},${p.lon}`).join('|'));
    }
    return `https://www.google.com/maps/dir/?${parametros.toString()}`;
}

/** Enlace de navegación OSM, también limitado a coordenadas. */
export function urlOpenStreetMap(plan) {
    const puntos = puntosDeRuta(plan);
    if (puntos.length < 2) return null;
    const ruta = puntos.map(p => `${p.lat},${p.lon}`).join(';');
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(ruta)}`;
}

/** URL del servicio de demostración de OSRM; no se envían nombres ni datos de lectores. */
export function urlCalculoVial(plan) {
    const puntos = puntosDeRuta(plan);
    if (puntos.length < 2) return null;
    const coordenadas = puntos.map(p => `${p.lon},${p.lat}`).join(';');
    return `https://router.project-osrm.org/route/v1/driving/${coordenadas}?overview=full&geometries=geojson&steps=false`;
}

/** Valida y convierte una respuesta GeoJSON de OSRM a [lat, lon]. */
export function leerRutaOsrm(respuesta) {
    const ruta = respuesta?.code === 'Ok' && Array.isArray(respuesta.routes)
        ? respuesta.routes[0]
        : null;
    const coordenadas = ruta?.geometry?.coordinates;
    if (!Array.isArray(coordenadas) || coordenadas.length < 2) return null;

    const latLngs = coordenadas.map(par => {
        if (!Array.isArray(par) || par.length < 2) return null;
        const punto = normalizarCoordenada({ lon: par[0], lat: par[1] });
        return punto ? [punto.lat, punto.lon] : null;
    });
    if (latLngs.some(p => !p)) return null;

    const distancia = Number(ruta.distance);
    const duracion = Number(ruta.duration);
    return {
        latLngs,
        distanciaKm: Number.isFinite(distancia) && distancia >= 0 ? distancia / 1000 : null,
        duracionMin: Number.isFinite(duracion) && duracion >= 0 ? duracion / 60 : null
    };
}
