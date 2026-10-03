import { supabase } from '../supabase-init.js';
import { traerTodasLasFilas } from './db/compartido.js';

/**
 * Persistencia local (Fase 1.2 y 1.3 — funcionamiento sin conexión).
 *
 * Qué hace y qué NO hace:
 *
 *   - Guarda una copia del CATÁLOGO completo en IndexedDB, con sincronización
 *     por delta (`actualizado_en`, migración 011): en vez de traer todos los
 *     libros cada vez, solo pide lo que cambió desde la última sincronización.
 *   - Guarda una copia PARCIAL de los LECTORES — nunca el padrón completo.
 *   - Desde la Fase 1.3: expone búsquedas locales (`buscarLibroLocalPorCodigo`,
 *     `buscarLectorLocalPorRut`) que `db.js` usa como último recurso cuando
 *     la red falla, y el almacén `colaSync` — la cola de escrituras
 *     pendientes que orquesta la clase `SyncQueue`, definida en `db.js` (la
 *     lógica de reintento vive allá; aquí solo se guarda).
 *
 * Por qué los lectores se tratan distinto del catálogo — esto no es una
 * decisión de diseño libre, está exigido por CUMPLIMIENTO-LEGAL.md, sección
 * "9 bis" (riesgo abierto identificado el 30 de julio de 2026, al planificar
 * esta misma fase):
 *
 *   1. NUNCA se hace un volcado completo de "lectores" a este almacén. Un
 *      lector entra a la copia local por una de dos vías, ambas acotadas:
 *      - `guardarLectorConsultado()`: alguien lo buscó por RUT en el mesón
 *        (db.estadoLector). Es exactamente el lector que se necesita a mano
 *        para la Fase 1.3, ni uno más.
 *      - `sincronizarLectoresActivos()`: tiene un préstamo activo en este
 *        momento — es información que YA es visible en la vista Préstamos,
 *        no un dato nuevo expuesto.
 *   2. Todo lector local se purga solo por antigüedad
 *      (`purgarLectoresAntiguos`): si nadie lo vuelve a consultar y no tiene
 *      un préstamo activo (que refresca la marca de consulta cada vez que se
 *      sincroniza), desaparece del disco del equipo del mesón a los 30 días.
 *   3. El derecho de supresión SÍ llega hasta acá (`purgarLectoresEliminados`):
 *      un DELETE de verdad en el servidor no se puede transmitir por marca de
 *      tiempo — la fila ya no existe, no queda nada que traiga la fecha —, así
 *      que se consulta aparte la tabla de lápidas
 *      (`elementos_eliminados`, migración 015) para enterarse de qué se borró
 *      y borrarlo también aquí. Sin esto, alguien que ejerce su derecho de
 *      supresión seguiría con sus datos en el disco del mesón indefinidamente.
 *   4. El service worker (sw.js, Fase 1.1) nunca cachea ninguna respuesta de
 *      Supabase — los datos personales entran a este almacén únicamente por
 *      las dos vías controladas de arriba, nunca de rebote por una caché
 *      genérica de red.
 *
 * Lo que sigue sin resolver, y es responsabilidad de la organización, no del
 * código (documentado igual en CUMPLIMIENTO-LEGAL.md): el disco del equipo
 * del mesón no está cifrado. Sin cifrado de disco y bloqueo de sesión del
 * sistema operativo, cualquiera con acceso físico al computador alcanza esta
 * copia local mientras no se haya purgado.
 */

// Id sintético para altas sin conexión. Antes era -Date.now() a secas: dos
// altas dentro del mismo milisegundo (dos escaneos seguidos, por ejemplo)
// producían el MISMO id y la segunda pisaba a la primera en IndexedDB. Este
// contador solo baja, así que nunca se repite dentro de la sesión, y sigue
// siendo negativo para no chocar jamás con un id real de Postgres.
let ultimoIdOptimista = 0;
function idOptimista() {
    ultimoIdOptimista = Math.min(ultimoIdOptimista - 1, -Date.now());
    return ultimoIdOptimista;
}

function normalizarTextoBusqueda(valor) {
    return (valor ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
}

/**
 * Replica en la copia local los filtros de buscar_libros() del servidor.
 * Exportada para probar la lógica real (no una copia escrita en el test).
 */
export function filtrarLibrosLocales(libros, busqueda = '', esBibliomovil = null, filtroStock = 'todos') {
    const consulta = normalizarTextoBusqueda(busqueda).trim();
    return (Array.isArray(libros) ? libros : []).filter(libro => {
        if (esBibliomovil !== null && esBibliomovil !== undefined && libro.es_bibliomovil !== esBibliomovil) return false;

        const stock = Number(libro.stock ?? 0);
        if (filtroStock === 'disponibles' && !(stock > 0)) return false;
        if (filtroStock === 'prestados' && stock !== 0) return false;
        if (!consulta) return true;

        return [libro.titulo, libro.autor, libro.isbn]
            .some(valor => normalizarTextoBusqueda(valor).includes(consulta));
    });
}

const NOMBRE_BD = 'biblionexo-local';
// v2 (Fase 1.3): agrega el índice "rut" a "lectores" (para encontrarlo
// offline sin recorrer todo el almacén) y el almacén "colaSync" — la cola de
// escrituras pendientes de SyncQueue, en js/modules/db.js. Ver el bloque de
// onupgradeneeded más abajo: cada pieza se crea solo si falta, así que sirve
// igual para una instalación nueva (salta de 0 a 2 de un tirón) que para
// alguien que ya tenía la v1 (solo se agrega lo que falta).
const VERSION_BD = 2;

// Cuánto puede vivir un lector en el almacén local sin que nadie lo consulte
// ni tenga un préstamo activo. Es una purga por antigüedad, no un permiso de
// conservación distinto al que ya rige en el servidor (CUMPLIMIENTO-LEGAL.md
// sección 7) — es mucho más corta a propósito: esto es una copia de trabajo
// del mesón, no un registro.
const RETENCION_LECTORES_DIAS = 30;

// Tope de páginas por sincronización, para que un error de lógica no termine
// en un bucle infinito pidiendo la misma página para siempre. Con el tamaño
// de esta biblioteca (cientos de títulos, no cientos de miles), nunca debería
// acercarse a este número.
const TOPE_PAGINAS = 50;
const TAMANO_PAGINA = 500;

let promesaBD = null;

/** Abre (o crea) el almacén local. Memoiza la promesa: dos llamadas seguidas
 *  no abren dos conexiones ni disparan `onupgradeneeded` dos veces. */
function abrir() {
    if (promesaBD) return promesaBD;
    promesaBD = new Promise((resolver, rechazar) => {
        if (typeof indexedDB === 'undefined') {
            rechazar(new Error('Este navegador no soporta almacenamiento local (IndexedDB).'));
            return;
        }
        const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
        peticion.onupgradeneeded = () => {
            const bd = peticion.result;
            const tx = peticion.transaction;

            const almacenLibros = bd.objectStoreNames.contains('libros')
                ? tx.objectStore('libros')
                : bd.createObjectStore('libros', { keyPath: 'id' });
            if (!almacenLibros.indexNames.contains('isbn')) {
                // Para poder buscar un libro por ISBN sin conexión (Fase 1.3,
                // consultarLibro) sin recorrer todo el catálogo local.
                almacenLibros.createIndex('isbn', 'isbn');
            }

            const almacenLectores = bd.objectStoreNames.contains('lectores')
                ? tx.objectStore('lectores')
                : bd.createObjectStore('lectores', { keyPath: 'id' });
            if (!almacenLectores.indexNames.contains('consultadoEn')) {
                // Para poder purgar por antigüedad sin recorrer todo el almacén.
                almacenLectores.createIndex('consultadoEn', 'consultadoEn');
            }
            if (!almacenLectores.indexNames.contains('rut')) {
                // Para poder buscar un lector por RUT sin conexión (Fase 1.3,
                // estadoLector) — el almacén se indexa por id, no por rut.
                almacenLectores.createIndex('rut', 'rut');
            }

            if (!bd.objectStoreNames.contains('meta')) {
                bd.createObjectStore('meta', { keyPath: 'clave' });
            }

            if (!bd.objectStoreNames.contains('colaSync')) {
                // La cola de escrituras pendientes (Fase 1.3). La orquesta
                // SyncQueue en js/modules/db.js; este almacén solo la guarda.
                const almacenCola = bd.createObjectStore('colaSync', { keyPath: 'id', autoIncrement: true });
                almacenCola.createIndex('proximoIntentoEn', 'proximoIntentoEn');
            }
        };
        peticion.onsuccess = () => resolver(peticion.result);
        peticion.onerror = () => {
            promesaBD = null; // permite reintentar en la próxima llamada
            rechazar(peticion.error || new Error('No se pudo abrir el almacén local.'));
        };
    });
    return promesaBD;
}

/** Envuelve una transacción de un solo almacén en una promesa. */
function conAlmacen(bd, nombre, modo, fn) {
    return new Promise((resolver, rechazar) => {
        const tx = bd.transaction(nombre, modo);
        const almacen = tx.objectStore(nombre);
        let resultado;
        Promise.resolve(fn(almacen))
            .then(r => { resultado = r; })
            .catch(rechazar);
        tx.oncomplete = () => resolver(resultado);
        tx.onerror = () => rechazar(tx.error || new Error(`Fallo en el almacén local "${nombre}".`));
        tx.onabort = () => rechazar(tx.error || new Error(`Transacción abortada en "${nombre}".`));
    });
}

function pedido(peticionIDB) {
    return new Promise((resolver, rechazar) => {
        peticionIDB.onsuccess = () => resolver(peticionIDB.result);
        peticionIDB.onerror = () => rechazar(peticionIDB.error);
    });
}

async function leerMeta(clave) {
    const bd = await abrir();
    const fila = await conAlmacen(bd, 'meta', 'readonly', almacen => pedido(almacen.get(clave)));
    return fila ? fila.valor : null;
}

async function escribirMeta(clave, valor) {
    const bd = await abrir();
    await conAlmacen(bd, 'meta', 'readwrite', almacen => almacen.put({ clave, valor }));
}

async function ponerVarios(nombreAlmacen, filas) {
    if (!filas.length) return;
    const bd = await abrir();
    await conAlmacen(bd, nombreAlmacen, 'readwrite', almacen => {
        filas.forEach(fila => almacen.put(fila));
    });
}

async function borrarVarios(nombreAlmacen, ids) {
    if (!ids.length) return;
    const bd = await abrir();
    await conAlmacen(bd, nombreAlmacen, 'readwrite', almacen => {
        ids.forEach(id => almacen.delete(id));
    });
}

async function obtenerTodos(nombreAlmacen) {
    const bd = await abrir();
    return conAlmacen(bd, nombreAlmacen, 'readonly', almacen => pedido(almacen.getAll()));
}

/** Trae, en páginas, todo lo de `tabla` con `actualizado_en` posterior a
 *  `marca` (o toda la tabla si `marca` es null: primera sincronización). */
/**
 * Trae todas las filas nuevas desde un cursor `{t, id}` (marca de tiempo + id
 * de la última fila procesada con esa marca).
 *
 * Por qué no basta `gte(marca)` + `limit`, que era lo de antes: un UPDATE
 * masivo (una migración, un `update ... set` como el de la 026) deja TODAS las
 * filas con el mismo `actualizado_en` — `now()` es igual para toda la
 * transacción. Si esa marca caía en el borde de una página, el bucle volvía a
 * pedir la misma página y el resto del catálogo nunca llegaba a la copia
 * local; y con las lápidas, que son un requisito del derecho de supresión
 * (CUMPLIMIENTO-LEGAL.md § 9 bis), perder filas no es aceptable.
 *
 * El cursor se mueve así:
 *   1. `inicial`  : primera sincronización, ordenar por (marca, id).
 *   2. `dentro`   : filas con la MISMA marca y id mayor — se agota la marca
 *                   sin ambigüedad, sin offsets que se corran.
 *   3. `siguiente`: la marca se agotó; traer marcas mayores.
 *   4. `marca-completa`: una instalación vieja guardó solo la marca, sin id.
 *                   Se incluyen una vez todas las filas de esa marca (pueden
 *                   repetirse filas ya procesadas; el llamador las de-duplica).
 */
async function traerDesdeMarca(tabla, columnas, columnaMarca, cursor, { filtros = [], onProgress } = {}) {
    const filas = [];
    let t = cursor.t;
    let id = cursor.id;
    let paginas = 0;
    let modo = t === null ? 'inicial' : (id === null ? 'marca-completa' : 'dentro');

    const base = () => {
        let q = supabase.from(tabla).select(columnas);
        for (const [columna, valor] of filtros) q = q.eq(columna, valor);
        return q;
    };

    while (paginas < TOPE_PAGINAS) {
        if (onProgress) onProgress({ mensaje: `Descargando ${tabla} (página ${paginas + 1})...` });
        let q;
        if (modo === 'inicial') {
            q = base().order(columnaMarca, { ascending: true }).order('id', { ascending: true }).limit(TAMANO_PAGINA);
        } else if (modo === 'marca-completa') {
            q = base().eq(columnaMarca, t).order('id', { ascending: true }).limit(TAMANO_PAGINA);
        } else if (modo === 'dentro') {
            q = base().eq(columnaMarca, t).gt('id', id).order('id', { ascending: true }).limit(TAMANO_PAGINA);
        } else {
            q = base().gt(columnaMarca, t).order(columnaMarca, { ascending: true }).order('id', { ascending: true }).limit(TAMANO_PAGINA);
        }

        const { data, error } = await q;
        if (error) throw error;
        const lote = data || [];
        paginas++;

        if (lote.length === 0) {
            if (modo === 'dentro' || modo === 'marca-completa') { modo = 'siguiente'; continue; }
            break; // no hay más filas, ni en esta marca ni en las siguientes
        }

        filas.push(...lote);
        t = lote[lote.length - 1][columnaMarca];
        id = lote[lote.length - 1].id;
        modo = lote.length < TAMANO_PAGINA ? 'siguiente' : 'dentro';
    }

    // Una instalación vieja pudo dejar la fila de borde repetida: se de-duplica.
    const unicas = new Map();
    for (const fila of filas) unicas.set(fila.id, fila);
    return { filas: [...unicas.values()], t, id };
}

/** Lee el cursor guardado (marca + id) de un par de claves de `meta`. */
async function leerCursor(claveMarca, claveId) {
    const [t, id] = await Promise.all([leerMeta(claveMarca), leerMeta(claveId)]);
    return { t: t || null, id: id === null || id === undefined ? null : id };
}

/** Guarda el cursor (marca + id) en `meta`, si avanzó. */
async function escribirCursor(claveMarca, claveId, t, id) {
    if (!t) return;
    await escribirMeta(claveMarca, t);
    if (id !== null && id !== undefined) await escribirMeta(claveId, id);
}

class PersistentStorage {
    async buscarLibrosLocales(busqueda = '', pagina = 0, porPagina = 25, esBibliomovil = null, filtroStock = 'todos') {
        const bd = await abrir();
        const todos = await conAlmacen(bd, 'libros', 'readonly', almacen => pedido(almacen.getAll()));

        // Mismos filtros que buscar_libros() en la base (010/026), incluidos
        // el campo real de stock, el booleano estricto y la búsqueda sin tildes.
        const filtrados = filtrarLibrosLocales(todos, busqueda, esBibliomovil, filtroStock);
        filtrados.sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es-CL'));
        const tamano = Number.isInteger(Number(porPagina)) ? Math.max(1, Number(porPagina)) : 25;
        const paginaSegura = Number.isInteger(Number(pagina)) ? Math.max(0, Number(pagina)) : 0;
        const inicio = paginaSegura * tamano;
        return {
            libros: filtrados.slice(inicio, inicio + tamano),
            total: filtrados.length
        };
    }

    async buscarLectoresLocales(busqueda = '', pagina = 0, porPagina = 25) {
        const bd = await abrir();
        const todos = await conAlmacen(bd, 'lectores', 'readonly', almacen => pedido(almacen.getAll()));
        const limpia = (busqueda || '').trim().toLowerCase();
        const filtrados = limpia ? todos.filter(l => 
            (l.nombre && l.nombre.toLowerCase().includes(limpia)) ||
            (l.rut && l.rut.toLowerCase().includes(limpia)) ||
            (l.email && l.email.toLowerCase().includes(limpia))
        ) : todos;
        filtrados.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        const inicio = pagina * porPagina;
        return {
            lectores: filtrados.slice(inicio, inicio + porPagina),
            total: filtrados.length
        };
    }

    /**
     * Sincroniza el catálogo completo. Delta por `actualizado_en`: la primera
     * vez trae todo; después, solo lo que cambió. También aplica las lápidas
     * de `libros` (borrados reales), aunque para el catálogo — sin datos
     * personales — es más una prolijidad que un requisito legal.
     *
     * Nunca lanza: sin conexión, o si algo falla a mitad de camino, se
     * conserva la copia que ya había y se reintenta en la próxima llamada.
     * Es sincronización en segundo plano — no debe interrumpir nada.
     */
    async sincronizarLibros(onProgress) {
        try {
            const cursorCambios = await leerCursor('libros_ultima_sync', 'libros_ultima_sync_id');
            const cambios = await traerDesdeMarca('libros', '*', 'actualizado_en', cursorCambios, { onProgress });
            const filas = cambios.filas;
            if (onProgress && filas.length) onProgress({ mensaje: `Guardando ${filas.length} libros actualizados...` });
            await ponerVarios('libros', filas);
            await escribirCursor('libros_ultima_sync', 'libros_ultima_sync_id', cambios.t, cambios.id);

            const cursorBajas = await leerCursor('libros_eliminados_ultima_sync', 'libros_eliminados_ultima_sync_id');
            const bajas = await traerDesdeMarca('elementos_eliminados', 'id, eliminado_en', 'eliminado_en', cursorBajas,
                { filtros: [['tabla', 'libros']] });
            await borrarVarios('libros', bajas.filas.map(l => l.id));
            await escribirCursor('libros_eliminados_ultima_sync', 'libros_eliminados_ultima_sync_id', bajas.t, bajas.id);
            return { libros: filas.length, eliminados: bajas.filas.length };
        } catch (e) {
            return { error: e.message || String(e) };
        }
    }

    /**
     * Guarda (o refresca) un lector recién consultado por RUT en el mesón.
     * Es la única vía "manual" de entrada al almacén de lectores — se llama
     * desde db.js justo después de un `estadoLector()` exitoso, nunca en
     * bloque ni por adelantado.
     *
     * Espera la forma que devuelve la función `estado_lector` (existe,
     * lector_id, nombre, rut, email, telefono, bloqueado_manual,
     * motivo_bloqueo, ...) más `prestamos_activos_detalle` — un arreglo con
     * la fecha de vencimiento de cada préstamo activo, que db.js agrega con
     * una segunda consulta después del RPC (ver estadoLector() en db.js).
     * Si esa segunda consulta falló (por ejemplo, la red se cortó justo
     * después del RPC principal) y no llega, se conserva el detalle que ya
     * hubiera de una sincronización anterior en vez de borrarlo con un
     * arreglo vacío — eso haría ver a un lector atrasado como si no lo
     * estuviera la próxima vez que se consulte sin conexión.
     */
    async guardarLectorConsultado(estadoLector) {
        if (!estadoLector || estadoLector.existe === false || estadoLector.lector_id === null || estadoLector.lector_id === undefined) return;
        try {
            const bd = await abrir();
            await conAlmacen(bd, 'lectores', 'readwrite', async almacen => {
                const previo = await pedido(almacen.get(estadoLector.lector_id));
                almacen.put({
                    id: estadoLector.lector_id,
                    nombre: estadoLector.nombre ?? null,
                    rut: estadoLector.rut ?? null,
                    email: estadoLector.email ?? null,
                    telefono: estadoLector.telefono ?? null,
                    bloqueadoManual: !!estadoLector.bloqueado_manual,
                    motivoBloqueo: estadoLector.motivo_bloqueo ?? null,
                    prestamosActivosDetalle: estadoLector.prestamos_activos_detalle
                        ?? previo?.prestamosActivosDetalle
                        ?? [],
                    consultadoEn: Date.now()
                });
            });
        } catch {
            // Nunca debe interrumpir el flujo de préstamo por esto.
        }
    }

    /**
     * Replica (o refresca) solo a los lectores con un préstamo activo AHORA
     * MISMO — información que ya es visible en la vista Préstamos del mesón,
     * no un dato nuevo expuesto. Al refrescar `consultadoEn`, un lector con
     * préstamo activo nunca se purga por antigüedad mientras lo siga
     * teniendo: la purga y esta sincronización trabajan juntas a propósito.
     *
     * También guarda la fecha de vencimiento de cada préstamo activo
     * (`prestamosActivosDetalle`) — tampoco es un dato nuevo (misma vista
     * Préstamos), pero es lo que le permite a `estadoLectorSinConexion()` en
     * db.js recalcular "¿tiene algo atrasado?" con el reloj del propio
     * equipo si más tarde se corta la conexión, en vez de limitarse solo al
     * bloqueo manual.
     */
    async sincronizarLectoresActivos() {
        try {
            // .limit(2000) no garantiza 2000 filas: PostgREST puede imponer un
            // máximo de 1000 y truncar en silencio. Paginar por id estable evita
            // dejar sin copia offline a lectores con préstamos activos después
            // del límite configurado en el servidor.
            const { data, error } = await traerTodasLasFilas((desde, hasta) =>
                supabase
                    .from('prestamos')
                    .select('id, fecha_devolucion_esperada, libros(titulo), lectores(id, nombre, rut, email, telefono, bloqueado_manual, motivo_bloqueo)')
                    .eq('estado', 'activo')
                    .order('id', { ascending: true })
                    .range(desde, hasta)
            );
            if (error) throw error;

            const vistos = new Map();
            const prestamosPorLector = new Map();
            for (const fila of data || []) {
                const l = fila.lectores;
                if (!l || l.id == null) continue;
                vistos.set(l.id, l);
                if (!prestamosPorLector.has(l.id)) prestamosPorLector.set(l.id, []);
                prestamosPorLector.get(l.id).push({
                    fechaDevolucionEsperada: fila.fecha_devolucion_esperada ?? null,
                    tituloLibro: fila.libros?.titulo ?? null
                });
            }
            const ahora = Date.now();
            const filas = [...vistos.values()].map(l => ({
                id: l.id,
                nombre: l.nombre ?? null,
                rut: l.rut ?? null,
                email: l.email ?? null,
                telefono: l.telefono ?? null,
                bloqueadoManual: !!l.bloqueado_manual,
                motivoBloqueo: l.motivo_bloqueo ?? null,
                prestamosActivosDetalle: prestamosPorLector.get(l.id) || [],
                consultadoEn: ahora
            }));
            await ponerVarios('lectores', filas);
            return { lectores: filas.length };
        } catch (e) {
            return { error: e.message || String(e) };
        }
    }

    /**
     * Aplica el derecho de supresión a la copia local: cualquier lector
     * borrado de verdad en el servidor (DELETE, no anonimización) desaparece
     * también de aquí. Es el requisito de CUMPLIMIENTO-LEGAL.md sección
     * "9 bis", punto 1 — no es opcional.
     */
    async purgarLectoresEliminados() {
        try {
            const cursor = await leerCursor('lectores_eliminados_ultima_sync', 'lectores_eliminados_ultima_sync_id');
            const bajas = await traerDesdeMarca('elementos_eliminados', 'id, eliminado_en', 'eliminado_en', cursor,
                { filtros: [['tabla', 'lectores']] });
            await borrarVarios('lectores', bajas.filas.map(l => l.id));
            await escribirCursor('lectores_eliminados_ultima_sync', 'lectores_eliminados_ultima_sync_id', bajas.t, bajas.id);
            return { eliminados: bajas.filas.length };
        } catch (e) {
            return { error: e.message || String(e) };
        }
    }

    /**
     * Borra de la copia local a todo lector que nadie consultó ni tuvo un
     * préstamo activo en los últimos `diasRetencion` días. Es el requisito
     * de CUMPLIMIENTO-LEGAL.md sección "9 bis", punto 2 — "no se replica el
     * padrón completo... con purga automática por antigüedad".
     */
    async purgarLectoresAntiguos(diasRetencion = RETENCION_LECTORES_DIAS) {
        try {
            const limite = Date.now() - diasRetencion * 24 * 60 * 60 * 1000;
            const bd = await abrir();
            const vencidos = await conAlmacen(bd, 'lectores', 'readonly', almacen => {
                const indice = almacen.index('consultadoEn');
                // Recupera solo las llaves primarias de los registros donde consultadoEn < limite
                return pedido(indice.getAllKeys(IDBKeyRange.upperBound(limite, true)));
            });
            await borrarVarios('lectores', vencidos);
            return { purgados: vencidos.length };
        } catch (e) {
            return { error: e.message || String(e) };
        }
    }

    /**
     * Corre todo lo de arriba en el orden correcto. Pensado para llamarse una
     * vez después de iniciar sesión y después, cada cierto tiempo, mientras
     * la pestaña siga abierta (ver el enganche en js/main.js). Nunca lanza:
     * cada paso ya atrapa sus propios errores; esto solo los junta para que
     * quien llama pueda registrar un resumen si quiere.
     */
    async sincronizarTodo(onProgress) {
        const libros = await this.sincronizarLibros(onProgress);
        if (onProgress) onProgress({ mensaje: 'Actualizando lectores activos...' });
        const activos = await this.sincronizarLectoresActivos();
        if (onProgress) onProgress({ mensaje: 'Purgando lectores inactivos...' });
        const bajasLectores = await this.purgarLectoresEliminados();
        const purgados = await this.purgarLectoresAntiguos();
        const pasos = { libros, activos, bajasLectores, purgados };
        const errores = Object.entries(pasos)
            .filter(([, resultado]) => resultado?.error)
            .map(([paso, resultado]) => ({ paso, mensaje: resultado.error }));
        const completo = errores.length === 0;
        if (onProgress) onProgress({ mensaje: completo
            ? 'Sincronización completada.'
            : `Sincronización incompleta: ${errores.length} paso(s) con error.` });
        // La sincronización en segundo plano es best-effort y nunca lanza, pero
        // quienes preparan una operación offline deben poder distinguir éxito
        // de fallo; de lo contrario la UI podía anunciar "listo" sin descargar.
        return { ...pasos, completo, errores };
    }

    /** Lectura para quien consuma el almacén (Fase 1.3 en adelante). */
    async obtenerLibrosLocal() {
        return obtenerTodos('libros');
    }

    /** Lectura para quien consuma el almacén (Fase 1.3 en adelante). */
    async obtenerLectoresLocal() {
        return obtenerTodos('lectores');
    }

    /**
     * Guarda de inmediato, en la copia local, un libro agregado al catálogo
     * SIN CONEXIÓN — antes de que el servidor le asigne su `id` real. Sin
     * esto, el libro "desaparecería" de la vista Catálogo hasta la próxima
     * sincronización, aunque la persona ya lo haya escrito.
     *
     * Se guarda con un `id` sintético (negativo: nunca choca con un `id`
     * real, que en Postgres siempre es positivo) para que
     * `sincronizarLibros()` — que hace `put()` por `id`, nunca `clear()` —
     * no lo pise ni lo confunda con nada del servidor. `quitarLibroLocalOptimista()`
     * lo retira cuando la cola de sincronización confirma que el alta real
     * ya se aplicó (ver OPERACIONES_COLA en db.js).
     */
    async guardarLibroLocalOptimista(libro) {
        try {
            await ponerVarios('libros', [{
                id: idOptimista(),
                isbn: libro.isbn,
                titulo: libro.titulo,
                autor: libro.autor,
                genero: libro.genero || null,
                ubicacion: libro.ubicacion || null,
                portada_url: libro.portada_url || null,
                copias_totales: libro.stock,
                stock: libro.stock,
                actualizado_en: new Date().toISOString(),
                pendienteSync: true
            }]);
        } catch {
            // Nunca debe impedir que la operación quede encolada igual.
        }
    }

    /** Retira la entrada optimista de un libro una vez que el alta real ya se sincronizó. */
    async quitarLibroLocalOptimista(isbn) {
        try {
            const bd = await abrir();
            await conAlmacen(bd, 'libros', 'readwrite', async almacen => {
                const fila = await pedido(almacen.index('isbn').get(String(isbn)));
                if (fila?.pendienteSync && fila.id < 0) almacen.delete(fila.id);
            });
        } catch {
            // Si falla, la próxima sincronización completa del catálogo
            // (sincronizarLibros) igual va a traer la fila real; en el peor
            // caso queda una entrada optimista huérfana hasta entonces.
        }
    }

    /**
     * Igual que guardarLibroLocalOptimista(), para un lector recién
     * registrado sin conexión — necesario para poder, en la misma sesión
     * offline, prestarle un libro de inmediato (estadoLectorSinConexion()
     * lo busca por RUT igual que a cualquier otro lector ya conocido).
     *
     * Aviso importante, distinto del caso de libros: el catálogo se replica
     * ENTERO localmente, así que un ISBN duplicado se puede detectar con
     * certeza antes de encolar. La copia de lectores es PARCIAL a propósito
     * (CUMPLIMIENTO-LEGAL.md §9 bis) — un RUT que ya existe en el servidor
     * pero que nunca se consultó en este equipo puede no detectarse hasta
     * reconectar, momento en el que el alta se rechaza como duplicado
     * (23505) y queda registrada en Administración → Diagnóstico, no
     * perdida en silencio. No hay forma de evitarlo del todo sin replicar
     * el padrón completo de lectores, que es justo lo que la Fase 1.2
     * decidió no hacer por minimización de datos.
     */
    async guardarLectorLocalOptimista(lector) {
        try {
            await ponerVarios('lectores', [{
                id: idOptimista(),
                nombre: lector.nombre ?? null,
                rut: lector.rut ?? null,
                email: lector.email ?? null,
                telefono: lector.telefono ?? null,
                bloqueadoManual: false,
                motivoBloqueo: null,
                prestamosActivosDetalle: [],
                consultadoEn: Date.now(),
                pendienteSync: true
            }]);
        } catch {
            // Nunca debe impedir que la operación quede encolada igual.
        }
    }

    /** Retira la entrada optimista de un lector una vez que el alta real ya se sincronizó. */
    async quitarLectorLocalOptimista(rut) {
        try {
            const bd = await abrir();
            await conAlmacen(bd, 'lectores', 'readwrite', async almacen => {
                const fila = await pedido(almacen.index('rut').get(rut));
                if (fila?.pendienteSync && fila.id < 0) almacen.delete(fila.id);
            });
        } catch {
            // Igual que en libros: en el peor caso queda una entrada
            // optimista huérfana hasta la próxima sincronización completa.
        }
    }

    /**
     * Busca un libro guardado localmente por ISBN o por id (lo que haya
     * escaneado o escrito la persona). Es el último recurso de
     * `db.consultarLibro()` cuando la red falla — el catálogo se replica
     * entero (Fase 1.2), así que esto no tiene ningún reparo de privacidad.
     */
    async buscarLibroLocalPorCodigo(codigo) {
        if (codigo == null) return null;
        const bd = await abrir();
        const porIsbn = await conAlmacen(bd, 'libros', 'readonly', almacen =>
            pedido(almacen.index('isbn').get(String(codigo))));
        if (porIsbn) return porIsbn;
        const comoNumero = Number(codigo);
        if (!Number.isFinite(comoNumero)) return null;
        const porId = await conAlmacen(bd, 'libros', 'readonly', almacen => pedido(almacen.get(comoNumero)));
        // IDBObjectStore.get() resuelve en `undefined`, no en `null`, cuando no
        // hay coincidencia — se normaliza para que quien llama (db.js) pueda
        // comprobar siempre con `=== null` o simplemente `!libro`, sin
        // sorpresas según cuál de las dos rutas de búsqueda respondió.
        return porId ?? null;
    }

    /**
     * Busca un lector guardado localmente por RUT. Es el último recurso de
     * `db.estadoLector()` cuando la red falla — a diferencia del catálogo,
     * SOLO encuentra algo si ese lector ya había entrado antes por una de
     * las dos vías controladas de arriba (consultado, o con préstamo
     * activo). No encontrar nada es el caso esperado para cualquier lector
     * que nunca se tocó desde este equipo, no un error.
     */
    async buscarLectorLocalPorRut(rut) {
        if (!rut) return null;
        const bd = await abrir();
        const lector = await conAlmacen(bd, 'lectores', 'readonly', almacen => pedido(almacen.index('rut').get(rut)));
        // Misma normalización que buscarLibroLocalPorCodigo: `undefined` → `null`.
        return lector ?? null;
    }

    // ------------------------------------------------------------------
    // Cola de sincronización (Fase 1.3) — almacenamiento puro. La decisión
    // de CUÁNDO reintentar y qué hacer con cada resultado es de SyncQueue,
    // en js/modules/db.js; aquí solo se guarda, lista y actualiza.
    // ------------------------------------------------------------------

    /** Guarda una operación pendiente y devuelve su id local. */
    async encolarOperacion(tipo, params, descripcion) {
        const bd = await abrir();
        return conAlmacen(bd, 'colaSync', 'readwrite', almacen => pedido(almacen.add({
            tipo, params, descripcion: descripcion || null,
            creadoEn: Date.now(), intentos: 0, proximoIntentoEn: Date.now(), ultimoError: null
        })));
    }

    /** Todas las operaciones pendientes, sin filtrar por si ya les tocaba
     *  reintentar — ese cálculo lo hace SyncQueue. */
    async listarOperacionesPendientes() {
        return obtenerTodos('colaSync');
    }

    /** Aplica cambios parciales a una operación pendiente (intentos,
     *  próximo intento, último error) sin tener que releerla primero. */
    async actualizarOperacion(id, cambios) {
        const bd = await abrir();
        await conAlmacen(bd, 'colaSync', 'readwrite', async almacen => {
            const actual = await pedido(almacen.get(id));
            if (!actual) return; // ya se quitó (por ejemplo, se completó en paralelo)
            almacen.put({ ...actual, ...cambios });
        });
    }

    /** Quita una operación de la cola: se completó, o se dio por fallida
     *  para siempre (con su aviso ya registrado aparte). */
    async quitarOperacion(id) {
        const bd = await abrir();
        await conAlmacen(bd, 'colaSync', 'readwrite', almacen => almacen.delete(id));
    }

    /** Diagnóstico simple: cuánto hay guardado y cuándo se sincronizó por
     *  última vez cada cosa. Pensado para un futuro indicador de conexión
     *  (Fase 1.4) y para las propias pruebas de este módulo. */
    async estado() {
        const [libros, lectores, pendientes, librosUltimaSync, lectoresEliminadosUltimaSync] = await Promise.all([
            obtenerTodos('libros'),
            obtenerTodos('lectores'),
            obtenerTodos('colaSync'),
            leerMeta('libros_ultima_sync'),
            leerMeta('lectores_eliminados_ultima_sync')
        ]);
        return {
            librosGuardados: libros.length,
            lectoresGuardados: lectores.length,
            operacionesPendientes: pendientes.length,
            librosUltimaSync,
            lectoresEliminadosUltimaSync
        };
    }
}

export default new PersistentStorage();
