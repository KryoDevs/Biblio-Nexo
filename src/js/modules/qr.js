/**
 * Genera el código QR de acceso remoto al escáner, como una etiqueta SVG
 * lista para insertar en la pantalla.
 *
 * La librería (`src/js/vendor/qrcode.min.js`, ~20 KB) se carga solo al pedir un
 * QR por primera vez, como se hace con html5-qrcode.min.js y Chart.js (esas dos
 * sí en `public/vendor/`, porque son UMD): quien nunca genera un QR no la
 * descarga.
 *
 * Se usa SVG en vez de un <canvas> o una imagen: el resultado es texto,
 * queda dentro de la Política de Seguridad de Contenido sin abrir ningún
 * dominio nuevo (no hay ninguna petición de red de por medio) y se ve nítido
 * a cualquier tamaño en la pantalla del celular que lo escanea.
 */
let promesaLibreria = null;
function cargarLibreria() {
    if (!promesaLibreria) {
        // Import dinámico relativo, y el archivo vive en `src/js/vendor/` y no
        // en `public/vendor/` desde la revisión del 25/10/2026. Antes se
        // importaba por URL absoluta (`/vendor/js/qrcode.min.js`) con
        // `@vite-ignore` y una bifurcación para Node, porque el empaquetador no
        // puede resolver una ruta de `public/`. Con Vite 8.3 ese truco dejó de
        // servir: la compilación se cae con «Could not resolve
        // '/vendor/js/qrcode.min.js'» aunque el comentario de ignorar esté
        // puesto. Siendo como es un módulo ES de verdad (`export default`), lo
        // honesto es tratarlo como un módulo del proyecto: Vite lo code-split y
        // sigue cargándose solo cuando se pide un QR —que era el punto de todo
        // esto—, con nombre con hash (cacheable como inmutable) y sin depender
        // de que el servidor le acierte al tipo MIME.
        //
        // Las otras dos librerías vendorizadas (html5-qrcode, Chart.js) siguen
        // en `public/vendor/` a propósito: son UMD que cuelgan un global y se
        // insertan con <script>, otro mecanismo, y mezclar los dos en un mismo
        // commit hubiera hecho esta corrección imposible de revisar.
        promesaLibreria = import('../vendor/qrcode.min.js').then(m => m.default);
    }
    return promesaLibreria;
}

/**
 * @param {string} texto  Lo que codifica el QR (aquí, siempre una URL propia
 *                        del sistema; nunca datos de una persona).
 * @returns {Promise<string>} Una etiqueta <svg ...>...</svg> como texto.
 */
export async function generarSvgQr(texto) {
    const qrcode = await cargarLibreria();
    // typeNumber 0 = que la librería elija el tamaño mínimo que alcance;
    // 'M' = corrección de errores media, el valor por defecto recomendado.
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    // cellSize 5, margin 2: legible desde una foto de celular sin quedar
    // enorme en pantallas chicas.
    return qr.createSvgTag(5, 2);
}
