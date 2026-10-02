/**
 * Guardia de arranque.
 *
 * Si algo esencial no carga o el inicio se cuelga, se muestra un mensaje claro
 * en vez de dejar el indicador girando para siempre. Alguien en el mesón que ve
 * una rueda que no para no tiene forma de saber si es la conexión, el servidor
 * o su propio computador.
 *
 * Este código vive en un archivo aparte y no dentro de index.html a propósito:
 * así la Política de Seguridad de Contenido puede prohibir por completo los
 * scripts en línea (`script-src 'self'`, sin 'unsafe-inline'). Con eso, aunque
 * alguien lograra inyectar una etiqueta <script> o un atributo onclick en la
 * página, el navegador se negaría a ejecutarlo.
 *
 * Se carga como módulo en el <head> y ANTES que main.js: los módulos se
 * ejecutan en orden de documento, antes de DOMContentLoaded, así que la
 * función de error y el vigía de 10 s ya están puestos cuando arranca la
 * aplicación. (El comentario anterior decía que se cargaba "sin type=module";
 * nunca fue así, y con un <script> clásico Vite no lo empaquetaría.)
 *
 * El vigía de carga de los scripts escucha en fase de captura sobre window y
 * no espera a DOMContentLoaded: aunque este archivo ya se ejecuta tarde para
 * los scripts del <body>, el oyente sí alcanza a cualquier script que se
 * inserte después (por ejemplo html5-qrcode, que se carga bajo demanda).
 */
(function () {
  'use strict';

  window.__appBooted = false;

  // ------------------------------------------------------------------------
  // Respaldo contra clickjacking
  // ------------------------------------------------------------------------
  // La defensa correcta es la cabecera HTTP `frame-ancestors 'none'`, que va en
  // `vercel.json`. Esa directiva NO se puede enviar por <meta>: el navegador
  // la ignora.
  //
  // Esto queda como respaldo adicional en JavaScript, por si algo impide que
  // la cabecera llegue.
  //
  // El ataque que evita: alguien monta el sistema dentro de un marco invisible
  // en otra página y superpone botones falsos. La persona del mesón cree estar
  // pulsando una cosa y en realidad autoriza otra — por ejemplo, eliminar un
  // lector. Con la sesión ya abierta, el ataque no necesita la contraseña.
  //
  // Es menos sólido que la cabecera: un marco con el atributo `sandbox` puede
  // impedir la salida. Por eso, si se puede, se usa la cabecera.
  try {
    if (window.top !== window.self) {
      // Se intenta salir del marco. Si el marco lo bloquea, al menos no se
      // muestra nada aprovechable.
      var enmarcado = true;
      try {
        window.top.location = window.self.location;
      } catch (e) {
        // El marco impide la navegación: se deja la advertencia visible
      }
      if (enmarcado) {
        document.addEventListener('DOMContentLoaded', function () {
          if (window.top !== window.self) {
            document.body.textContent = '';
            var aviso = document.createElement('div');
            aviso.setAttribute('role', 'alert');
            aviso.style.cssText =
              'font-family:system-ui,sans-serif;padding:2rem;text-align:center;' +
              'background:#1c1917;color:#fafaf9;min-height:100vh;display:flex;' +
              'flex-direction:column;align-items:center;justify-content:center;gap:1rem';
            var t = document.createElement('strong');
            t.textContent = 'Esta página no puede mostrarse dentro de otro sitio';
            var d = document.createElement('span');
            d.style.cssText = 'font-size:0.875rem;max-width:28rem;line-height:1.5';
            d.textContent = 'Por seguridad, el sistema de la biblioteca solo funciona en su propia ' +
              'ventana. Abre la dirección directamente en el navegador.';
            aviso.appendChild(t);
            aviso.appendChild(d);
            document.body.appendChild(aviso);
          }
        });
      }
    }
  } catch (e) {
    // Comprobar window.top puede lanzar excepción entre orígenes distintos.
    // Que falle no debe impedir que el sistema arranque.
  }

  window.__showCriticalError = function (mensaje) {
    var destino = document.getElementById('views-container') || document.body;

    // Se construye con el DOM en vez de innerHTML para que el mensaje no pueda
    // interpretarse como HTML bajo ninguna circunstancia.
    destino.textContent = '';

    var fondo = document.createElement('div');
    fondo.className = 'h-screen w-full bg-patrimonio-lago flex items-center justify-center p-6';

    var tarjeta = document.createElement('div');
    tarjeta.className = 'bg-patrimonio-card border border-stone-300 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4';
    tarjeta.setAttribute('role', 'alert');

    var icono = document.createElement('i');
    icono.setAttribute('aria-hidden', 'true');
    icono.className = 'fas fa-triangle-exclamation text-3xl text-rose-700';

    var titulo = document.createElement('h3');
    titulo.className = 'font-serif text-lg font-bold text-stone-900';
    titulo.textContent = 'No se pudo conectar';

    var texto = document.createElement('p');
    texto.className = 'text-stone-600 text-sm';
    texto.textContent = mensaje;

    var boton = document.createElement('button');
    boton.className = 'w-full bg-patrimonio-madera hover:bg-[#633414] text-white font-medium rounded-xl shadow py-2.5 text-sm';
    boton.textContent = 'Reintentar';
    boton.addEventListener('click', function () { location.reload(); });

    tarjeta.appendChild(icono);
    tarjeta.appendChild(titulo);
    tarjeta.appendChild(texto);
    tarjeta.appendChild(boton);
    fondo.appendChild(tarjeta);
    destino.appendChild(fondo);
  };

  // Vigilancia de los scripts esenciales. Antes esto eran atributos onerror en
  // cada etiqueta; ahora se engancha aquí para poder cerrar la CSP.
  //
  // A diferencia de la versión anterior (que enganchaba los oyentes recién en
  // DOMContentLoaded), se usa un oyente global en FASE DE CAPTURA sobre
  // window: los scripts del <body> se descargan durante el parseo, así que si
  // fallan disparan su 'error' ANTES de que exista DOMContentLoaded — el
  // oyente tardío solo dejaba el aviso genérico de los 10 segundos. Los
  // 'error' de recursos no burbujean, pero sí se capturan en window.
  var MENSAJES_DE_CARGA = {
    'script-supabase': 'No se pudo cargar el módulo de base de datos. Verifique que la carpeta vendor esté publicada.',
    'script-app': 'No se pudo cargar la aplicación.'
  };
  window.addEventListener('error', function (evento) {
    var id = evento && evento.target && evento.target.id;
    if (id && MENSAJES_DE_CARGA[id]) {
      window.__showCriticalError(MENSAJES_DE_CARGA[id]);
    }
  }, true);

  // Red de seguridad: si a los 10 segundos la aplicación no avisó que arrancó,
  // se asume que algo se colgó por el camino.
  setTimeout(function () {
    if (!window.__appBooted) {
      window.__showCriticalError(
        'La aplicación tardó demasiado en cargar. Verifique su conexión a internet e intente nuevamente.'
      );
    }
  }, 10000);
})();
