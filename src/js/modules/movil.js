/**
 * La condición de «esto es un teléfono», en un solo lugar.
 *
 * Dos cosas la consumen y tienen que decir lo mismo:
 *
 *  · el CSS —`src/assets/css/styles.css`, donde la cadena está escrita en cada
 *    bloque `@media` (CSS no tiene `@custom-media` sin pasar por PostCSS);
 *  · este módulo, que decide en `ui-router.js` si el sidebar es un drawer o un
 *    riel lateral, si aparece el FAB del Mesón y qué redraw hace al girar el
 *    aparato.
 *
 * Mientras las dos dijeron cosas distintas, durante toda una ronda, el teléfono
 * en horizontal se quedó con el layout de escritorio: las consultas de CSS solo
 * miraban `max-width: 768px`, y un teléfono apaisado mide 844×390 (iPhone 15
 * Pro) o 915×412 (Pixel 8) — ancho de escritorio, alto de sobre. Por eso la
 * condición es «angosto, O bajo en horizontal», y por eso `pruebas/probar-movil.mjs`
 * verifica que el texto de este archivo y el de los `@media` sigan siendo la
 * misma cadena: es el único mecanismo que impide que alguien «simplifique» uno
 * de los dos y reintroduzca el defecto sin que se note en el emulador en
 * vertical, que es donde se mira.
 *
 * Por qué `max-height: 480px` en vez de solo `orientation: landscape`: un
 * escritorio con una ventana alta pero angosta sigue siendo escritorio, y una
 * ventana de 1200×400 no tiene por qué volverse móvil. 480 px deja adentro a
 * cualquier teléfono apaisado (el más alto de los corrientes llega a ~430) y
 * afuera a cualquier ventana usable de escritorio.
 */
export const MOVIL_QUERY = '(max-width: 768px), (max-height: 480px) and (orientation: landscape)';
// La misma cadena, sin el `@media`, es la que se le pasa a `matchMedia`. No hay
// segunda constante a propósito: dos copias de un umbral son dos oportunidades
// de que se separen.

/**
 * ¿Hoy por hoy esto es un teléfono? Sin dependencias raras: si no existe
 * `matchMedia` (entornos de prueba, WebViews vetustos) se decide con las
 * dimensiones, que es exactamente lo que la consulta pregunta.
 */
export function esMovil(globo = (typeof window !== 'undefined' ? window : null)) {
  if (!globo) return false;
  if (typeof globo.matchMedia === 'function') {
    try {
      return !!globo.matchMedia(MOVIL_QUERY).matches;
    } catch {
      /* `matchMedia` existe pero lanzó (ha pasado con cadenas compuestas en
         Safari viejos): se cae a la versión por dimensiones, no se asume nada. */
    }
  }
  const ancho = globo.innerWidth || 0;
  const alto = globo.innerHeight || 0;
  return ancho <= 768 || (alto <= 480 && ancho > alto);
}

/**
 * Suscribirse a los cambios de la consulta. Devuelve la función para dejar de
 * escuchar —que es la forma de que `renderShell()`, que corre en cada inicio de
 * sesión, no acumule un listener por sesión dentro de la misma pestaña.
 */
export function escucharMovil(callback, globo = (typeof window !== 'undefined' ? window : null)) {
  if (!globo || typeof globo.matchMedia !== 'function') return () => {};
  let mql;
  try {
    mql = globo.matchMedia(MOVIL_QUERY);
  } catch {
    return () => {};
  }
  const cambio = () => callback(mql.matches);
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', cambio);
    return () => mql.removeEventListener('change', cambio);
  }
  if (typeof mql.addListener === 'function') {
    // Safari ≤ 13: solo `addListener`. Todavía hay tableta del mesón con iOS 12.
    mql.addListener(cambio);
    return () => mql.removeListener(cambio);
  }
  return () => {};
}

/** Campos que hacen que el teclado aparezca. Los demás (`button`, `checkbox`) no. */
const SELECTOR_CAMPO_DE_TEXTO = 'input[type="text"], input[type="search"], input[type="tel"], input[type="email"], input[type="number"], input[type="password"], input[type="date"], input:not([type]), textarea, select';

/**
 * Con el teclado abierto, la barra inferior fija se queda flotando sobre el
 * campo que se está escribiendo — en iOS el viewport NO se encoge cuando aparece
 * el teclado, así que `100dvh` no salva. La regla de CSS (`body.entrada-activa
 * #mobile-bottom-nav`) baja la barra; esta función es lo único que la activa.
 *
 * `visualViewport` se usa solo para una cosa: si el campo enfocado quedó debajo
 * del teclado, se lo sube lo justo. Cuando el navegador no lo tiene (Android
 * viejo, jsdom) se omite el ajuste y la barra se esconde igual — degradación, no
 * fallo.
 *
 * Idempotente a propósito: `renderShell()` se llama en cada inicio de sesión y
 * en cada cambio de rol, y un listener acumulado por sesión significa que al
 * tercer cambio de turno hay tres funciones poniendo y sacando la misma clase.
 */
export function vigilarTeclado(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.addEventListener !== 'function') return () => {};
  if (doc.body && doc.body.dataset.tecladoVigilado === '1') return () => {};
  if (doc.body) doc.body.dataset.tecladoVigilado = '1';

  const ventana = typeof window !== 'undefined' ? window : null;
  const campoEsDeTexto = (nodo) => {
    if (!nodo || !nodo.matches) return false;
    // `contenteditable` entra: el aviso de Bidi y los formularios de prueba lo usan.
    return nodo.matches(SELECTOR_CAMPO_DE_TEXTO) || nodo.isContentEditable === true;
  };

  let activo = false;
  const alEnfocar = (evento) => {
    if (!campoEsDeTexto(evento.target)) return;
    if (!activo) {
      doc.body.classList.add('entrada-activa');
      activo = true;
    }
    const vv = ventana && ventana.visualViewport;
    if (!vv) return;
    // El teclado se come la parte de abajo del viewport visible: si el campo
    // está ahí, se lo sube. Se mide contra `vv.height`, no contra `innerHeight`,
    // que es el viewport *completo* y en iOS incluye lo que el teclado tapa.
    const caja = evento.target.getBoundingClientRect();
    const debajoDelTeclado = caja.bottom - vv.offsetTop > vv.height - 8;
    if (debajoDelTeclado && typeof evento.target.scrollIntoView === 'function') {
      evento.target.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  };
  const alDesenfocar = () => {
    // Un `blur` seguido de un `focus` en el campo siguiente (tabular, o el
    // autocompletado de Android) no debería hacer parpadear la barra: se
    // pospone la decisión un turno de macrotarea.
    setTimeout(() => {
      const enfocado = doc.activeElement;
      if (campoEsDeTexto(enfocado)) return;
      if (activo) {
        doc.body.classList.remove('entrada-activa');
        activo = false;
      }
    }, 0);
  };

  doc.addEventListener('focusin', alEnfocar, true);
  doc.addEventListener('focusout', alDesenfocar, true);
  return () => {
    doc.removeEventListener('focusin', alEnfocar, true);
    doc.removeEventListener('focusout', alDesenfocar, true);
    if (doc.body) delete doc.body.dataset.tecladoVigilado;
    doc.body?.classList.remove('entrada-activa');
    activo = false;
  };
}

/**
 * Pone la barra de estado del teléfono del color del tema. En un PWA instalado
 * (`display: standalone`, que es como lo usa el mesón) el `theme-color` de
 * `index.html` es lo que pinta la franja del reloj y la batería: fijado una vez
 * en el HTML, el modo oscuro dejaba una franja café claro sobre una app oscura.
 *
 * `color-scheme` en el `<meta>` no existe; lo que hace el trabajo del lado del
 * navegador es decirle al HTML de qué color quiere los controles nativos, y eso
 * ya se hace con la clase `.dark` sobre el `<html>` (`styles.css`).
 */
export function actualizarColorDeTema(esOscuro, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.querySelector !== 'function') return;
  // `meta theme-color` admite variantes por `media`; la del usuario (sin
  // `media`) es la que gana cuando existe, así que se escribe ESA y no se
  // agregan metas nuevos: más de un `theme-color` sin `media` es indefinido.
  const meta = doc.querySelector('meta[name="theme-color"]:not([media])') || doc.querySelector('meta[name="theme-color"]');
  const color = esOscuro ? '#1C1917' : '#7A431D';
  if (!meta) {
    const nuevo = doc.createElement('meta');
    nuevo.setAttribute('name', 'theme-color');
    nuevo.setAttribute('content', color);
    doc.head?.appendChild(nuevo);
    return;
  }
  meta.setAttribute('content', color);
}
