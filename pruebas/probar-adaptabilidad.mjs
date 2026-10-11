/**
 * Verificación de adaptabilidad — teléfonos, tablets y modo nocturno.
 *
 * BiblioNexo se usa desde el mesón (computador del mesón), desde una tablet en
 * la sala y desde el teléfono del personal en la ruta del Bibliomóvil. Esta
 * comprobación no reemplaza probar en un equipo real, pero sí atrapa lo que se
 * rompe solo, sin que nadie lo note:
 *
 *   · un contenedor de 100vh, que en un teléfono es más alto que la pantalla;
 *   · un botón que se esconde a los 768px mientras el menú se vuelve cajón
 *     recién a los 1024px (en un iPad en vertical no se podía navegar);
 *   · una celda de tabla sin su etiqueta, que en pantalla angosta deja el dato
 *     sin nombre;
 *   · un texto claro sin su variante oscura, que en modo nocturno queda
 *     invisible sobre el fondo oscuro.
 *
 * Lee los archivos, no el navegador: mismo criterio y mismas limitaciones que
 * pruebas/verificar_clases_tailwind.py y pruebas/verificar_llamadas_rpc.py.
 * Las clases armadas con interpolación (`class="... ${variable}"`) solo se
 * revisan en su parte literal: la parte dinámica no se puede resolver sin
 * ejecutar el código.
 *
 * Ejecutar:  node pruebas/probar-adaptabilidad.mjs
 * Devuelve 0 si todo está en orden, 1 si hay algo que corregir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

let pasadas = 0;
let fallidas = 0;
const comprobar = (descripcion, condicion, detalle = '') => {
  if (condicion) {
    pasadas++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  ✗ ${descripcion}${detalle ? ' — ' + detalle : ''}`);
  }
};

const titulo = t => console.log(`\n${t}`);

/**
 * Devuelve el cuerpo de cada consulta de medios cuya cabecera coincida.
 * Buscar la regla con una ventana fija de caracteres es frágil: basta agregar
 * un comentario largo dentro del bloque para que la comprobación deje de
 * encontrarla aunque la regla siga ahí. Esto lee el bloque de verdad, contando
 * llaves.
 */
const cuerposMedia = (cabecera) => {
  const cuerpos = [];
  const re = new RegExp(cabecera.source, cabecera.flags.includes('g') ? cabecera.flags : cabecera.flags + 'g');
  let m;
  while ((m = re.exec(CSS)) !== null) {
    const desde = CSS.indexOf('{', m.index);
    if (desde < 0) continue;
    let nivel = 0;
    for (let j = desde; j < CSS.length; j++) {
      if (CSS[j] === '{') nivel++;
      else if (CSS[j] === '}') {
        nivel--;
        if (nivel === 0) { cuerpos.push(CSS.slice(desde + 1, j)); break; }
      }
    }
  }
  return cuerpos;
};

// ---------------------------------------------------------------------------
// Archivos del sistema
// ---------------------------------------------------------------------------
const CSS = leer('src/assets/css/styles.css');
const INDEX = leer('index.html');
const SHELL = leer('src/js/modules/ui-router.js');
const CONFIG = leer('src/js/config.js');

const archivosVistas = fs.readdirSync(path.join(RAIZ, 'src/js/vistas'))
  .filter(f => f.endsWith('.js'))
  .map(f => `src/js/vistas/${f}`);
const archivosUi = [
  'src/js/arranque.js',
  'src/js/modules/ui-base.js',
  'src/js/modules/ui-modales.js',
  'src/js/modules/ui-router.js'
];
// Todo el código que dibuja interfaz: es donde viven las clases de color.
const archivosConClases = [...archivosVistas, ...archivosUi];

// ---------------------------------------------------------------------------
// 1. Ventana y alto de pantalla
// ---------------------------------------------------------------------------
titulo('1. Ventana y alto de pantalla (teléfonos con barra de direcciones y muesca)');

comprobar('index.html declara viewport-fit=cover (el recorte de pantalla se respeta, no se recorta contenido)',
  /name="viewport"[^>]*viewport-fit=cover/.test(INDEX));
comprobar('index.html declara interactive-widget=resizes-content (el teclado no tapa el botón de guardar)',
  /name="viewport"[^>]*interactive-widget=resizes-content/.test(INDEX));
comprobar('styles.css define .pantalla-completa con 100dvh (y 100vh como respaldo)',
  /\.pantalla-completa\s*\{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s.test(CSS));
comprobar('styles.css define .pantalla-minima con 100dvh',
  /\.pantalla-minima\s*\{[^}]*min-height:\s*100dvh;/s.test(CSS));

const conAlturaFija = archivosConClases.filter(rel => /\bh-screen\b/.test(leer(rel)));
comprobar('ninguna vista ni pantalla usa h-screen (100vh es más alto que la pantalla del teléfono)',
  conAlturaFija.length === 0, conAlturaFija.join(', '));

// El propio index.html dibuja el cargador de arranque (el aro que gira mientras
// la aplicación despierta). También tiene que medir la pantalla visible: era el
// último h-screen que quedaba.
comprobar('el cargador de arranque de index.html mide la pantalla visible (pantalla-completa, sin h-screen)',
  /id="views-container"[^>]*pantalla-completa/.test(INDEX) && !/\bh-screen\b/.test(INDEX));

// El tema se aplica antes del primer pintado con un script CLÁSICO en el
// <head> (public/tema-inicial.js): quien dejó el modo oscuro guardado veía un
// destello blanco en cada carga. Un módulo no sirve — se ejecuta después de
// parsear la página, cuando el destello ya ocurrió.
const TEMA_INICIAL = leer('public/tema-inicial.js');
comprobar('index.html aplica el tema antes del primer pintado (script clásico, no módulo)',
  /<script src="\/tema-inicial\.js"><\/script>/.test(INDEX),
  'se esperaba <script src="/tema-inicial.js"></script>, sin type=module');
comprobar('el script de tema corre antes que la aplicación',
  INDEX.indexOf('/tema-inicial.js') < INDEX.indexOf('/src/js/main.js'));
comprobar('el script de tema lee la misma preferencia que la aplicación (localStorage "theme")',
  /localStorage\.getItem\('theme'\)/.test(TEMA_INICIAL) &&
  /localStorage\.getItem\('theme'\)/.test(leer('src/js/modules/ui-base.js')));
comprobar('el script de tema también deja el color de la barra del navegador en oscuro',
  /#0c0a09/.test(TEMA_INICIAL) && /meta-color-tema/.test(TEMA_INICIAL));

// ---------------------------------------------------------------------------
// 2. Menú lateral y navegación en tablets y teléfonos
// ---------------------------------------------------------------------------
titulo('2. Menú lateral y navegación en tablets y teléfonos');

comprobar('el cajón lateral se activa hasta 1024px (el ancho de un iPad en vertical queda cubierto)',
  /@media\s*\(max-width:\s*1023\.98px\)/.test(CSS));
comprobar('el botón del menú usa el mismo umbral que el cajón (lg:hidden, 1024px)',
  /id="sidebar-toggle-btn"[^>]*lg:hidden/.test(SHELL),
  'con md:hidden el botón desaparecía a los 768px y el menú seguía oculto: en iPad vertical no había navegación');
comprobar('#sidebar se oculta y se muestra con la clase .active en pantalla angosta',
  /#sidebar\.active\s*\{[^}]*transform:\s*translateX\(0\)/s.test(CSS));
comprobar('el cajón cerrado no recibe el foco del teclado (visibility: hidden)',
  /#sidebar\s*\{[^}]*visibility:\s*hidden;/s.test(CSS));
// Regresión real que se coló hasta una revisión con navegador: la regla base
// de escritorio (`#sidebar { position: relative }`) vivía más abajo en el
// archivo que el bloque del cajón, y con la misma especificidad le ganaba por
// puro orden de cascada. El cajón seguía ocupando lugar en la fila y el área
// de trabajo quedaba reducida a los ~50px que sobraban al costado: en un
// teléfono la aplicación entera se veía recortada. Las dos formas del menú
// tienen que vivir en consultas de medios que no puedan coincidir.
const bloquesCajon = cuerposMedia(/@media\s*\(max-width:\s*1023\.98px\)/g);
comprobar('el cajón lateral es fijo en pantalla angosta (no ocupa lugar en la fila)',
  bloquesCajon.some(b => /#sidebar\s*\{[^}]*position:\s*fixed;/s.test(b)));
comprobar('el menú de escritorio es relativo dentro de su propia consulta (min-width: 1024px)',
  /@media\s*\(min-width:\s*1024px\)\s*\{\s*#sidebar\s*\{[^}]*position:\s*relative;/s.test(CSS),
  'una regla #sidebar suelta fuera de consulta de medios vuelve a pisar el cajón por orden de cascada');
comprobar('no queda ninguna regla #sidebar con position fuera de una consulta de medios',
  !/^(?![\s\S]*@media)[^@]*#sidebar\s*\{[^}]*position:/m.test(CSS.split('@media')[0]) &&
  !/^#sidebar\s*\{[^}]*position:/m.test(CSS),
  'bastan una base suelta y el orden del archivo para volver a romper el teléfono');
comprobar('Escape cierra el cajón lateral',
  /_escapeMenuLateral[\s\S]{0,220}Escape/.test(SHELL));
comprobar('la página de atrás no se desplaza con el cajón abierto (body.menu-abierto)',
  /body\.menu-abierto\s*\{\s*overflow:\s*hidden/.test(CSS));
comprobar('el panel de notificaciones no se sale de la pantalla del teléfono',
  /max-w-\[calc\(100vw-2rem\)\]/.test(SHELL));
// El `max-w-[calc(100vw-2rem)]` de arriba NO alcanzaba: el `w-80` sigue siendo
// el ancho natural y, como el panel cuelga de la campana (pegada al borde
// derecho), el navegador lo alinea por la derecha y lo desborda por la
// IZQUIERDA. Medido en un marco de 358px quedaba entre -46 y 258: 46px fuera
// de la pantalla y el título «Notificaciones» cortado. En pantalla angosta el
// panel pasa a ocupar el ancho disponible.
const bloques640 = cuerposMedia(/@media\s*\(max-width:\s*640px\)/g);
comprobar('en pantalla angosta el panel de notificaciones se ancha al ancho disponible',
  bloques640.some(b => /#notificaciones-panel\s*\{[^}]*left:\s*0\.75rem;[^}]*right:\s*0\.75rem;[^}]*width:\s*auto;/s.test(b)),
  'sin esto el panel se abre fuera de la pantalla por la izquierda');
comprobar('la franja de título se pinta sobre la vista (si no, el panel queda detrás del contenido)',
  bloques640.some(b => /\.franja-titulo\s*\{\s*position:\s*relative;\s*z-index:\s*10;/s.test(b)),
  'el backdrop-filter de la franja la vuelve el bloque contenedor del panel y su capa lo dejaba detrás');

comprobar('el cascarón monta la barra de accesos rápidos',
  /id="barra-inferior"/.test(SHELL) && /\.barra-inferior\s*\{[\s\S]{0,80}display:\s*none/.test(CSS));

// Cada acceso rápido declarado en CONFIG debe existir en las vistas del rol:
// si no, el botón no llevaría a ninguna parte (o desaparecería en silencio).
const bloqueConfig = CONFIG.match(/VISTAS_RAPIDAS:\s*\{([\s\S]*?)\n  \}/);
const vistasPorRol = CONFIG.match(/VIEWS_BY_ROLE:\s*\{([\s\S]*?)\n  \},\n\n  \/\/ Accesos rápidos/);
comprobar('config.js declara CONFIG.VISTAS_RAPIDAS', !!bloqueConfig);
comprobar('config.js declara VIEWS_BY_ROLE antes de los accesos rápidos', !!vistasPorRol);

if (bloqueConfig && vistasPorRol) {
  const rapidasPorRol = {};
  for (const m of bloqueConfig[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    rapidasPorRol[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
  }
  const vistasDeRol = {};
  for (const m of vistasPorRol[1].matchAll(/^\s{4}(\w+):\s*\[([\s\S]*?)^\s{4}\]/gm)) {
    vistasDeRol[m[1]] = [...m[2].matchAll(/id:\s*'([^']+)'/g)].map(x => x[1]);
  }

  const rolesConBarra = ['admin', 'librero', 'bibliomovil'];
  comprobar('los tres roles tienen accesos rápidos declarados',
    rolesConBarra.every(r => rapidasPorRol[r]?.length >= 2));
  for (const rol of rolesConBarra) {
    const desconocidas = (rapidasPorRol[rol] || []).filter(id => !(vistasDeRol[rol] || []).includes(id));
    comprobar(`los accesos rápidos de "${rol}" existen en su menú`, desconocidas.length === 0, desconocidas.join(', '));
    comprobar(`"${rol}" no tiene más de 4 accesos rápidos (el resto va en "Más")`,
      (rapidasPorRol[rol] || []).length <= 4);
  }
}

// La tarjeta de un libro: la portada en miniatura a la izquierda y los datos a
// la derecha. El grupo de datos lleva `min-w-0` y la fila entera `w-full`; sin
// eso, en un teléfono, el título largo empujaba la fila 47px más allá de la
// tarjeta y la mitad derecha de los datos (autor, ISBN, sellos) quedaba fuera
// de la pantalla, con el nombre del libro cortado por el borde.
comprobar('la fila de datos de la tarjeta de libro ocupa el ancho de la tarjeta (min-w-0 y w-full)',
  /class="flex items-start gap-4 flex-1 min-w-0 w-full"/.test(leer('src/js/vistas/catalogo.js')),
  'sin w-full la tarjeta se desborda a lo ancho en el teléfono');

comprobar('el área de trabajo deja espacio para la barra inferior (los avisos no quedan tapados)',
  /#views-container\s*\{[^}]*padding-bottom:\s*calc\(4\.75rem \+ env\(safe-area-inset-bottom\)\)/s.test(CSS));
comprobar('el contenido arranca arriba al cambiar de sección (scrollTop = 0)',
  /areaDeTrabajo\.scrollTop\s*=\s*0/.test(SHELL));

// ---------------------------------------------------------------------------
// 3. Recorte de pantalla, área táctil y teclado del teléfono
// ---------------------------------------------------------------------------
titulo('3. Recorte de pantalla, área táctil y teclado del teléfono');

const usosSafeArea = (CSS.match(/env\(safe-area-inset/g) || []).length;
comprobar('se respetan las zonas del recorte de pantalla (muesca y barra de gestos)',
  usosSafeArea >= 5 && /safe-area-inset-top/.test(CSS) && /safe-area-inset-bottom/.test(CSS),
  `${usosSafeArea} usos de env(safe-area-inset-*)`);

comprobar('existe la clase .boton-icono para los botones de solo ícono',
  /\.boton-icono\s*\{[^}]*min-width:\s*2\.25rem;[^}]*min-height:\s*2\.25rem;/s.test(CSS));
comprobar('.boton-icono crece a 44px en pantallas táctiles (WCAG 2.5.8 recomienda 44px)',
  /@media\s*\(pointer:\s*coarse\)[\s\S]{0,900}\.boton-icono\s*\{[^}]*min-width:\s*2\.75rem;[^}]*min-height:\s*2\.75rem;/s.test(CSS));
comprobar('en pantalla táctil los botones de las vistas tienen alto mínimo de 40px',
  /@media\s*\(pointer:\s*coarse\)[\s\S]{0,400}min-height:\s*2\.5rem/.test(CSS));

comprobar('los campos de formulario usan 16px en pantalla angosta (iOS no hace zoom al enfocar)',
  /@media\s*\(max-width:\s*1023\.98px\)[\s\S]*?input:not\(\[type="checkbox"\]\)[\s\S]{0,220}font-size:\s*1rem;/s.test(CSS));

const botonesIcono = (SHELL.match(/boton-icono/g) || []).length;
comprobar('los botones de solo ícono del cascarón usan .boton-icono',
  botonesIcono >= 4, `${botonesIcono} usos en ui-router.js`);
comprobar('el botón de tema de la pantalla de ingreso usa .boton-icono',
  /dark-mode-toggle boton-icono/.test(leer('src/js/modules/ui-base.js')));

// ---------------------------------------------------------------------------
// 4. Tablas adaptables
// ---------------------------------------------------------------------------
titulo('4. Tablas adaptables (fichas en pantalla angosta)');

comprobar('styles.css convierte las tablas .tabla-adaptable en fichas hasta 768px',
  /@media\s*\(max-width:\s*767\.98px\)[\s\S]{0,900}\.tabla-adaptable thead\s*\{\s*display:\s*none;/s.test(CSS));
comprobar('la etiqueta de cada celda sale de data-etiqueta (::before con attr)',
  /\.tabla-adaptable td::before\s*\{[^}]*attr\(data-etiqueta\)/s.test(CSS));

for (const rel of ['src/js/vistas/admin.js', 'src/js/vistas/lectores.js']) {
  const texto = leer(rel);
  const tablas = [...texto.matchAll(/<table\b[^>]*>/g)].map(m => m[0]);
  const conEncabezado = tablas.filter((t, i) => {
    const resto = texto.slice(texto.indexOf(t));
    return /<thead\b/.test(resto.slice(0, resto.indexOf('</table>') + 1));
  });
  const sinClase = conEncabezado.filter(t => !/tabla-adaptable/.test(t));
  comprobar(`${path.basename(rel)}: todas las tablas con encabezado son adaptables`,
    sinClase.length === 0, sinClase.join(' | '));

  // Recorrido secuencial: se cuentan las celdas que están dentro de una tabla
  // adaptable. Las de una tabla sin encabezado —la de parámetros, que es una
  // lista de nombre y valor— no llevan etiqueta y no se revisan. Las celdas
  // que se dibujan en otra función (las filas de Lectores) quedan fuera de
  // cualquier bloque <table>, así que también se revisan: son justamente las
  // que se olvidan al marcar la tabla.
  const EVENTOS = /<table\b[^>]*>|<\/table>|<td\b[^>]*>/g;
  let tabla = 'fuera'; // 'fuera' | 'adaptable' | 'normal'
  let celdas = 0;
  const sinEtiqueta = [];
  for (const m of texto.matchAll(EVENTOS)) {
    const trozo = m[0];
    if (/^<table/.test(trozo)) {
      tabla = /tabla-adaptable/.test(trozo) ? 'adaptable' : 'normal';
      continue;
    }
    if (trozo === '</table>') {
      tabla = 'fuera';
      continue;
    }
    // Una celda dentro de una tabla normal —la de parámetros, que es una
    // lista de nombre y valor— no necesita etiqueta. Las demás sí: tanto las
    // de una tabla adaptable como las que se dibujan desde otra función
    // (las filas de Lectores), que quedan fuera de todo bloque <table>.
    if (tabla === 'normal') continue;
    const atributos = trozo.slice(3);
    if (/\bcolspan\b/.test(atributos)) continue;
    celdas++;
    if (!/\bdata-etiqueta\b/.test(atributos)) sinEtiqueta.push(trozo);
  }
  comprobar(`${path.basename(rel)}: las ${celdas} celdas llevan su etiqueta de columna`,
    sinEtiqueta.length === 0, `${sinEtiqueta.length} sin data-etiqueta`);
}

// ---------------------------------------------------------------------------
// 5. Diálogos que caben en la pantalla
// ---------------------------------------------------------------------------
titulo('5. Diálogos que caben en la pantalla');

comprobar('los modales declaran role="dialog" y aria-modal (gancho de la regla de alto máximo)',
  /overlay\.setAttribute\('role',\s*'dialog'\)/.test(leer('src/js/modules/ui-modales.js')) &&
  /overlay\.setAttribute\('aria-modal',\s*'true'\)/.test(leer('src/js/modules/ui-modales.js')));
comprobar('la caja del modal nunca es más alta que la ventana visible, con scroll interno',
  /\[role="dialog"\]\[aria-modal="true"\]\s*>\s*:first-child\s*\{[^}]*max-height:\s*calc\(100dvh - 2rem\);[^}]*overflow-y:\s*auto;/s.test(CSS));

// ---------------------------------------------------------------------------
// 6. Modo nocturno
// ---------------------------------------------------------------------------
titulo('6. Modo nocturno');

comprobar('el fondo y el color de texto base cambian con el tema (html.dark body)',
  /html\.dark body\s*\{[^}]*background-color:\s*#0c0a09;[^}]*color:\s*#e7e5e4;/s.test(CSS));
comprobar('el color de esquema del navegador sigue al tema (color-scheme)',
  /html\s*\{[^}]*color-scheme:\s*light;/s.test(CSS) && /html\.dark\s*\{[^}]*color-scheme:\s*dark;/s.test(CSS));
comprobar('el anillo de foco del teclado se ve sobre fondo oscuro',
  /html\.dark a:focus-visible,[\s\S]{0,300}outline-color:\s*#F6B26B;/s.test(CSS));

const reglasOscuras = [
  ['la cabecera de tarjeta (catalog-card-header)', /\.dark \.catalog-card-header\s*\{/],
  ['el borde inferior de las celdas', /html\.dark td\s*\{/],
  ['el resalte de fila al pasar el mouse', /html\.dark tbody tr:hover\s*\{/],
  ['el cargador giratorio', /\.dark \.spinner\s*\{/],
  ['el sello de alerta', /\.dark \.stamp-danger\s*\{/],
  ['el sello de colección/estado', /\.dark \.stamp-info\s*\{/],
  ['el sello de disponible', /\.dark \.stamp-success\s*\{/],
  ['el sello del Bibliomóvil', /\.dark \.stamp-movil\s*\{/],
  ['los esqueletos de carga', /\.dark \.skeleton-shimmer/],
  ['el mapa y los mosaicos de OpenStreetMap', /\.dark \.bibliomovil-map \.leaflet-tile\s*\{/],
  ['los controles y globos del mapa', /\.dark \.bibliomovil-map \.leaflet-popup-content-wrapper/],
  ['la marca de agua del área de trabajo', /\.dark \.view-canvas\s*\{/],
  ['los acentos de marca (madera, bosque, lago) sobre fondo oscuro', /\.dark \.text-patrimonio-madera\s*\{[^}]*color:\s*#E7B98D;/s],
  ['el acento de bosque aclarado', /\.dark \.text-patrimonio-bosque\s*\{[^}]*color:\s*#6EE7B7;/s],
  ['el acento de lago aclarado', /\.dark \.text-patrimonio-lago\s*\{[^}]*color:\s*#7DD3FC;/s],
  ['el hover de los enlaces de madera', /\.dark \.hover\\:text-patrimonio-madera:hover\s*\{/],
  ['la marca del menú lateral (oscuro en los dos temas)', /#sidebar \.text-patrimonio-madera\s*\{[^}]*color:\s*#E7B98D;/s],
  ['el panel de vidrio del ingreso, en la familia stone (no azulado)', /\.dark \.glass-panel\s*\{[^}]*rgba\(28,\s*25,\s*23/s],
  ['la escena del lago atenuada cuando el tema es oscuro', /\.dark #login-scene\s*\{[^}]*filter:/s],
  ['el velo del cajón, que sobre fondo oscuro desaparecía', /\.dark #sidebar-overlay\s*\{[^}]*rgba\(12,\s*10,\s*9/s],
];
for (const [nombre, patron] of reglasOscuras) {
  comprobar(`tiene corrección propia en modo oscuro: ${nombre}`, patron.test(CSS));
}

// La veta de madera de los botones era un mosaico de 120x120px: el ruido de
// feTurbulence no cierra en los bordes y cada unión dejaba una línea vertical
// recta en medio del botón (se notaba sobre todo en los botones anchos, como
// el «Agregar» del catálogo). Ahora la mancha se estira al tamaño del botón y
// no queda ninguna unión que mirar.
comprobar('la veta del botón de madera no se repite (sin costuras visibles)',
  /\.btn-madera\s*\{[^}]*background-repeat:\s*no-repeat;[^}]*background-size:\s*100% 100%;/s.test(CSS),
  'el mosaico de 120px dejaba costuras verticales dentro del botón');

comprobar('la franja del navegador del teléfono sigue al tema elegido, no al del sistema',
  /_sincronizarColorDeBarra/.test(SHELL) && /id="meta-color-tema"/.test(INDEX));
comprobar('el botón del tema anuncia su estado (aria-pressed) a los lectores de pantalla',
  /setAttribute\('aria-pressed',\s*dark\s*\?\s*'true'\s*:\s*'false'\)/.test(leer('src/js/modules/ui-base.js')));

/**
 * Clases de color claro sin ninguna variante oscura en el mismo atributo.
 *
 * Es el error que se repite solo: alguien escribe text-stone-700 (o bg-white,
 * o border-stone-300) y olvida su pareja dark:. En modo oscuro el texto queda
 * casi negro sobre fondo casi negro, o el fondo blanco deslumbra.
 *
 * Se revisa por grupo de propiedad (texto, fondo, borde, separadores): basta
 * con que el atributo tenga una variante oscura de la misma familia. Es
 * deliberadamente conservador — se busca el olvido completo, no el matiz.
 */
const IGNORAR = new Set([
  // Blancos translúcidos: son velos sobre un panel oscuro (menú lateral,
  // vitrina del ingreso), no fondos de papel. No necesitan variante oscura.
  // Se detectan solos porque llevan "/" en la clase (bg-white/10), así que no
  // hace falta listarlos: esta entrada queda como recordatorio del criterio.

  // Bolita de los interruptores: va blanca sobre un carril que sí cambia de
  // color con el tema (stone-700 apagado, lago encendido). Blanca es lo
  // legible en los dos temas.
  'absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform duration-300 ease-in-out shadow-sm toggle-switch-knob flex items-center justify-center',
  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform',
]);

const TOKENS_CLAROS = [
  { re: /^(hover:|focus:)?text-stone-(500|600|700|800|900)$/, grupo: 'texto' },
  { re: /^(hover:|focus:)?text-rose-(600|700|800)$/, grupo: 'texto' },
  { re: /^(hover:|focus:)?text-amber-(600|700|800)$/, grupo: 'texto' },
  { re: /^(hover:|focus:)?text-emerald-(600|700|800)$/, grupo: 'texto' },
  { re: /^bg-(white|stone-50|stone-100|stone-200)$/, grupo: 'fondo' },
  { re: /^bg-(rose|amber|emerald|sky)-(50|100)$/, grupo: 'fondo' },
  { re: /^hover:bg-(white|stone-50|stone-100|stone-200|rose-50|amber-100)$/, grupo: 'fondo' },
  { re: /^(hover:|focus:)?border-stone-(200|300)$/, grupo: 'borde' },
  { re: /^border-(rose|amber|emerald|sky)-(200|300)$/, grupo: 'borde' },
  { re: /^divide-stone-(100|200)$/, grupo: 'separador' },
];
const GRUPO_A_VARIANTE = {
  texto: /\bdark:(hover:|focus:)?text-/,
  fondo: /\bdark:(hover:|focus:)?bg-/,
  borde: /\bdark:(hover:|focus:)?border-/,
  separador: /\bdark:divide-/,
};

const PATRON_CLASE = /\bclass(?:Name)?\s*=\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/gs;
const hallazgos = [];
for (const rel of archivosConClases) {
  const texto = leer(rel);
  for (const m of texto.matchAll(PATRON_CLASE)) {
    const valor = m[2];
    if (valor.includes('${')) continue; // parte dinámica: no resoluble
    if (IGNORAR.has(valor.trim())) continue;
    const tokens = valor.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (token.includes('/')) continue; // translúcido
      const regla = TOKENS_CLAROS.find(t => t.re.test(token));
      if (!regla) continue;
      if (GRUPO_A_VARIANTE[regla.grupo].test(valor)) continue;
      const linea = texto.slice(0, m.index).split('\n').length;
      hallazgos.push(`${rel}:${linea}  ${token}  (sin variante oscura)`);
    }
  }
}
if (hallazgos.length) {
  console.log(`\n  Clases claras sin variante oscura (${hallazgos.length}):`);
  for (const h of hallazgos) console.log(`    · ${h}`);
  console.log('  Corrección: agrega la pareja dark: del mismo grupo (dark:text-stone-200,');
  console.log('  dark:bg-stone-900, dark:border-stone-700, dark:divide-stone-800…). Si el');
  console.log('  color es intencional en los dos temas, agrégalo a IGNORAR en este script');
  console.log('  con el motivo escrito.');
}
comprobar('ningún texto, fondo, borde o separador claro quedó sin su variante oscura',
  hallazgos.length === 0, `${hallazgos.length} hallazgo(s)`);

// Colores que viajan como variable en vez de ir escritos dentro de un
// class="…": `${color}`, classList.toggle('text-rose-700', …), los arreglos de
// estilos de un filtro. El escáner de arriba solo mira los atributos class, y
// por ese hueco se colaron ocho números en rose-700 y amber-700 que quedaban
// casi negros sobre las tarjetas oscuras.
const TINTA_OSCURA = /\btext-(stone|rose|amber|emerald|sky|lago|bosque|madera)-(600|700|800|900)\b/;
const IGNORAR_TINTA = [
  // La página del escáner remoto (escaneo-remoto.html) no tiene tema oscuro:
  // siempre se dibuja sobre papel claro, así que sus tintas oscuras son
  // correctas ahí. Si algún día se le agrega modo nocturno, hay que quitar
  // esta excepción.
  'src/js/escaneo-remoto.js',
];
const hallazgosTinta = [];
for (const rel of archivosConClases) {
  if (IGNORAR_TINTA.includes(rel)) continue;
  const lineas = leer(rel).split('\n');
  lineas.forEach((linea, i) => {
    // Se descartan los comentarios: ahí los colores se nombran para explicar.
    if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return;
    for (const m of linea.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
      const literal = m[1] ?? m[2] ?? '';
      if (literal.includes('dark:')) continue;      // ya trae su pareja
      const golpe = literal.match(TINTA_OSCURA);
      if (!golpe) continue;
      // La pareja puede estar en la línea siguiente, como en los
      // classList.toggle de dos pasos (perfil.js, bibliomovil.js).
      const trio = lineas.slice(i, i + 3).join('\n');
      const color = golpe[1] === 'stone' ? 'stone' : golpe[1];
      if (new RegExp(`dark:text-${color}-`).test(trio)) continue;
      hallazgosTinta.push(`${rel}:${i + 1}  ${golpe[0]}  (sin variante oscura)`);
    }
  });
}
if (hallazgosTinta.length) {
  console.log(`\n  Tintas oscuras sin variante oscura (${hallazgosTinta.length}):`);
  for (const h of hallazgosTinta) console.log(`    · ${h}`);
  console.log('  Corrección: agrega la pareja dark:text-… en el mismo literal');
  console.log('  (dark:text-rose-300, dark:text-amber-300, dark:text-stone-200…).');
}
comprobar('ningún color que viaja como variable quedó sin su pareja oscura',
  hallazgosTinta.length === 0, `${hallazgosTinta.length} hallazgo(s)`);

// Los colores de marca del modo claro no deben reaparecer dentro de una
// variante oscura: el lago (#1B3B48) y el bosque (#2C4A3E) sobre stone-900
// quedan por debajo de 2:1, es decir, invisibles.
const lagoEnOscuro = archivosConClases.filter(rel => /dark:text-patrimonio-(lago|bosque|madera)/.test(leer(rel)));
comprobar('ninguna variante oscura usa los colores de marca oscuros (invisibles sobre stone-900)',
  lagoEnOscuro.length === 0, lagoEnOscuro.join(', '));

// Las tres pantallas que se abren desde un enlace del correo (ingreso,
// contraseña nueva e invitación) tienen que aplicar el tema por su cuenta: no
// pasan por el cascarón del panel, que es el otro lugar donde se inicializa.
const UI_BASE = leer('src/js/modules/ui-base.js');
for (const [pantalla, siguiente] of [
  ['renderNuevaPassword', 'renderCompletarInvitacion'],
  ['renderCompletarInvitacion', 'renderLogin'],
  ['renderLogin', '_renderIndicadorConexion']
]) {
  const desde = UI_BASE.indexOf(`${pantalla}()`);
  const hasta = UI_BASE.indexOf(`${siguiente}()`, desde + 1);
  const cuerpo = UI_BASE.slice(desde, hasta > 0 ? hasta : undefined);
  comprobar(`la pantalla de ${pantalla} aplica el tema elegido`,
    desde > -1 && /this\._initDarkMode\(\)/.test(cuerpo));
}

// ---------------------------------------------------------------------------
// 7. Páginas que se abren fuera del panel (también se usan en el teléfono)
// ---------------------------------------------------------------------------
titulo('7. Páginas que se abren fuera del panel');

// No todas pasan por el cascarón: el 404 (cualquier enlace roto), el escaneo
// remoto del Bibliomóvil (el enlace que se le manda al lector, siempre desde
// un teléfono) y la política de privacidad (la casilla de consentimiento del
// ingreso). Se revisan aparte porque tienen su propio HTML.

const LIMITE_MOVIL = [
  ['404.html', '404.html'],
  ['escaneo-remoto.html', 'escaneo-remoto.html']
];
for (const [rel] of LIMITE_MOVIL) {
  const pagina = leer(rel);
  comprobar(`${rel} declara el mismo viewport que la aplicación (muesca y teclado)`,
    /name="viewport"[^>]*viewport-fit=cover/.test(pagina) &&
    /name="viewport"[^>]*interactive-widget=resizes-content/.test(pagina));
  comprobar(`${rel} no usa h-screen y sí pantalla-minima`,
    !/\bh-screen\b/.test(pagina) && /pantalla-minima/.test(pagina));
}

const PRIVACIDAD = leer('privacidad.html');
comprobar('privacidad.html: la tabla de datos personales es adaptable (fichas con etiqueta)',
  /<table class="tabla-adaptable">/.test(PRIVACIDAD) &&
  /<thead>/.test(PRIVACIDAD) &&
  !/<td(?![^>]*data-etiqueta)[^>]*>/.test(PRIVACIDAD),
  'alguna celda quedó sin data-etiqueta');
comprobar('privacidad.html: el margen se reduce en pantalla angosta',
  /@media\s*\(max-width:\s*640px\)[\s\S]{0,200}\.pagina-legal \.contenedor/s.test(CSS));

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log('\n' + '─'.repeat(62));
console.log(fallidas === 0
  ? `${pasadas} comprobaciones correctas. Todo adaptado a teléfonos, tablets y modo oscuro.`
  : `${pasadas} comprobaciones correctas, ${fallidas} con fallo.`);
process.exit(fallidas === 0 ? 0 : 1);
