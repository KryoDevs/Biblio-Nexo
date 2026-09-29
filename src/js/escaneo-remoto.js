/**
 * Página de escaneo remoto SIN sesión (escaneo-remoto.html).
 *
 * Aparte del sistema principal a propósito: la abre el enlace del QR de
 * ui-base.js (showQrRemotoModal), con un token de un solo objetivo en la URL
 * (?token=...). No importa js/main.js ni supabase-init.js — no hace falta
 * iniciar sesión, así que tampoco hace falta gotrue-js (la librería de
 * autenticación de Supabase) ni su candado entre pestañas. Se habla
 * directamente con la API REST de Supabase (PostgREST) con la llave anónima,
 * exactamente lo mismo que hace supabase-js por debajo para llamar una
 * función RPC.
 *
 * El módulo de escaneo (scanner.js) y la búsqueda por ISBN en Open Library
 * (libros-externos.js) se reutilizan tal cual: no dependen de si hay sesión.
 *
 * Desde el 22 de agosto de 2026 SÍ carga vendor/js/supabase.js (ver
 * escaneo-remoto.html) — no para hablar con la base (eso lo sigue haciendo
 * rpc() por fetch() plano, más abajo) sino solo para avisar en vivo al mesón
 * que se escaneó un libro (Realtime Broadcast), que necesita un canal de
 * WebSocket. El cliente que se arma aquí es aparte del de supabase-init.js:
 * nunca inicia sesión, así que no levanta el candado entre pestañas de
 * gotrue-js que ese archivo documenta y esquiva.
 */
import { CONFIG } from './config.js';
import { escapeHtml, canalEscaneo } from './modules/utilidades.js';
import { buscarPorIsbnExterno } from './modules/libros-externos.js';
import { portadaHtml, vigilarPortadas } from './modules/portadas.js';
import Scanner from './modules/scanner.js';

const ESPERA_MS = 15000;

const supabaseRealtime = window.supabase
    ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    })
    : null;

let canalActual = null;

/**
 * Avisa, en vivo, que se resolvió un escaneo (libro nuevo o ya existente) —
 * lo recibe el mesón si tiene abierta la ventana del código QR de este mismo
 * enlace (ver showQrRemotoModal() en mostrador.js). Es "mejor esfuerzo": si
 * el canal no se pudo abrir (por ejemplo, sin conexión de WebSocket en una
 * red restringida) el escaneo ya se guardó igual por rpc(), así que un fallo
 * acá nunca debe impedir seguir escaneando.
 */
async function avisarEscaneo(payload) {
    if (!supabaseRealtime) return;
    try {
        if (!canalActual) {
            canalActual = supabaseRealtime.channel(await canalEscaneo(token()));
            canalActual.subscribe();
        }
        canalActual.send({ type: 'broadcast', event: 'libro-escaneado', payload });
    } catch (e) {
        // silencioso a propósito — ver el comentario de arriba
    }
}

/**
 * Llama a una función RPC de Postgres directo por la API REST de Supabase.
 * Los parámetros que no se envían usan el valor por defecto de la función
 * (así lo resuelve PostgREST), así que alcanza con mandar los que importan
 * cada vez.
 */
async function rpc(nombre, parametros = {}) {
    const controlador = new AbortController();
    const expira = setTimeout(() => controlador.abort(), ESPERA_MS);
    let respuesta;
    try {
        respuesta = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: CONFIG.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(parametros),
            signal: controlador.signal
        });
    } catch (e) {
        throw new Error(e.name === 'AbortError'
            ? 'La operación tardó demasiado en responder. Intente nuevamente.'
            : 'No se pudo conectar. Revise su conexión a internet.');
    } finally {
        clearTimeout(expira);
    }

    const datos = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
        const errorMsg = (datos && (datos.message || datos.error_description || datos.hint)) || 'No se pudo completar la operación.';
        const err = new Error(errorMsg);
        if (datos && datos.code) err.code = String(datos.code);
        throw err;
    }
    return datos;
}

function token() {
    return new URLSearchParams(window.location.search).get('token') || '';
}

function raiz() {
    return document.getElementById('escaneo-remoto-app');
}

/** Tarjeta de error a pantalla completa: enlace inválido, vencido o revocado. */
function mostrarError(mensaje) {
    raiz().innerHTML = `
      <div class="bg-patrimonio-card border border-stone-300 rounded-2xl shadow-2xl p-6 text-center space-y-3">
        <i aria-hidden="true" class="fas fa-triangle-exclamation text-3xl text-rose-700"></i>
        <h1 class="font-serif text-lg font-bold text-stone-900">Este enlace no funciona</h1>
        <p class="text-sm text-stone-600">${escapeHtml(mensaje)}</p>
        <p class="text-xs text-stone-500">Pida un enlace nuevo en el mesón de la biblioteca.</p>
      </div>`;
}

let ultimoCodigo = null;
let ultimoEscaneo = 0;
function esRepetido(codigo) {
    const ahora = Date.now();
    if (codigo === ultimoCodigo && ahora - ultimoEscaneo < 3000) return true;
    ultimoCodigo = codigo;
    ultimoEscaneo = ahora;
    return false;
}

function toast(mensaje, tipo = 'success') {
    const contenedor = document.getElementById('er-toast');
    if (!contenedor) return;
    const colores = tipo === 'error'
        ? 'bg-rose-50 border-rose-200 text-rose-800'
        : 'bg-emerald-50 border-emerald-200 text-emerald-800';
    contenedor.innerHTML = `<div class="border rounded-xl px-3 py-2 text-xs font-medium ${colores}" role="status">${escapeHtml(mensaje)}</div>`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { if (contenedor) contenedor.innerHTML = ''; }, 5000);
}

/**
 * Lo que se agregó o repuso en esta visita (ítem 11, "pulido, no urgente").
 * En memoria nomás — no se guarda en ningún lado, se pierde si recarga la
 * página, igual que el contador simple que reemplaza. Cada entrada trae lo
 * necesario para deshacerla: libroId + accion + cantidad son justo los
 * parámetros que espera deshacer_libro_remoto().
 */
let escaneados = [];
let siguienteIdEscaneado = 1;

function agregarAlaLista({ libroId, isbn, titulo, autor, accion, cantidad }) {
    escaneados.unshift({
        id: siguienteIdEscaneado++,
        libroId, isbn, titulo, autor, accion, cantidad,
        deshaciendo: false
    });
    renderListaEscaneados();
}

function renderListaEscaneados() {
    const nodo = document.getElementById('er-escaneados');
    if (!nodo) return;

    if (escaneados.length === 0) {
        nodo.innerHTML = '';
        return;
    }

    const filas = escaneados.map(item => `
      <li class="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-3" data-id="${item.id}">
        ${portadaHtml({ isbn: item.isbn, titulo: item.titulo })}
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-stone-800 truncate">${escapeHtml(item.titulo || item.isbn)}</p>
          <p class="text-[11px] text-stone-500 truncate">${item.autor ? escapeHtml(item.autor) + ' — ' : ''}${item.accion === 'creado' ? 'Agregado' : `Repuesto ×${item.cantidad}`}</p>
        </div>
        <button data-deshacer="${item.id}" ${item.deshaciendo ? 'disabled' : ''}
          class="shrink-0 text-[11px] font-bold text-rose-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1.5 rounded-lg">
          ${item.deshaciendo
            ? '<i aria-hidden="true" class="fas fa-spinner fa-spin"></i>'
            : '<i aria-hidden="true" class="fas fa-rotate-left mr-1"></i>Deshacer'}
        </button>
      </li>`).join('');

    nodo.innerHTML = `
      <p class="text-center text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg py-2">
        ${escaneados.length === 1 ? '1 libro agregado en esta sesión' : `${escaneados.length} libros agregados en esta sesión`}
      </p>
      <ul class="space-y-2 mt-2">${filas}</ul>`;

    nodo.querySelectorAll('[data-deshacer]').forEach(boton => {
        boton.addEventListener('click', () => deshacerEscaneo(Number(boton.dataset.deshacer)));
    });
}

/** Revierte una entrada de la lista llamando a deshacer_libro_remoto(). */
async function deshacerEscaneo(id) {
    const item = escaneados.find(e => e.id === id);
    if (!item || item.deshaciendo) return;

    item.deshaciendo = true;
    renderListaEscaneados();
    try {
        // p_accion/p_cantidad ya no se mandan: el servidor los deriva solo de
        // su propio rastro de auditoría (ver el comentario largo de la
        // función en 010_consolidacion.sql — versión corregida por el hueco
        // de seguridad de la primera).
        const filas = await rpc('deshacer_libro_remoto', {
            p_token: token(), p_libro_id: item.libroId
        });
        const fila = filas?.[0];
        if (!fila?.deshecho) {
            toast(fila?.motivo || 'No se pudo deshacer.', 'error');
            item.deshaciendo = false;
            renderListaEscaneados();
            return;
        }
        escaneados = escaneados.filter(e => e.id !== id);
        renderListaEscaneados();
        toast('Deshecho.', 'success');
    } catch (err) {
        toast(err.message || 'No se pudo deshacer.', 'error');
        item.deshaciendo = false;
        renderListaEscaneados();
    }
}

/** Pantalla principal: vence-en, cámara, entrada manual, resultado. */
function pintarPrincipal(vence) {
    raiz().innerHTML = `
      <div class="bg-patrimonio-card border border-stone-300 rounded-2xl shadow-2xl p-6 space-y-4">
        <div class="text-center">
          <i aria-hidden="true" class="fas fa-barcode text-3xl text-patrimonio-madera"></i>
          <h1 class="font-serif text-xl font-bold text-stone-900 mt-2">Escaneo remoto de libros</h1>
          <p class="text-xs text-stone-500 mt-1.5 leading-relaxed">
            Sin iniciar sesión. Si el libro es nuevo, lo agrega al catálogo; si ya existe,
            muestra quién lo tiene ahora mismo en vez de sumarle ejemplares.
            ${vence ? `Este enlace vence a las ${escapeHtml(vence)}.` : ''}
          </p>
        </div>

        <ol class="grid grid-cols-3 gap-2 text-center">
          <li class="bg-stone-50 border border-stone-200 rounded-xl px-2 py-3">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-patrimonio-madera text-white text-xs font-bold mx-auto mb-1.5">1</span>
            <span class="text-[11px] text-stone-600 leading-tight block">Pulse «Iniciar cámara» y permita el acceso</span>
          </li>
          <li class="bg-stone-50 border border-stone-200 rounded-xl px-2 py-3">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-patrimonio-madera text-white text-xs font-bold mx-auto mb-1.5">2</span>
            <span class="text-[11px] text-stone-600 leading-tight block">Apunte al código de barras del libro</span>
          </li>
          <li class="bg-stone-50 border border-stone-200 rounded-xl px-2 py-3">
            <span class="flex items-center justify-center w-8 h-8 rounded-full bg-patrimonio-madera text-white text-xs font-bold mx-auto mb-1.5">3</span>
            <span class="text-[11px] text-stone-600 leading-tight block">Suena un pitido y sigue con el próximo</span>
          </li>
        </ol>

        <div id="er-toast"></div>

        <button id="er-start" class="btn-madera w-full text-white font-sans font-bold rounded-xl shadow px-4 py-3.5 text-base">
          <i aria-hidden="true" class="fas fa-camera mr-2"></i>Iniciar cámara
        </button>
        <div id="er-camara-encendida" class="hidden space-y-3">
          <div id="reader" class="w-full"></div>
          <button id="er-stop" class="w-full bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-xl font-medium px-4 py-2.5 text-sm">
            <i aria-hidden="true" class="fas fa-stop mr-1.5"></i>Detener cámara
          </button>
        </div>

        <div id="er-escaneados"></div>

        <details class="text-center">
          <summary class="text-xs text-stone-500 cursor-pointer select-none py-1">¿Prefiere escribir el código a mano?</summary>
          <div class="flex gap-2 mt-2">
            <input id="er-manual" inputmode="numeric" aria-label="Escribir el ISBN manualmente"
              placeholder="Ingrese el ISBN"
              class="flex-1 px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
            <button id="er-buscar" class="bg-patrimonio-lago hover:bg-[#14303c] text-white font-sans font-medium rounded-xl shadow px-4 py-2 text-sm">Agregar</button>
          </div>
        </details>

        <div id="er-resultado"></div>
      </div>`;

    document.getElementById('er-start').addEventListener('click', async e => {
        const boton = e.currentTarget;
        const original = boton.innerHTML;
        boton.disabled = true;
        boton.innerHTML = '<i aria-hidden="true" class="fas fa-spinner fa-spin mr-2"></i>Preparando cámara…';
        document.getElementById('er-camara-encendida')?.classList.remove('hidden');
        try {
            await Scanner.start(
                codigo => { if (!esRepetido(codigo)) manejarCodigo(codigo); },
                mensaje => {
                    toast(mensaje, 'error');
                    boton.classList.remove('hidden');
                    document.getElementById('er-camara-encendida')?.classList.add('hidden');
                }
            );
            // Scanner.start() no relanza el error: lo entrega por el segundo
            // parámetro (arriba) y esta promesa igual se resuelve. Por eso se
            // comprueba Scanner.activo en vez de asumir éxito por no haber
            // caído en un catch — si no, este botón se volvería a esconder
            // justo después de que el aviso de error lo mostrara de nuevo.
            if (Scanner.activo) boton.classList.add('hidden');
        } finally {
            boton.disabled = false;
            boton.innerHTML = original;
        }
    });
    document.getElementById('er-stop').addEventListener('click', () => {
        Scanner.stop();
        document.getElementById('er-camara-encendida')?.classList.add('hidden');
        document.getElementById('er-start')?.classList.remove('hidden');
    });

    const buscarManual = () => {
        const campo = document.getElementById('er-manual');
        const codigo = campo.value.trim();
        if (codigo) { campo.value = ''; manejarCodigo(codigo); }
    };
    document.getElementById('er-buscar').addEventListener('click', buscarManual);
    document.getElementById('er-manual').addEventListener('keydown', e => {
        if (e.key === 'Enter') buscarManual();
    });
}

/**
 * Ficha de solo lectura de consultar_libro_remoto(): el libro escaneado ya
 * está en el catálogo, así que se muestra quién lo tiene ahora mismo —RUT y
 * nombre de quien tiene el préstamo activo, o de quien lo tiene reservado o
 * apartado— en vez de sumarle ejemplares en silencio. Decisión explícita del
 * 22 de agosto de 2026 (ver claude/reservas-whatsapp-meson-2026-08-22.md y
 * el punto 4 de «ESCANEO REMOTO SIN SESIÓN» en 010_consolidacion.sql): esta
 * página, sin sesión, SÍ puede mostrar esos datos.
 */
function fichaConsultaRemota(filas) {
    const libro = filas[0];
    const circulacion = filas.filter(f => f.tipo);

    const filaCirculacion = c => c.tipo === 'prestamo' ? `
        <div class="border-t border-stone-200 pt-2 mt-2 text-left">
          <p class="text-[10px] font-black uppercase tracking-widest text-stone-500">En préstamo</p>
          <p class="text-sm font-bold text-stone-800">${escapeHtml(c.persona_nombre || 'Lector desconocido')}</p>
          <p class="text-xs font-mono text-stone-500">${escapeHtml(c.persona_rut || '—')}</p>
          ${c.prestamo_fecha_devolucion_esperada ? `<p class="text-xs text-stone-500 mt-0.5">Vuelve el ${escapeHtml(c.prestamo_fecha_devolucion_esperada)}</p>` : ''}
        </div>` : `
        <div class="border-t border-stone-200 pt-2 mt-2 text-left">
          <p class="text-[10px] font-black uppercase tracking-widest text-stone-500">
            ${c.reserva_estado === 'apartada' ? 'Apartado para' : `Reservado para (posición ${escapeHtml(String(c.reserva_posicion_en_fila ?? '?'))} en la fila)`}
          </p>
          <p class="text-sm font-bold text-stone-800">${escapeHtml(c.persona_nombre || 'Lector desconocido')}</p>
          <p class="text-xs font-mono text-stone-500">${escapeHtml(c.persona_rut || '—')}</p>
        </div>`;

    return `
      <div class="border border-stone-300 rounded-xl p-4 text-center">
        <p class="font-bold text-stone-800">${escapeHtml(libro.titulo)}</p>
        ${libro.autor ? `<p class="text-sm text-stone-500">${escapeHtml(libro.autor)}</p>` : ''}
        <p class="text-xs text-stone-500 mt-1">${escapeHtml(String(libro.stock))} de ${escapeHtml(String(libro.copias_totales))} ejemplar(es) disponibles</p>
        <p class="text-[11px] text-stone-500 mt-2">Este libro ya está en el catálogo — no se sumó ningún ejemplar.</p>
        ${circulacion.length === 0
            ? '<p class="text-xs text-emerald-700 mt-2"><i aria-hidden="true" class="fas fa-circle-check mr-1"></i>Nadie lo tiene ahora mismo.</p>'
            : circulacion.map(filaCirculacion).join('')}
      </div>`;
}

/**
 * Resuelve un código escaneado. Primero consulta (consultar_libro_remoto,
 * de solo lectura): si el libro ya está en el catálogo, muestra sus datos de
 * circulación y termina ahí — ya NO le suma ejemplares en silencio (hasta el
 * 22 de agosto de 2026 sí lo hacía, ver agregar_libro_remoto en
 * 010_consolidacion.sql). Solo si el código no está en el catálogo cae al
 * camino de agregar_libro_remoto, para crear el libro (o pedir los datos que
 * falten).
 */
async function manejarCodigo(codigo) {
    const resultado = document.getElementById('er-resultado');
    if (!resultado) return;
    resultado.innerHTML = '<p class="text-xs text-stone-500"><i aria-hidden="true" class="fas fa-spinner fa-spin mr-1"></i>Consultando…</p>';

    try {
        const filasConsulta = await rpc('consultar_libro_remoto', { p_token: token(), p_codigo: codigo });
        if (filasConsulta?.[0]?.encontrado) {
            resultado.innerHTML = fichaConsultaRemota(filasConsulta);
            toast('Este libro ya está en el catálogo.', 'success');
            avisarEscaneo({ isbn: filasConsulta[0].isbn, titulo: filasConsulta[0].titulo, autor: filasConsulta[0].autor });
            return;
        }
    } catch (err) {
        // Se deja caer al camino de agregar_libro_remoto de abajo SOLO si el error
        // no parece ser un fallo de red o del servidor. Si es un 404/not found, o
        // la función no devolvió nada, pasamos al bloque inferior para crearlo.
        // Pero si es un error interno o timeout, paramos aquí para no intentar
        // crearlo repetidamente si el servidor está caído (Fix prioridad ALTA #4).
        const msg = String(err.message || '').toLowerCase();
        if (msg.includes('timeout') || msg.includes('tardó demasiado') || msg.includes('fetch') || !navigator.onLine) {
             resultado.innerHTML = `<p class="text-rose-700 text-sm font-bold"><i aria-hidden="true" class="fas fa-wifi mr-1.5"></i>Error de conexión al consultar.</p>`;
             return;
        }
        if (err.code && err.code !== 'PGRST116') { // PGRST116 = result contains no rows
             resultado.innerHTML = `<p class="text-rose-700 text-sm font-bold"><i aria-hidden="true" class="fas fa-server mr-1.5"></i>Fallo del servidor: ${escapeHtml(err.message)}</p>`;
             return;
        }
    }

    try {
        const filas = await rpc('agregar_libro_remoto', { p_token: token(), p_isbn: codigo });
        const fila = filas?.[0];
        if (!fila) throw new Error('El sistema no respondió con datos.');

        if (fila.estado === 'falta_info') {
            await mostrarFormularioDatos(resultado, codigo);
            return;
        }

        if (fila.estado === 'existe') {
            // Carrera poco probable: alguien más lo agregó entre la consulta
            // de arriba y este intento. Mismo resultado que si
            // consultar_libro_remoto lo hubiera encontrado desde el inicio.
            resultado.innerHTML = `
              <div class="border border-emerald-200 bg-emerald-50 rounded-xl p-4 text-sm text-center">
                <p class="font-bold text-emerald-800"><i aria-hidden="true" class="fas fa-circle-check mr-1.5"></i>Este libro ya está en el catálogo</p>
                <p class="text-emerald-700 mt-1">${escapeHtml(fila.titulo || fila.isbn)}${fila.autor ? ` — ${escapeHtml(fila.autor)}` : ''}</p>
              </div>`;
            toast('Este libro ya está en el catálogo.', 'success');
            avisarEscaneo({ isbn: fila.isbn, titulo: fila.titulo, autor: fila.autor });
            return;
        }

        resultado.innerHTML = `
          <div class="border border-emerald-200 bg-emerald-50 rounded-xl p-4 text-sm">
            <p class="font-bold text-emerald-800"><i aria-hidden="true" class="fas fa-circle-check mr-1.5"></i>Se agregó al catálogo</p>
            <p class="text-emerald-700 mt-1">${escapeHtml(fila.titulo || fila.isbn)}${fila.autor ? ` — ${escapeHtml(fila.autor)}` : ''}</p>
            <p class="text-xs text-emerald-700 mt-1">Ahora hay ${escapeHtml(String(fila.stock))} de ${escapeHtml(String(fila.copias_totales))} ejemplar(es) disponibles.</p>
          </div>`;
        toast('Listo. Puede seguir escaneando.', 'success');
        agregarAlaLista({
            libroId: fila.libro_id, isbn: fila.isbn, titulo: fila.titulo, autor: fila.autor,
            accion: fila.estado, cantidad: 1
        });
        avisarEscaneo({ isbn: fila.isbn, titulo: fila.titulo, autor: fila.autor });
    } catch (err) {
        const mensaje = err.message || 'No se pudo completar la operación.';
        resultado.innerHTML = `<p class="text-rose-700 text-sm font-bold"><i aria-hidden="true" class="fas fa-circle-exclamation mr-1.5"></i>${escapeHtml(mensaje)}</p>`;
        // Un enlace vencido o revocado a mitad de sesión no se recupera solo:
        // se corta aquí para que la persona no siga escaneando en vano.
        if (/no es válido|expiró|revocado/i.test(mensaje)) {
            Scanner.stop();
        }
    }
}

/** El ISBN es nuevo: pide título/autor (con ayuda de Open Library) y reintenta. */
async function mostrarFormularioDatos(resultado, codigo) {
    const campo = (id, etiqueta, extra = '') => `
      <div>
        <label for="${id}" class="text-[11px] font-black uppercase tracking-wide text-stone-600 mb-1 block">${etiqueta}</label>
        <input id="${id}" ${extra}
          class="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:border-patrimonio-lago focus:ring-1 focus:ring-patrimonio-lago" />
      </div>`;

    resultado.innerHTML = `
      <div class="border border-stone-300 rounded-xl p-4">
        <p class="text-sm text-stone-600 mb-1">Ningún libro registrado con el código <span class="font-mono font-bold">${escapeHtml(codigo)}</span>.</p>
        <p id="er-buscando" class="text-xs text-stone-500 mb-3"><i aria-hidden="true" class="fas fa-spinner fa-spin"></i> Buscando título y autor en Open Library…</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${campo('er-nuevo-titulo', 'Título')}
          ${campo('er-nuevo-autor', 'Autor')}
          ${campo('er-nuevo-cantidad', 'Ejemplares', 'type="number" min="1" value="1"')}
        </div>
        <div class="flex justify-end gap-3 pt-3">
          <button id="er-nuevo-guardar" class="btn-madera text-white px-5 py-2 rounded-xl text-sm font-medium">
            <i aria-hidden="true" class="fas fa-plus mr-1"></i>Agregar al catálogo
          </button>
        </div>
      </div>`;

    document.getElementById('er-nuevo-guardar').addEventListener('click', async e => {
        const titulo = document.getElementById('er-nuevo-titulo').value.trim();
        const autor = document.getElementById('er-nuevo-autor').value.trim();
        const cantidad = Number(document.getElementById('er-nuevo-cantidad').value || 1);
        if (!titulo) { toast('El título es obligatorio.', 'error'); return; }

        const boton = e.currentTarget;
        boton.disabled = true;
        try {
            const filas = await rpc('agregar_libro_remoto', {
                p_token: token(), p_isbn: codigo, p_titulo: titulo, p_autor: autor || null, p_stock: cantidad
            });
            const fila = filas?.[0];
            resultado.innerHTML = `
              <div class="border border-emerald-200 bg-emerald-50 rounded-xl p-4 text-sm">
                <p class="font-bold text-emerald-800"><i aria-hidden="true" class="fas fa-circle-check mr-1.5"></i>Se agregó al catálogo</p>
                <p class="text-emerald-700 mt-1">${escapeHtml(fila?.titulo || titulo)}</p>
              </div>`;
            toast('Listo. Puede seguir escaneando.', 'success');
            if (fila) {
                agregarAlaLista({
                    libroId: fila.libro_id, isbn: fila.isbn, titulo: fila.titulo || titulo, autor: fila.autor,
                    accion: fila.estado, cantidad
                });
                avisarEscaneo({ isbn: fila.isbn, titulo: fila.titulo || titulo, autor: fila.autor });
            }
        } catch (err) {
            toast(err.message || 'No se pudo agregar el libro.', 'error');
            boton.disabled = false;
        }
    });

    // Se completa DESPUÉS de pintar el formulario, igual que en el escáner
    // del personal (ui-base.js, _formularioAltaRapida): si Open Library no
    // responde a tiempo, el formulario queda intacto para llenarlo a mano.
    const datos = await buscarPorIsbnExterno(codigo);
    document.getElementById('er-buscando')?.remove();
    if (datos) {
        const tituloInput = document.getElementById('er-nuevo-titulo');
        const autorInput = document.getElementById('er-nuevo-autor');
        if (tituloInput && !tituloInput.value.trim() && datos.titulo) tituloInput.value = datos.titulo;
        if (autorInput && !autorInput.value.trim() && datos.autor) autorInput.value = datos.autor;
    }
}

/**
 * Exportada a propósito: para que el banco de pruebas (pruebas/probar-
 * escaneo-remoto.mjs) pueda llamarla directo, en vez de depender de que
 * jsdom dispare DOMContentLoaded en el momento justo — main.js tiene el mismo
 * problema y por eso el resto de las pruebas nunca lo importa, sino que
 * llaman directo a las funciones de ui.js.
 */
export async function iniciar() {
    const t = token();
    if (!t) {
        mostrarError('Falta el código del enlace en la dirección. Pida uno nuevo en el mesón.');
        return;
    }

    let fila;
    try {
        const filas = await rpc('validar_enlace_escaneo', { p_token: t });
        fila = filas?.[0];
    } catch (err) {
        mostrarError(err.message || 'No se pudo comprobar el enlace.');
        return;
    }

    if (!fila || !fila.valido) {
        mostrarError(fila?.motivo || 'Este enlace ya no es válido.');
        return;
    }

    const vence = fila.expira_en ? new Date(fila.expira_en).toLocaleString('es-CL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    }) : '';
    pintarPrincipal(vence);
    vigilarPortadas();

    // Se descarga el módulo de la cámara por adelantado, apenas se sabe que
    // el enlace es válido — así, al pulsar "Iniciar cámara" el permiso se
    // pide de inmediato en vez de después de una espera de red (en Safari de
    // iPhone eso es la diferencia entre que la cámara abra o no: ver
    // scanner.js, precargar()).
    Scanner.precargar();

    // Si la persona cambia de aplicación con la cámara encendida (para
    // revisar algo en WhatsApp, por ejemplo), se apaga sola: nadie se da
    // cuenta de dejarla prendida y el celular no se calienta ni gasta
    // batería de más mientras el enlace sigue vigente.
    document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        Scanner.stop();
        const erCamara = document.getElementById('er-camara-encendida');
        const erStart = document.getElementById('er-start');
        if (erCamara) erCamara.classList.add('hidden');
        if (erStart) erStart.classList.remove('hidden');
    }
});
}

document.addEventListener('DOMContentLoaded', () => {
    iniciar().catch(() => mostrarError('No se pudo cargar la página. Revise su conexión e intente de nuevo.'));
});
