/**
 * Generador de la vista previa visual (solo para revisión de diseño).
 *
 * Monta las vistas Catálogo, Bibliomóvil y Mi perfil con datos de ejemplo —sin
 * sesión de Supabase— y las deja en un HTML dentro de `dist/`, con el CSS ya
 * compilado por el build. Sirve para revisar el aspecto de la interfaz (incluido
 * el modo oscuro) sin depender de una base de datos real ni de credenciales.
 *
 * Uso:
 *   npm run build
 *   node pruebas/generar-vista-previa.mjs
 *   npx serve dist        (o cualquier servidor estático sobre dist/)
 *
 * No forma parte de la aplicación: es una herramienta de revisión y no se
 * publica. `dist/` está en .gitignore.
 */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Datos de ejemplo (los mismos que usa la suite de vistas, ampliados)
// ---------------------------------------------------------------------------
const LIBROS = [
  { id: 1, isbn: '9789561117442', titulo: 'Subterra', autor: 'Baldomero Lillo', genero: 'Cuento', ubicacion: 'Sala 1', stock: 3, copias_totales: 4, portada_url: null, es_bibliomovil: false },
  { id: 2, isbn: '9788437604947', titulo: 'La Araucana', autor: 'Alonso de Ercilla', genero: 'Épica', ubicacion: 'Sala 2', stock: 0, copias_totales: 1, portada_url: null, es_bibliomovil: false },
  { id: 3, isbn: '9789562891234', titulo: 'Historia de Futrono y sus Riberas', autor: 'Ramón Quichiyao', genero: 'Local', ubicacion: 'Patrimonio', stock: 1, copias_totales: 1, portada_url: null, es_bibliomovil: true },
  { id: 4, isbn: '9780140449136', titulo: 'La Odisea', autor: 'Homero', genero: 'Clásicos', ubicacion: 'Sala 3', stock: 2, copias_totales: 2, portada_url: null, es_bibliomovil: false },
  { id: 5, isbn: '9789561117008', titulo: 'Cuentos del Lago Ranco', autor: 'Vecinos de Futrono', genero: 'Local', ubicacion: 'Patrimonio', stock: 0, copias_totales: 3, portada_url: null, es_bibliomovil: true },
  { id: 6, isbn: '9789871138435', titulo: 'Rayuela', autor: 'Julio Cortázar', genero: 'Novela', ubicacion: 'Sala 1', stock: 1, copias_totales: 1, portada_url: null, es_bibliomovil: true }
];

const PERFIL = {
  usuario_id: '00000000-0000-0000-0000-000000000001',
  email: 'maria.antileo@futrono.cl',
  nombre: 'María Antileo Huenchumán',
  cargo: 'Encargada de Biblioteca',
  telefono: '56987654321',
  rol: 'librero',
  ultimo_acceso: new Date(Date.now() - 3600 * 1000).toISOString(),
  creado_en: new Date(Date.now() - 400 * 86400000).toISOString(),
  actualizado_en: new Date(Date.now() - 3 * 86400000).toISOString()
};

const PARAMETROS = [
  { clave: 'max_prestamos_por_lector', valor: '3', descripcion: 'Préstamos simultáneos' },
  { clave: 'filas_por_pagina', valor: '25', descripcion: 'Filas por página' }
];

const supabaseFalso = {
  from: () => crearConsulta([]),
  rpc: (nombre, args) => {
    if (nombre === 'buscar_libros') {
      const desde = args?.p_desplazamiento || 0;
      const limite = args?.p_limite || 25;
      const filtro = (args?.p_busqueda || '').toLowerCase();
      const coleccion = args?.p_es_bibliomovil;
      const filtrados = LIBROS.filter(l => {
        if (coleccion !== null && coleccion !== undefined && (l.es_bibliomovil ?? false) !== coleccion) return false;
        if (args?.p_filtro_stock === 'disponibles' && !(l.stock > 0)) return false;
        if (args?.p_filtro_stock === 'prestados' && l.stock !== 0) return false;
        return !filtro || (l.titulo || '').toLowerCase().includes(filtro);
      });
      const pagina = filtrados.slice(desde, desde + limite)
        .map(l => ({ ...l, total_coincidencias: filtrados.length }));
      return Promise.resolve({ data: pagina, error: null });
    }
    if (nombre === 'mi_perfil') return Promise.resolve({ data: [PERFIL], error: null });
    if (nombre === 'obtener_parametros') return Promise.resolve({ data: PARAMETROS, error: null });
    return Promise.resolve({ data: null, error: null });
  }
};

function crearConsulta(datos) {
  const q = {
    data: datos, error: null, count: datos.length,
    select() { return q; }, eq() { return q; }, or() { return q; }, order() { return q; },
    range() { return q; }, limit() { return q; }, gt() { return q; }, lt() { return q; },
    gte() { return q; }, lte() { return q; },
    single() { return Promise.resolve({ data: datos[0] || null, error: null }); },
    maybeSingle() { return Promise.resolve({ data: datos[0] || null, error: null }); },
    then(res) { return Promise.resolve({ data: datos, error: null, count: datos.length }).then(res); }
  };
  return q;
}

// ---------------------------------------------------------------------------
// Entorno
// ---------------------------------------------------------------------------
const dom = new JSDOM(
  '<!DOCTYPE html><html><head></head><body><main id="views-container"></main></body></html>',
  { url: 'https://biblionexo.test/', pretendToBeVisual: true }
);
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.HTMLElement = dom.window.HTMLElement;
global.URL = dom.window.URL;
dom.window.print = () => {};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biblionexo-preview-'));
fs.cpSync(RAIZ, tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, 'src/js/supabase-init.js'), 'export const supabase = globalThis.__supabaseFalso;');
globalThis.__supabaseFalso = supabaseFalso;
const importDesde = ruta => import(pathToFileURL(path.join(tmp, ruta)));

const { db } = await importDesde('src/js/modules/db.js');
const ui = (await importDesde('src/js/modules/ui.js')).default;

const cont = document.getElementById('views-container');
ui._parametros = Object.fromEntries(PARAMETROS.map(p => [p.clave, p.valor]));
ui._montarMapaBibliomovil = async () => {
  const mapa = document.getElementById('bibliomovil-map');
  if (mapa) mapa.innerHTML = '<p class="bibliomovil-map-placeholder">Vista previa: aquí se dibuja el mapa interactivo (Leaflet + OpenStreetMap).</p>';
};

// Plan de ruta de ejemplo, en el almacenamiento del navegador simulado.
dom.window.localStorage.setItem('biblionexo-bibliomovil-plan-v1', JSON.stringify({
  version: 1,
  origen: { nombre: 'Biblioteca Municipal (Balmaceda 99)', lat: -40.133, lon: -72.4 },
  paradas: [
    { id: 'p1', nombre: 'Llifén', lat: -40.198, lon: -72.259 },
    { id: 'p2', nombre: 'Nontuelá', lat: -40.245, lon: -72.36 },
    { id: 'p3', nombre: 'Escuela Rural Chihuío', lat: -40.31, lon: -72.45 }
  ]
}));

async function capturar(vista, rol) {
  ui.currentUserRole = rol;
  ui.currentView = vista;
  ui.bookPage = 0;
  ui.catalogSearch = '';
  ui.bibliomovilSearch = '';
  ui.catalogFilter = 'todos';
  ui.bibliomovilFilter = 'todos';
  const renderizadores = {
    catalog: () => ui.renderCatalog(),
    bibliomovil: () => ui.renderBibliomovil(),
    profile: () => ui.renderProfile()
  };
  await renderizadores[vista]();
  return cont.innerHTML;
}

const bloques = [
  { titulo: 'Catálogo de la biblioteca (sede)', nota: 'Colección separada: solo ejemplares de la sede. El botón «Al Bibliomóvil» mueve un ejemplar a la otra colección (solo administradores).', vista: 'catalog', rol: 'admin' },
  { titulo: 'Bibliomóvil — Modo Ruta', nota: 'Cabecera con resumen operativo, preparación sin conexión, mapa, plan de paradas e impresión de la hoja de ruta.', vista: 'bibliomovil', rol: 'librero' },
  { titulo: 'Catálogo del Bibliomóvil (rol de ruta)', nota: 'El mismo catálogo, visto por el rol bibliomóvil: solo la colección de la ruta y sin alta de libros de sede.', vista: 'catalog', rol: 'bibliomovil' },
  { titulo: 'Mi perfil (rediseñado)', nota: 'Encabezado de identidad, datos editables, contraseña con requisitos en vivo, preferencias (tamaño de letra y modo oscuro), actividad y sesión.', vista: 'profile', rol: 'librero' }
];

const secciones = [];
for (const bloque of bloques) {
  secciones.push(`<section class="preview-bloque">
  <div class="preview-encabezado">
    <h2>${bloque.titulo}</h2>
    <p>${bloque.nota}</p>
  </div>
  <div class="preview-vista">${await capturar(bloque.vista, bloque.rol)}</div>
</section>`);
}

// El CSS compilado por Vite lleva hash en el nombre: se busca el más reciente.
const assets = fs.readdirSync(path.join(RAIZ, 'dist/assets'));
const hoja = assets.find(f => f.startsWith('styles-') && f.endsWith('.css'));
if (!hoja) {
  console.error('No encontré el CSS compilado. Ejecuta `npm run build` antes.');
  process.exit(1);
}

const htmlFinal = `<!DOCTYPE html>
<html lang="es-CL">
<head>
<meta charset="utf-8" />
<!-- La página se sirve desde dist/preview/, pero el CSS y los recursos viven
     en la raíz de dist/: con <base> los enlaces relativos siguen resolviendo. -->
<base href="../" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Vista previa de la interfaz — BiblioNexo</title>
<link rel="stylesheet" href="vendor/css/fonts.css" />
<link rel="stylesheet" href="vendor/css/fontawesome.min.css" />
<link rel="stylesheet" href="assets/${hoja}" />
<style>
  body { background: var(--patrimonio-base); }
  .dark body { background: #0c0a09; }
  .preview-barra {
    position: sticky; top: 0; z-index: 40;
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;
    padding: 12px 20px; background: #1B3B48; color: #fff;
  }
  .preview-barra h1 { font-family: Newsreader, serif; font-size: 18px; font-weight: 600; margin: 0; }
  .preview-barra p { font-size: 12px; color: #D6D0BE; margin: 2px 0 0; }
  .preview-barra button {
    background: #7A431D; color: #fff; border: 0; border-radius: 10px;
    padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .preview-bloque { padding: 28px 20px 8px; }
  .preview-encabezado { max-width: 1100px; margin: 0 auto 14px; }
  .preview-encabezado h2 { font-family: Newsreader, serif; font-size: 22px; font-weight: 600; color: #1c1917; margin: 0 0 4px; }
  .dark .preview-encabezado h2 { color: #f5f5f4; }
  .preview-encabezado p { font-size: 13px; color: #57534e; margin: 0; }
  .dark .preview-encabezado p { color: #a8a29e; }
  .preview-vista {
    max-width: 1100px; margin: 0 auto 22px; padding: 18px;
    border: 1px dashed #d6d3d1; border-radius: 18px; background: #F7F4EB;
  }
  .dark .preview-vista { border-color: #44403c; background: #0c0a09; }
</style>
</head>
<body>
<div class="preview-barra">
  <div>
    <h1>Vista previa de la interfaz — BiblioNexo</h1>
    <p>Datos de ejemplo, sin sesión real. Solo para revisar diseño, jerarquía y modo oscuro.</p>
  </div>
  <button id="boton-tema" type="button">Alternar modo oscuro</button>
</div>
${secciones.join('\n')}
<script>
  document.getElementById('boton-tema').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
  });
</script>
</body>
</html>`;

const destino = path.join(RAIZ, 'dist', 'preview', 'index.html');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, htmlFinal, 'utf8');
fs.writeFileSync(path.join(RAIZ, 'dist', 'vista-previa-interfaz.html'), htmlFinal, 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Vista previa generada: ${path.relative(RAIZ, destino)}`);
console.log('Ábrela con un servidor estático sobre dist/ (por ejemplo: npx serve dist).');
