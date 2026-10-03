/**
 * Lector de códigos de barras — compartido entre la vista Mesón (ui-base.js,
 * con sesión) y la página de escaneo remoto sin sesión (escaneo-remoto.js).
 *
 * Historial de correcciones importantes:
 *
 * 1) La cámara no volvía a encender. `clear()` desmonta la instancia y la
 *    deja inservible, pero se guardaba igual en `this.html5Qrcode`. Al volver
 *    a la vista y pulsar "Iniciar cámara", se llamaba sobre un objeto ya
 *    desmontado y no pasaba nada, sin mensaje de error. Ahora la instancia
 *    se descarta siempre al detener.
 *
 * 2) El pitido apuntaba a un archivo de sonido que no existe en el proyecto.
 *    Se reemplaza por un tono generado con la API de audio del navegador.
 *
 * 3) La librería pesa 368 KB y se carga solo al encender la cámara, no en
 *    el arranque (igual que Chart.js).
 *
 * 4) (Este cambio) Se dejó de usar `Html5QrcodeScanner` — la interfaz
 *    "enlatada" de la librería — por `Html5Qrcode`, su API de bajo nivel.
 *    `Html5QrcodeScanner` dibuja su propia pantalla dentro de #reader con
 *    un botón adicional ("Permitir el uso de la cámara") que hay que pulsar
 *    APARTE del botón "Iniciar cámara" de esta aplicación: quien no repara
 *    en ese segundo botón —muy fácil en un celular ajeno, la primera vez
 *    que abre el enlace— tiene la sensación de que "la cámara no abre",
 *    aunque técnicamente el permiso nunca llegó a pedirse. Con la API de
 *    bajo nivel, un solo clic en nuestro botón pide el permiso del
 *    navegador de inmediato y la cámara se enciende sin pasos intermedios.
 *    De regalo, ya no hace falta traducir a mano por CSS la interfaz en
 *    inglés de la librería (ver css/styles.css) porque ahora dibujamos la
 *    nuestra.
 */

// Carga diferida de html5-qrcode. Se guarda la promesa para que dos llamadas
// seguidas no inserten el script dos veces.
let promesaLibreria = null;
function cargarLibreria() {
  if (typeof window.Html5Qrcode === 'function') return Promise.resolve();
  if (promesaLibreria) return promesaLibreria;
  promesaLibreria = new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = 'vendor/js/html5-qrcode.min.js';
    script.onload = () => resolver();
    script.onerror = () => {
      promesaLibreria = null; // permite reintentar
      rechazar(new Error('No se pudo cargar el módulo de escaneo.'));
    };
    document.head.appendChild(script);
  });
  return promesaLibreria;
}

/**
 * Mensajes de error del navegador al pedir la cámara (nombres estándar de
 * DOMException para getUserMedia), traducidos y con una salida clara para
 * cada caso — no hay dos motivos iguales para "la cámara no funciona".
 */
const MENSAJES_ERROR_CAMARA = {
  NotAllowedError: 'El navegador no tiene permiso para usar la cámara. Revise el candado o los ajustes del sitio y permita el acceso a la cámara, luego intente de nuevo.',
  PermissionDeniedError: 'El navegador no tiene permiso para usar la cámara. Revise el candado o los ajustes del sitio y permita el acceso a la cámara, luego intente de nuevo.',
  NotFoundError: 'No se encontró ninguna cámara en este dispositivo.',
  DevicesNotFoundError: 'No se encontró ninguna cámara en este dispositivo.',
  NotReadableError: 'La cámara está siendo usada por otra aplicación. Ciérrela e intente de nuevo.',
  TrackStartError: 'La cámara está siendo usada por otra aplicación. Ciérrela e intente de nuevo.',
  SecurityError: 'El navegador bloqueó el acceso a la cámara en este sitio.',
  AbortError: 'No se pudo encender la cámara. Intente de nuevo.'
};

function mensajeErrorCamara(e) {
  const nombre = e?.name || '';
  if (MENSAJES_ERROR_CAMARA[nombre]) return MENSAJES_ERROR_CAMARA[nombre];
  const texto = String(e?.message || e || '');
  // Algunos navegadores (sobre todo dentro de apps como WhatsApp o
  // Instagram, que abren los enlaces en su propio visor en vez del
  // navegador) ni siquiera exponen la cámara: no hay DOMException con
  // nombre, solo un mensaje genérico. Se detecta por el texto para dar una
  // salida útil en vez de "error desconocido".
  if (/permission|constraint|overconstrained/i.test(texto)) {
    return 'No se pudo acceder a la cámara con la configuración pedida.';
  }
  return 'No se pudo encender la cámara. Si abrió este enlace desde WhatsApp u otra aplicación, intente abrirlo en su navegador (Chrome o Safari).';
}

/** Formatos de código de barras típicos de libros, más QR por si acaso.
 *  Restringir los formatos acelera la lectura y evita falsos positivos.
 *  Se arma con cautela: si el enum no trae alguno de estos nombres (por
 *  ejemplo, una versión distinta de la librería), se descarta la lista
 *  entera antes que fallar — sin restricción, la librería igual reconoce
 *  todos los formatos que soporta. */
function formatosDeBarras() {
  const Formatos = window.Html5QrcodeSupportedFormats;
  if (!Formatos) return undefined;
  const nombres = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'CODABAR', 'ITF', 'QR_CODE', 'PDF_417', 'DATA_MATRIX'];
  const lista = nombres.map(n => Formatos[n]).filter(v => v !== undefined);
  return lista.length === nombres.length ? lista : undefined;
}

/** Dibuja el marco de escaneo propio: recuadro con esquinas y una línea
 *  animada, para que quede claro que la cámara SÍ está encendida y
 *  buscando un código — la librería, por su cuenta, no da ninguna pista
 *  visual de que está "viva" más allá del video en sí.
 *
 *  Clases propias, definidas en css/styles.css con CSS de verdad — no
 *  clases de Tailwind sueltas. El proyecto no tiene paso de compilación:
 *  vendor/css/tailwind.css es estático, así que una clase de Tailwind que
 *  nunca se haya usado antes en ningún otro archivo (una relación de
 *  aspecto, un color de marca en el borde, unas esquinas) no existe en ese
 *  CSS aunque el nombre "se vea" válido — queda sin estilo, en silencio,
 *  sin ningún error. Ver el comentario junto a estas clases en styles.css. */
function pintarMarco(contenedor) {
  contenedor.innerHTML = `
    <div class="escaneo-marco">
      <div id="reader-video" class="escaneo-marco__video"></div>
      <div class="escaneo-overlay"></div>
      <div class="escaneo-marco__guia" aria-hidden="true">
        <span class="escaneo-marco__esquina escaneo-marco__esquina--tl"></span>
        <span class="escaneo-marco__esquina escaneo-marco__esquina--tr"></span>
        <span class="escaneo-marco__esquina escaneo-marco__esquina--bl"></span>
        <span class="escaneo-marco__esquina escaneo-marco__esquina--br"></span>
      </div>
      <div class="linea-escaneo" aria-hidden="true"></div>
      <div class="absolute bottom-4 inset-x-0 text-center z-20">
        <span class="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/20 shadow-lg">Apunta la cámara al código</span>
      </div>
    </div>`;
}

class ScannerManager {
    constructor() {
        this.html5Qrcode = null;
        this.activo = false;
        this._audioCtx = null;
    }

    /** Tono corto de confirmación, generado en el momento. */
    _pitido() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            if (!this._audioCtx || this._audioCtx.state === 'closed') {
                this._audioCtx = new Ctx();
            }
            if (this._audioCtx.state === 'suspended') {
                this._audioCtx.resume();
            }

            const osc = this._audioCtx.createOscillator();
            const gainNode = this._audioCtx.createGain();
            
            // Un sonido más premium y suave: dos tonos rápidos
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, this._audioCtx.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(1760, this._audioCtx.currentTime + 0.1); // A6
            
            gainNode.gain.setValueAtTime(0, this._audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.5, this._audioCtx.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this._audioCtx.currentTime + 0.15);
            
            osc.connect(gainNode);
            gainNode.connect(this._audioCtx.destination);
            
            osc.start();
            osc.stop(this._audioCtx.currentTime + 0.2);

            // Efecto visual: borde verde
            const guias = document.querySelectorAll('.escaneo-marco__esquina');
            guias.forEach(g => {
                g.style.borderColor = '#10b981'; // Emerald 500
                g.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.8)';
            });
            setTimeout(() => {
                guias.forEach(g => {
                    g.style.borderColor = '';
                    g.style.boxShadow = '';
                });
            }, 400);

        } catch (e) {
            console.error('No se pudo reproducir el sonido', e);
        }
    }

    /**
     * Descarga la librería por adelantado, SIN encender la cámara. Se llama
     * apenas se sabe que puede hacer falta (token válido en escaneo-remoto.js,
     * vista Mesón abierta), para que al pulsar "Iniciar cámara" la librería
     * ya esté lista. Importa sobre todo en celulares: en Safari de iPhone, un
     * permiso de cámara pedido después de una espera de red ya no cuenta
     * como gesto directo de la persona usuaria y el navegador lo bloquea sin
     * avisar. El error real (si la descarga falla) se muestra recién al
     * pulsar el botón, no aquí.
     */
    precargar() {
        cargarLibreria().catch(() => {});
    }

    async start(onSuccess, onError) {
        const contenedor = document.getElementById('reader');
        if (!contenedor) return onError?.('El área de la cámara no está lista.');
        if (this.activo) return; // ya está encendida

        try {
            await cargarLibreria();
        } catch (e) {
            return onError?.(e.message);
        }

        // La vista pudo cambiar mientras se descargaba la librería
        if (!document.getElementById('reader')) return;

        pintarMarco(contenedor);
        const config = {
            fps: 10,
            qrbox: (anchoVisor, altoVisor) => {
                const lado = Math.floor(Math.min(anchoVisor, altoVisor) * 0.75);
                return { width: lado, height: Math.floor(lado * 0.5) };
            },
            formatsToSupport: formatosDeBarras()
        };

        const intentarEncender = camara => this.html5Qrcode.start(
            camara,
            config,
            texto => { this._pitido(); onSuccess(texto); },
            // Se llama en cada cuadro sin código detectado: no es un error real
            () => {}
        );

        try {
            this.html5Qrcode = new window.Html5Qrcode('reader-video', /* verbose */ false);
            this.activo = true;
            try {
                await intentarEncender({ facingMode: 'environment' });
            } catch (e) {
                // Algunos computadores y tablets solo tienen cámara frontal: si la
                // trasera no existe, se reintenta con la que haya en vez de fallar.
                if (e?.name === 'OverconstrainedError') {
                    await intentarEncender({ facingMode: 'user' });
                } else {
                    throw e;
                }
            }
        } catch (e) {
            this.activo = false;
            const instancia = this.html5Qrcode;
            this.html5Qrcode = null;
            try { await instancia?.clear(); } catch { /* ya estaba desmontada */ }
            contenedor.innerHTML = '';
            onError?.(mensajeErrorCamara(e));
        }
    }

    stop() {
        if (!this.html5Qrcode) return;
        const instancia = this.html5Qrcode;
        this.html5Qrcode = null;
        this.activo = false;
        // Se descarta ANTES de limpiar, para que un fallo de stop()/clear() no
        // deje una instancia muerta bloqueando el próximo encendido.
        const terminar = () => instancia.clear().catch(() => {});
        try {
            const promesaParo = instancia.stop();
            if (promesaParo?.then) promesaParo.then(terminar, terminar);
            else terminar();
        } catch {
            terminar();
        }
        const contenedor = document.getElementById('reader');
        if (contenedor) contenedor.innerHTML = '';
    }
}

export default new ScannerManager();
