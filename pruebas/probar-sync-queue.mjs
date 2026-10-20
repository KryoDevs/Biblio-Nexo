/**
 * Prueba de la cola de sincronización (Fase 1.3 — funcionamiento sin
 * conexión): la clase SyncQueue en js/modules/db.js, y el respaldo sin
 * conexión de estadoLector()/consultarLibro() que se apoya en
 * js/modules/persistencia.js (Fase 1.2).
 *
 * Cubre lo que pide PROMPT-produccion.md §7 (1.3):
 *   1. Un fallo de RED en préstamo/devolución/renovación se encola, nunca se
 *      pierde ni se muestra como un error normal.
 *   2. Un rechazo REAL del servidor (con código) se lanza tal cual — nunca
 *      se encola algo que el servidor ya dijo que no.
 *   3. La cola reproduce la MISMA llamada que se habría hecho con conexión
 *      (sin reinventar ninguna lógica de negocio — esa la revalida el
 *      servidor al reintentar).
 *   4. Reintento con espera exponencial, y un aviso visible (nunca en
 *      silencio) tanto en un rechazo real al reintentar como al acumular
 *      varios fallos de red seguidos.
 *   5. estadoLector()/consultarLibro() caen a la copia local (Fase 1.2)
 *      cuando la red falla, sin inventar nunca un "no existe" que no se
 *      pueda comprobar sin conexión.
 *
 * No sustituye a una prueba en un navegador real: usa fake-indexeddb (para
 * persistencia.js) y un cliente de Supabase falso hecho a mano, con control
 * total sobre qué responde cada llamada RPC.
 *
 * Ejecutar:
 *   npm install jsdom fake-indexeddb --no-save   (una sola vez, las dos
 *                                                  juntas — ver LEEME.md)
 *   node pruebas/probar-sync-queue.mjs
 */

import 'fake-indexeddb/auto';

// ---------------------------------------------------------------------------
// Registro de resultados
// ---------------------------------------------------------------------------
let pasadas = 0, fallidas = 0;
const comprobar = (descripcion, condicion, detalle = '') => {
    if (condicion) {
        pasadas++;
        console.log(`  ✓ ${descripcion}`);
    } else {
        fallidas++;
        console.log(`  ✗ ${descripcion}${detalle ? ' — ' + detalle : ''}`);
    }
};

// ---------------------------------------------------------------------------
// Entorno mínimo: db.js y errores.js esperan que exista `window`
// (supabase-init.js lo lee directo, sin `typeof window`), y db.js se
// suscribe a `window.addEventListener('online', ...)` al importarse.
// ---------------------------------------------------------------------------
globalThis.window = globalThis.window || {};
globalThis.window.addEventListener = () => {}; // no hace falta que haga nada real aquí
globalThis.window.innerWidth = 0;
globalThis.window.innerHeight = 0;
// Node ya trae un `navigator` global propio (de solo lectura, no se puede
// reemplazar) — no hace falta: errores.js solo lo usa para un diagnóstico
// informativo que no participa en ninguna de estas pruebas.

// ---------------------------------------------------------------------------
// Cliente de Supabase falso.
//
//   .from(tabla)  — mismo "query builder" mínimo que usa
//                   probar-persistencia.mjs, para que persistencia.js pueda
//                   sincronizar el catálogo cuando hace falta sembrar datos.
//   .rpc(nombre)  — con control total: cada llamada consume el próximo
//                   "paso" programado con programarRpc(), o repite el
//                   último si no queda ninguno. Registra cada llamada en
//                   `llamadasRpc` para poder comprobar que la cola reproduce
//                   EXACTAMENTE los mismos parámetros al reintentar.
// ---------------------------------------------------------------------------
const tablas = { libros: [], lectores: [], elementos_eliminados: [], prestamos: [] };

class ConsultaFalsa {
    constructor(filas, tabla) {
        this._filas = filas;
        this._tabla = tabla;
        this._filtros = [];
        this._orden = null;
    }
    select() { return this; }
    eq(col, val) { this._filtros.push(f => f[col] === val); return this; }
    gt(col, val) { this._filtros.push(f => f[col] > val); return this; }
    order(col, { ascending = true } = {}) { this._orden = { col, ascending }; return this; }
    limit() { return this; }
    /**
     * Igual patrón que .rpc()/programarRpc(), pero para un `insert` directo
     * a una tabla — agregarLibro()/agregarLector() no pasan por un RPC, así
     * que necesitan su propio control de "red caída" vs. "rechazo real"
     * (ver programarInsert() más abajo). Por omisión, si nadie programó
     * nada, el insert simplemente funciona y la fila queda en `tablas`.
     */
    insert(filas) {
        const paso = proximoPasoInsert(this._tabla);
        if (paso.tipo === 'red') {
            return Promise.reject(paso.error || new TypeError('Failed to fetch'));
        }
        if (paso.tipo === 'rechazo') {
            return Promise.resolve({
                error: { code: paso.code || 'P0001', message: paso.mensaje || 'Rechazado por el servidor.' }
            });
        }
        this._filas.push(...filas);
        return Promise.resolve({ error: null });
    }
    then(resolver, rechazar) {
        try {
            // ¿Se programó un desenlace especial para esta consulta de tabla?
            // (ver programarConsulta más abajo). Los pasos se CONSUMEN (no se
            // repiten como en .rpc()/.insert()): una consulta con error
            // programado no debe contaminar las sincronizaciones de
            // persistencia.js que usan la misma tabla más adelante.
            const paso = proximoPasoConsulta(this._tabla);
            if (paso?.tipo === 'error') {
                resolver({
                    data: null,
                    error: { code: paso.code || 'PGRST000', message: paso.mensaje || 'Error de consulta programado.' }
                });
                return;
            }
            let filas = this._filas.filter(f => this._filtros.every(fn => fn(f)));
            if (this._orden) {
                const { col, ascending } = this._orden;
                filas = [...filas].sort((a, b) => {
                    if (a[col] === b[col]) return 0;
                    return (a[col] > b[col] ? 1 : -1) * (ascending ? 1 : -1);
                });
            }
            resolver({ data: filas, error: null });
        } catch (e) {
            rechazar(e);
        }
    }
}

const llamadasRpc = [];
const comportamientos = {}; // nombre de la función RPC -> lista de pasos pendientes
const comportamientosInsert = {}; // nombre de tabla -> lista de pasos pendientes
const comportamientosConsulta = {}; // nombre de tabla -> pasos CONSUMIBLES para un select

/** Programa qué debe responder la próxima (o próximas) llamada(s) a este RPC. */
function programarRpc(nombre, pasos) {
    comportamientos[nombre] = [...pasos];
}

/** Igual que programarRpc(), para un `insert` directo a una tabla (agregarLibro/agregarLector). */
function programarInsert(tabla, pasos) {
    comportamientosInsert[tabla] = [...pasos];
}

function proximoPaso(nombre) {
    const pasos = comportamientos[nombre];
    if (!pasos || pasos.length === 0) return { tipo: 'exito', data: null };
    // Si queda uno solo, se repite (para probar fallos de red persistentes
    // sin tener que programar decenas de pasos idénticos a mano).
    return pasos.length > 1 ? pasos.shift() : pasos[0];
}

function proximoPasoInsert(tabla) {
    const pasos = comportamientosInsert[tabla];
    if (!pasos || pasos.length === 0) return { tipo: 'exito' };
    return pasos.length > 1 ? pasos.shift() : pasos[0];
}

/** Programa el desenlace de los próximos `select` a una tabla (se consumen). */
function programarConsulta(tabla, pasos) {
    comportamientosConsulta[tabla] = [...pasos];
}

function proximoPasoConsulta(tabla) {
    const pasos = comportamientosConsulta[tabla];
    if (!pasos || pasos.length === 0) return null;
    return pasos.shift(); // consumible a propósito: ver el comentario en ConsultaFalsa.then()
}

const clienteFalso = {
    from(nombre) {
        return new ConsultaFalsa(tablas[nombre] || [], nombre);
    },
    rpc(nombre, params) {
        llamadasRpc.push({ nombre, params });
        const paso = proximoPaso(nombre);
        if (paso.tipo === 'red') {
            // Simula un fetch que nunca llegó a hablar con el servidor: una
            // excepción SIN .code, exactamente como distingue esFalloDeRed().
            return Promise.reject(paso.error || new TypeError('Failed to fetch'));
        }
        if (paso.tipo === 'sin_codigo') {
            // Simula el otro camino hacia el mismo diagnóstico: un {error}
            // devuelto (no lanzado) pero sin .code — también debe tratarse
            // como fallo de red, no como rechazo del servidor.
            return Promise.resolve({ data: null, error: { message: paso.mensaje || 'Error sin código.' } });
        }
        if (paso.tipo === 'rechazo') {
            // Rechazo REAL del servidor: siempre con .code, como cualquier
            // error genuino de Postgres/PostgREST.
            return Promise.resolve({
                data: null,
                error: { code: paso.code || 'P0001', message: paso.mensaje || 'Rechazado por el servidor.' }
            });
        }
        return Promise.resolve({ data: paso.data ?? null, error: null });
    }
};

globalThis.window.supabase = { createClient: () => clienteFalso };

// ---------------------------------------------------------------------------
// Módulos bajo prueba (importados recién ahora: supabase-init.js lee
// window.supabase al importarse, así que el mock tiene que existir antes).
// ---------------------------------------------------------------------------
const { default: persistencia } = await import('../src/js/modules/persistencia.js');
const { default: registroErrores } = await import('../src/js/modules/errores.js');
const { db, colaSync } = await import('../src/js/modules/db.js');

// Se reemplaza por un espía: así se puede comprobar que un rechazo real (o
// varios fallos de red seguidos) deja un aviso VISIBLE, sin depender de que
// el registro de errores real llegue a hablar con ningún servidor.
const avisos = [];
registroErrores.registrarOperacion = (accion, error) => {
    avisos.push({ accion, mensaje: error?.message || String(error) });
};

async function vaciarCola() {
    const pendientes = await persistencia.listarOperacionesPendientes();
    for (const op of pendientes) await persistencia.quitarOperacion(op.id);
}

// ---------------------------------------------------------------------------
// 1. Fallo de red al ejecutar una escritura: se encola, no se pierde
// ---------------------------------------------------------------------------
console.log('\n1. Fallo de red al ejecutar una escritura: se encola, no se pierde');

programarRpc('prestar_libro', [{ tipo: 'red' }]);
let resultado = await db.registrarPrestamo(5, '11111111-1');
comprobar('registrarPrestamo() devuelve encolado:true cuando la red falla',
    resultado?.encolado === true, JSON.stringify(resultado));
comprobar('trae un mensaje explicando que se completará sola',
    typeof resultado.mensaje === 'string' && resultado.mensaje.length > 0);

let pendientes = await persistencia.listarOperacionesPendientes();
comprobar('la operación quedó guardada en la cola', pendientes.length === 1, JSON.stringify(pendientes));
comprobar('se guardó con los MISMOS parámetros que se habrían mandado con conexión',
    pendientes[0]?.tipo === 'prestar_libro' &&
    pendientes[0]?.params?.p_libro_id === 5 &&
    pendientes[0]?.params?.p_lector_rut === '11111111-1',
    JSON.stringify(pendientes[0]));

await vaciarCola();

// ---------------------------------------------------------------------------
// 2. Rechazo real del servidor: se lanza, NUNCA se encola
// ---------------------------------------------------------------------------
console.log('\n2. Rechazo real del servidor (con código): se lanza, nunca se encola');

programarRpc('prestar_libro', [{ tipo: 'rechazo', code: '23514', mensaje: 'No hay ejemplares disponibles.' }]);
let lanzo = null;
try {
    await db.registrarPrestamo(6, '22222222-2');
} catch (e) {
    lanzo = e;
}
comprobar('un rechazo real lanza el error del servidor tal cual',
    lanzo?.message === 'No hay ejemplares disponibles.', String(lanzo));
pendientes = await persistencia.listarOperacionesPendientes();
comprobar('un rechazo real no deja nada en la cola', pendientes.length === 0, JSON.stringify(pendientes));

// ---------------------------------------------------------------------------
// 3. Un error devuelto sin código también cuenta como fallo de red
// ---------------------------------------------------------------------------
console.log('\n3. Un {error} devuelto sin código (no una excepción) también se trata como fallo de red');

programarRpc('devolver_prestamo', [{ tipo: 'sin_codigo', mensaje: 'Se cortó a mitad de camino.' }]);
resultado = await db.devolverPrestamo(77);
comprobar('devolverPrestamo() también encola cuando el error viene sin .code',
    resultado?.encolado === true, JSON.stringify(resultado));

await vaciarCola();

// ---------------------------------------------------------------------------
// 4. Falta la migración: mensaje específico, tampoco se encola
// ---------------------------------------------------------------------------
console.log('\n4. Falta la migración (función inexistente): mensaje específico, tampoco se encola');

programarRpc('renovar_prestamo', [{ tipo: 'rechazo', code: '42883', mensaje: 'function renovar_prestamo does not exist' }]);
lanzo = null;
try {
    await db.renovarPrestamo(9);
} catch (e) {
    lanzo = e;
}
comprobar('función inexistente da el mensaje de "falta la migración", no el genérico ni el de encolado',
    /migración 005/.test(lanzo?.message || ''), String(lanzo));
pendientes = await persistencia.listarOperacionesPendientes();
comprobar('tampoco se encola cuando lo que falta es la migración', pendientes.length === 0, JSON.stringify(pendientes));

// ---------------------------------------------------------------------------
// 5. Reintento exitoso: al reconectar, se reproduce y sale de la cola
// ---------------------------------------------------------------------------
console.log('\n5. Reintento exitoso: al "reconectar" la operación se reproduce y sale de la cola');

const idReplay = await persistencia.encolarOperacion('prestar_libro',
    { p_libro_id: 8, p_lector_rut: '33333333-3' }, 'Préstamo de prueba');
programarRpc('prestar_libro', [{ tipo: 'exito', data: [{ prestamo_id: 123 }] }]);
llamadasRpc.length = 0;
await colaSync.reintentarPendientes();

pendientes = await persistencia.listarOperacionesPendientes();
comprobar('la operación sale de la cola cuando el reintento tiene éxito',
    !pendientes.some(o => o.id === idReplay), JSON.stringify(pendientes));
comprobar('el reintento llamó al MISMO rpc con los MISMOS parámetros que se habrían usado con conexión ' +
    '(la cola no reinventa la lógica de negocio, solo repite la llamada)',
    llamadasRpc.some(l => l.nombre === 'prestar_libro' && l.params.p_libro_id === 8 && l.params.p_lector_rut === '33333333-3'),
    JSON.stringify(llamadasRpc));

// ---------------------------------------------------------------------------
// 6. Rechazo real al reintentar: sale de la cola, y queda un aviso visible
// ---------------------------------------------------------------------------
console.log('\n6. Rechazo real al reintentar: se saca de la cola y se avisa (nunca en silencio)');

const idFalla = await persistencia.encolarOperacion('devolver_prestamo',
    { p_prestamo_id: 55 }, 'Devolución de prueba');
programarRpc('devolver_prestamo', [{ tipo: 'rechazo', code: '23514', mensaje: 'El préstamo ya estaba devuelto.' }]);
avisos.length = 0;
await colaSync.reintentarPendientes();

pendientes = await persistencia.listarOperacionesPendientes();
comprobar('un rechazo real al reintentar saca la operación de la cola (no tiene sentido reintentar para ' +
    'siempre algo que el servidor ya rechazó de verdad)',
    !pendientes.some(o => o.id === idFalla), JSON.stringify(pendientes));
comprobar('queda un aviso visible en el registro de errores propio, nunca se pierde en silencio',
    avisos.some(a => a.accion === 'sincronizacion' && /rechazada al sincronizar/.test(a.mensaje)),
    JSON.stringify(avisos));

// ---------------------------------------------------------------------------
// 7. Fallo de red persistente: espera exponencial y aviso al quinto intento
// ---------------------------------------------------------------------------
console.log('\n7. Fallo de red persistente al reintentar: espera exponencial, aviso al quinto intento');

const idBackoff = await persistencia.encolarOperacion('renovar_prestamo',
    { p_prestamo_id: 66 }, 'Renovación de prueba');
programarRpc('renovar_prestamo', [{ tipo: 'red' }]); // un solo paso: se repite en cada intento
avisos.length = 0;

// 30 s, 1 min, 2 min, 4 min, 8 min — duplica en cada intento, tal como
// documenta REINTENTO_BASE_MS/REINTENTO_MAX_MS en db.js.
const esperasEsperadas = [30000, 60000, 120000, 240000, 480000];
for (let i = 0; i < 5; i++) {
    // Se fuerza el turno a "ahora" para no depender de temporizadores reales
    // de hasta 8 minutos en una prueba automatizada.
    await persistencia.actualizarOperacion(idBackoff, { proximoIntentoEn: Date.now() });
    const antes = Date.now();
    await colaSync.reintentarPendientes();
    const [op] = (await persistencia.listarOperacionesPendientes()).filter(o => o.id === idBackoff);
    comprobar(`intento ${i + 1}: sigue en cola (fallo de red: se reintenta, no se pierde)`, !!op);
    if (op) {
        const delta = op.proximoIntentoEn - antes;
        comprobar(`intento ${i + 1}: la próxima espera es ~${esperasEsperadas[i] / 1000}s (backoff exponencial)`,
            Math.abs(delta - esperasEsperadas[i]) < 3000, `delta=${delta}ms`);
        comprobar(`intento ${i + 1}: el contador de intentos avanzó a ${i + 1}`,
            op.intentos === i + 1, `intentos=${op.intentos}`);
    }
}
comprobar('al quinto intento seguido sin poder sincronizar, queda un aviso (sigue en cola, pero ya es visible)',
    avisos.some(a => a.accion === 'sincronizacion' && /5 intentos/.test(a.mensaje)), JSON.stringify(avisos));

await vaciarCola();

// Al volver la conexión (evento "online" → reintentarPendientes(true)) no hay
// que seguir esperando lo que quede de la espera exponencial: la red ya
// volvió. Sin forzar (temporizador/intervalo), la espera se respeta igual
// que siempre — las dos mitades de este comportamiento se comprueban aquí.
console.log('\n7b. Reintento forzado al recuperar la conexión: no espera a que venza la espera exponencial');
const idForzado = await persistencia.encolarOperacion('prestar_libro',
    { p_libro_id: 21, p_lector_rut: '22222222-2' }, 'Préstamo con espera lejana');
await persistencia.actualizarOperacion(idForzado, { proximoIntentoEn: Date.now() + 60 * 60 * 1000 });
programarRpc('prestar_libro', [{ tipo: 'exito', data: [{ prestamo_id: 456 }] }]);
llamadasRpc.length = 0;
await colaSync.reintentarPendientes();
pendientes = await persistencia.listarOperacionesPendientes();
comprobar('sin forzar, una operación cuya espera no ha vencido sigue en cola y no se llama al RPC',
    pendientes.some(o => o.id === idForzado) && !llamadasRpc.some(l => l.nombre === 'prestar_libro'),
    JSON.stringify({ pendientes, llamadasRpc }));
await colaSync.reintentarPendientes(true);
pendientes = await persistencia.listarOperacionesPendientes();
comprobar('forzando (como hace el evento "online"), la misma operación se reproduce de inmediato y sale de la cola',
    !pendientes.some(o => o.id === idForzado) && llamadasRpc.some(l => l.nombre === 'prestar_libro' && l.params.p_libro_id === 21),
    JSON.stringify({ pendientes, llamadasRpc }));

await vaciarCola();

// ---------------------------------------------------------------------------
// 8. estadoLector(): respaldo sin conexión con la copia local (Fase 1.2)
// ---------------------------------------------------------------------------
console.log('\n8. estadoLector() cae a la copia local cuando la red falla');

await persistencia.guardarLectorConsultado({
    existe: true, lector_id: 50, nombre: 'Lector Offline', rut: '55555555-5',
    email: 'off@x.cl', telefono: '+56955555555', bloqueado_manual: false, motivo_bloqueo: null
});

programarRpc('estado_lector', [{ tipo: 'red' }]);
const estadoOffline = await db.estadoLector('55555555-5');
comprobar('con la red caída y el lector ya en la copia local, estadoLector() responde igual (offline:true)',
    estadoOffline?.existe === true && estadoOffline?.offline === true && estadoOffline?.lector_id === 50,
    JSON.stringify(estadoOffline));
comprobar('sin préstamos activos guardados localmente, no hay nada que pueda estar atrasado: puede_prestar da true',
    estadoOffline?.puede_prestar === true && estadoOffline?.prestamos_atrasados === 0);

programarRpc('estado_lector', [{ tipo: 'red' }]);
lanzo = null;
try {
    await db.estadoLector('99999999-9'); // nunca se guardó localmente
} catch (e) {
    lanzo = e;
}
comprobar('un lector que nunca se guardó localmente lanza un error claro en vez de existe:false ' +
    '(evita el flujo de "lector nuevo" y un posible duplicado al reconectar)',
    lanzo instanceof Error && /copia local/.test(lanzo.message), String(lanzo));

await persistencia.guardarLectorConsultado({
    existe: true, lector_id: 51, nombre: 'Lector Bloqueado', rut: '66666666-6',
    email: null, telefono: null, bloqueado_manual: true, motivo_bloqueo: 'Libro perdido'
});
programarRpc('estado_lector', [{ tipo: 'red' }]);
const estadoBloqueado = await db.estadoLector('66666666-6');
comprobar('un lector bloqueado manualmente sigue bloqueado sin conexión (el único dato local confiable)',
    estadoBloqueado?.puede_prestar === false && /Libro perdido/.test(estadoBloqueado?.motivo_rechazo || ''),
    JSON.stringify(estadoBloqueado));

// Ampliación: atrasados recalculados sin conexión con el reloj del equipo,
// a partir de la fecha de vencimiento guardada (no un conteo cacheado).
await persistencia.guardarLectorConsultado({
    existe: true, lector_id: 52, nombre: 'Lector Atrasado', rut: '77777777-7',
    email: null, telefono: null, bloqueado_manual: false, motivo_bloqueo: null,
    prestamos_activos_detalle: [
        { fechaDevolucionEsperada: '2020-01-01', tituloLibro: 'Libro Viejo' }
    ]
});
programarRpc('estado_lector', [{ tipo: 'red' }]);
const estadoAtrasado = await db.estadoLector('77777777-7');
comprobar('un préstamo vencido según la fecha guardada bloquea el préstamo sin conexión, aunque no haya bloqueo manual',
    estadoAtrasado?.puede_prestar === false && /atrasada/.test(estadoAtrasado?.motivo_rechazo || '') &&
    /Libro Viejo/.test(estadoAtrasado?.motivo_rechazo || ''),
    JSON.stringify(estadoAtrasado));

// Y el caso contrario: un préstamo activo que TODAVÍA no vence no bloquea.
await persistencia.guardarLectorConsultado({
    existe: true, lector_id: 53, nombre: 'Lector Al Día', rut: '88888888-8',
    email: null, telefono: null, bloqueado_manual: false, motivo_bloqueo: null,
    prestamos_activos_detalle: [
        { fechaDevolucionEsperada: '2099-01-01', tituloLibro: 'Libro Nuevo' }
    ]
});
programarRpc('estado_lector', [{ tipo: 'red' }]);
const estadoAlDia = await db.estadoLector('88888888-8');
comprobar('un préstamo activo que aún no vence no bloquea sin conexión',
    estadoAlDia?.puede_prestar === true, JSON.stringify(estadoAlDia));

// Consultar de nuevo sin el detalle (segunda consulta falló) no debe borrar
// el atraso ya conocido de una sincronización anterior.
await persistencia.guardarLectorConsultado({
    existe: true, lector_id: 52, nombre: 'Lector Atrasado', rut: '77777777-7',
    email: null, telefono: null, bloqueado_manual: false, motivo_bloqueo: null
    // sin prestamos_activos_detalle: simula que la segunda consulta falló
});
programarRpc('estado_lector', [{ tipo: 'red' }]);
const estadoConservado = await db.estadoLector('77777777-7');
comprobar('si una consulta posterior no trae el detalle de atrasados, se conserva el que ya había (no se borra con un arreglo vacío)',
    estadoConservado?.puede_prestar === false && /atrasada/.test(estadoConservado?.motivo_rechazo || ''),
    JSON.stringify(estadoConservado));

// El mismo escenario, pero por el camino REAL de db.estadoLector() en línea:
// el RPC responde bien, pero la segunda consulta (los préstamos activos que
// alimentan el detalle) vuelve con { data: null, error } SIN lanzar ninguna
// excepción — así responde PostgREST ante un error de servidor. Ese `null`
// no puede convertirse en un detalle vacío que pise el atraso ya guardado:
// "no se pudo consultar" no es lo mismo que "no tiene préstamos activos".
await persistencia.guardarLectorConsultado({
    existe: true, lector_id: 54, nombre: 'Lector Con Detalle Previo', rut: '44444444-4',
    email: null, telefono: null, bloqueado_manual: false, motivo_bloqueo: null,
    prestamos_activos_detalle: [
        { fechaDevolucionEsperada: '2020-06-01', tituloLibro: 'Libro Atrasado Previo' }
    ]
});
programarRpc('estado_lector', [{ tipo: 'exito', data: [{
    existe: true, lector_id: 54, nombre: 'Lector Con Detalle Previo', rut: '44444444-4',
    email: null, telefono: null, bloqueado_manual: false, motivo_bloqueo: null,
    prestamos_activos: 1, prestamos_atrasados: 1, puede_prestar: false,
    motivo_rechazo: 'Tiene préstamos atrasados.'
}] }]);
programarConsulta('prestamos', [{ tipo: 'error', mensaje: 'Error interno al consultar préstamos.' }]);
await db.estadoLector('44444444-4');
// estadoLector() guarda en segundo plano (sin await, a propósito): se da un
// margen breve para que la escritura en IndexedDB alcance a completarse.
await new Promise(r => setTimeout(r, 50));
programarRpc('estado_lector', [{ tipo: 'red' }]);
const estadoTrasErrorConsulta = await db.estadoLector('44444444-4');
comprobar('un error {data:null,error} en la consulta de préstamos activos NO borra el detalle de atrasados ya guardado ' +
    '(sin conexión, ese lector debe seguir sin poder pedir prestado)',
    estadoTrasErrorConsulta?.puede_prestar === false && /atrasada/.test(estadoTrasErrorConsulta?.motivo_rechazo || ''),
    JSON.stringify(estadoTrasErrorConsulta));

// ---------------------------------------------------------------------------
// 9. consultarLibro(): respaldo sin conexión con el catálogo local
// ---------------------------------------------------------------------------
console.log('\n9. consultarLibro() cae a la copia local cuando la red falla');

tablas.libros = [
    { id: 40, isbn: '999888', titulo: 'Libro de prueba offline', autor: 'Autora Test',
      stock: 2, copias_totales: 2, actualizado_en: '2026-08-10T00:00:00Z' }
];
await persistencia.sincronizarLibros();

programarRpc('consultar_libro', [{ tipo: 'red' }]);
const consultaOffline = await db.consultarLibro('999888');
comprobar('con la red caída, un libro ya replicado se puede consultar igual (offline:true, sin préstamos)',
    consultaOffline?.libro?.id === 40 && consultaOffline?.offline === true &&
    Array.isArray(consultaOffline?.prestamos) && consultaOffline.prestamos.length === 0,
    JSON.stringify(consultaOffline));

programarRpc('consultar_libro', [{ tipo: 'red' }]);
lanzo = null;
try {
    await db.consultarLibro('codigo-que-no-existe-en-ningun-lado');
} catch (e) {
    lanzo = e;
}
comprobar('un código que no está en la copia local da un error claro en vez de ofrecer darlo de alta a ciegas',
    lanzo instanceof Error && /copia local/.test(lanzo.message), String(lanzo));

// ---------------------------------------------------------------------------
// 10. colaSync.estado(): diagnóstico para un futuro indicador (Fase 1.4)
// ---------------------------------------------------------------------------
console.log('\n10. colaSync.estado(): diagnóstico');

await vaciarCola();
let estadoCola = await colaSync.estado();
comprobar('sin nada pendiente, reporta 0', estadoCola.pendientes === 0, JSON.stringify(estadoCola));

await persistencia.encolarOperacion('prestar_libro', { p_libro_id: 1, p_lector_rut: '11111111-1' }, 'Diagnóstico');
estadoCola = await colaSync.estado();
comprobar('con una operación en cola, reporta 1', estadoCola.pendientes === 1, JSON.stringify(estadoCola));

await vaciarCola();

// ---------------------------------------------------------------------------
// 11. agregarLibro()/agregarLector(): alta sin conexión (Fase 1.3, ampliación)
// ---------------------------------------------------------------------------
console.log('\n11. agregarLibro()/agregarLector() sin conexión');

// Caso feliz: sin red, el libro se guarda de inmediato en la copia local
// (con id sintético negativo) y la operación queda encolada.
programarInsert('libros', [{ tipo: 'red' }]);
const rLibro = await db.agregarLibro({
    isbn: '111222333', titulo: 'Libro Nuevo Offline', autor: 'Autor X',
    genero: 'Novela', ubicacion: 'Estante 3', stock: 1
});
comprobar('agregarLibro() sin conexión queda encolado, no lanza',
    rLibro?.encolado === true, JSON.stringify(rLibro));
const libroLocal = await persistencia.buscarLibroLocalPorCodigo('111222333');
comprobar('el libro agregado sin conexión aparece de inmediato en la copia local (guardado optimista)',
    libroLocal?.titulo === 'Libro Nuevo Offline' && libroLocal?.id < 0,
    JSON.stringify(libroLocal));

// Duplicado detectable con certeza: el catálogo local YA tiene ese ISBN
// (sembrado en la sección 9), así que se rechaza sin encolar nada.
lanzo = null;
try {
    await db.agregarLibro({ isbn: '999888', titulo: 'Repetido', autor: 'Y', stock: 1 });
} catch (e) {
    lanzo = e;
}
comprobar('un ISBN que ya está en el catálogo local se rechaza sin conexión, sin encolar (duplicado detectable con certeza)',
    lanzo instanceof Error && /ya está registrado/.test(lanzo.message), String(lanzo));

// Al reconectar, la cola confirma el alta real y retira la entrada
// optimista — no debe quedar duplicada junto a la fila "de verdad".
programarInsert('libros', [{ tipo: 'exito' }]);
await colaSync.reintentarPendientes();
const libroTrasSync = await persistencia.buscarLibroLocalPorCodigo('111222333');
comprobar('tras sincronizar, la entrada optimista del libro se retira (ya no tiene id negativo)',
    libroTrasSync == null || libroTrasSync.id > 0, JSON.stringify(libroTrasSync));

await vaciarCola();

// Lector: mismo patrón, pero a propósito SIN la verificación previa de
// duplicado (ver el docstring de agregarLector en db.js) — un RUT que el
// servidor ya tiene pero que este equipo nunca consultó no se puede
// descartar con la misma certeza que un ISBN, porque la copia de lectores
// es parcial.
programarInsert('lectores', [{ tipo: 'red' }]);
const rLector = await db.agregarLector({
    rut: '12345678-9', nombre: 'Lector Nuevo Offline', email: 'x@x.cl', telefono: '+56911111111'
});
comprobar('agregarLector() sin conexión queda encolado, no lanza',
    rLector?.encolado === true, JSON.stringify(rLector));
const lectorLocal = await persistencia.buscarLectorLocalPorRut('12345678-9');
comprobar('el lector agregado sin conexión aparece de inmediato en la copia local (para poder prestarle en la misma sesión)',
    lectorLocal?.nombre === 'Lector Nuevo Offline' && lectorLocal?.id < 0,
    JSON.stringify(lectorLocal));

// Ese mismo lector recién agregado ya se le puede prestar sin conexión (es
// justo lo que motivó guardarlo de inmediato, no solo encolarlo a ciegas).
const estadoLectorNuevo = await db.estadoLector('12345678-9');
comprobar('un lector agregado sin conexión ya se puede consultar/prestar en la misma sesión offline',
    estadoLectorNuevo?.puede_prestar === true, JSON.stringify(estadoLectorNuevo));

// Al reconectar, si el servidor de verdad rechaza por RUT duplicado
// (23505), es un rechazo real — no un fallo de red — y debe fallar
// permanentemente con aviso, nunca reintentar para siempre.
programarInsert('lectores', [{ tipo: 'rechazo', code: '23505', mensaje: 'ya existe' }]);
avisos.length = 0;
await colaSync.reintentarPendientes();
comprobar('un RUT duplicado detectado recién al reconectar se marca como fallo permanente, con aviso visible',
    avisos.some(a => /ya existe|23505|Rechazado/.test(a.mensaje)), JSON.stringify(avisos));

await vaciarCola();

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pasadas} comprobaciones correctas, ${fallidas} con fallo`);
process.exit(fallidas === 0 ? 0 : 1);
