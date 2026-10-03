import { supabase } from '../supabase-init.js';
import { conTiempoLimite } from './utilidades.js';
import persistencia from './persistencia.js';
import registroErrores from './errores.js';
import { ESPERA, hoyEnChile, esFuncionInexistente } from './db/compartido.js';

export { hoyEnChile };

// ----------------------------------------------------------------------
// El resto de los dominios (libros, lectores, préstamos sin conexión, admin-
// istración, personal, perfil, diagnóstico, errores del servidor, escaneo
// remoto, respaldos, cumplimiento legal, reportes) vive en js/modules/db/ —
// dividido por dominio el 22 de agosto de 2026 (ver pendientes-checklist.md).
// Este archivo se queda con lo que no se podía separar sin romper nada: la
// cola de sincronización sin conexión (SyncQueue) y las nueve llamadas que
// la usan directamente (registrarPrestamo, devolverPrestamo, renovarPrestamo,
// reservarLibro, retirarReserva, consultarLibro, estadoLector, agregarLibro,
// agregarLector) — moverlas habría dejado la lógica de negocio en un archivo
// y su respaldo sin conexión en otro. reservarLibro/retirarReserva son tan
// urgentes en el mesón como prestar/devolver (022_reservas.sql), así que
// siguen el mismo
// patrón; cancelarReserva/listarReservas, menos urgentes, viven en
// js/modules/db/reservas.js. Igual que antes,
// `pruebas/probar-interfaz.mjs` sigue vigilando esta parte leyendo
// directamente el texto de ESTE archivo (no basta con que el código exista
// en algún lado): si alguna vez hace falta mover algo más de aquí, hay que
// actualizar también esas comprobaciones.
// ----------------------------------------------------------------------

import { libros } from './db/libros.js';
import { lectores } from './db/lectores.js';
import { prestamos } from './db/prestamos.js';
import { administracion } from './db/administracion.js';
import { personal } from './db/personal.js';
import { perfil } from './db/perfil.js';
import { diagnostico } from './db/diagnostico.js';
import { erroresServidor } from './db/errores-servidor.js';
import { enlacesEscaneo } from './db/enlaces-escaneo.js';
import { respaldos } from './db/respaldos.js';
import { cumplimiento } from './db/cumplimiento.js';
import { reportes } from './db/reportes.js';
import { reservas } from './db/reservas.js';

/**
 * ¿Este error es "no llegamos a hablar con el servidor" (sin red, se cortó
 * a mitad de camino, se agotó el tiempo de espera de conTiempoLimite) o es
 * un rechazo REAL del servidor (sin stock, RUT inexistente, límite
 * alcanzado, sesión vencida)?
 *
 * La distinción importa porque de ella depende qué hace SyncQueue: un fallo
 * de red se reintenta más tarde (puede que la próxima vez sí funcione); un
 * rechazo real no — reintentarlo no cambia el motivo por el que el servidor
 * lo rechazó, así que solo se avisaría lo mismo una y otra vez.
 *
 * El criterio: todo error que de verdad viene de Postgres/PostgREST trae un
 * `.code` (ver esFuncionInexistente arriba, o los `errcode` que usan las
 * funciones RPC de supabase/migrations/). Un error SIN `.code` es, por
 * eliminación, algo que pasó ANTES de llegar al servidor: el error sintético
 * de conTiempoLimite, o una excepción real del navegador al no poder ni
 * siquiera abrir la conexión (TypeError: Failed to fetch / NetworkError,
 * igual que ya distingue el registro de errores en errores.js).
 */
function esFalloDeRed(error) {
    return !error?.code;
}

/**
 * Cola de sincronización (Fase 1.3 — funcionamiento sin conexión).
 *
 * Qué resuelve: `prestar_libro`, `devolver_prestamo`, `renovar_prestamo`,
 * `reservar_libro` y `retirar_reserva` (022_reservas.sql) son funciones RPC
 * del servidor — sin conexión no hay forma de llamarlas. Antes de esta
 * clase, un fallo de red en cualquiera de ellas terminaba igual que
 * cualquier otro error: un mensaje y nada más, aunque la única causa real
 * fuera que en ese momento no había internet.
 *
 * Qué hace en vez de eso: cuando una de esas tres llamadas falla
 * específicamente por RED (ver esFalloDeRed arriba, nunca por un rechazo
 * real del servidor), la INTENCIÓN queda guardada en el almacén local
 * (`persistencia.js`, almacén "colaSync" — sobrevive a cerrar el
 * navegador) y se reintenta sola: al recuperar la conexión (evento
 * "online"), y mientras tanto con espera exponencial (30 s, 1 min, 2 min...
 * hasta un tope de 30 min) para no martillar la red si sigue caída.
 *
 * Estrategia de conflictos — por qué NO hace falta resolver nada a mano:
 * la cola no intenta adivinar si el préstamo "debería" funcionar. Se limita
 * a repetir la MISMA llamada RPC que se habría hecho con conexión, y esa
 * función ya revalida todo del lado del servidor (stock con `FOR UPDATE`,
 * límite de préstamos, bloqueos) en el momento real de la sincronización,
 * no con el dato que había cuando se encoló. El stock es el dato en
 * disputa señalado en el plan de trabajo, y ya está cubierto: si dos
 * mesones sin conexión intentaran prestar el último ejemplar y ambos
 * quedan en cola, al reconectar uno de los dos RPC va a fallar por falta de
 * stock — de verdad, no en apariencia — y ESE es un rechazo real (con
 * `.code`), no un fallo de red: no se reintenta, se avisa. Dos mesones
 * sin conexión al mismo tiempo, en esta biblioteca, se considera
 * suficientemente improbable como para no justificar más que esto.
 *
 * Fallo permanente, nunca silencioso: si el rechazo es real, o si un fallo
 * de red se repite demasiadas veces seguidas, queda un aviso en el registro
 * de errores propio (visible en Administración → Diagnóstico) — nunca se
 * pierde en silencio, aunque la persona que originó la operación ya se haya
 * ido del mesón.
 */
const REINTENTO_BASE_MS = 30 * 1000;       // primer reintento tras un fallo: 30 s
const REINTENTO_MAX_MS = 30 * 60 * 1000;   // tope: no esperar más de 30 min entre intentos
const INTENTOS_ANTES_DE_AVISAR = 5;        // a esta altura, además de seguir reintentando, se avisa

// Qué RPC llamar por cada tipo de operación encolada. Deliberadamente la
// MISMA llamada que hace cada método de más abajo — la cola no reimplementa
// la lógica de negocio, solo la repite tal cual cuando vuelve la conexión.
const OPERACIONES_COLA = {
    prestar_libro: params => supabase.rpc('prestar_libro', params),
    devolver_prestamo: params => supabase.rpc('devolver_prestamo', params),
    renovar_prestamo: params => supabase.rpc('renovar_prestamo', params),
    reservar_libro: params => supabase.rpc('reservar_libro', params),
    retirar_reserva: params => supabase.rpc('retirar_reserva', params),
    // A diferencia de las cinco de arriba (RPCs atómicas), estas dos son un
    // insert directo — no hay función de negocio que proteja la unicidad
    // más que la restricción de la propia tabla (23505). Por eso, al
    // confirmarse, además de la fila real hay que retirar la entrada
    // optimista que se había guardado localmente al encolar (ver
    // guardarLibroLocalOptimista()/guardarLectorLocalOptimista() en
    // persistencia.js) — si no, quedaría duplicada junto a la fila real que
    // trae la próxima sincronización completa del catálogo/lectores.
    agregar_libro: async params => {
        const { error } = await supabase.from('libros').insert([params]);
        if (!error) await persistencia.quitarLibroLocalOptimista(params.isbn);
        return { error };
    },
    agregar_lector: async params => {
        const { error } = await supabase.from('lectores').insert([params]);
        if (!error) await persistencia.quitarLectorLocalOptimista(params.rut);
        return { error };
    }
};

/**
 * Respaldo sin conexión de consultarLibro(): el catálogo se replica entero
 * (Fase 1.2), así que si el código está en la copia local no hay ningún
 * reparo de privacidad en usarlo. Nunca trae préstamos (esa parte sí
 * necesita el servidor) — se devuelve `prestamos: []`, nunca inventado.
 */
async function consultarLibroSinConexion(codigo) {
    const libro = await persistencia.buscarLibroLocalPorCodigo(codigo);
    if (!libro) {
        throw new Error('Sin conexión, y este libro no está en la copia local del mesón.');
    }
    return { libro, prestamos: [], offline: true };
}

/**
 * Respaldo sin conexión de estadoLector(): a diferencia del catálogo, SOLO
 * puede responder si ese RUT ya entró antes a la copia local por una de las
 * dos vías controladas (consultado antes, o con préstamo activo — ver
 * persistencia.js y CUMPLIMIENTO-LEGAL.md §9 bis). Que no esté guardado NO
 * significa que no exista: solo que sin conexión no hay forma de saberlo.
 * Por eso, a propósito, nunca se devuelve `existe: false` aquí — eso abriría
 * en la interfaz el flujo de "lector nuevo" y terminaría intentando crear un
 * duplicado al reconectar. Se lanza un error claro en su lugar.
 *
 * `puede_prestar` se calcula a partir del bloqueo manual (el dato local que
 * nunca se desactualiza) MÁS los atrasados, recalculados con el reloj del
 * propio equipo contra `prestamosActivosDetalle` — la fecha de vencimiento
 * de cada préstamo activo que se guardó en la última sincronización (ver
 * sincronizarLectoresActivos()/guardarLectorConsultado() en persistencia.js).
 * A diferencia de un conteo cacheado, esto sí se puede recalcular sin
 * conexión: comparar una fecha ya conocida contra "hoy" no necesita ir al
 * servidor.
 *
 * Dos límites que siguen sin resolverse, a propósito, y quedan documentados
 * para no repetir el error de "arreglarlo a medias":
 *   1. El LÍMITE de préstamos activos (`max_prestamos_por_lector`) no se
 *      revalida acá — ese parámetro no se replica localmente. Solo se
 *      bloquea por atraso o por bloqueo manual, nunca por haber alcanzado el
 *      máximo.
 *   2. Un préstamo devuelto en otra sesión/equipo después de la última
 *      sincronización puede seguir apareciendo como atrasado acá (falso
 *      positivo — más seguro que el error contrario); y un préstamo nuevo
 *      creado después de esa sincronización no se conoce en absoluto. El RPC
 *      real, con conexión, sigue siendo la única autoridad.
 */
async function estadoLectorSinConexion(rut) {
    const lector = await persistencia.buscarLectorLocalPorRut(rut);
    if (!lector) {
        throw new Error('Sin conexión, y este lector no está en la copia local del mesón (hay que consultarlo antes, con conexión, para poder atenderlo sin ella).');
    }
    const hoy = hoyEnChile();
    const detalle = lector.prestamosActivosDetalle || [];
    const atrasados = detalle.filter(p => p.fechaDevolucionEsperada && p.fechaDevolucionEsperada < hoy);

    let puedePrestar = !lector.bloqueadoManual;
    let motivo = lector.bloqueadoManual ? coalesceMotivoBloqueo(lector.motivoBloqueo) : null;
    if (puedePrestar && atrasados.length > 0) {
        puedePrestar = false;
        const cual = atrasados[0].tituloLibro ? ` (incluye "${atrasados[0].tituloLibro}")` : '';
        motivo = `Tiene ${atrasados.length} libro(s) con la devolución atrasada${cual}, según la última sincronización.`;
    }

    return {
        existe: true,
        offline: true,
        lector_id: lector.id,
        nombre: lector.nombre,
        rut: lector.rut,
        email: lector.email,
        telefono: lector.telefono,
        bloqueado_manual: !!lector.bloqueadoManual,
        motivo_bloqueo: lector.motivoBloqueo ?? null,
        prestamos_activos: detalle.length,
        prestamos_atrasados: atrasados.length,
        atrasados_detalle: atrasados,
        puede_prestar: puedePrestar,
        motivo_rechazo: motivo
    };
}

function coalesceMotivoBloqueo(motivo) {
    return motivo ? `Bloqueado por la biblioteca: ${motivo}` : 'Bloqueado por la biblioteca.';
}

/**
 * Encola sin conexión el alta de un libro nuevo (ver agregarLibro en el
 * objeto db, más abajo). Duplicado detectable con certeza (el catálogo se
 * replica entero, Fase 1.2): se rechaza de inmediato, igual que lo haría el
 * servidor, en vez de encolar algo que se sabe que va a fallar al
 * reconectar.
 */
async function encolarAgregarLibro(datos) {
    const existente = await persistencia.buscarLibroLocalPorCodigo(datos.isbn);
    if (existente) throw new Error('El ISBN ya está registrado.');
    await persistencia.guardarLibroLocalOptimista(datos);
    return colaSync.encolar('agregar_libro', datos, `Alta del libro "${datos.titulo}" (ISBN ${datos.isbn})`);
}

/**
 * Encola sin conexión el alta de un lector nuevo (ver agregarLector en el
 * objeto db, más abajo). A diferencia de encolarAgregarLibro, A PROPÓSITO
 * no verifica duplicado local primero — ver el docstring de
 * guardarLectorLocalOptimista() en persistencia.js sobre por qué un RUT no
 * se puede descartar con la misma certeza que un ISBN sin conexión.
 */
async function encolarAgregarLector(datos) {
    await persistencia.guardarLectorLocalOptimista(datos);
    return colaSync.encolar('agregar_lector', datos, `Alta del lector ${datos.nombre} (RUT ${datos.rut})`);
}

class SyncQueue {
    constructor() {
        this._reintentando = false;
        this._temporizador = null;
        // Fase 1.4 (indicador de conexión): quién quiere enterarse de que
        // cambió cuántas operaciones hay pendientes, o de que empezó/terminó
        // un reintento. La cola en sí no depende de que alguien esté
        // escuchando — esto es puramente informativo, ver alCambiar().
        this._escuchas = new Set();
    }

    /**
     * Guarda la intención y devuelve de inmediato — no espera a que se
     * sincronice de verdad. `descripcion` es solo para que un aviso futuro
     * (registro de errores, o el indicador de conexión) tenga algo legible
     * que mostrar, nunca se usa para decidir nada.
     */
    async encolar(tipo, params, descripcion) {
        const id = await persistencia.encolarOperacion(tipo, params, descripcion);
        // Da un respiro antes del primer intento en vez de golpear la red de
        // inmediato: si el fallo original fue un corte real, reintentar en el
        // mismo segundo solo repite el mismo fallo.
        this._programarReintento(1000);
        await this._avisar();
        return {
            encolado: true,
            id,
            mensaje: 'Sin conexión: la operación se guardó y se completará sola apenas vuelva la red.'
        };
    }

    /**
     * Se suscribe a cambios de la cola (Fase 1.4: el indicador de conexión).
     * Devuelve una función para des-suscribirse. Pensado para un consumidor
     * de interfaz que quiere mostrar "sincronizando" o "N pendientes" sin
     * tener que preguntar por encuesta (polling) — la propia cola avisa en
     * el momento en que algo cambia.
     */
    alCambiar(fn) {
        this._escuchas.add(fn);
        return () => this._escuchas.delete(fn);
    }

    async _avisar() {
        if (this._escuchas.size === 0) return; // nadie escucha: no vale la pena ni consultar el almacén
        try {
            const { pendientes } = await this.estado();
            this._escuchas.forEach(fn => fn({ pendientes, sincronizando: this._reintentando }));
        } catch {
            // Nunca debe interrumpir la sincronización real por esto.
        }
    }

    _programarReintento(ms) {
        if (typeof window === 'undefined') return; // en pruebas sin temporizadores reales, se llama a mano
        clearTimeout(this._temporizador);
        this._temporizador = setTimeout(() => this.reintentarPendientes(), ms);
    }

    /**
     * Intenta reproducir todo lo pendiente cuyo turno ya llegó. Nunca lanza
     * ni deja una promesa rechazada suelta: es sincronización en segundo
     * plano, igual que persistencia.sincronizarTodo().
     */
    async reintentarPendientes() {
        if (this._reintentando) return;
        this._reintentando = true;
        await this._avisar(); // Fase 1.4: que el indicador pueda mostrar "sincronizando" desde ya
        try {
            const pendientes = await persistencia.listarOperacionesPendientes();
            const ahora = Date.now();
            for (const operacion of pendientes) {
                if (operacion.proximoIntentoEn > ahora) continue;
                await this._intentarUna(operacion);
            }
        } catch {
            // No debería llegar aquí (cada paso atrapa lo suyo), pero si pasa,
            // no debe tumbar el resto de la sincronización en segundo plano.
        } finally {
            this._reintentando = false;
            const restantes = await persistencia.listarOperacionesPendientes().catch(() => []);
            if (restantes.length) {
                const proximo = Math.min(...restantes.map(o => o.proximoIntentoEn));
                this._programarReintento(Math.max(1000, proximo - Date.now()));
            }
            await this._avisar(); // idem: "sincronizando" ya terminó, y el conteo pudo cambiar
        }
    }

    async _intentarUna(operacion) {
        const llamar = OPERACIONES_COLA[operacion.tipo];
        if (!llamar) {
            // No debería pasar nunca: es una operación de un tipo que esta
            // versión del código no sabe ejecutar. No se reintenta para
            // siempre algo imposible de completar.
            await persistencia.quitarOperacion(operacion.id);
            registroErrores.registrarOperacion('sincronizacion',
                new Error(`Operación en cola de tipo desconocido: "${operacion.tipo}".`));
            return;
        }
        try {
            const { error } = await llamar(operacion.params);
            if (error) {
                if (esFalloDeRed(error)) {
                    await this._reprogramar(operacion);
                } else {
                    await this._fallaPermanente(operacion, error.message || 'Rechazado por el servidor.');
                }
                return;
            }
            await persistencia.quitarOperacion(operacion.id);
        } catch (e) {
            if (esFalloDeRed(e)) {
                await this._reprogramar(operacion);
            } else {
                await this._fallaPermanente(operacion, e?.message || String(e));
            }
        }
    }

    async _reprogramar(operacion) {
        const intentos = (operacion.intentos || 0) + 1;
        const espera = Math.min(REINTENTO_BASE_MS * 2 ** (intentos - 1), REINTENTO_MAX_MS);
        await persistencia.actualizarOperacion(operacion.id, {
            intentos,
            proximoIntentoEn: Date.now() + espera,
            ultimoError: 'Sin conexión'
        });
        if (intentos === INTENTOS_ANTES_DE_AVISAR) {
            registroErrores.registrarOperacion('sincronizacion', new Error(
                `Una operación pendiente (${operacion.descripcion || operacion.tipo}) lleva ${intentos} ` +
                'intentos sin poder sincronizarse por falta de conexión. Sigue en cola y se seguirá ' +
                'reintentando; revisar la conexión del equipo del mesón.'
            ));
        }
    }

    async _fallaPermanente(operacion, motivo) {
        await persistencia.quitarOperacion(operacion.id);
        registroErrores.registrarOperacion('sincronizacion', new Error(
            `Operación pendiente (${operacion.descripcion || operacion.tipo}) rechazada al sincronizar, ` +
            `no se reintentará: ${motivo}`
        ));
    }

    /** Para el indicador de conexión (Fase 1.4) y para las pruebas. */
    async estado() {
        const pendientes = await persistencia.listarOperacionesPendientes();
        return { pendientes: pendientes.length };
    }
}

export const colaSync = new SyncQueue();

if (typeof window !== 'undefined') {
    // Apenas el navegador avisa que recuperó la conexión, no hace falta
    // esperar al próximo reintento programado.
    window.addEventListener('online', () => colaSync.reintentarPendientes());
}

async function _ejecutarRpcMuta(rpcName, params, mensajeCola, errorMsgs = {}) {
    let resultado;
    try {
        resultado = await conTiempoLimite(supabase.rpc(rpcName, params), ESPERA);
    } catch (e) {
        if (esFalloDeRed(e)) return colaSync.encolar(rpcName, params, mensajeCola);
        throw e;
    }
    const { data, error } = resultado;
    if (error) {
        if (esFuncionInexistente(error) && errorMsgs.migracionFaltante) {
            throw new Error(errorMsgs.migracionFaltante);
        }
        if (esFalloDeRed(error)) return colaSync.encolar(rpcName, params, mensajeCola);
        throw new Error(error.message || errorMsgs.porDefecto || `Error en la operación ${rpcName}.`);
    }
    return Array.isArray(data) ? data[0] : data;
}

export const db = {
    async registrarPrestamo(libroId, lectorRut, ubicacion = null) {
        const payload = { p_libro_id: libroId, p_lector_rut: lectorRut };
        if (ubicacion && ubicacion.nombre) {
            payload.p_parada_nombre = ubicacion.nombre;
            payload.p_parada_lat = ubicacion.lat || null;
            payload.p_parada_lng = ubicacion.lng || null;
        }
        return _ejecutarRpcMuta(
            'prestar_libro',
            payload,
            `Préstamo del libro #${libroId} al RUT ${lectorRut}`,
            { porDefecto: 'Fallo al registrar préstamo.' }
        );
    },

    async devolverPrestamo(prestamoId) {
        return _ejecutarRpcMuta(
            'devolver_prestamo',
            { p_prestamo_id: prestamoId },
            `Devolución del préstamo #${prestamoId}`,
            { porDefecto: 'Error en devolución.' }
        );
    },

    async renovarPrestamo(prestamoId) {
        return _ejecutarRpcMuta(
            'renovar_prestamo',
            { p_prestamo_id: prestamoId },
            `Renovación del préstamo #${prestamoId}`,
            { 
                porDefecto: 'No se pudo renovar el préstamo.',
                migracionFaltante: 'Falta ejecutar la migración 005 en Supabase para poder renovar.'
            }
        );
    },

    async reservarLibro(libroId, lectorRut) {
        return _ejecutarRpcMuta(
            'reservar_libro',
            { p_libro_id: libroId, p_lector_rut: lectorRut },
            `Reserva del libro #${libroId} para el RUT ${lectorRut}`,
            { 
                porDefecto: 'No se pudo registrar la reserva.',
                migracionFaltante: 'Falta ejecutar la migración 022 en Supabase para poder reservar.'
            }
        );
    },

    async retirarReserva(reservaId) {
        return _ejecutarRpcMuta(
            'retirar_reserva',
            { p_reserva_id: reservaId },
            `Retiro de la reserva #${reservaId}`,
            { 
                porDefecto: 'No se pudo registrar el retiro.',
                migracionFaltante: 'Falta ejecutar la migración 022 en Supabase para poder retirar una reserva.'
            }
        );
    },

    /**
     * Todo lo que hace falta saber al escanear un código: el libro, si está
     * prestado, a quién, con qué RUT y en qué situación está esa persona.
     *
     * Devuelve { libro, prestamos } o null si el código no existe.
     */
    async consultarLibro(codigo) {
        // Fase 1.3: ver el comentario de registrarPrestamo sobre por qué el
        // try/catch envuelve solo la llamada, nunca los errores de negocio
        // que este método lanza a propósito más abajo.
        let resultado;
        try {
            resultado = await conTiempoLimite(supabase.rpc('consultar_libro', { p_codigo: codigo }), ESPERA);
        } catch (e) {
            if (esFalloDeRed(e)) return consultarLibroSinConexion(codigo);
            throw e;
        }
        const { data, error } = resultado;
        if (error) {
            if (esFuncionInexistente(error)) {
                throw new Error('Falta ejecutar la migración 006 en Supabase para usar el mesón.');
            }
            if (esFalloDeRed(error)) return consultarLibroSinConexion(codigo);
            throw new Error(error.message || 'No se pudo consultar el libro.');
        }
        if (!data || data.length === 0) return null;

        const f = data[0];
        const libro = {
            id: f.libro_id, isbn: f.isbn, titulo: f.titulo, autor: f.autor,
            genero: f.genero, ubicacion: f.ubicacion, portada_url: f.portada_url,
            copias_totales: f.copias_totales, stock: f.stock
        };
        // Las filas sin prestamo_id significan "no hay préstamos activos"
        const prestamos = data.filter(r => r.prestamo_id !== null && r.prestamo_id !== undefined).map(r => ({
            id: r.prestamo_id,
            fecha_prestamo: r.fecha_prestamo,
            fecha_devolucion_esperada: r.fecha_devolucion_esperada,
            dias_restantes: r.dias_restantes,
            renovaciones: r.renovaciones,
            lector: {
                id: r.lector_id, nombre: r.lector_nombre, rut: r.lector_rut,
                email: r.lector_email, telefono: r.lector_telefono,
                bloqueado_manual: r.lector_bloqueado, atrasados: r.lector_atrasados
            }
        }));
        return { libro, prestamos };
    },

    /**
     * Situación de un lector antes de prestarle: si existe, cuántos libros
     * tiene, cuántos atrasados, si está bloqueado y si puede pedir prestado.
     */
    async estadoLector(rut) {
        // Fase 1.3: ver el comentario de registrarPrestamo sobre el alcance
        // del try/catch.
        let respuesta;
        try {
            respuesta = await conTiempoLimite(supabase.rpc('estado_lector', { p_rut: rut }), ESPERA);
        } catch (e) {
            if (esFalloDeRed(e)) return estadoLectorSinConexion(rut);
            throw e;
        }
        const { data, error } = respuesta;
        if (error) {
            if (esFuncionInexistente(error)) {
                throw new Error('Falta ejecutar la migración 006 en Supabase.');
            }
            if (esFalloDeRed(error)) return estadoLectorSinConexion(rut);
            throw new Error(error.message || 'No se pudo consultar el lector.');
        }
        const resultado = Array.isArray(data) ? data[0] : data;

        // Junto con el resultado del RPC —que solo trae el CONTEO de
        // atrasados, no las fechas— se guarda también el vencimiento de cada
        // préstamo activo de este lector. Es lo que le permite a
        // estadoLectorSinConexion() recalcular "¿tiene algo atrasado?" con el
        // reloj del propio equipo si más tarde se corta la conexión. Nunca
        // debe interrumpir la consulta real si esta segunda llamada falla:
        // si falla, persistencia.js conserva el detalle que ya hubiera.
        let detalle;
        if (resultado?.existe && resultado.lector_id != null) {
            try {
                const { data: activos } = await conTiempoLimite(
                    supabase.from('prestamos')
                        .select('fecha_devolucion_esperada, libros(titulo)')
                        .eq('lector_id', resultado.lector_id)
                        .eq('estado', 'activo'),
                    ESPERA
                );
                detalle = (activos || []).map(p => ({
                    fechaDevolucionEsperada: p.fecha_devolucion_esperada ?? null,
                    tituloLibro: p.libros?.titulo ?? null
                }));
            } catch {
                detalle = undefined;
            }
        }

        // Fase 1.2 (funcionamiento sin conexión): se guarda en el almacén
        // local del mesón para poder mostrarlo si se corta la conexión justo
        // después de consultarlo. Nunca debe interrumpir la consulta real: si
        // el almacén local falla, persistencia.js ya se hace cargo de
        // atraparlo en silencio.
        // .catch(() => {}): deja explícita la intención de ignorar el error y
        // previene UnhandledPromiseRejection si la función lanzara síncronamente.
        persistencia.guardarLectorConsultado({ ...resultado, prestamos_activos_detalle: detalle }).catch(() => {});
        return resultado;
    },

    /**
     * Agrega un libro nuevo al catálogo. Ver el comentario de
     * registrarPrestamo sobre el alcance del try/catch.
     *
     * A diferencia de las siete llamadas de arriba, no es un RPC: es un
     * `insert` directo, así que la única fuente de verdad de "¿ya existe
     * este ISBN?" es la restricción `unique` de la tabla. Sin conexión, el
     * catálogo replicado (Fase 1.2) permite adelantarse a ese rechazo con
     * confianza total, porque es una copia COMPLETA — a diferencia de la
     * copia de lectores, que es parcial a propósito (ver agregarLector).
     */
    async agregarLibro(libro) {
        const datos = {
            isbn: libro.isbn,
            titulo: libro.titulo,
            autor: libro.autor,
            genero: libro.genero || null,
            ubicacion: libro.ubicacion || null,
            portada_url: libro.portada_url || null,
            copias_totales: libro.stock,
            stock: libro.stock,
            // Colección a la que entra el ejemplar (migración 030). `false` es
            // el default de la columna, pero se manda explícito para que el
            // alta quede igual de clara tanto en la sede como en la ruta y no
            // dependa de que la migración esté aplicada.
            es_bibliomovil: !!libro.es_bibliomovil
        };
        let resultado;
        try {
            resultado = await conTiempoLimite(supabase.from('libros').insert([datos]), ESPERA);
        } catch (e) {
            if (esFalloDeRed(e)) return encolarAgregarLibro(datos);
            throw e;
        }
        const { error } = resultado;
        if (error) {
            if (esFalloDeRed(error)) return encolarAgregarLibro(datos);
            throw new Error(error.code === '23505' ? 'El ISBN ya está registrado.' : 'Error al guardar el libro.');
        }
    },

    /**
     * Agrega un lector nuevo. Ver el comentario de agregarLibro sobre por
     * qué esto no es un RPC, y el de guardarLectorLocalOptimista() en
     * persistencia.js sobre por qué, a diferencia de un libro, un RUT
     * duplicado NO se puede descartar con la misma certeza sin conexión: la
     * copia local de lectores es parcial, por diseño (minimización de
     * datos, CUMPLIMIENTO-LEGAL.md §9 bis). Si de verdad hay un duplicado
     * que esta copia parcial no alcanzó a ver, se descubre al reconectar y
     * queda registrado como fallo permanente en el registro de errores
     * (Administración → Diagnóstico) — no se pierde en silencio, pero
     * tampoco se evita de antemano como si fuera un libro.
     */
    async agregarLector(lector) {
        const datos = {
            rut: lector.rut,
            nombre: lector.nombre,
            email: lector.email,
            telefono: lector.telefono,
            consentimiento_fecha: lector.consentimiento_fecha || null,
            consentimiento_version: lector.consentimiento_version || null,
            es_menor: lector.es_menor || false,
            apoderado_nombre: lector.apoderado_nombre || null,
            apoderado_rut: lector.apoderado_rut || null
        };
        let resultado;
        try {
            resultado = await conTiempoLimite(supabase.from('lectores').insert([datos]), ESPERA);
        } catch (e) {
            if (esFalloDeRed(e)) return encolarAgregarLector(datos);
            throw e;
        }
        const { error } = resultado;
        if (error) {
            if (esFalloDeRed(error)) return encolarAgregarLector(datos);
            throw new Error(error.code === '23505' ? 'El RUT ya está registrado.' : 'Error al guardar lector.');
        }
    },

    // El resto de los métodos vive por dominio en js/modules/db/ — ver el
    // comentario al principio de este archivo.
    ...libros,
    ...lectores,
    ...prestamos,
    ...administracion,
    ...personal,
    ...perfil,
    ...diagnostico,
    ...erroresServidor,
    ...enlacesEscaneo,
    ...respaldos,
    ...cumplimiento,
    ...reportes,
    ...reservas
};
