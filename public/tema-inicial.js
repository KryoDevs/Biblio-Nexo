/**
 * Tema antes del primer pintado (script clásico, sin módulo).
 *
 * El resto del sistema decide el tema en `_initDarkMode()` (ver
 * src/js/modules/ui-base.js), que corre cuando la pantalla ya se está
 * dibujando. Para quien dejó el modo oscuro guardado, el teléfono alcanzaba a
 * mostrar un destello blanco en cada carga —justo de noche, que es cuando
 * molesta— antes de que el JavaScript alcanzara a pintar el fondo oscuro.
 *
 * Este archivo hace lo mismo, pero sale en el <head> como script clásico y
 * bloquea el parseo: cuando el navegador pinta el <body>, la clase ya está
 * puesta. Es un script clásico (no `type="module"`) a propósito: los módulos
 * se ejecutan después de parsear la página, y ahí el destello ya ocurrió. Por
 * eso vive en public/ (se copia tal cual al build) y no en src/js/ (que Vite
 * empaqueta como módulo y dejaría de bloquear). Ver la comprobación
 * "index.html declara el tema antes del primer pintado" en
 * pruebas/probar-adaptabilidad.mjs.
 *
 * No es una segunda fuente de verdad: solo repite las dos mismas reglas de
 * `_initDarkMode()` (localStorage 'theme' y, si no hay nada guardado, la
 * preferencia del sistema) y el color de la barra del navegador. Sin
 * JavaScript, o si esto falla, la aplicación se ve en claro y no se rompe
 * nada.
 */
(function () {
    try {
        var guardado = localStorage.getItem('theme');
        var oscuro = guardado === 'dark' ||
            (guardado !== 'light' && window.matchMedia &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (!oscuro) return;

        document.documentElement.classList.add('dark');

        // La franja del navegador se pinta con el color oscuro antes de que
        // corra _sincronizarColorDeBarra().
        var meta = document.getElementById('meta-color-tema');
        if (meta) meta.setAttribute('content', '#0c0a09');
        var metaDelSistema = document.querySelector('meta[name="theme-color"][media]');
        if (metaDelSistema && guardado) metaDelSistema.setAttribute('media', 'not all');
    } catch (e) {
        // Navegador con el almacenamiento bloqueado: se queda en claro.
    }
})();
