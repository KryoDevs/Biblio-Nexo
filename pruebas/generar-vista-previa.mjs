/**
 * Generador de la vista previa visual (solo para revisión de diseño).
 *
 * Monta las pantallas del sistema con el cascarón real (menú lateral, franja de
 * título y barra de accesos rápidos) y datos de ejemplo —sin sesión de Supabase—
 * y las deja en un HTML dentro de `dist/`, con el CSS ya compilado por el build.
 *
 * Cada pantalla se dibuja DENTRO DE UN IFRAME con el ancho del equipo que se
 * elija (teléfono de 360px, teléfono grande de 390px, tablet en vertical de
 * 768px, tablet en horizontal de 1024px o ancho completo). Es la única forma de
 * ver de verdad la adaptación: las media queries de CSS responden al ancho de la
 * VENTANA, y un contenedor angosto dentro de una página ancha no las activa — el
 * modo cajón del menú, las tablas en fichas y la barra inferior solo aparecen si
 * el documento es realmente angosto.
 *
 * Uso:
 *   npm run build
 *   node pruebas/generar-vista-previa.mjs
 *   npx serve dist        (o cualquier servidor estático sobre dist/)
 *   → abrir /preview/
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

const PERFIL_BASE = {
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
  { clave: 'dias_aviso_previo', valor: '3', descripcion: 'Días de aviso antes del vencimiento' },
  { clave: 'max_renovaciones', valor: '2', descripcion: 'Renovaciones por préstamo' },
  { clave: 'filas_por_pagina', valor: '25', descripcion: 'Filas por página' }
];

const LECTORES = [
  { id: 'l1', nombre: 'Pedro Curinao Antileo', rut: '12.345.678-9', email: 'pedro.curinao@correo.cl', telefono: '56911112222', created_at: '2026-02-11T12:00:00Z' },
  { id: 'l2', nombre: 'Rosa Llancamán Muñoz', rut: '9.876.543-2', email: 'rosa.llancaman@correo.cl', telefono: '56922223333', created_at: '2026-03-02T12:00:00Z' },
  { id: 'l3', nombre: 'José Miguel Riquelme', rut: '15.222.333-4', email: 'jm.riquelme@correo.cl', telefono: '', created_at: '2026-04-18T12:00:00Z' },
  { id: 'l4', nombre: 'Ana María Sandoval', rut: '10.555.777-1', email: 'ana.sandoval@correo.cl', telefono: '56944445555', created_at: '2026-05-21T12:00:00Z' },
  { id: 'l5', nombre: 'Luis Alberto Paillamilla', rut: '13.909.111-8', email: 'luis.paillamilla@correo.cl', telefono: '56966667777', created_at: '2026-06-30T12:00:00Z' }
];

const fecha = dias => new Date(Date.now() + dias * 86400000).toISOString().split('T')[0];

const PRESTAMOS = [
  { id: 'p1', fecha_prestamo: fecha(-20), fecha_devolucion_esperada: fecha(-5), estado: 'activo', renovaciones: 0, parada_nombre: null, libros: { id: 1, titulo: 'Subterra', stock: 3 }, lectores: { id: 'l1', nombre: 'Pedro Curinao Antileo', rut: '12.345.678-9', email: 'pedro.curinao@correo.cl', telefono: '56911112222' } },
  { id: 'p2', fecha_prestamo: fecha(-12), fecha_devolucion_esperada: fecha(1), estado: 'activo', renovaciones: 1, parada_nombre: null, libros: { id: 4, titulo: 'La Odisea', stock: 2 }, lectores: { id: 'l2', nombre: 'Rosa Llancamán Muñoz', rut: '9.876.543-2', email: 'rosa.llancaman@correo.cl', telefono: '56922223333' } },
  { id: 'p3', fecha_prestamo: fecha(-6), fecha_devolucion_esperada: fecha(3), estado: 'activo', renovaciones: 0, parada_nombre: 'Llifén', libros: { id: 6, titulo: 'Rayuela', stock: 1 }, lectores: { id: 'l3', nombre: 'José Miguel Riquelme', rut: '15.222.333-4', email: 'jm.riquelme@correo.cl', telefono: '' } },
  { id: 'p4', fecha_prestamo: fecha(-3), fecha_devolucion_esperada: fecha(6), estado: 'activo', renovaciones: 0, parada_nombre: 'Nontuelá', libros: { id: 3, titulo: 'Historia de Futrono y sus Riberas', stock: 1 }, lectores: { id: 'l4', nombre: 'Ana María Sandoval', rut: '10.555.777-1', email: 'ana.sandoval@correo.cl', telefono: '56944445555' } },
  { id: 'p5', fecha_prestamo: fecha(-1), fecha_devolucion_esperada: fecha(14), estado: 'activo', renovaciones: 0, parada_nombre: null, libros: { id: 1, titulo: 'Subterra', stock: 3 }, lectores: { id: 'l5', nombre: 'Luis Alberto Paillamilla', rut: '13.909.111-8', email: 'luis.paillamilla@correo.cl', telefono: '56966667777' } }
];

const ESTADISTICAS = {
  libros: 1840, lectores: 926, prestamos: 5, devueltos: 3120, noDevueltos: 1, enEstante: 1795,
  paradas: [
    { nombre: 'Llifén', total_prestamos: 42 },
    { nombre: 'Nontuelá', total_prestamos: 28 },
    { nombre: 'Escuela Rural Chihuío', total_prestamos: 15 }
  ]
};

const REPORTE = {
  faltaMigracion: false,
  desde: fecha(-30),
  hasta: fecha(0),
  totalPrestamos: 187,
  totalDevoluciones: 156,
  totalNuevosLectores: 23,
  devolucionesAtrasadas: 9,
  topLibros: [
    { etiqueta: 'Subterra', total: 14 },
    { etiqueta: 'La Odisea', total: 11 },
    { etiqueta: 'Cuentos del Lago Ranco', total: 9 }
  ],
  topLectores: [
    { etiqueta: 'Pedro Curinao Antileo', total: 6 },
    { etiqueta: 'Rosa Llancamán Muñoz', total: 5 },
    { etiqueta: 'Ana María Sandoval', total: 4 }
  ],
  porParada: [
    { parada_nombre: 'Llifén', total_prestamos: 22 },
    { parada_nombre: 'Nontuelá', total_prestamos: 14 },
    { parada_nombre: 'Escuela Rural Chihuío', total_prestamos: 8 }
  ],
  prestamos: PRESTAMOS.map(p => ({
    id: p.id, fecha_prestamo: p.fecha_prestamo, fecha_devolucion_esperada: p.fecha_devolucion_esperada,
    fecha_devolucion_real: null, estado: p.estado, libros: p.libros, lectores: p.lectores
  })),
  nuevosLectores: LECTORES.map(l => ({ id: l.id, nombre: l.nombre, rut: l.rut, created_at: l.created_at }))
};

// ---------------------------------------------------------------------------
// Supabase falso
// ---------------------------------------------------------------------------
// El rol se cambia entre bloques para poder mostrar el mismo sistema con los
// tres perfiles (admin, librero y bibliomóvil).
let rolActual = 'librero';
const perfilActual = () => ({ ...PERFIL_BASE, rol: rolActual, email: `${rolActual}@futrono.cl` });

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
    if (nombre === 'mi_perfil') return Promise.resolve({ data: [perfilActual()], error: null });
    if (nombre === 'obtener_parametros') return Promise.resolve({ data: PARAMETROS, error: null });
    if (nombre === 'estadisticas_paradas') return Promise.resolve({ data: ESTADISTICAS.paradas, error: null });
    return Promise.resolve({ data: null, error: null });
  }
};

function crearConsulta(datos) {
  const q = {
    data: datos, error: null, count: datos.length,
    select() { return q; }, eq() { return q; }, or() { return q; }, order() { return q; },
    range() { return q; }, limit() { return q; }, gt() { return q; }, lt() { return q; },
    gte() { return q; }, lte() { return q; }, update() { return q; }, insert() { return q; },
    delete() { return q; },
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
  '<!DOCTYPE html><html><head></head><body><main id="views-container"></main><div id="toast-container"></div></body></html>',
  { url: 'https://biblionexo.test/', pretendToBeVisual: true }
);
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.URL = dom.window.URL;
global.Audio = class { play() { return Promise.resolve(); } };
global.AudioContext = undefined;
dom.window.print = () => {};
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));

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

// Datos de ejemplo para las secciones que leen de la base. Se reemplazan las
// funciones de db —no las tablas de Supabase— porque es la forma más corta de
// que cada vista reciba datos con la forma exacta que espera.
db.obtenerEstadisticas = async () => ESTADISTICAS;
db.obtenerReservasApartadas = async () => [];
db.obtenerLectores = async () => ({ lectores: LECTORES, total: LECTORES.length });
db.obtenerPrestamos = async () => ({
  prestamos: PRESTAMOS,
  total: PRESTAMOS.length,
  conteos: { todos: PRESTAMOS.length, vencidos: 1, porVencer: 1 }
});
db.obtenerPendientesDeAviso = async () => [];
db.obtenerReporte = async () => REPORTE;

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

/**
 * Dibuja una pantalla con el cascarón completo y devuelve su HTML.
 *
 * Se prefiere el cascarón real (menú lateral, franja de título, barra de
 * accesos rápidos) porque es ahí donde vive la adaptación: el cajón, el botón
 * del menú y la barra inferior solo existen en él. Si `renderShell` fallara por
 * algún cambio en las vistas, se cae al modo anterior (solo el contenido, sin
 * cascarón) para que la herramienta siga sirviendo.
 */
async function capturarPantalla(vista, rol) {
  rolActual = rol;
  try {
    await ui.renderShell({ id: perfilActual().usuario_id, email: perfilActual().email });
    await ui.switchView(vista);
    return { html: document.body.innerHTML, cascaron: true };
  } catch (err) {
    console.warn(`  · ${vista} (${rol}) sin cascarón: ${err.message}`);
    ui.currentUserRole = rol;
    ui.currentView = vista;
    const renderizadores = {
      catalog: () => ui.renderCatalog(),
      bibliomovil: () => ui.renderBibliomovil(),
      profile: () => ui.renderProfile(),
      users: () => ui.renderUsers(),
      loans: () => ui.renderLoans(),
      dashboard: () => ui.renderDashboard(),
      reports: () => ui.renderReports(),
      admin: () => ui.renderAdmin(),
      scanner: () => ui.renderMostrador?.()
    };
    const dibujar = renderizadores[vista];
    if (!dibujar) throw err;
    cont.innerHTML = '';
    await dibujar();
    return { html: `<nav id="barra-inferior" class="barra-inferior"></nav><main id="views-container" class="view-canvas p-4 md:p-7">${cont.innerHTML}</main>`, cascaron: false };
  }
}

const bloques = [
  { vista: 'scanner', rol: 'librero', titulo: 'Mesón — préstamo y devolución', nota: 'La pantalla del día a día: escáner, búsqueda manual, devolución rápida. En el teléfono las dos columnas se apilan.' },
  { vista: 'loans', rol: 'librero', titulo: 'Préstamos activos', nota: 'Filtros por estado con conteo, botones de aviso y renovación, y las fechas de vencimiento por color.' },
  { vista: 'users', rol: 'librero', titulo: 'Lectores', nota: 'Tabla adaptable: hasta 768px cada fila se lee como ficha con el nombre de la columna al lado.' },
  { vista: 'catalog', rol: 'admin', titulo: 'Catálogo de la biblioteca (sede)', nota: 'Colección separada: solo ejemplares de la sede. El botón «Al Bibliomóvil» mueve un ejemplar a la otra colección (solo administradores).' },
  { vista: 'bibliomovil', rol: 'librero', titulo: 'Bibliomóvil — Modo Ruta', nota: 'Cabecera con resumen operativo, preparación sin conexión, mapa, plan de paradas e impresión de la hoja de ruta.' },
  { vista: 'catalog', rol: 'bibliomovil', titulo: 'Catálogo del Bibliomóvil (rol de ruta)', nota: 'El mismo catálogo, visto por el rol bibliomóvil: solo la colección de la ruta y sin alta de libros de sede.' },
  { vista: 'reports', rol: 'admin', titulo: 'Reportes', nota: 'Tarjetas de totales, rankings y paradas del período. Se imprime en PDF con el botón de hoja de ruta.' },
  { vista: 'admin', rol: 'admin', titulo: 'Administración — parámetros y salud del sistema', nota: 'Pestañas, tarjetas de aviso y la tabla de parámetros (nombre y valor), la única tabla que no se convierte en fichas.' },
  { vista: 'dashboard', rol: 'librero', titulo: 'Dashboard', nota: 'Resumen del día con accesos rápidos según el rol.' },
  { vista: 'profile', rol: 'librero', titulo: 'Mi perfil', nota: 'Datos editables, requisitos de contraseña en vivo, tamaño de letra y el interruptor del modo oscuro.' }
];

const capturas = [];
for (const bloque of bloques) {
  const { html, cascaron } = await capturarPantalla(bloque.vista, bloque.rol);
  capturas.push({ ...bloque, html, cascaron });
}

// El CSS compilado por Vite lleva hash en el nombre: se busca el más reciente.
const assets = fs.readdirSync(path.join(RAIZ, 'dist/assets'));
const hoja = assets.find(f => f.startsWith('styles-') && f.endsWith('.css'));
if (!hoja) {
  console.error('No encontré el CSS compilado. Ejecuta `npm run build` antes.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Página de revisión
// ---------------------------------------------------------------------------
// Cada pantalla queda en un <template>; las plantillas se copian dentro de un
// iframe del ancho elegido (ver el comentario de arriba: es la única manera de
// que las media queries respondan al ancho simulado).
const plantillas = capturas.map((c, i) => `
<template id="pantalla-${i}">${c.html}</template>`).join('');

const tarjetas = capturas.map((c, i) => `
<section class="preview-bloque">
  <div class="preview-encabezado">
    <h2>${c.titulo}</h2>
    <p>${c.nota}${c.cascaron ? '' : ' <strong>(sin cascarón: revisar aviso en la consola)</strong>'}</p>
  </div>
  <div class="preview-marco">
    <iframe id="marco-${i}" title="${c.titulo}" loading="lazy"></iframe>
  </div>
</section>`).join('');

const htmlFinal = `<!DOCTYPE html>
<html lang="es-CL">
<head>
<meta charset="utf-8" />
<!-- La página se sirve desde dist/preview/, pero el CSS y los recursos viven
     en la raíz de dist/: con <base> los enlaces relativos siguen resolviendo
     (también dentro de los iframes). -->
<base href="__BASE__" />
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
    padding: 12px 20px; background: #1B3B48; color: #fff;
  }
  .preview-barra h1 { font-family: Newsreader, serif; font-size: 18px; font-weight: 600; margin: 0; }
  .preview-barra p { font-size: 12px; color: #D6D0BE; margin: 2px 0 10px; }
  .preview-controles { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .preview-controles button {
    background: rgba(255,255,255,0.12); color: #fff; border: 1px solid rgba(255,255,255,0.25);
    border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .preview-controles button[aria-pressed="true"] { background: #7A431D; border-color: #7A431D; }
  .preview-controles .separador { width: 1px; height: 22px; background: rgba(255,255,255,0.25); margin: 0 4px; }
  body[data-ancho="360"] iframe { width: 360px; }
  body[data-ancho="390"] iframe { width: 390px; }
  body[data-ancho="768"] iframe { width: 768px; }
  body[data-ancho="1024"] iframe { width: 1024px; }
  body[data-ancho="completo"] iframe { width: 100%; }
  iframe { height: 720px; border: 1px solid #d6d3d1; border-radius: 14px; background: #fff; }
  .dark iframe { border-color: #44403c; background: #1c1917; }
  .preview-bloque { padding: 26px 20px 6px; }
  .preview-encabezado { max-width: 1100px; margin: 0 auto 12px; }
  .preview-encabezado h2 { font-family: Newsreader, serif; font-size: 21px; font-weight: 600; color: #1c1917; margin: 0 0 4px; }
  .dark .preview-encabezado h2 { color: #f5f5f4; }
  .preview-encabezado p { font-size: 13px; color: #57534e; margin: 0; }
  .dark .preview-encabezado p { color: #a8a29e; }
  .preview-marco { max-width: 1100px; margin: 0 auto 22px; display: flex; justify-content: center; }
</style>
</head>
<body data-ancho="completo">
<div class="preview-barra">
  <div>
    <h1>Vista previa de la interfaz — BiblioNexo</h1>
    <p>Datos de ejemplo, sin sesión real. Cada pantalla se dibuja en un marco del ancho elegido para que las reglas de pantalla angosta se activen de verdad.</p>
  </div>
  <div class="preview-controles">
    <span style="font-size:12px;font-weight:700">Ancho:</span>
    <button type="button" data-ancho="360">Teléfono 360</button>
    <button type="button" data-ancho="390">Teléfono 390</button>
    <button type="button" data-ancho="768">Tablet 768</button>
    <button type="button" data-ancho="1024">Tablet 1024</button>
    <button type="button" data-ancho="completo" aria-pressed="true">Ancho completo</button>
    <span class="separador"></span>
    <button type="button" id="boton-tema" aria-pressed="false">Modo oscuro</button>
    <button type="button" id="boton-menu" aria-pressed="false">Abrir el menú</button>
  </div>
</div>
${plantillas}
${tarjetas}
<script>
  const marcos = [...document.querySelectorAll('iframe')];
  const hoja = 'assets/${hoja}';

  function documentoDe(indice) {
    const plantilla = document.getElementById('pantalla-' + indice).innerHTML;
    return '<!DOCTYPE html><html lang="es-CL"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link rel="stylesheet" href="vendor/css/fonts.css">'
      + '<link rel="stylesheet" href="vendor/css/fontawesome.min.css">'
      + '<link rel="stylesheet" href="' + hoja + '">'
      + '</head><body class="bg-patrimonio-base font-sans text-stone-800">' + plantilla + '</body></html>';
  }

  marcos.forEach((marco, i) => {
    marco.srcdoc = documentoDe(i);
    marco.addEventListener('load', () => aplicarEstado(marco));
  });

  let oscuro = false;
  let menuAbierto = false;

  function aplicarEstado(marco) {
    const doc = marco.contentDocument;
    if (!doc) return;
    doc.documentElement.classList.toggle('dark', oscuro);
    const sidebar = doc.getElementById('sidebar');
    const overlay = doc.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.toggle('active', menuAbierto);
    if (overlay) overlay.classList.toggle('hidden', !menuAbierto);
    if (doc.body) doc.body.classList.toggle('menu-abierto', menuAbierto);
  }

  document.getElementById('boton-tema').addEventListener('click', (e) => {
    oscuro = !oscuro;
    document.documentElement.classList.toggle('dark', oscuro);
    e.currentTarget.setAttribute('aria-pressed', String(oscuro));
    e.currentTarget.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
    marcos.forEach(aplicarEstado);
  });

  document.getElementById('boton-menu').addEventListener('click', (e) => {
    menuAbierto = !menuAbierto;
    e.currentTarget.setAttribute('aria-pressed', String(menuAbierto));
    document.body.dataset.ancho = document.body.dataset.ancho === 'completo' && menuAbierto ? '390' : document.body.dataset.ancho;
    marcos.forEach(aplicarEstado);
  });

  document.querySelectorAll('[data-ancho]').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.body.dataset.ancho = boton.dataset.ancho;
      document.querySelectorAll('[data-ancho]').forEach(b => b.setAttribute('aria-pressed', String(b === boton)));
    });
  });
</script>
</body>
</html>`;

const destino = path.join(RAIZ, 'dist', 'preview', 'index.html');
fs.mkdirSync(path.dirname(destino), { recursive: true });
// La copia dentro de dist/preview/ necesita subir un nivel para encontrar los
// recursos; la que queda en la raíz de dist/, no.
fs.writeFileSync(destino, htmlFinal.replace('__BASE__', '../'), 'utf8');
fs.writeFileSync(path.join(RAIZ, 'dist', 'vista-previa-interfaz.html'), htmlFinal.replace('__BASE__', './'), 'utf8');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Vista previa generada: ${path.relative(RAIZ, destino)} (${capturas.length} pantallas)`);
console.log('Ábrela con un servidor estático sobre dist/ (por ejemplo: npx serve dist) y entra a /preview/.');

// El cascarón real deja temporizadores andando (el control de inactividad, la
// vigilancia de portadas, la sincronización en segundo plano). Con eso, el
// proceso se quedaría esperando para siempre aunque el trabajo ya terminó: se
// cierra a mano, que es lo mismo que hace el navegador al cerrar la pestaña.
process.exit(0);
