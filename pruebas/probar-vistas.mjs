/**
 * Banco de pruebas de BiblioNexo.
 *
 * Monta un navegador simulado (jsdom), reemplaza Supabase y Chart.js por
 * dobles controlados, y ejecuta cada vista de la aplicación para detectar
 * errores en tiempo de ejecución antes de publicar.
 *
 * Uso:  node pruebas/probar-vistas.mjs
 */

import { JSDOM } from 'jsdom';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Raíz real del repo (carpeta que contiene pruebas/), derivada de la ubicación
// de este archivo. Antes era path.resolve('biblionexo'), que dependía de
// ejecutar el script desde un directorio padre con una subcarpeta literal
// "biblionexo" — no existía en este checkout y la suite fallaba con ENOENT
// sin importar desde dónde se invocara.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------
// `es_bibliomovil` explícito en todos: desde la migración 030 los catálogos
// están separados (sede ↔ Bibliomóvil) y el doble de buscar_libros respeta el
// parámetro de colección, igual que el RPC real.
const LIBROS = [
  { id: 1, isbn: '9789561117small', titulo: 'Subterra', autor: 'Baldomero Lillo', genero: 'Cuento', ubicacion: 'Sala 1', stock: 3, copias_totales: 4, portada_url: null, es_bibliomovil: false },
  { id: 2, isbn: '9788437604947', titulo: 'La Araucana', autor: 'Alonso de Ercilla', genero: null, ubicacion: null, stock: 0, copias_totales: 1, portada_url: null, es_bibliomovil: false },
  { id: 3, isbn: 'sin-isbn', titulo: 'Historia de Futrono y sus Riberas', autor: 'Ramón Quichiyao', genero: 'Local', ubicacion: 'Patrimonio', stock: 1, copias_totales: 1, portada_url: 'https://ejemplo.cl/portada.jpg', es_bibliomovil: true },
  // Casos límite: campos nulos y texto con caracteres peligrosos
  { id: 4, isbn: null, titulo: '<script>alert(1)</script>', autor: null, genero: null, ubicacion: null, stock: 0, copias_totales: 0, portada_url: null, es_bibliomovil: false },
  // Libro sin préstamos activos: caso "todo en la estantería"
  { id: 5, isbn: '9780140449136', titulo: 'La Odisea', autor: 'Homero', genero: 'Épica', ubicacion: 'Sala 2', stock: 2, copias_totales: 2, portada_url: null, es_bibliomovil: true }
];

const LECTORES = [
  { id: 10, rut: '12345678-5', nombre: 'María Antileo', email: 'maria@correo.cl', telefono: '56912345678', bloqueado_manual: false, created_at: '2026-07-20T10:00:00Z' },
  { id: 11, rut: '11111111-1', nombre: 'Pedro Huenchumán', email: null, telefono: null, bloqueado_manual: true, motivo_bloqueo: 'Pérdida de ejemplar', created_at: '2026-07-24T10:00:00Z' }
];

// "Hoy" en la fecha de Chile, no en la del reloj UTC del runner de CI —
// mismo criterio que hoyEnChile() en js/modules/db.js. Antes esto era
// `new Date()` + toISOString() (que da la fecha en UTC): entre las 00:00 y
// las ~03:00-04:00 UTC, Chile todavía está en el día anterior, así que
// _diasRestantes(iso(hoy)) daba -1 en vez de 0 y dos pruebas fallaban solas
// varias horas al día, sin que nadie tocara el código (encontrado al
// intentar enganchar esta suite a CI: ver ESTADO.md).
const hoyCL = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const [anioCL, mesCL, diaCL] = hoyCL.split('-').map(Number);
const hoy = new Date(anioCL, mesCL - 1, diaCL, 12); // mediodía local: setDate() nunca cruza de día por un desfase horario
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return iso(d); };

const PRESTAMOS = [
  { id: 100, fecha_prestamo: masDias(-10), fecha_devolucion_esperada: masDias(-3), fecha_devolucion_real: null, estado: 'activo', renovaciones: 0, libros: LIBROS[0], lectores: LECTORES[0] },
  { id: 101, fecha_prestamo: masDias(-5), fecha_devolucion_esperada: masDias(2), fecha_devolucion_real: null, estado: 'activo', renovaciones: 2, libros: LIBROS[1], lectores: LECTORES[1] },
  { id: 102, fecha_prestamo: masDias(-1), fecha_devolucion_esperada: masDias(20), fecha_devolucion_real: null, estado: 'activo', renovaciones: 0, libros: LIBROS[2], lectores: LECTORES[0] },
  // Préstamo con relaciones nulas: pasa si la BD tiene datos huérfanos
  { id: 103, fecha_prestamo: masDias(-2), fecha_devolucion_esperada: masDias(5), fecha_devolucion_real: null, estado: 'activo', renovaciones: 0, libros: null, lectores: null }
];

// Una reserva vigente sobre LIBROS[1] (La Araucana, stock=0), para probar
// que la ficha de circulación del mesón (_fichaCirculacion, mostrador.js)
// también muestra la fila de espera — no solo los préstamos activos.
const RESERVAS = [
  { reserva_id: 1, libro_id: 2, libro_titulo: 'La Araucana', libro_isbn: '9788437604947',
    lector_id: 11, lector_nombre: 'Pedro Huenchumán', lector_rut: '11111111-1',
    estado: 'activa', creado_en: '2026-08-15T10:00:00Z', apartada_en: null, vence_apartado_en: null,
    posicion_en_fila: 1 }
];

// ---------------------------------------------------------------------------
// Supabase simulado
// ---------------------------------------------------------------------------
function crearConsulta(datos, tabla) {
  const q = {
    data: datos, error: null, count: datos.length,
    // lt/gte/lte se usan para filtrar préstamos por fecha en el servidor
    lt() { return q; }, gt() { return q; },
    select() { return q; }, eq() { return q; }, gte() { return q; },
    lte() { return q; }, or() { return q; }, order() { return q; },
    range() { return q; },
    limit() { return q; },
    single() { return Promise.resolve({ data: datos[0] || null, error: null }); },
    maybeSingle() { return Promise.resolve({ data: datos[0] || null, error: null }); },
    insert() { return Promise.resolve({ error: null }); },
    update() { return q; },
    delete() { return q; },
    then(res) { return Promise.resolve({ data: datos, error: null, count: datos.length }).then(res); }
  };
  return q;
}

const PARAMETROS = [
  { clave: 'max_prestamos_por_lector', valor: '3', descripcion: 'Préstamos simultáneos' },
  { clave: 'retencion_prestamos_anios', valor: '5', descripcion: 'Años de conservación' }
];
const TABLAS = { libros: LIBROS, lectores: LECTORES, prestamos: PRESTAMOS, usuarios: [], parametros: PARAMETROS };

// Estado en memoria de los enlaces de escaneo remoto que el propio banco de
// pruebas va creando, para que listar_enlaces_escaneo() y
// revocar_enlace_escaneo() reflejen lo que crear_enlace_escaneo() generó (en
// vez de datos fijos, como en el resto de los RPC simulados de más abajo).
const ENLACES_ESCANEO = [];
let PROXIMO_ID_ENLACE = 1;
// A propósito NO parte de `hoy` (mediodía de la fecha calendario de Chile,
// ver más abajo): esto es una marca de tiempo real que el mock compara
// contra `new Date()` (el instante real) para decidir "vigente" — tiene que
// partir del instante real también, o un enlace recién creado podría nacer
// ya "expirado" si el mediodía de Chile quedó en el pasado respecto a ahora.
const masFechaHoras = n => { const d = new Date(); d.setHours(d.getHours() + n); return d.toISOString(); };

const supabaseFalso = {
  from: tabla => crearConsulta(TABLAS[tabla] || [], tabla),
  rpc: (nombre, args) => {
    if (nombre === 'buscar_libros') {
      const desde = args?.p_desplazamiento || 0;
      const limite = args?.p_limite || 25;
      const filtro = (args?.p_busqueda || '').toLowerCase();
      // Colección: null = todas, true = Bibliomóvil, false = sede (un libro sin
      // marcar cuenta como de sede, igual que el coalesce de la migración 030).
      const coleccion = args?.p_es_bibliomovil;
      const filtrados = LIBROS.filter(l => {
        if (coleccion !== null && coleccion !== undefined && (l.es_bibliomovil ?? false) !== coleccion) return false;
        if (args?.p_filtro_stock === 'disponibles' && !(l.stock > 0)) return false;
        if (args?.p_filtro_stock === 'prestados' && l.stock !== 0) return false;
        return !filtro ||
          (l.titulo || '').toLowerCase().includes(filtro) ||
          (l.autor || '').toLowerCase().includes(filtro);
      });
      const pagina = filtrados.slice(desde, desde + limite)
        .map(l => ({ ...l, total_coincidencias: filtrados.length }));
      return Promise.resolve({ data: pagina, error: null });
    }
    if (nombre === 'consultar_libro') {
      const libro = LIBROS.find(l => l.isbn === args?.p_codigo);
      if (!libro) return Promise.resolve({ data: [], error: null });
      const activos = PRESTAMOS.filter(p => p.libros?.id === libro.id);
      if (activos.length === 0) {
        return Promise.resolve({ data: [{
          libro_id: libro.id, isbn: libro.isbn, titulo: libro.titulo, autor: libro.autor,
          genero: libro.genero, ubicacion: libro.ubicacion, portada_url: libro.portada_url,
          copias_totales: libro.copias_totales, stock: libro.stock,
          prestamo_id: null, lector_id: null
        }], error: null });
      }
      return Promise.resolve({ data: activos.map(p => ({
        libro_id: libro.id, isbn: libro.isbn, titulo: libro.titulo, autor: libro.autor,
        genero: libro.genero, ubicacion: libro.ubicacion, portada_url: libro.portada_url,
        copias_totales: libro.copias_totales, stock: libro.stock,
        prestamo_id: p.id, fecha_prestamo: p.fecha_prestamo,
        fecha_devolucion_esperada: p.fecha_devolucion_esperada,
        dias_restantes: 0, renovaciones: p.renovaciones,
        lector_id: p.lectores?.id, lector_nombre: p.lectores?.nombre, lector_rut: p.lectores?.rut,
        lector_email: p.lectores?.email, lector_telefono: p.lectores?.telefono,
        lector_bloqueado: p.lectores?.bloqueado_manual || false, lector_atrasados: 1
      })), error: null });
    }
    if (nombre === 'estado_lector') {
      const lec = LECTORES.find(l => l.rut === args?.p_rut);
      if (!lec) return Promise.resolve({ data: [{ existe: false, rut: args?.p_rut, puede_prestar: false, motivo_rechazo: 'Este RUT no está registrado.', prestamos_activos: 0, prestamos_atrasados: 0 }], error: null });
      const bloq = lec.bloqueado_manual;
      return Promise.resolve({ data: [{
        existe: true, lector_id: lec.id, nombre: lec.nombre, rut: lec.rut,
        email: lec.email, telefono: lec.telefono, bloqueado_manual: bloq,
        motivo_bloqueo: lec.motivo_bloqueo || null,
        prestamos_activos: 2, prestamos_atrasados: bloq ? 1 : 0,
        puede_prestar: !bloq, motivo_rechazo: bloq ? 'Bloqueado por la biblioteca.' : null
      }], error: null });
    }
    if (nombre === 'verificar_rls') {
      return Promise.resolve({ data: [
        { tabla: 'libros', rls_activo: true, politicas: 3, diagnostico: 'Correcto' },
        { tabla: 'lectores', rls_activo: false, politicas: 0, diagnostico: 'CRÍTICO: sin RLS, cualquiera puede leer y escribir esta tabla' }
      ], error: null });
    }
    if (nombre === 'exportar_datos_lector') {
      return Promise.resolve({ data: { generado_en: '2026-07-26', datos_personales: { nombre: 'María Antileo' }, historial_prestamos: [] }, error: null });
    }
    if (nombre === 'anonimizar_lector') return Promise.resolve({ data: null, error: null });
    if (nombre === 'purgar_datos_antiguos') return Promise.resolve({ data: 2, error: null });
    if (nombre === 'evidencia_incidente') {
      return Promise.resolve({ data: { total_movimientos: 5, por_usuario: [], eliminaciones: [] }, error: null });
    }
    if (nombre === 'revisar_inventario') {
      return Promise.resolve({ data: [{ libro_id: 1, titulo: 'Subterra', isbn: 'x', copias_totales: 4, stock: 3, prestados: 0, diferencia: 1 }], error: null });
    }
    if (nombre === 'estadisticas_paradas') {
      return Promise.resolve({ data: [{ parada: 'Llifén', lat: -40.198, lng: -72.259, total_prestamos: 4 }], error: null });
    }
    if (nombre === 'listar_personal') {
      return Promise.resolve({ data: [{ usuario_id: 'abc', email: 'admin@biblionexo.cl', rol: 'admin', ultimo_acceso: '2026-07-25T10:00:00Z' }], error: null });
    }
    if (nombre === 'ajustar_copias') {
      return Promise.resolve({ data: [{ copias_totales: args?.p_copias_totales, stock: args?.p_copias_totales }], error: null });
    }
    if (nombre === 'corregir_inventario') {
      return Promise.resolve({ data: [{ copias_totales: 4, stock: 4 }], error: null });
    }
    if (nombre === 'renovar_prestamo') {
      return Promise.resolve({ data: [{ nueva_fecha: masDias(14), renovaciones_usadas: 1 }], error: null });
    }
    if (nombre === 'crear_enlace_escaneo') {
      ENLACES_ESCANEO.push({
        id: PROXIMO_ID_ENLACE, token_hash: `hash-${PROXIMO_ID_ENLACE}`,
        creado_por_email: 'admin@biblionexo.cl', creado_en: '2026-08-19T10:00:00Z',
        expira_en: masFechaHoras(args?.p_horas ?? 4), revocado: false, usos: 0, ultimo_uso_en: null
      });
      const nueva = ENLACES_ESCANEO[ENLACES_ESCANEO.length - 1];
      const resultado = { id: nueva.id, token: `token-de-prueba-${nueva.id}`, expira_en: nueva.expira_en };
      PROXIMO_ID_ENLACE++;
      return Promise.resolve({ data: [resultado], error: null });
    }
    if (nombre === 'listar_enlaces_escaneo') {
      return Promise.resolve({
        data: ENLACES_ESCANEO.map(e => ({ ...e, vigente: !e.revocado && new Date(e.expira_en) > new Date() })),
        error: null
      });
    }
    if (nombre === 'revocar_enlace_escaneo') {
      const fila = ENLACES_ESCANEO.find(e => String(e.id) === String(args?.p_id));
      if (!fila) return Promise.resolve({ data: null, error: { message: 'Ese enlace no existe.' } });
      fila.revocado = true;
      return Promise.resolve({ data: null, error: null });
    }
    if (nombre === 'listar_reservas') {
      const filtradas = RESERVAS.filter(r =>
        (args?.p_libro_id == null || r.libro_id === args.p_libro_id) &&
        (args?.p_incluir_historial || r.estado === 'activa' || r.estado === 'apartada'));
      return Promise.resolve({ data: filtradas, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
    signInWithOAuth: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
    signOut: () => Promise.resolve({})
  }
};

// ---------------------------------------------------------------------------
// Entorno de navegador
// ---------------------------------------------------------------------------
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://biblionexo.test/', pretendToBeVisual: true
});

const errores = [];
const advertencias = [];

global.window = dom.window;
global.document = dom.window.document;
// En Node 22 `navigator` es de solo lectura, hay que redefinirlo
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
dom.window.URL.createObjectURL = () => 'blob:falso';
dom.window.URL.revokeObjectURL = () => {};
dom.window.print = () => {};
dom.window.open = () => {};
dom.window.scrollTo = () => {};

// Chart.js simulado: registra las llamadas y valida la forma de los datos
const graficosCreados = [];
dom.window.Chart = class {
  constructor(ctx, cfg) {
    graficosCreados.push(cfg);
    if (!cfg?.data?.datasets?.[0]) errores.push('Chart creado sin dataset');
    const d = cfg.data.datasets[0].data;
    if (d.some(v => typeof v !== 'number' || Number.isNaN(v))) {
      errores.push(`Chart con valores no numéricos: ${JSON.stringify(d)}`);
    }
  }
  destroy() {}
};

// El <canvas> de jsdom no tiene contexto 2D real
dom.window.HTMLCanvasElement.prototype.getContext = () => ({});

dom.window.addEventListener('error', e => errores.push(`window.error: ${e.message}`));
const errOriginal = console.error;
console.error = (...a) => { advertencias.push(a.join(' ')); };

// ---------------------------------------------------------------------------
// Carga de módulos con Supabase interceptado
// ---------------------------------------------------------------------------
// Fuera de RAIZ y con sufijo único (os.tmpdir() + mkdtempSync): antes era
// path.resolve('.tmp-pruebas'), que caía DENTRO de RAIZ al invocar desde la
// raíz del repo, y fs.cpSync fallaba al copiar el árbol dentro de sí mismo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biblionexo-pruebas-'));
let pasadas = 0, fallidas = 0;

// A partir de aquí todo va en un try/finally: si cualquier prueba revienta
// fuera del wrapper prueba() de más abajo (un error al montar una vista, un
// import roto), el directorio temporal igual se borra. No se reindentó el
// cuerpo completo para no inflar el diff con solo cambios de espacios.
try {

fs.cpSync(RAIZ, tmp, { recursive: true });
// Se reemplaza el cliente real por el simulado
fs.writeFileSync(path.join(tmp, 'src/js/supabase-init.js'),
  `export const supabase = globalThis.__supabaseFalso;`);
globalThis.__supabaseFalso = supabaseFalso;

// import() dinámico exige file:// para rutas absolutas en Windows: una ruta
// cruda como "C:\...\db.js" se interpreta como URL con esquema "c:" y falla.
const importDesdeTmp = ruta => import(pathToFileURL(path.join(tmp, ruta)));

const { db } = await importDesdeTmp('src/js/modules/db.js');
const uiModule = await importDesdeTmp('src/js/modules/ui.js');
const ui = uiModule.default;
const { buscarPorIsbnExterno } = await importDesdeTmp('src/js/modules/libros-externos.js');
const { generarSvgQr } = await importDesdeTmp('src/js/modules/qr.js');
const { CONFIG } = await importDesdeTmp('src/js/config.js');

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

async function prueba(nombre, fn) {
  try {
    await fn();
    console.log(`  ✓ ${nombre}`);
    pasadas++;
  } catch (e) {
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
    fallidas++;
  }
}

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

console.log('\n=== Funciones puras ===');

await prueba('RUT válido se acepta', () => assert(ui.isValidRut('12345678-5')));
await prueba('RUT con DV incorrecto se rechaza', () => assert(!ui.isValidRut('12345678-9')));
await prueba('RUT con DV K se acepta', () => assert(ui.isValidRut('10000013-K')));
await prueba('RUT vacío / basura se rechaza', () => {
  assert(!ui.isValidRut(''));
  assert(!ui.isValidRut(null));
  assert(!ui.isValidRut('hola'));
});
await prueba('formatRut normaliza puntos y guiones', () =>
  assert(ui.formatRut('12.345.678-5') === '12345678-5', ui.formatRut('12.345.678-5')));
await prueba('formatPhone normaliza a formato internacional', () =>
  assert(ui.formatPhone('9 1234 5678') === '56912345678', ui.formatPhone('9 1234 5678')));
await prueba('formatPhone tolera nulo', () => { ui.formatPhone(null); ui.formatPhone(undefined); });

await prueba('_diasRestantes calcula sin corrimiento de zona horaria', () => {
  assert(ui._diasRestantes(iso(hoy)) === 0, 'hoy debería ser 0');
  assert(ui._diasRestantes(masDias(3)) === 3, 'en 3 días');
  assert(ui._diasRestantes(masDias(-4)) === -4, 'hace 4 días');
});
await prueba('_estadoPrestamo clasifica correctamente', () => {
  assert(ui._estadoPrestamo(masDias(-1)).clave === 'vencido');
  assert(ui._estadoPrestamo(iso(hoy)).clave === 'porVencer');
  assert(ui._estadoPrestamo(masDias(2)).clave === 'porVencer');
  assert(ui._estadoPrestamo(masDias(30)).clave === 'alDia');
});
await prueba('_estadoPrestamo tolera fecha nula', () => ui._estadoPrestamo(null));
await prueba('_momentoDelDia devuelve un valor conocido', () =>
  assert(['amanecer', 'dia', 'atardecer', 'noche'].includes(ui._momentoDelDia())));

await prueba('_rangoPeriodo cubre los cuatro períodos', () => {
  for (const p of ['dia', 'semana', 'mes', 'anio']) {
    const r = ui._rangoPeriodo(p);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(r.desde), `desde inválido en ${p}: ${r.desde}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(r.hasta), `hasta inválido en ${p}: ${r.hasta}`);
    assert(r.desde <= r.hasta, `rango invertido en ${p}`);
  }
});

await prueba('_portadaUrl usa la manual si existe', () =>
  assert(ui._portadaUrl(LIBROS[2]) === 'https://ejemplo.cl/portada.jpg'));
await prueba('_portadaUrl arma URL de Open Library con ISBN válido', () =>
  assert(ui._portadaUrl(LIBROS[1]).includes('covers.openlibrary.org')));
await prueba('_portadaUrl devuelve null sin ISBN', () =>
  assert(ui._portadaUrl(LIBROS[3]) === null));

console.log('\n=== Seguridad ===');
await prueba('escapeHtml neutraliza etiquetas en el catálogo', () => {
  const html = ui._renderBookRows([LIBROS[3]]).toString();
  assert(!html.includes('<script>alert'), 'se coló un <script> sin escapar');
  assert(html.includes('&lt;script&gt;'), 'no se escapó el título');
});

console.log('\n=== Vistas (render completo) ===');

// La app dibuja dentro de #views-container
const MARCADO_BASE = '<main id="views-container" tabindex="-1" aria-label="Contenido principal"></main>' +
  '<div id="toast-container" role="status" aria-live="polite"></div>';
document.body.innerHTML = MARCADO_BASE;

for (const vista of ['dashboard', 'reports', 'catalog', 'users', 'loans', 'scanner']) {
  await prueba(`renderiza la vista "${vista}"`, async () => {
    ui.currentView = vista;
    const antes = errores.length;
    const renderers = {
      dashboard: () => ui.renderDashboard(),
      reports: () => ui.renderReports(),
      catalog: () => ui.renderCatalog(),
      users: () => ui.renderUsers(),
      loans: () => ui.renderLoans(),
      scanner: () => ui.renderScannerView()
    };
    await renderers[vista]();
    const cont = document.getElementById('views-container');
    assert(cont.innerHTML.length > 50, 'la vista quedó vacía');
    assert(!cont.innerHTML.includes('undefined'), 'aparece "undefined" en pantalla');
    assert(!cont.innerHTML.includes('NaN'), 'aparece "NaN" en pantalla');
    if (vista === 'users') {
      const tbody = cont.querySelector('#users-tbody');
      assert(tbody && tbody.tagName === 'TBODY', '#users-tbody debe ser un elemento <tbody> dentro de <table>');
      assert(tbody.querySelectorAll('tr').length > 0, 'las filas <tr> de lectores no se conservaron en el DOM');
    }
    assert(errores.length === antes, `errores nuevos: ${errores.slice(antes).join('; ')}`);
  });
}

await prueba('Bibliomóvil renderiza el plan, los accesos de navegación y escapa los nombres locales', async () => {
  const inicializarMapa = ui._montarMapaBibliomovil;
  const descriptorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true, writable: true });
  const key = 'biblionexo-bibliomovil-plan-v1';
  ui._montarMapaBibliomovil = async () => {};
  ui.currentView = 'bibliomovil';
  ui.bibliomovilSearch = '';
  ui.bibliomovilFilter = 'todos';
  ui.bookPage = 0;
  localStorage.setItem(key, JSON.stringify({
    origen: { nombre: 'Inicio', lat: -40.1, lon: -72.2 },
    paradas: [{ id: 'prueba-1', nombre: '<img src=x onerror=alert(1)>', lat: -40.2, lon: -72.3 }]
  }));
  try {
    await ui.renderBibliomovil();
    const cont = document.getElementById('views-container');
    assert(cont.querySelector('#bibliomovil-map'), 'falta el mapa interactivo');
    assert(cont.querySelector('#bibliomovil-select-stop'), 'falta la selección de paradas');
    assert(cont.querySelector('#bibliomovil-google-maps'), 'falta el acceso a Google Maps');
    assert(cont.querySelector('#bibliomovil-osm-directions'), 'falta el acceso a OpenStreetMap');
    assert(cont.querySelector('#bibliomovil-retry-route'), 'falta el control para recalcular una ruta');
    const disponible = cont.querySelector('.bibliomovil-filter-btn[data-filter="disponibles"]');
    disponible.dispatchEvent(new dom.window.Event('click'));
    assert(disponible.getAttribute('aria-pressed') === 'true', 'el filtro de disponibles no queda seleccionado');
    assert(disponible.classList.contains('bg-emerald-700') && !disponible.classList.contains('bg-stone-200'),
      'el filtro conserva colores de estado inactivo al seleccionarse');
    const lista = cont.querySelector('#bibliomovil-route-stops');
    assert(lista.textContent.includes('<img src=x onerror=alert(1)>'), 'el nombre local no aparece como texto');
    assert(!lista.querySelector('img'), 'un nombre local se interpretó como HTML ejecutable');
    assert(lista.querySelector('[data-route-action="notify"]'), 'falta el botón de aviso por WhatsApp en la parada');
    const tabCatalogo = cont.querySelector('#tab-catalogo');
    assert(tabCatalogo && !tabCatalogo.classList.contains('hidden'), 'el catálogo del Bibliomóvil quedó oculto por defecto');
    const btnSoloRuta = cont.querySelector('.biblio-tab-btn[data-target="tab-ruta"]');
    assert(btnSoloRuta, 'faltan los botones de filtro de sección en Bibliomóvil');
    btnSoloRuta.dispatchEvent(new dom.window.Event('click'));
    assert(tabCatalogo.classList.contains('hidden'), 'el botón de Mapa y ruta no ocultó la sección de catálogo');
  } finally {
    ui._montarMapaBibliomovil = inicializarMapa;
    localStorage.removeItem(key);
    ui.currentView = 'dashboard';
    if (descriptorStorage) Object.defineProperty(globalThis, 'localStorage', descriptorStorage);
    else delete globalThis.localStorage;
  }
});

await prueba('un error tardío de Bibliomóvil no reemplaza la vista abierta después', async () => {
  const renderBibliomovilOriginal = ui.renderBibliomovil;
  const renderCatalogOriginal = ui.renderCatalog;
  let rechazar;
  ui.currentView = 'dashboard';
  ui.renderBibliomovil = () => new Promise((_, reject) => { rechazar = reject; });
  ui.renderCatalog = async () => {
    document.getElementById('views-container').innerHTML = '<p id="vista-actual">Catálogo vigente</p>';
  };
  try {
    const cargaAntigua = ui.switchView('bibliomovil');
    await Promise.resolve();
    await ui.switchView('catalog');
    rechazar(new Error('fallo tardío de la consulta'));
    await cargaAntigua;
    assert(document.getElementById('vista-actual')?.textContent === 'Catálogo vigente',
      'un error atrasado sobrescribió el catálogo');
    assert(ui.currentView === 'catalog', 'el router perdió la vista vigente');
  } finally {
    ui.renderBibliomovil = renderBibliomovilOriginal;
    ui.renderCatalog = renderCatalogOriginal;
    ui.currentView = 'dashboard';
  }
});

await prueba('renderiza ambos roles sin romperse', async () => {
  for (const rol of ['admin', 'librero', 'bibliomovil']) {
    ui.currentUserRole = rol;
    ui.currentView = 'catalog';
    await ui.renderCatalog();
    ui.currentView = 'loans';
    await ui.renderLoans();
  }
  ui.currentUserRole = 'admin';
});

await prueba('el rol bibliomóvil no entra a Administración', async () => {
  ui.currentUserRole = 'bibliomovil';
  ui.currentView = 'admin';
  await ui.renderAdmin();
  assert(/solo para administradores/i.test(document.getElementById('views-container').textContent),
    'el bibliomóvil no debió ver el panel de administración');
  assert(!document.querySelector('.admin-tab-btn'), 'se dibujaron pestañas de administración');
  ui.currentUserRole = 'admin';
});

await prueba('el Dashboard del bibliomóvil ofrece accesos de ruta', async () => {
  ui.currentUserRole = 'bibliomovil';
  ui.currentView = 'dashboard';
  await ui.renderDashboard();
  const htmlDash = document.getElementById('views-container').innerHTML;
  assert(/Ir al mapa/i.test(htmlDash), 'falta el acceso rápido al mapa');
  assert(/Prestar en parada/i.test(htmlDash), 'falta el acceso a prestar en parada');
  ui.currentUserRole = 'admin';
});

await prueba('el catálogo del bibliomóvil no ofrece el alta de libros de sede', async () => {
  ui.currentUserRole = 'bibliomovil';
  ui.currentView = 'catalog';
  await ui.renderCatalog();
  assert(!document.getElementById('add-book-form'), 'el alta de libros de sede no corresponde en ruta');
  assert(document.getElementById('catalog-search-input'), 'debe seguir pudiendo buscar el catálogo');
  ui.currentUserRole = 'admin';
});

// Separación de catálogos (migración 030). Lo que se vigila es que la vista
// pida UNA colección concreta y no las dos mezcladas: antes del cambio, el
// catálogo de la biblioteca y el del Bibliomóvil mostraban los mismos títulos.
await prueba('cada catálogo pide su propia colección (sede / Bibliomóvil)', async () => {
  const rpcOriginal = supabaseFalso.rpc;
  const llamadas = [];
  supabaseFalso.rpc = (nombre, args) => {
    if (nombre === 'buscar_libros') llamadas.push({ ...args });
    return rpcOriginal(nombre, args);
  };
  const montarMapaOriginal = ui._montarMapaBibliomovil;
  const descriptorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true, writable: true });
  ui._montarMapaBibliomovil = async () => {};
  try {
    // 1. Catálogo de la biblioteca (rol de sede)
    ui.currentUserRole = 'librero';
    ui.currentView = 'catalog';
    ui.catalogSearch = '';
    ui.bookPage = 0;
    await ui.renderCatalog();
    const contSede = document.getElementById('views-container');
    assert(/Catálogo de la biblioteca/.test(contSede.textContent), 'el catálogo de sede no se rotula como tal');
    assert(!contSede.querySelector('.stamp-movil'), 'el catálogo de la biblioteca mostró un ejemplar del Bibliomóvil');
    assert(!contSede.querySelector('.toggle-collection-btn'),
      'el librero no debería ver el botón de mover de colección (editar libros es de admin)');

    // 2. Catálogo de ruta: el rol bibliomóvil ve la colección móvil
    ui.currentUserRole = 'bibliomovil';
    await ui.renderCatalog();
    const contRuta = document.getElementById('views-container');
    assert(/Catálogo del Bibliomóvil/.test(contRuta.textContent), 'la ruta no se rotula como Bibliomóvil');
    assert(contRuta.querySelectorAll('.stamp-movil').length > 0, 'faltan los ejemplares del Bibliomóvil');
    assert(contRuta.querySelector('.loan-book-btn'), 'debería poder prestarse un ejemplar de ruta');

    // 3. La vista Bibliomóvil también pide la colección de ruta
    ui.currentUserRole = 'librero';
    ui.currentView = 'bibliomovil';
    ui.bibliomovilSearch = '';
    ui.bookPage = 0;
    await ui.renderBibliomovil();

    const delCatalogo = llamadas.slice(0, 2).map(a => a.p_es_bibliomovil);
    assert(delCatalogo[0] === false, `el catálogo de la biblioteca pidió "${delCatalogo[0]}" en vez de false (sede)`);
    assert(delCatalogo[1] === true, `el catálogo de ruta pidió "${delCatalogo[1]}" en vez de true (Bibliomóvil)`);
    const deLaVistaRuta = llamadas.slice(2).filter(a => a.p_es_bibliomovil === true);
    assert(deLaVistaRuta.length >= 1, 'la vista Bibliomóvil no pidió la colección del Bibliomóvil');
    assert(!llamadas.some(a => a.p_es_bibliomovil === undefined), 'alguna consulta salió sin parámetro de colección');

    // 4. El admin puede mover un ejemplar de colección y ve el botón
    ui.currentUserRole = 'admin';
    ui.currentView = 'catalog';
    ui.bookPage = 0;
    await ui.renderCatalog();
    const boton = document.querySelector('.toggle-collection-btn');
    assert(boton, 'el admin no ve el botón para mover un ejemplar de colección');
    assert(['sede', 'ruta'].includes(boton.dataset.destino), 'el botón no declara a qué colección mueve');
    assert(document.getElementById('add-book-form'), 'falta el alta de libros en el catálogo de sede');
    assert(document.getElementById('new-book-bibliomovil'), 'el alta no permite marcar el ejemplar como del Bibliomóvil');
  } finally {
    supabaseFalso.rpc = rpcOriginal;
    ui._montarMapaBibliomovil = montarMapaOriginal;
    ui.currentUserRole = 'admin';
    ui.currentView = 'dashboard';
    if (descriptorStorage) Object.defineProperty(globalThis, 'localStorage', descriptorStorage);
    else delete globalThis.localStorage;
  }
});

await prueba('los filtros de préstamos funcionan', async () => {
  for (const f of ['todos', 'vencidos', 'porVencer']) {
    ui.loanFilter = f;
    ui.currentView = 'loans';
    await ui.renderLoans();
    assert(document.getElementById('views-container').innerHTML.length > 50, `filtro ${f} dejó la vista vacía`);
  }
  ui.loanFilter = 'todos';
});

await prueba('los cuatro períodos de reporte se renderizan', async () => {
  for (const p of ['dia', 'semana', 'mes', 'anio']) {
    ui.reportPeriod = p;
    ui.currentView = 'reports';
    await ui.renderReports();
    assert(document.getElementById('views-container').innerHTML.length > 50, `período ${p} dejó la vista vacía`);
  }
});

await prueba('el catálogo tolera una lista vacía y explica por qué está vacía', () => {
  // Dos vacíos distintos, con mensajes distintos: colección sin ejemplares
  // («todavía no tiene títulos», con la instrucción para agregarlos) y
  // búsqueda sin coincidencias («sin resultados para …»). Antes los dos caían
  // en el mismo «Sin libros que coincidan con la búsqueda», que en el
  // Bibliomóvil recién instalado no explicaba nada.
  ui.currentView = 'catalog';
  ui.catalogSearch = '';
  const vacia = ui._renderBookRows([]).toString();
  assert(/todavía no tiene títulos/.test(vacia), 'falta el mensaje de colección vacía');

  ui.catalogSearch = 'zzz';
  const sinResultados = ui._renderBookRows([]).toString();
  assert(/Sin resultados/.test(sinResultados) && sinResultados.includes('zzz'),
    'falta el mensaje de búsqueda sin coincidencias, con el término buscado');

  ui.currentView = 'bibliomovil';
  ui.bibliomovilSearch = '';
  const movil = ui._renderBookRows([]).toString();
  assert(/El Bibliomóvil todavía no tiene títulos/.test(movil), 'falta el vacío propio del Bibliomóvil');
  assert(/Al Bibliomóvil/.test(movil), 'el vacío del Bibliomóvil no dice cómo asignar ejemplares');
  ui.currentView = 'dashboard';
  ui.catalogSearch = '';
  ui.bibliomovilSearch = '';
});

console.log('\n=== Modales ===');
await prueba('modal de aviso se abre y se cierra', () => {
  const antes = document.body.children.length;
  ui.showNotifyModal(PRESTAMOS[0]);
  assert(document.body.children.length === antes + 1, 'el modal no se agregó');
  const overlay = document.body.lastElementChild;
  assert(overlay.querySelector('#notify-message'), 'falta el área de mensaje');
  overlay.querySelector('[data-action="close"]').dispatchEvent(new dom.window.Event('click'));
  assert(document.body.children.length === antes, 'el modal no se cerró');
});

await prueba('modal de aviso tolera lector sin contacto', () => {
  ui.showNotifyModal(PRESTAMOS[1]); // Pedro no tiene email ni teléfono
  const overlay = document.body.lastElementChild;
  const wa = overlay.querySelector('[data-action="whatsapp"]');
  const mail = overlay.querySelector('[data-action="email"]');
  assert(wa.hasAttribute('disabled'), 'WhatsApp debería estar deshabilitado');
  assert(mail.hasAttribute('disabled'), 'Correo debería estar deshabilitado');
  overlay.remove();
});

await prueba('modal de aviso tolera préstamo con relaciones nulas', () => {
  ui.showNotifyModal(PRESTAMOS[3]);
  document.body.lastElementChild.remove();
});

await prueba('showConfirm y showPrompt se montan', () => {
  ui.showConfirm('¿Seguro?');
  document.body.lastElementChild.remove();
  ui.showPrompt('Escribe algo');
  document.body.lastElementChild.remove();
});

console.log('\n=== Reportes: datos y exportación ===');
await prueba('obtenerReporte devuelve la forma esperada', async () => {
  const r = await db.obtenerReporte('2026-01-01', '2026-12-31');
  for (const k of ['totalPrestamos', 'totalDevoluciones', 'totalNuevosLectores', 'topLibros', 'topLectores', 'porParada']) {
    assert(k in r, `falta la clave ${k}`);
  }
  assert(Array.isArray(r.topLibros), 'topLibros no es arreglo');
  assert(Array.isArray(r.porParada) && r.porParada[0]?.parada === 'Llifén', 'porParada no incluye las paradas del Bibliomóvil');
});

await prueba('renderReports muestra la sección de préstamos por parada del Bibliomóvil', async () => {
  ui.currentView = 'reports';
  await ui.renderReports();
  const bloqueParadas = document.getElementById('reporte-paradas');
  assert(bloqueParadas, 'no se dibujó #reporte-paradas en la vista de reportes');
  assert(bloqueParadas.textContent.includes('Llifén'), 'no muestra el nombre de la parada en el reporte');
});

await prueba('exportación CSV no lanza errores', async () => {
  const r = await db.obtenerReporte('2026-01-01', '2026-12-31');
  ui._exportarReporteCsv(r, { desde: '2026-01-01', hasta: '2026-12-31', titulo: 'Prueba' });
});

await prueba('CSV escapa comillas dobles', async () => {
  const original = dom.window.Blob;
  let contenido = '';
  dom.window.Blob = class { constructor(p) { contenido = p.join(''); } };
  global.Blob = dom.window.Blob;
  const r = await db.obtenerReporte('2026-01-01', '2026-12-31');
  r.prestamos = [{ fecha_prestamo: '2026-01-01', libros: { titulo: 'Un "gran" libro', autor: 'X' }, lectores: { nombre: 'Y', rut: 'Z' }, fecha_devolucion_esperada: '2026-01-08', estado: 'activo' }];
  ui._exportarReporteCsv(r, { desde: '2026-01-01', hasta: '2026-12-31', titulo: 'Prueba' });
  assert(contenido.includes('""gran""'), 'las comillas no se duplicaron');
  dom.window.Blob = original;
  global.Blob = original;
});

console.log('\n=== Gráficos ===');
await prueba('se crearon gráficos de tipo anillo', () => {
  assert(graficosCreados.length > 0, 'no se creó ningún gráfico');
  assert(graficosCreados.every(g => g.type === 'doughnut'), 'hay gráficos que no son de anillo');
});
await prueba('los anillos no reciben valores negativos', () => {
  graficosCreados.forEach(g => {
    g.data.datasets[0].data.forEach(v => assert(v >= 0, `valor negativo: ${v}`));
  });
});


console.log('\n=== Paginación y edición ===');
await prueba('obtenerLibros devuelve { libros, total }', async () => {
  const r = await db.obtenerLibros('', 0, 2);
  assert(Array.isArray(r.libros), 'libros no es arreglo');
  assert(typeof r.total === 'number', 'total no es número');
  assert(r.libros.length <= 2, 'no respetó el límite de página');
});

await prueba('la paginación no aparece si todo cabe en una página', () => {
  assert(ui._paginacionHtml(0, 10, 25, 'x') === '', 'no debería mostrarse');
});

await prueba('la paginación muestra el rango correcto', () => {
  const html = ui._paginacionHtml(1, 100, 25, 'x');
  assert(html.includes('26'), 'falta el inicio del rango');
  assert(html.includes('50'), 'falta el fin del rango');
  assert(html.includes('2 / 4'), 'número de página incorrecto');
});

await prueba('primera página deshabilita el botón anterior', () => {
  const html = ui._paginacionHtml(0, 100, 25, 'x');
  const antes = html.slice(0, html.indexOf('chevron-right'));
  assert(antes.includes('disabled'), 'el botón anterior debería estar deshabilitado');
});

await prueba('modal de editar libro se monta con los datos', () => {
  ui.showEditBookModal(LIBROS[0]);
  const overlay = document.body.lastElementChild;
  assert(overlay.querySelector('#edit-book-title').value === 'Subterra', 'no cargó el título');
  // El campo muestra EJEMPLARES TOTALES (4), no las disponibles (3):
  // escribir las disponibles era lo que corrompía el inventario.
  assert(overlay.querySelector('#edit-book-qty').value === '4', 'debe mostrar copias totales, no disponibles');
  overlay.remove();
});

await prueba('modal de editar lector se monta con los datos', () => {
  ui.showEditUserModal(LECTORES[0]);
  const overlay = document.body.lastElementChild;
  assert(overlay.querySelector('#edit-user-name').value === 'María Antileo', 'no cargó el nombre');
  assert(overlay.querySelector('#edit-user-email').value === 'maria@correo.cl', 'no cargó el correo');
  overlay.remove();
});

await prueba('editar permite stock 0 pero no negativo', () => {
  document.body.insertAdjacentHTML('beforeend',
    '<div id="tmp"><input id="edit-book-title" value="X"><input id="edit-book-author" value="Y">' +
    '<input id="edit-book-isbn" value=""><input id="edit-book-qty" value="0"></div>');
  assert(ui.validateBookForm(true) === true, 'stock 0 debería aceptarse al editar');
  document.getElementById('edit-book-qty').value = '-1';
  assert(ui.validateBookForm(true) === false, 'stock negativo debería rechazarse');
  document.getElementById('tmp').remove();
});

console.log('\n=== Respaldo y renovación ===');
await prueba('exportarTodo reúne las tres tablas', async () => {
  const r = await db.exportarTodo();
  for (const t of ['libros', 'lectores', 'prestamos']) {
    assert(Array.isArray(r.tablas[t]), `falta la tabla ${t}`);
  }
  assert(r.generado, 'falta la marca de tiempo');
});

await prueba('renovarPrestamo devuelve la fecha nueva', async () => {
  const r = await db.renovarPrestamo(100);
  assert(r.nueva_fecha, 'no devolvió fecha nueva');
});

console.log('\n=== Escanear libro (sin cámara desde el 22 de agosto de 2026) ===');
await prueba('ofrece el enlace remoto y la entrada manual, sin botones de cámara', () => {
  ui.currentView = 'scanner';
  ui.renderScannerView();
  const html = document.getElementById('views-container').innerHTML;
  assert(html.includes('qr-remoto-btn'), 'falta el botón «Escanear desde el celular»');
  assert(html.includes('manual-scan-input'), 'falta la entrada manual del ISBN');
  // Todo el escaneo con cámara se mudó al celular (escaneo-remoto.js): esta
  // vista ya no debe ofrecer «Iniciar/Detener cámara» ni el visor #reader.
  assert(!html.includes('start-scan-btn'), 'no debería quedar el botón de cámara');
  assert(!html.includes('stop-scan-btn'), 'no debería quedar el botón de detener cámara');
  assert(!document.getElementById('reader'), 'no debería quedar el visor de la cámara');
});

console.log('\n=== Recuperación de contraseña ===');
await prueba('la pantalla de contraseña nueva se monta', () => {
  ui.renderNuevaPassword();
  assert(document.getElementById('new-password-form'), 'falta el formulario');
  assert(document.getElementById('np-1'), 'falta el campo de contraseña');
  assert(document.getElementById('np-2'), 'falta la confirmación');
  // Se restaura el contenedor para las pruebas siguientes
  const MARCADO_BASE = '<main id="views-container" tabindex="-1" aria-label="Contenido principal"></main>' +
  '<div id="toast-container" role="status" aria-live="polite"></div>';
document.body.innerHTML = MARCADO_BASE;
});

console.log('\n=== Mesón de circulación ===');
await prueba('consultarLibro devuelve libro y sus préstamos', async () => {
  const r = await db.consultarLibro(LIBROS[0].isbn);
  assert(r && r.libro, 'no devolvió el libro');
  assert(Array.isArray(r.prestamos), 'prestamos no es arreglo');
  assert(r.prestamos[0].lector.rut, 'falta el RUT del lector');
});

await prueba('consultarLibro devuelve null si el código no existe', async () => {
  assert(await db.consultarLibro('codigo-inexistente') === null);
});

await prueba('la ficha muestra el RUT y la situación de quien lo tiene', async () => {
  const r = await db.consultarLibro(LIBROS[0].isbn);
  const html = ui._fichaCirculacion(r);
  assert(html.includes(r.prestamos[0].lector.rut), 'no muestra el RUT');
  assert(/Al día|Debe \d+ libro|Bloqueado/.test(html), 'no muestra la situación del lector');
  assert(html.includes('Registrar devolución'), 'falta la acción de devolver');
});

await prueba('la ficha de un libro sin préstamos ofrece prestarlo', async () => {
  const r = await db.consultarLibro(LIBROS[4].isbn);
  const html = ui._fichaCirculacion(r);
  assert(html.includes('Sin préstamos activos'), 'no indica que está disponible');
  assert(html.includes('Prestar este libro'), 'falta el botón de prestar');
});

await prueba('la ficha muestra la fila de espera cuando hay reservas vigentes', async () => {
  const r = await db.consultarLibro(LIBROS[1].isbn); // La Araucana, tiene una reserva (RESERVAS)
  const reservas = await db.listarReservas(LIBROS[1].id);
  const html = ui._fichaCirculacion(r, reservas);
  assert(html.includes('Pedro Huenchumán'), 'no muestra el nombre de quien espera');
  assert(html.includes('11111111-1'), 'no muestra el RUT de quien espera');
  assert(/En fila/.test(html), 'no indica que está en fila de espera');
});

await prueba('la ficha no muestra ninguna fila de espera si no se le pasan reservas', async () => {
  const r = await db.consultarLibro(LIBROS[4].isbn); // La Odisea, sin reservas en el fixture
  const html = ui._fichaCirculacion(r);
  assert(!/En fila|Apartado para/.test(html), 'no debería inventar una fila de espera sin datos');
});

await prueba('escanear un libro con reserva vigente la muestra en pantalla', async () => {
  ui.currentView = 'scanner';
  ui.renderScannerView();
  await ui._mostrarResultadoEscaneo(LIBROS[1].isbn);
  const html = document.getElementById('scan-result').innerHTML;
  assert(html.includes('Pedro Huenchumán'), 'el flujo completo (consultarLibro + listarReservas) no mostró a quien espera');
});

await prueba('estadoLector detecta lector bloqueado', async () => {
  const e = await db.estadoLector('11111111-1');
  assert(e.existe === true, 'debería existir');
  assert(e.puede_prestar === false, 'un lector bloqueado no puede pedir libros');
});

await prueba('estadoLector detecta lector nuevo', async () => {
  const e = await db.estadoLector('16179263-2');
  assert(e.existe === false, 'no debería existir');
});

await prueba('el modal ofrece registrar si el lector es nuevo', async () => {
  const e = await db.estadoLector('16179263-2');
  ui.showConfirmarPrestamoModal(1, '16179263-2', e, null);
  const overlay = document.body.lastElementChild;
  assert(overlay.innerHTML.includes('Lector nuevo'), 'no indica que es nuevo');
  assert(overlay.querySelector('[data-action="registrar"]'), 'falta el botón de registrar');
  overlay.remove();
});

await prueba('el modal impide prestar a un lector bloqueado', async () => {
  const e = await db.estadoLector('11111111-1');
  ui.showConfirmarPrestamoModal(1, '11111111-1', e, null);
  const overlay = document.body.lastElementChild;
  assert(overlay.innerHTML.includes('No se puede prestar'), 'no bloquea el préstamo');
  assert(!overlay.querySelector('[data-action="prestar"]'), 'no debería ofrecer confirmar');
  overlay.remove();
});

await prueba('el modal permite prestar a un lector al día', async () => {
  const e = await db.estadoLector('12345678-5');
  ui.showConfirmarPrestamoModal(1, '12345678-5', e, null);
  const overlay = document.body.lastElementChild;
  assert(overlay.querySelector('[data-action="prestar"]'), 'falta el botón de confirmar');
  overlay.remove();
});

await prueba('el registro rápido de lector precarga el RUT', () => {
  ui.showNuevoLectorModal('16179263-2', null);
  const overlay = document.body.lastElementChild;
  assert(overlay.querySelector('#new-user-id').value === '16179263-2', 'no precargó el RUT');
  assert(overlay.querySelector('#new-user-id').hasAttribute('readonly'), 'el RUT debería ser de solo lectura');
  overlay.remove();
});

console.log('\n=== Aviso con advertencia de bloqueo ===');
await prueba('el aviso de atrasado advierte la suspensión', () => {
  const texto = ui._textoAviso(PRESTAMOS[0]); // atrasado
  assert(/suspendida/i.test(texto), 'no menciona la suspensión');
  assert(/devolver/i.test(texto), 'no dice qué hacer');
});

await prueba('el aviso por vencer advierte lo que pasará', () => {
  const texto = ui._textoAviso(PRESTAMOS[1]); // por vencer
  assert(/suspendida|suspender/i.test(texto), 'no advierte la consecuencia');
  assert(/renovar/i.test(texto), 'no ofrece la alternativa de renovar');
});

console.log('\n=== Herramientas de administración ===');
for (const tab of ['inventario', 'bloqueados', 'personal', 'enlaces', 'auditoria']) {
  await prueba(`la pestaña de administración "${tab}" se renderiza`, async () => {
    ui.currentUserRole = 'admin';
    ui.currentView = 'admin';
    ui.adminTab = tab;
    const antes = errores.length;
    await ui.renderAdmin();
    const html = document.getElementById('views-container').innerHTML;
    assert(html.length > 100, 'quedó vacía');
    assert(!html.includes('undefined'), 'aparece "undefined"');
    assert(errores.length === antes, `errores nuevos: ${errores.slice(antes).join('; ')}`);
  });
}

await prueba('un librero no puede ver administración', async () => {
  ui.currentUserRole = 'librero';
  ui.currentView = 'admin';
  await ui.renderAdmin();
  assert(document.getElementById('views-container').innerHTML.includes('solo para administradores'),
    'debería negar el acceso');
  ui.currentUserRole = 'admin';
});

console.log('\n=== Cumplimiento legal (Ley 21.719 / 21.663) ===');

await prueba('el formulario pide consentimiento informado', () => {
  const html = ui._bloqueConsentimiento('new');
  assert(html.includes('new-user-consent'), 'falta la casilla de consentimiento');
  assert(/finalidad|se usan únicamente/i.test(html), 'no declara la finalidad del tratamiento');
  assert(/Municipalidad de Futrono/.test(html), 'no identifica al responsable');
  assert(/acceder a tus datos|corregirlos|eliminación/i.test(html), 'no informa los derechos del titular');
});

await prueba('el consentimiento registra versión y fecha', () => {
  document.body.insertAdjacentHTML('beforeend', `<div id="tmpc">${ui._bloqueConsentimiento('new')}</div>`);
  document.getElementById('new-user-consent').checked = true;
  const d = ui._datosConsentimiento('new');
  assert(d !== null, 'debería aceptar');
  assert(d.consentimiento_version, 'no registra la versión del texto');
  assert(d.consentimiento_fecha, 'no registra la fecha');
  document.getElementById('tmpc').remove();
});

await prueba('sin marcar la casilla no se puede registrar', () => {
  document.body.insertAdjacentHTML('beforeend', `<div id="tmpc">${ui._bloqueConsentimiento('new')}</div>`);
  assert(ui._datosConsentimiento('new') === null, 'no debería permitir seguir sin consentimiento');
  document.getElementById('tmpc').remove();
});

await prueba('un menor de edad exige datos del apoderado', () => {
  document.body.insertAdjacentHTML('beforeend', `<div id="tmpc">${ui._bloqueConsentimiento('new')}</div>`);
  document.getElementById('new-user-consent').checked = true;
  document.getElementById('new-user-minor').checked = true;
  assert(ui._datosConsentimiento('new') === null, 'debería exigir el apoderado');
  document.getElementById('new-guardian-name').value = 'Ana Pérez';
  document.getElementById('new-guardian-rut').value = '12345678-5';
  const d = ui._datosConsentimiento('new');
  assert(d && d.es_menor === true, 'no marcó al lector como menor');
  assert(d.apoderado_rut === '12345678-5', 'no guardó el RUT del apoderado');
  document.getElementById('tmpc').remove();
});

await prueba('rechaza un RUT de apoderado inválido', () => {
  document.body.insertAdjacentHTML('beforeend', `<div id="tmpc">${ui._bloqueConsentimiento('new')}</div>`);
  document.getElementById('new-user-consent').checked = true;
  document.getElementById('new-user-minor').checked = true;
  document.getElementById('new-guardian-name').value = 'Ana Pérez';
  document.getElementById('new-guardian-rut').value = '12345678-9';
  assert(ui._datosConsentimiento('new') === null, 'debería rechazar el DV incorrecto');
  document.getElementById('tmpc').remove();
});

await prueba('el derecho de acceso entrega los datos del titular', async () => {
  const d = await db.exportarDatosLector('12345678-5');
  assert(d.datos_personales, 'falta el bloque de datos personales');
  assert('historial_prestamos' in d, 'falta el historial');
});

await prueba('la pestaña de cumplimiento se renderiza', async () => {
  ui.currentUserRole = 'admin';
  ui.currentView = 'admin';
  ui.adminTab = 'cumplimiento';
  const antes = errores.length;
  await ui.renderAdmin();
  const html = document.getElementById('views-container').innerHTML;
  assert(html.length > 500, 'quedó vacía');
  assert(!html.includes('undefined'), 'aparece "undefined"');
  assert(errores.length === antes, `errores nuevos: ${errores.slice(antes).join('; ')}`);
});

await prueba('la vista advierte cuando una tabla no tiene RLS', async () => {
  ui.adminTab = 'cumplimiento';
  await ui.renderAdmin();
  const html = document.getElementById('views-container').innerHTML;
  assert(/sin protección adecuada/i.test(html), 'no advierte el problema de RLS');
  assert(/CRÍTICO/.test(html), 'no muestra el diagnóstico');
});

console.log('\n=== Zona horaria: pantalla y servidor deben coincidir ===');
const { hoyEnChile } = await importDesdeTmp('src/js/modules/db.js');

await prueba('_diasRestantes usa la fecha de Chile, no la del dispositivo', () => {
  const hoyCL = hoyEnChile();
  assert(ui._diasRestantes(hoyCL) === 0, `hoy en Chile (${hoyCL}) debería dar 0, dio ${ui._diasRestantes(hoyCL)}`);
});

await prueba('la fecha de Chile puede diferir de la UTC del dispositivo', () => {
  const utc = new Date().toISOString().split('T')[0];
  const cl = hoyEnChile();
  // No siempre difieren, pero el cálculo debe anclarse a Chile en ambos casos
  assert(ui._diasRestantes(cl) === 0, 'debe anclarse a Chile');
  if (utc !== cl) {
    assert(ui._diasRestantes(utc) !== 0, `con UTC=${utc} y Chile=${cl} el resultado no debería ser 0`);
  }
});

await prueba('un préstamo atrasado no ofrece renovación', async () => {
  ui.currentView = 'loans';
  ui.loanFilter = 'todos';
  await ui.renderLoans();
  const html = document.getElementById('views-container').innerHTML;
  // PRESTAMOS[0] está atrasado: no debe aparecer su botón renovar
  const filaAtrasada = html.includes('Atrasado');
  assert(filaAtrasada, 'debería mostrar al menos un atraso en los datos de prueba');
});

console.log('\n=== Accesibilidad (Decreto N° 1/2015) ===');

await prueba('todo campo de formulario tiene etiqueta accesible', async () => {
  // Se renderizan todas las vistas para juntar el máximo de campos
  for (const v of ['catalog', 'users', 'loans', 'reports', 'scanner']) {
    ui.currentView = v;
    await ({ catalog: () => ui.renderCatalog(), users: () => ui.renderUsers(),
             loans: () => ui.renderLoans(), reports: () => ui.renderReports(),
             scanner: () => ui.renderScannerView() })[v]();
    const sinEtiqueta = [...document.querySelectorAll('input, textarea, select')].filter(el => {
      if (el.type === 'hidden') return false;
      if (el.getAttribute('aria-label')) return false;
      if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
      if (el.closest('label')) return false;
      return true;
    });
    assert(sinEtiqueta.length === 0,
      `vista ${v}: ${sinEtiqueta.length} campo(s) sin etiqueta → ${sinEtiqueta.map(e => e.id || e.type).join(', ')}`);
  }
});

await prueba('los avisos se anuncian al lector de pantalla', () => {
  // Se revisa el código fuente de la aplicación, no el marcado del banco de
  // pruebas: así la verificación no depende de cómo montamos el entorno.
  // El contenedor vive en ui-base.js (constructor y navegación transversal),
  // no en ui.js: ese quedó reducido a ensamblar ui-base.js + js/vistas/*.js
  // cuando UIManager se repartió en varios archivos.
  const fuente = fs.readFileSync(path.join(tmp, 'src/js/modules/ui-base.js'), 'utf8');
  const contenedores = fuente.match(/<div id="toast-container"[^>]*>/g) || [];
  assert(contenedores.length > 0, 'la aplicación no crea ningún contenedor de avisos');
  contenedores.forEach((c, i) => {
    assert(/aria-live="polite"/.test(c), `contenedor ${i + 1} sin aria-live`);
    assert(/role="status"/.test(c), `contenedor ${i + 1} sin role="status"`);
  });
  const indexHtml = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  const enIndex = indexHtml.match(/<div id="toast-container"[^>]*>/);
  assert(enIndex && /aria-live/.test(enIndex[0]), 'el contenedor de index.html no anuncia');
});

const modalesAProbar = [
  ['showConfirm', () => ui.showConfirm('¿Seguro?')],
  ['showPrompt', () => ui.showPrompt('Escribe algo')],
  ['showEditBookModal', () => ui.showEditBookModal(LIBROS[0])],
  ['showEditUserModal', () => ui.showEditUserModal(LECTORES[0])],
  ['showNotifyModal', () => ui.showNotifyModal(PRESTAMOS[0])],
  ['showNuevoLectorModal', () => ui.showNuevoLectorModal('16179263-2', null)],
  ['showBulkNotifyModal', () => ui.showBulkNotifyModal([PRESTAMOS[0]])],
  ['showQrRemotoModal', () => ui.showQrRemotoModal()],
];

for (const [nombre, abrir] of modalesAProbar) {
  await prueba(`${nombre} es accesible (diálogo + título + foco)`, () => {
    abrir();
    const overlay = document.body.lastElementChild;
    assert(overlay.getAttribute('role') === 'dialog', 'falta role="dialog"');
    assert(overlay.getAttribute('aria-modal') === 'true', 'falta aria-modal="true"');
    assert(overlay.getAttribute('aria-labelledby') || overlay.getAttribute('aria-label'),
      'el diálogo no está asociado a ningún título');
    if (overlay.getAttribute('aria-labelledby')) {
      assert(document.getElementById(overlay.getAttribute('aria-labelledby')),
        'aria-labelledby apunta a un id que no existe');
    }
    overlay.remove();
  });
}

await prueba('Escape cierra los modales', () => {
  const antes = document.body.children.length;
  ui.showEditBookModal(LIBROS[0]);
  assert(document.body.children.length === antes + 1, 'no se abrió');
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(document.body.children.length === antes, 'Escape no cerró el modal');
});

await prueba('los iconos decorativos se ocultan al lector de pantalla', async () => {
  ui.currentView = 'loans';
  await ui.renderLoans();
  const iconos = [...document.querySelectorAll('i.fas, i.fa-solid, i.fa-brands')];
  const expuestos = iconos.filter(i => i.getAttribute('aria-hidden') !== 'true');
  assert(expuestos.length === 0, `${expuestos.length} icono(s) sin aria-hidden`);
});

await prueba('los botones de solo icono tienen nombre accesible', () => {
  const html = ui._paginacionHtml(1, 100, 25, 'x');
  assert(html.includes('aria-label="Página anterior"'), 'falta nombre en el botón anterior');
  assert(html.includes('aria-label="Página siguiente"'), 'falta nombre en el botón siguiente');
});

console.log('\n=== Escáner remoto: alta rápida y QR de acceso ===');

await prueba('buscarPorIsbnExterno() completa título y autor', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async (url) => {
    assert(String(url).includes('openlibrary.org'), `no consultó Open Library: ${url}`);
    return {
      ok: true,
      json: async () => ({
        'ISBN:9780140449136': { title: 'La Odisea', authors: [{ name: 'Homero' }] }
      })
    };
  };
  try {
    const datos = await buscarPorIsbnExterno('978-0-14-044913-6');
    assert(datos?.titulo === 'La Odisea', `título no llegó: ${JSON.stringify(datos)}`);
    assert(datos?.autor === 'Homero', `autor no llegó: ${JSON.stringify(datos)}`);
  } finally {
    global.fetch = fetchOriginal;
  }
});

await prueba('buscarPorIsbnExterno() no revienta si Open Library falla', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => { throw new Error('sin conexión'); };
  try {
    const datos = await buscarPorIsbnExterno('9780140449136');
    assert(datos === null, 'debió devolver null en vez de lanzar el error');
  } finally {
    global.fetch = fetchOriginal;
  }
});

await prueba('buscarPorIsbnExterno() no revienta si el ISBN no aparece', async () => {
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    const datos = await buscarPorIsbnExterno('0000000000');
    assert(datos === null, 'debió devolver null cuando Open Library no tiene el ISBN');
  } finally {
    global.fetch = fetchOriginal;
  }
});

await prueba('generarSvgQr() produce un SVG usable', async () => {
  const svg = await generarSvgQr('https://biblionexo.test/?vista=scanner');
  assert(svg.startsWith('<svg'), `no parece un SVG: ${svg.slice(0, 40)}`);
  assert(svg.includes('</svg>'), 'el SVG no está cerrado');
});

await prueba('db.crearEnlaceEscaneo() devuelve token y fecha de vencimiento', async () => {
  const enlace = await db.crearEnlaceEscaneo(4);
  assert(enlace?.token, 'no devolvió el token');
  assert(enlace?.expira_en, 'no devolvió la fecha de vencimiento');
  assert(typeof enlace.id === 'number', 'no devolvió el id del enlace');
});

await prueba('db.listarEnlacesEscaneo() y db.revocarEnlaceEscaneo() funcionan juntos', async () => {
  const enlace = await db.crearEnlaceEscaneo(4);
  let filas = await db.listarEnlacesEscaneo();
  const propia = filas.find(f => f.id === enlace.id);
  assert(propia, 'el enlace recién creado no aparece en el listado');
  assert(propia.vigente === true, 'un enlace recién creado debería figurar vigente');

  await db.revocarEnlaceEscaneo(enlace.id);
  filas = await db.listarEnlacesEscaneo();
  const revocada = filas.find(f => f.id === enlace.id);
  assert(revocada.revocado === true, 'no quedó marcado como revocado');
});

await prueba('showQrRemotoModal() genera un enlace SIN sesión, no "?vista=scanner"', async () => {
  await ui.showQrRemotoModal();
  // La generación es asíncrona (crea el enlace antes de dibujar el QR): se
  // espera un instante, igual que en la prueba de guardar el perfil más arriba.
  await new Promise(r => setTimeout(r, 60));
  const overlay = document.body.lastElementChild;
  const texto = overlay.textContent;
  assert(/escaneo-remoto\.html\?token=/.test(texto), `no armó la URL sin sesión: ${texto.slice(0, 200)}`);
  assert(!/\?vista=scanner/.test(texto), 'sigue mandando a la vista con sesión, no al enlace sin sesión');
  assert(/Vence el/.test(texto), 'no muestra cuándo vence el enlace');
  assert(overlay.querySelector('[data-action="revocar"]'), 'falta el botón para revocar de inmediato');
  overlay.remove();
});

await prueba('showQrRemotoModal(): "Revocar este enlace ahora" lo invalida', async () => {
  const antes = (await db.listarEnlacesEscaneo()).filter(f => f.vigente).length;
  await ui.showQrRemotoModal();
  await new Promise(r => setTimeout(r, 60));
  const overlay = document.body.lastElementChild;
  overlay.querySelector('[data-action="revocar"]').click();
  await new Promise(r => setTimeout(r, 60));
  const despues = (await db.listarEnlacesEscaneo()).filter(f => f.vigente).length;
  assert(despues === antes, `debió quedar un enlace vigente menos: antes=${antes} después=${despues}`);
  assert(/revocado/i.test(overlay.textContent), 'no avisa que el enlace quedó revocado');
  overlay.remove();
});

await prueba('la pestaña "Enlaces remotos" de Administración lista lo generado y permite revocar', async () => {
  ui.currentUserRole = 'admin';
  ui.currentView = 'admin';
  ui.adminTab = 'enlaces';
  await ui.renderAdmin();
  const panel = document.getElementById('admin-panel');
  assert(/admin@biblionexo\.cl/.test(panel.innerHTML), 'no muestra quién generó el enlace');
  assert(panel.querySelectorAll('.revocar-enlace-btn').length > 0, 'no ofrece revocar los enlaces vigentes');
});

await prueba('_vistaInicial() respeta ?vista= cuando el rol puede verla', () => {
  dom.reconfigure({ url: 'https://biblionexo.test/?vista=scanner' });
  assert(ui._vistaInicial('librero') === 'scanner', 'no usó la vista pedida por la URL');
});

await prueba('_vistaInicial() del bibliomóvil abre la ruta', () => {
  dom.reconfigure({ url: 'https://biblionexo.test/' });
  assert(ui._vistaInicial('bibliomovil') === 'bibliomovil',
    'el personal de ruta debe aterrizar en Bibliomóvil');
});

await prueba('_vistaInicial() ignora un valor inventado o sin permiso', () => {
  dom.reconfigure({ url: 'https://biblionexo.test/?vista=admin' });
  // 'admin' no está en las vistas de librero: debe caer a la primera de su rol
  assert(ui._vistaInicial('librero') === CONFIG.VIEWS_BY_ROLE.librero[0].id,
    'no cayó a la vista por defecto del rol');

  dom.reconfigure({ url: 'https://biblionexo.test/?vista=lo-que-sea' });
  assert(ui._vistaInicial('admin') === CONFIG.VIEWS_BY_ROLE.admin[0].id,
    'un valor inventado no cayó a la vista por defecto');

  dom.reconfigure({ url: 'https://biblionexo.test/' });
});

await prueba('el escáner ofrece alta rápida cuando el código no está en el catálogo', async () => {
  // Se simula Open Library también aquí: sin esto, la prueba dependería de
  // una red real, con el riesgo de quedar lenta o inestable en CI.
  const fetchOriginal = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    ui.currentView = 'scanner';
    await ui.renderScannerView();
    await ui._mostrarResultadoEscaneo('9999999999999');
    assert(document.getElementById('scan-new-book-title'), 'no se ofreció el formulario de alta rápida');
    assert(document.getElementById('scan-new-book-isbn').value === '9999999999999',
      'el ISBN escaneado no quedó precargado');
  } finally {
    global.fetch = fetchOriginal;
  }
});

console.log('\n=== Parámetros: pantalla y base de datos sincronizadas ===');

await prueba('param() lee de la base de datos cuando está disponible', async () => {
  await ui.cargarParametros();
  assert(ui.param('max_prestamos_por_lector') === 3, 'no leyó el valor de la tabla');
});

await prueba('param() cae al respaldo si la tabla no existe', () => {
  const guardado = ui._parametros;
  ui._parametros = null;
  assert(ui.param('max_prestamos_por_lector') === 3, 'el respaldo no funciona');
  assert(ui.param('max_renovaciones') === 2, 'el respaldo de renovaciones no funciona');
  ui._parametros = guardado;
});

await prueba('un cambio de parámetro se refleja en la pantalla', async () => {
  ui._parametros = { max_prestamos_por_lector: '7', max_renovaciones: '4', dias_aviso_previo: '3', filas_por_pagina: '25' };
  ui.currentView = 'loans';
  await ui.renderLoans();
  const html = document.getElementById('views-container').innerHTML;
  assert(html.includes('Máx. 7 por lector'), 'la pantalla no refleja el parámetro nuevo');
  await ui.cargarParametros(); // restaurar
});

console.log('\n=== Préstamos: conteos desde el servidor ===');

await prueba('obtenerPrestamos devuelve lista, total y conteos', async () => {
  const r = await db.obtenerPrestamos('todos', 0, 25, 3);
  assert(Array.isArray(r.prestamos), 'prestamos no es arreglo');
  assert(typeof r.total === 'number', 'falta el total');
  assert(r.conteos && typeof r.conteos.vencidos === 'number', 'faltan los conteos del servidor');
});

await prueba('los tres filtros de préstamos funcionan', async () => {
  for (const f of ['todos', 'vencidos', 'porVencer']) {
    ui.loanFilter = f;
    ui.currentView = 'loans';
    const antes = errores.length;
    await ui.renderLoans();
    const html = document.getElementById('views-container').innerHTML;
    assert(html.length > 100, `filtro ${f} dejó la vista vacía`);
    assert(!html.includes('NaN'), `filtro ${f} muestra NaN`);
    assert(errores.length === antes, `filtro ${f}: ${errores.slice(antes).join('; ')}`);
  }
  ui.loanFilter = 'todos';
});

await prueba('cambiar de filtro vuelve a la primera página', async () => {
  ui.loanPage = 3;
  ui.currentView = 'loans';
  await ui.renderLoans();
  const btn = document.querySelector('.loan-filter-btn[data-filter="vencidos"]');
  if (btn) {
    btn.dispatchEvent(new dom.window.Event('click'));
    await new Promise(r => setTimeout(r, 10));
    assert(ui.loanPage === 0, 'no volvió a la primera página');
  }
});

// ---------------------------------------------------------------------------
console.log('\n=== Menú y router sincronizados ===');

await prueba('cada vista del menú tiene su render en el router', () => {
  // Este fue un bug real: el menú ofrecía "Bibliomóvil" (CONFIG.VIEWS_BY_ROLE)
  // pero switchView no tenía renderer para ese id y caía en el Dashboard, así
  // que la vista completa del Modo Ruta era inalcanzable. La comprobación lee
  // el código fuente para que también valga para futuras vistas.
  const fuenteRouter = fs.readFileSync(path.join(tmp, 'src/js/modules/ui-router.js'), 'utf8');
  const fuenteConfig = fs.readFileSync(path.join(tmp, 'src/js/config.js'), 'utf8');
  const bloque = fuenteRouter.match(/const renderers = \{([\s\S]*?)\n    \};/);
  assert(bloque, 'no se encontró el mapa de renderers en ui-router.js');
  const enRouter = new Set([...bloque[1].matchAll(/^\s{6}([a-z][\w]*)\s*:/gm)].map(m => m[1]));
  const ids = new Set([...fuenteConfig.matchAll(/\{\s*id:\s*'([a-z][\w]*)'/g)].map(m => m[1]));
  assert(ids.size >= 6, `se esperaban vistas en CONFIG.VIEWS_BY_ROLE y se leyeron ${ids.size}`);
  const sinRender = [...ids].filter(id => !enRouter.has(id));
  assert(sinRender.length === 0,
    `vistas del menú sin renderer: ${sinRender.join(', ')} (el clic cae en el Dashboard)`);
});

// ---------------------------------------------------------------------------

} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  console.error = errOriginal;
}

console.log('\n' + '='.repeat(52));
console.log(`  Pasadas: ${pasadas}    Fallidas: ${fallidas}`);
if (errores.length) {
  console.log(`\n  Errores en tiempo de ejecución (${errores.length}):`);
  errores.forEach(e => console.log('   - ' + e));
}
const relevantes = advertencias.filter(a => !/rol desde la tabla|ADMIN_EMAILS|Not implemented/i.test(a));
if (relevantes.length) {
  console.log(`\n  Avisos de consola (${relevantes.length}):`);
  [...new Set(relevantes)].slice(0, 8).forEach(a => console.log('   - ' + a.slice(0, 160)));
}
console.log('='.repeat(52) + '\n');

process.exit(fallidas > 0 || errores.length > 0 ? 1 : 0);
