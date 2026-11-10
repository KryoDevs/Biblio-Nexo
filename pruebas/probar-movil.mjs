#!/usr/bin/env node
/**
 * Auditoría de la interfaz en teléfonos — lo que se puede verificar sin un dedo.
 *
 * Existe porque la versión móvil de este proyecto se «validó» a mano (así lo
 * dice `docs/ANALISIS-MOVIL-2026-10.md`, §5: 360×740, 375×667, 390×844 y
 * 768×1024 en DevTools). Cuatro tamaños en vertical, y el defecto que había
 * adentro —el teléfono en horizontal recibiendo el layout de escritorio— es
 * invisible en esa lista: los cuatro son verticales. Todo lo que depende de que
 * alguien Recuerde mirar un tamaño concreto se cae del calendario; este archivo
 * es la forma de que la condición «se ve bien en todos los teléfonos» quede
 * escrita como comprobación, no como buena voluntad.
 *
 * No reemplaza mirar la app en un aparato: hay cosas (el blur del header sobre un
 * mapa, el brillo del sol, el dedo gordo) que ningún script ve. Lo que sí hace es
 * sostener las reglas que se pueden sostener, y en particular las que se rompen
 * por accidente: agregar un `@media (max-width: 768px)` nuevo, o un campo de
 * formulario sin los 16 px que iOS exige, o copiar el `<head>` de una página sin
 * su `viewport-fit=cover`.
 *
 * Uso:
 *   node pruebas/probar-movil.mjs        # sale 0 si todo cumple
 *   npm run test:movil
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = async (rel) => await readFile(join(RAIZ, rel), 'utf8');

// La condición vive en el código de producción y se importa ACÁ en vez de
// copiarse: si alguien cambia el umbral en modules/movil.js y se olvida del CSS (o al
// revés), esta prueba es la que lo avisa. Con la cadena copiada en el test, el
// test pasaría para siempre con las dos mitades separadas.
const { MOVIL_QUERY } = await import(pathToFileURL(join(RAIZ, 'src/js/modules/movil.js')).href);

const fallos = [];
let total = 0;
function revisar(etiqueta, fn) {
  total += 1;
  try {
    const detalle = fn();
    console.log(`  ✓ ${etiqueta}${detalle ? ` — ${detalle}` : ''}`);
  } catch (e) {
    fallos.push(etiqueta);
    console.log(`  ✗ ${etiqueta}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}
function exigir(cond, mensaje) { if (!cond) throw new Error(mensaje); }

/** Comentarios fuera: en este repo ya mordió dos veces casar texto dentro de un `<!-- … -->`. */
const sinComentariosCSS = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const sinComentariosHTML = (h) => h.replace(/<!--[\s\S]*?-->/g, '');


/**
 * Corta la hoja de estilos en reglas con su bloque. Se hace a mano, con
 * profundidad de llaves, por dos motivos que ya mordiieron a este proyecto:
 * `@media` anida reglas (una regex que busca `selector { … }` se queda con la
 * primera regla interna como si fuera el cuerpo del `@media`), y los comentarios
 * pueden llevar llaves. Cada regla devuelve también el `@` que la contiene, para
 * poder preguntar «¿esta regla está dentro del bloque de teléfono?».
 */
function reglasDeCSS(texto) {
  const limpio = texto.replace(/\/\*[\s\S]*?\*\//g, '');
  const reglas = [];
  let i = 0;
  let precondicion = null;
  while (i < limpio.length) {
    const abre = limpio.indexOf('{', i);
    if (abre === -1) break;
    const cabecera = limpio.slice(i, abre).trim();
    let profundidad = 1;
    let fin = abre + 1;
    while (fin < limpio.length && profundidad > 0) {
      const c = limpio[fin];
      if (c === '{') profundidad++;
      else if (c === '}') profundidad--;
      if (profundidad > 0) fin++;
    }
    const cuerpo = limpio.slice(abre + 1, fin);
    if (cabecera.startsWith('@')) {
      // Un `@media` guarda su precondición y se recorre por dentro; lo demás
      // (`@keyframes`, `@font-face`) se ignora como contenedor.
      if (cabecera.startsWith('@media')) {
        reglas.push({ selector: null, precondicion, at: cabecera, cuerpo });
        const anterior = precondicion;
        precondicion = cabecera.replace(/^@media\s*/, '');
        reglas.push(...reglasDeCSS(cuerpo).map(r => ({ ...r, precondicion })));
        precondicion = anterior;
      }
    } else if (cabecera) {
      reglas.push({ selector: cabecera, precondicion, at: null, cuerpo });
    }
    i = fin + 1;
  }
  return reglas;
}

const css = await leer('src/assets/css/styles.css');

const cssLimpio = sinComentariosCSS(css);
/** Cada regla de la hoja, con su `@media` padre si la tiene. */
const reglas = reglasDeCSS(cssLimpio);
/** Reglas cuyo selector menciona alguna de estas superficies (dentro o fuera de un `@media`). */
const reglasDe = (...selectores) => reglas.filter(r => r.selector && selectores.some(sel => r.selector.includes(sel)));
const router = await leer('src/js/modules/ui-router.js');
const movil = await leer('src/js/modules/movil.js');
const base = await leer('src/js/modules/ui-base.js');
const htmlPaginas = ['index.html', '404.html', 'privacidad.html', 'escaneo-remoto.html'];
const htmls = Object.fromEntries(await Promise.all(htmlPaginas.map(async p => [p, sinComentariosHTML(await leer(p))])));

// ─── 1. La condición de «teléfono» ─────────────────────────────────────────
console.log('\n1. Condición de teléfono (el caso que faltaba: el aparato en horizontal)');

revisar('no queda ningún «@media (max-width: 768px)» a secas', () => {
  const sueltos = [...cssLimpio.matchAll(/@media\s*\(\s*max-width:\s*768px\s*\)\s*\{/g)];
  exigir(sueltos.length === 0,
    sueltos.length + ' bloque(s) deciden «móvil» solo por el ancho: un teléfono apaisado (844×390 en un iPhone 15 Pro, 915×412 en un Pixel 8) queda con el layout de escritorio. La forma completa es @media ' + MOVIL_QUERY + '.');
});

revisar('todos los bloques de teléfono usan la condición compartida', () => {
  const bloques = [...cssLimpio.matchAll(/@media\s*([^{]+)\{/g)].map(m => m[1].trim());
  const deTelefono = bloques.filter(b => b.includes('max-width: 768px') || b.includes('max-height: 480px'));
  exigir(deTelefono.length >= 8, `solo hay ${deTelefono.length} bloques de teléfono; se esperaban al menos 8`);
  const malas = deTelefono.filter(b => b !== MOVIL_QUERY && b !== '(max-height: 480px) and (orientation: landscape)');
  exigir(malas.length === 0, `bloques con una condición parecida pero distinta: ${malas.map(m => `(${m})`).join(' , ')}`);
  return `${deTelefono.length} bloques`;
});

revisar('la regla complementaria de escritorio no tapa al teléfono apaisado', () => {
  const oculta = /@media\s*\(min-width:\s*769px\)([^{]*)\{[^}]*#mobile-header[^}]*display:\s*none/s.exec(cssLimpio);
  exigir(oculta, 'no se encontró la regla que oculta las barras móviles en escritorio');
  exigir(oculta[1].includes('min-height'),
    'la regla que oculta `#mobile-header`/`#mobile-bottom-nav` solo mira `min-width: 769px`: en un teléfono apaisado (ancho > 769) escondería su propia navegación');
});

revisar('el JS usa la misma condición, no un matchMedia escrito a mano', () => {
  // Sin comentarios: `ui-router.js` cita el umbral viejo en el comentario que
  // explica por qué ya no se usa, y eso no es un matchMedia duro.
  const fuentes = (router + '\n' + base)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"])\/\/[^'"]*$/gm, '$1');
  const duros = [...fuentes.matchAll(/matchMedia\(\s*['"]\(\s*max-width/g)];
  exigir(duros.length === 0, duros.length + ' matchMedia con el umbral escrito en el archivo: importar esMovil() desde modules/movil.js');
  exigir(/from '\.\/movil\.js'/.test(router) && /esMovil\(\)/.test(router), 'ui-router.js no consume `esMovil()` de modules/movil.js');
  exigir(cssLimpio.includes('@media ' + MOVIL_QUERY),
    'ningún @media del CSS lleva la cadena exacta que exporta modules/movil.js');
  return 'misma cadena en CSS y en JS';
});

revisar('hay un bloque explícito para el teléfono en horizontal', () => {
  const i = cssLimpio.indexOf('@media (max-height: 480px) and (orientation: landscape)');
  exigir(i > 0, 'no existe el bloque de apaisado');
  const cuerpo = cssLimpio.slice(i, cssLimpio.indexOf('}', cssLimpio.indexOf('--mobile-nav-height', i)));
  exigir(/--mobile-nav-height/.test(cuerpo), 'el bloque de apaisado no achica --mobile-nav-height: a 390 px de alto la barra se come media pantalla');
  exigir(/\.view-canvas\s*\{[^}]*padding/s.test(cssLimpio.slice(i, i + 4000)),
    'en apaisado queda el md:p-7 de Tailwind (28 px por lado) porque el ancho supera el `md`: hay que anularlo acá');
});

// ─── 2. Lo que el navegador del teléfono controla ───────────────────────────
console.log('\n2. Viewport, notch y teclado');

for (const pagina of htmlPaginas) {
  revisar(`${pagina} declara el viewport que la app necesita`, () => {
    const m = /<meta\s+name="viewport"\s+content="([^"]+)"/.exec(htmls[pagina]);
    exigir(m, 'no hay meta de viewport');
    const c = m[1];
    exigir(/width=device-width/.test(c), `falta width=device-width (con ${JSON.stringify(c)} la app se pinta a 980 px y se ve achicada)`);
    exigir(/viewport-fit=cover/.test(c),
      'falta viewport-fit=cover: sin él, env(safe-area-inset-*) vale 0 en todos los navegadores y el margen del notch desaparece en silencio');
    exigir(!/user-scalable=no|maximum-scale/.test(c),
      'el viewport bloquea el zoom: la norma técnica del Decreto 1/2015 (y el sentido común con un adulto mayor delante) no lo permite');
  });
}

revisar('«-webkit-text-size-adjust» fijado en el `html`', () => {
  const html = /html\s*\{([^}]*)\}/s.exec(cssLimpio);
  exigir(html && /text-size-adjust:\s*100%/.test(html[1]) && /-webkit-text-size-adjust/.test(html[1]),
    'sin esto, Safari de iPhone agranda la letra por su cuenta en horizontal y desarma el layout');
});

revisar('`color-scheme` declarado (claro y oscuro)', () => {
  exigir(/color-scheme:\s*light/.test(cssLimpio), 'falta color-scheme: light en el estado base');
  exigir(/\.dark\s*\{[^}]*color-scheme:\s*dark/.test(cssLimpio), 'en modo oscuro falta color-scheme: dark: los `input` salen con fondo blanco');
});

revisar('las barras fijas respetan las franjas laterales del notch', () => {
  // Superficie → qué franja lateral le corresponde. El FAB está anclado a la
  // derecha, exigirle `left` sería una expectativa falsa; las barras que ocupan
  // todo el ancho sí necesitan las dos, porque en horizontal el notch cambia de
  // lado al girar el aparato y no hay forma de saber de antemano cuál.
  const superficies = {
    '#mobile-bottom-nav': ['left', 'right'],
    '#mobile-header': ['left', 'right'],
    '#sidebar': ['left', 'right'],
    '#toast-container': ['left', 'right'],
    '.mobile-fab-meson': ['right']
    // `#sidebar-mobile-drawer` NO está en la lista, y no por olvido: el aside
    // existe en el markup de `renderShell()` pero nunca se pinta (solo se le
    // pone `display: none`, y `activeSidebar` siempre es `#sidebar`). El drawer
    // real es `#sidebar`, y ése sí se audita arriba.
  };
  const malos = [];
  for (const [nombre, lados] of Object.entries(superficies)) {
    const bloques = reglasDe(nombre).map(r => r.cuerpo);
    if (bloques.length === 0) { malos.push(nombre + ' no aparece en el CSS'); continue; }
    const faltan = lados.filter(l => !bloques.some(b => b.includes(`safe-area-inset-${l}`)));
    if (faltan.length) malos.push(`${nombre} no usa safe-area-inset-${faltan.join('/inset-')} en ninguno de sus ${bloques.length} bloques`);
  }
  exigir(malos.length === 0, malos.join('; ') + ' — en horizontal el notch queda a un lado y el primer toque se pierde');
});

revisar('el hueco inferior del contenido se calcula, no está escrito a mano', () => {
  exigir(!/padding-bottom:\s*88px/.test(cssLimpio),
    '#views-container volvió a tener 88px fijos: con la barra en --mobile-nav-height y la letra grande del perfil, el número miente y la última fila queda bajo la navegación');
  const m = /#views-container\s*\{[^}]*padding-bottom:\s*calc\(([^)]*\bbvar\b[^)]*|[^)]*)\)/.exec(cssLimpio);
  exigir(m && m[1].includes('--mobile-nav-height'), 'el padding inferior no usa --mobile-nav-height');
});

revisar('el teclado abierto saca la barra inferior de en medio', () => {
  exigir(/body\.entrada-activa\s+#mobile-bottom-nav\s*\{[^}]*transform/.test(cssLimpio),
    'falta la regla que baja `#mobile-bottom-nav` con el teclado: en iOS el viewport no se encoge y la barra tapa el campo');
  exigir(/vigilarTeclado\(\)/.test(router), 'ui-router.js no activa el watcher de teclado (vigilarTeclado())');
  exigir(/export function vigilarTeclado/.test(movil), 'el watcher del teclado no está exportado desde modules/movil.js');
});

revisar('el `theme-color` de la barra de estado sigue al tema', () => {
  exigir(/actualizarColorDeTema\(/.test(base), 'ui-base.js no sincroniza el meta theme-color al cambiar el tema');
  const m = /<meta\s+name="theme-color"\s+content="([^"]+)"/.exec(htmls['index.html']);
  exigir(m, 'index.html no declara theme-color');
  return `base ${m[1]}, oscuro #1C1917`;
});

// ─── 3. Blacos, letra y campos ─────────────────────────────────────────────
console.log('\n3. Targets, tipografía y formularios');

revisar('los campos de texto garantizan 16 px sin depender de acordarse de los ids', () => {
  // El patrón viejo era una lista de ids; la regla global es la que no se
  // puede olvidar al alta de un campo nuevo.
  const m = /(input,\s*select,\s*textarea)\s*\{([^}]*)\}/s.exec(cssLimpio);
  exigir(m, 'no hay una regla global `input, select, textarea` en el bloque de teléfono');
  exigir(/font-size:\s*max\(1rem,\s*16px\)/.test(m[2]),
    'la regla global no fija font-size: max(1rem, 16px): iOS hace zoom al enfocar un campo de menos de 16 px');
  exigir(/min-height:\s*44px/.test(m[2]), 'la regla global no fija min-height: 44px');
  const listaVieja = /#catalog-search-input,\s*#user-search-input/.test(cssLimpio);
  exigir(!listaVieja, 'volvió la lista de ids a mano: es la forma en que un campo nuevo se queda sin la protección');
});

revisar('la navegación inferior y sus botones son blancos de 44 px', () => {
  const m = /\.mobile-nav-btn\s*\{([^}]*)\}/s.exec(cssLimpio);
  exigir(m && /min-height:\s*44px/.test(m[1]), '#mobile-bottom-nav .mobile-nav-btn no declara min-height: 44px');
  const h = /#mobile-header button[^{]*\{([^}]*)\}/s.exec(cssLimpio);
  exigir(h && /min-height:\s*44px/.test(h[1]), 'los botones del header móvil no tienen mínimo táctil');
});

revisar('ningún texto del shell móvil está por debajo de 11 px ni en px fijo', () => {
  // El shell móvil es lo único que aquí se audita: en el resto de la hoja hay
  // texto pequeño deliberado (la hoja de ruta impresa, `@media print`, tiene
  // 10 px en una etiqueta y así debe quedar).
  const superficies = ['.mobile-nav-btn', '#estado-conexion-mobile', '#mobile-page-title', '.mobile-nav-badge', '.mobile-fab-meson'];
  const malas = [];
  for (const r of reglasDe(...superficies)) {
    const m = /font-size:\s*([^;]+);/.exec(r.cuerpo);
    if (!m) continue;
    const valor = m[1].trim();
    const px = /^(\d+(?:\.\d+)?)px$/.exec(valor);
    if (px && Number(px[1]) < 11) malas.push(`${r.selector}: ${valor}`);
  }
  exigir(malas.length === 0,
    `${malas.join(', ')} — texto clavado en px no escala con «Mi perfil → tamaño de letra» (--escala-fuente), y 10 px es ilegible con el sol encima. La forma correcta es max(0.6875rem, 11px).`);
});

revisar('las etiquetas de navegación escalan (no están clavadas en px fijo)', () => {
  // Ojo con el «parece verde»: esta comprobación estuvo midiendo un trozo del
  // CSS cortado por un `indexOf` que no encontraba el marcador y devolvía -1,
  // o sea `slice(-1)` = el último carácter de la hoja, o sea cero coincidencias
  // siempre. Un auditor que no puede fallar no audita nada; por eso se apoya en
  // las reglas ya parseadas, que no admiten un «no lo encontré» silencioso.
  const r = reglasDe('.mobile-nav-btn', '#estado-conexion-mobile').find(x => /font-size/.test(x.cuerpo));
  exigir(r, 'ningún botón del shell móvil define tipografía: no hay forma de saber si escala');
  const m = /font-size:\s*([^;]+);/.exec(r.cuerpo);
  exigir(/rem/.test(m[1]),
    `${r.selector} define font-size: ${m[1]} — en px absolutos, quien suba la letra desde «Mi perfil → tamaño de letra» sigue viendo 10 px en la barra con la que navega`);
});

revisar('el escaneo remoto (la página del vecino) comparte las mismas reglas', () => {
  const esc = htmls['escaneo-remoto.html'];
  exigir(/rel="stylesheet"[^>]*href="\/src\/assets\/css\/styles\.css"/.test(esc),
    'la página del escaneo remoto no carga styles.css: sus campos se quedaron sin la regla de 16 px/44 px');
});

// ─── Recuento ──────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(64)}`);
if (fallos.length === 0) {
  console.log(`${total} comprobaciones correctas, 0 con fallo — la interfaz de teléfono cumple las condiciones verificables.`);
} else {
  console.log(`${total - fallos.length}/${total} comprobaciones correctas, ${fallos.length} con fallo:`);
  for (const f of fallos) console.log(`  · ${f}`);
  console.log('\nSi una falló por un cambio de tamaño deliberado, hay que actualizar a la vez la\ncondición de src/js/modules/movil.js y la de los @media del CSS: son dos copias\nde un mismo umbral y esta prueba exige que coincidan.');
}
process.exit(fallos.length);
