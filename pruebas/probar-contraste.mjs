// Verificación de contraste WCAG 2.1 (Decreto N° 1/2015 exige estándares W3C)
// AA requiere 4.5:1 en texto normal y 3:1 en texto grande (>=18.66px negrita o >=24px)
const hex = h => { const n = parseInt(h.replace('#',''),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const lum = ([r,g,b]) => { const f = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const ratio = (a,b) => { const [l1,l2]=[lum(hex(a)),lum(hex(b))].sort((x,y)=>y-x); return (l1+0.05)/(l2+0.05); };

const P = {
  base:'#F7F4EB', card:'#FFFFFF', madera:'#7A431D', maderaHover:'#633414',
  lago:'#1B3B48', bosque:'#2C4A3E', stone500:'#78716c', stone400:'#a8a29e',
  stone600:'#57534e', rose700:'#be123c', amber600:'#d97706', amber700:'#b45309',
  blanco:'#FFFFFF', ambar:'#F6B26B',
  // Modo nocturno (ver «Modo nocturno — correcciones puntuales» en css/styles.css)
  noche:'#0c0a09', nocheCard:'#1c1917', nocheBorde:'#44403c',
  nocheTexto:'#e7e5e4', nocheTenue:'#a8a29e', nocheSuave:'#d6d3d1',
  nocheMadera:'#E7B98D', nocheBosque:'#6EE7B7', nocheLago:'#7DD3FC',
  nocheRosa:'#FDA4AF', nocheAmbar:'#FCD34D',
  // Avisos (toasts): texto blanco sobre color pleno, iguales en los dos temas.
  avisoExito:'#047857', avisoError:'#e11d48', avisoInfo:'#1B3B48'
};

const casos = [
  // [descripción, textoColor, fondoColor, mínimo]
  ['Texto principal sobre papel',        P.lago,     P.base, 4.5],
  ['Texto principal sobre tarjeta',      P.lago,     P.card, 4.5],
  ['Texto secundario (stone-600)',       P.stone600, P.card, 4.5],
  ['Texto auxiliar (stone-500)',         P.stone500, P.card, 4.5],
  ['Texto tenue sobre panel oscuro',     P.stone400, P.lago, 4.5],
  ['Enlace/acento madera sobre tarjeta', P.madera,   P.card, 4.5],
  ['Botón madera: blanco sobre madera',  P.blanco,   P.madera, 4.5],
  ['Botón madera hover',                 P.blanco,   P.maderaHover, 4.5],
  ['Botón lago: blanco sobre lago',      P.blanco,   P.lago, 4.5],
  ['Botón bosque: blanco sobre bosque',  P.blanco,   P.bosque, 4.5],
  ['Alerta atraso (rose-700)',           P.rose700,  P.card, 4.5],
  ['Alerta por vencer (amber-700)',      P.amber700, P.card, 4.5],
  ['Foco sobre panel oscuro',            P.ambar,    P.lago, 3.0],

  // --- Modo nocturno ---
  // El modo oscuro no exime del estándar: si el texto se aclara y el fondo se
  // oscurece, la relación de contraste se calcula igual. Estos pares son los
  // que estaban por debajo del mínimo antes de la corrección (el lago sobre
  // stone-900 daba 1.7:1 y el bosque, 1.8:1) y los que ahora usan las reglas
  // .dark: de css/styles.css y los acentos de marca.
  ['Texto principal sobre fondo nocturno', P.nocheTexto, P.noche, 4.5],
  ['Texto principal sobre tarjeta nocturna', P.nocheTexto, P.nocheCard, 4.5],
  ['Texto secundario sobre tarjeta nocturna', P.nocheSuave, P.nocheCard, 4.5],
  ['Texto tenue sobre tarjeta nocturna',   P.nocheTenue, P.nocheCard, 4.5],
  ['Sello de alerta en oscuro (rose-300)', P.nocheRosa, P.nocheCard, 4.5],
  ['Sello de estado en oscuro (sky-300)',  P.nocheLago, P.nocheCard, 4.5],
  ['Sello de disponible en oscuro (emerald-300)', P.nocheBosque, P.nocheCard, 4.5],
  ['Sello del Bibliomóvil en oscuro',      P.nocheMadera, P.nocheCard, 4.5],
  ['Acento madera aclarado (marca «Nexo»)', P.nocheMadera, P.lago, 4.5],
  ['Marca «Nexo» en el menú lateral',       P.nocheMadera, P.lago, 4.5],
  ['Acento bosque aclarado en oscuro',     P.nocheBosque, P.noche, 4.5],
  ['Acento lago aclarado en oscuro',       P.nocheLago, P.noche, 4.5],
  ['Foco del teclado en modo oscuro',      P.ambar,    P.noche, 3.0],
  ['Alerta por vencer en oscuro (amber-300)', P.nocheAmbar, P.nocheCard, 4.5],
  ['Panel de vidrio oscuro (texto claro encima)', P.nocheTexto, P.nocheCard, 4.5],
  ['Placeholder del panel de vidrio (stone-500)', P.stone500, P.card, 4.5],

  // --- Avisos (toasts) ---
  // Llevan texto blanco sobre un color pleno, en los dos temas. El verde era
  // esmeralda 500 (2,6:1): quedaba por debajo del mínimo y encandilaba de
  // noche. Ahora es el 700.
  ['Aviso de éxito',                     P.blanco, P.avisoExito, 4.5],
  ['Aviso de error',                     P.blanco, P.avisoError, 4.5],
  ['Aviso informativo',                  P.blanco, P.avisoInfo, 4.5],
];

let fallos = 0;
console.log('CONTRASTE WCAG 2.1 AA\n' + '='.repeat(62));
for (const [desc, fg, bg, min] of casos) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fallos++;
  console.log(`${ok?'✓':'✗'} ${desc.padEnd(38)} ${r.toFixed(2)}:1  (min ${min})`);
}
console.log('='.repeat(62));
console.log(fallos === 0 ? 'Todos cumplen AA' : `${fallos} combinación(es) NO cumplen AA`);

// Además se verifica que los colores descartados no hayan vuelto al código.
// Se lee ui-base.js más cada vista en js/vistas/ — no js/modules/ui.js, que
// desde la división de ui-base.js (22 de agosto de 2026) es solo un
// ensamblador de 17 líneas sin clases Tailwind: leer solo ese archivo hacía
// que esta verificación diera "sin regresiones" siempre, sin revisar nada.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const RAIZ_UI = path.dirname(fileURLToPath(import.meta.url));
const archivosUi = [
  path.join(RAIZ_UI, '../src/js/modules/ui-base.js'),
  // Los avisos (toasts) viven acá, con sus colores plenos y texto blanco:
  // revisarlos fuera de esta lista era justamente lo que dejó pasar el verde
  // esmeralda 500 a 2,6:1.
  path.join(RAIZ_UI, '../src/js/modules/ui-modales.js'),
  ...fs.readdirSync(path.join(RAIZ_UI, '../src/js/vistas'))
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(RAIZ_UI, '../src/js/vistas', f))
];
const ui = archivosUi.map(f => fs.readFileSync(f, 'utf8')).join('\n');
const prohibidos = [
  ['text-amber-600', 'solo 3.19:1 sobre blanco, usar amber-700'],
  // Los acentos de marca son tintas para papel claro: sobre stone-900 quedan
  // entre 1.5:1 y 2.2:1. En modo oscuro van por la regla .dark del CSS, que
  // usa el mismo matiz aclarado (ver styles.css); escribirlos como variante
  // oscura de Tailwind los haría invisibles.
  ['dark:text-patrimonio-lago', '1.7:1 sobre stone-900; usa dark:text-sky-300 o la regla .dark del CSS'],
  ['dark:text-patrimonio-bosque', '1.8:1 sobre stone-900; usa dark:text-emerald-400 o la regla .dark del CSS'],
  ['dark:text-patrimonio-madera', '2.2:1 sobre stone-900; usa dark:text-amber-400 o la regla .dark del CSS'],
  // Verde esmeralda 500: con el texto blanco del aviso queda en 2,6:1. El 700
  // (#047857) da 5,5:1 y sigue siendo el mismo matiz.
  ['bg-[#10b981]', 'texto blanco encima queda en 2.6:1; usar bg-[#047857] (esmeralda 700)'],
];
let regresiones = 0;
// Las clases prohibidas se buscan como texto literal: sin escapar, una clase
// como bg-[#10b981] se leería como expresión regular (el [ ] es una clase de
// caracteres) y marcaría cualquier bg- del código — pasó al agregar el primer
// color con corchetes a esta lista.
const escaparRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [clase, motivo] of prohibidos) {
  const n = (ui.match(new RegExp(escaparRegex(clase), 'g')) || []).length;
  if (n > 0) { console.log(`✗ ${clase} reapareció ${n} vez/veces — ${motivo}`); regresiones++; }
}
// stone-400 solo se acepta sobre fondo oscuro.
// "glass-panel" se sacó de esta lista: es un panel de vidrio CLARO
// (rgba(255,255,255,0.86), ver css/styles.css) sobre el que texto stone-400
// no cumple AA — no era una excepción válida, era un bug que esta
// verificación nunca alcanzaba a ver porque leía el archivo equivocado.
// "current-user-sub" se agregó en su lugar: es el único caso real de
// stone-400 en fondo oscuro que no queda cerca de un marcador en su misma
// línea (vive varias líneas dentro de #sidebar, que sí es oscuro — ver
// css/styles.css). El resto de las excepciones (texto blanco, el encabezado
// institucional, el fondo lago) sí son fondo oscuro en la misma línea.
// Se descartan primero las variantes de modo oscuro (`dark:text-stone-400`):
// ahí el fondo es oscuro y el color sí cumple. Contarlas como si fueran de
// fondo claro hacía que la comprobación marcara 166 líneas correctas y
// enterrara los 12 casos reales que sí había que corregir.
const sinVariantesOscuras = ui.replace(/dark:[^\s"']+/g, '');
const lineasClaras = sinVariantesOscuras.split('\n').filter(l =>
  l.includes('text-stone-400') && !/sidebar|current-user-sub|text-white|Región de Los Ríos|bg-patrimonio-lago|stone-300 mt-1/.test(l));
if (lineasClaras.length > 0) {
  console.log(`✗ text-stone-400 sobre fondo claro en ${lineasClaras.length} línea(s) — solo 2.52:1`);
  regresiones++;
}
if (regresiones === 0) console.log('Sin regresiones de color en el código (modo claro y oscuro)');
process.exit(fallos > 0 || regresiones > 0 ? 1 : 0);
process.exit(fallos > 0 ? 1 : 0);
