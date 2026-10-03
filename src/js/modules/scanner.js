/**
 * Lector de cÃ³digos de barras â€” compartido entre la vista MesÃ³n (ui-base.js,
 * con sesiÃ³n) y la pÃ¡gina de escaneo remoto sin sesiÃ³n (escaneo-remoto.js).
 *
 * Historial de correcciones importantes:
 *
 * 1) La cÃ¡mara no volvÃ­a a encender. `clear()` desmonta la instancia y la
 *    deja inservible, pero se guardaba igual en `this.html5Qrcode`. Al volver
 *    a la vista y pulsar "Iniciar cÃ¡mara", se llamaba sobre un objeto ya
 *    desmontado y no pasaba nada, sin mensaje de error. Ahora la instancia
 *    se descarta siempre al detener.
 *
 * 2) El pitido apuntaba a un archivo de sonido que no existe en el proyecto.
 *    Se reemplaza por un tono generado con la API de audio del navegador.
 *
 * 3) La librerÃ­a pesa 368 KB y se carga solo al encender la cÃ¡mara, no en
 *    el arranque (igual que Chart.js).
 *
 * 4) (Este cambio) Se dejÃ³ de usar `Html5QrcodeScanner` â€” la interfaz
 *    "enlatada" de la librerÃ­a â€” por `Html5Qrcode`, su API de bajo nivel.
 *    `Html5QrcodeScanner` dibuja su propia pantalla dentro de #reader con
 *    un botÃ³n adicional ("Permitir el uso de la cÃ¡mara") que hay que pulsar
 *    APARTE del botÃ³n "Iniciar cÃ¡mara" de esta aplicaciÃ³n: quien no repara
 *    en ese segundo botÃ³n â€”muy fÃ¡cil en un celular ajeno, la primera vez
 *    que abre el enlaceâ€” tiene la sensaciÃ³n de que "la cÃ¡mara no abre",
 *    aunque tÃ©cnicamente el permiso nunca llegÃ³ a pedirse. Con la API de
 *    bajo nivel, un solo clic en nuestro botÃ³n pide el permiso del
 *    navegador de inmediato y la cÃ¡mara se enciende sin pasos intermedios.
 *    De regalo, ya no hace falta traducir a mano por CSS la interfaz en
 *    inglÃ©s de la librerÃ­a (ver css/styles.css) porque ahora dibujamos la
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
      rechazar(new Error('No se pudo cargar el mÃ³dulo de escaneo.'));
    };
    document.head.appendChild(script);
  });
  return promesaLibreria;
}

/**
 * Mensajes de error del navegador al pedir la cÃ¡mara (nombres estÃ¡ndar de
 * DOMException para getUserMedia), traducidos y con una salida clara para
 * cada caso â€” no hay dos motivos iguales para "la cÃ¡mara no funciona".
 */
const MENSAJES_ERROR_CAMARA = {
  NotAllowedError: 'El navegador no tiene permiso para usar la cÃ¡mara. Revise el candado o los ajustes del sitio y permita el acceso a la cÃ¡mara, luego intente de nuevo.',
  PermissionDeniedError: 'El navegador no tiene permiso para usar la cÃ¡mara. Revise el candado o los ajustes del sitio y permita el acceso a la cÃ¡mara, luego intente de nuevo.',
  NotFoundError: 'No se encontrÃ³ ninguna cÃ¡mara en este dispositivo.',
  DevicesNotFoundError: 'No se encontrÃ³ ninguna cÃ¡mara en este dispositivo.',
  NotReadableError: 'La cÃ¡mara estÃ¡ siendo usada por otra aplicaciÃ³n. CiÃ©rrela e intente de nuevo.',
  TrackStartError: 'La cÃ¡mara estÃ¡ siendo usada por otra aplicaciÃ³n. CiÃ©rrela e intente de nuevo.',
  SecurityError: 'El navegador bloqueÃ³ el acceso a la cÃ¡mara en este sitio.',
  AbortError: 'No se pudo encender la cÃ¡mara. Intente de nuevo.'
};

function mensajeErrorCamara(e) {
  const nombre = e?.name || '';
  if (MENSAJES_ERROR_CAMARA[nombre]) return MENSAJES_ERROR_CAMARA[nombre];
  const texto = String(e?.message || e || '');
  // Algunos navegadores (sobre todo dentro de apps como WhatsApp o
  // Instagram, que abren los enlaces en su propio visor en vez del
  // navegador) ni siquiera exponen la cÃ¡mara: no hay DOMException con
  // nombre, solo un mensaje genÃ©rico. Se detecta por el texto para dar una
  // salida Ãºtil en vez de "error desconocido".
  if (/permission|constraint|overconstrained/i.test(texto)) {
    return 'No se pudo acceder a la cÃ¡mara con la configuraciÃ³n pedida.';
  }
  return 'No se pudo encender la cÃ¡mara. Si abriÃ³ este enlace desde WhatsApp u otra aplicaciÃ³n, intente abrirlo en su navegador (Chrome o Safari).';
}

/** Formatos de cÃ³digo de barras tÃ­picos de libros, mÃ¡s QR por si acaso.
 *  Restringir los formatos acelera la lectura y evita falsos positivos.
 *  Se arma con cautela: si el enum no trae alguno de estos nombres (por
 *  ejemplo, una versiÃ³n distinta de la librerÃ­a), se descarta la lista
 *  entera antes que fallar â€” sin restricciÃ³n, la librerÃ­a igual reconoce
 *  todos los formatos que soporta. */
function formatosDeBarras() {
  const Formatos = window.Html5QrcodeSupportedFormats;
  if (!Formatos) return undefined;
  const nombres = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'CODABAR', 'ITF', 'QR_CODE', 'PDF_417', 'DATA_MATRIX'];
  const lista = nombres.map(n => Formatos[n]).filter(v => v !== undefined);
  return lista.length === nombres.length ? lista : undefined;
}

/** Dibuja el marco de escaneo propio: recuadro con esquinas y una lÃ­nea
 *  animada, para que quede claro que la cÃ¡mara SÃ estÃ¡ encendida y
 *  buscando un cÃ³digo â€” la librerÃ­a, por su cuenta, no da ninguna pista
 *  visual de que estÃ¡ "viva" mÃ¡s allÃ¡ del video en sÃ­.
 *
 *  Clases propias, definidas en css/styles.css con CSS de verdad â€” no
 *  clases de Tailwind sueltas. El proyecto no tiene paso de compilaciÃ³n:
 *  vendor/css/tailwind.css es estÃ¡tico, asÃ­ que una clase de Tailwind que
 *  nunca se haya usado antes en ningÃºn otro archivo (una relaciÃ³n de
 *  aspecto, un color de marca en el borde, unas esquinas) no existe en ese
 *  CSS aunque el nombre "se vea" vÃ¡lido â€” queda sin estilo, en silencio,
 *  sin ningÃºn error. Ver el comentario junto a estas clases en styles.css. */
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
        <span class="bg-black/60 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-full border border-white/20 shadow-lg">Apunta la cÃ¡mara al cÃ³digo</span>
      </div>
    </div>`;
}

class ScannerManager {
    constructor() {
        this.html5Qrcode = null;
        this.activo = false;
        this._audioCtx = null;
    }

    /** Tono corto de confirmaciÃ³n, generado en el momento. */
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
            
            // Un sonido mÃ¡s premium y suave: dos tonos rÃ¡pidos
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
     * Descarga la librerÃ­a por adelantado, SIN encender la cÃ¡mara. Se llama
     * apenas se sabe que puede hacer falta (token vÃ¡lido en escaneo-remoto.js,
     * vista MesÃ³n abierta), para que al pulsar "Iniciar cÃ¡mara" la librerÃ­a
     * ya estÃ© lista. Importa sobre todo en celulares: en Safari de iPhone, un
     * permiso de cÃ¡mara pedido despuÃ©s de una espera de red ya no cuenta
     * como gesto directo de la persona usuaria y el navegador lo bloquea sin
     * avisar. El error real (si la descarga falla) se muestra reciÃ©n al
     * pulsar el botÃ³n, no aquÃ­.
     */
    precargar() {
        cargarLibreria().catch(() => {});
    }

    async start(onSuccess, onError) {
        const contenedor = document.getElementById('reader');
        if (!contenedor) return onError?.('El Ã¡rea de la cÃ¡mara no estÃ¡ lista.');
        if (this.activo) return; // ya estÃ¡ encendida

        try {
            await cargarLibreria();
        } catch (e) {
            return onError?.(e.message);
        }

        // La vista pudo cambiar mientras se descargaba la librerÃ­a
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
            // Se llama en cada cuadro sin cÃ³digo detectado: no es un error real
            () => {}
        );

        try {
            this.html5Qrcode = new window.Html5Qrcode('reader-video', /* verbose */ false);
            this.activo = true;
            try {
                await intentarEncender({ facingMode: 'environment' });
            } catch (e) {
                // Algunos computadores y tablets solo tienen cÃ¡mara frontal: si la
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
        // deje una instancia muerta bloqueando el prÃ³ximo encendido.
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

