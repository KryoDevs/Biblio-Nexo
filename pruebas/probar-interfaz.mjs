/**
 * Prueba de humo de la interfaz, sobre un DOM real (jsdom) y un Supabase falso.
 *
 * No reemplaza probar con la base de datos verdadera, pero sí atrapa lo que se
 * rompe al mover código: vistas que no existen, ids que no calzan, llamadas a
 * funciones que ya no están, y el rol que se muestra mal.
 *
 * Ejecutar:  node pruebas/probar-interfaz.mjs
 */

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Registro de resultados
// ---------------------------------------------------------------------------
let pasadas = 0, fallidas = 0;
const comprobar = (descripcion, condicion, detalle = '') => {
  if (condicion) {
    pasadas++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallidas++;
    console.log(`  ✗ ${descripcion}${detalle ? ' — ' + detalle : ''}`);
  }
};

// ---------------------------------------------------------------------------
// DOM simulado
// ---------------------------------------------------------------------------
const dom = new JSDOM(
  `<!DOCTYPE html><html><body>
     <main id="views-container"></main>
     <div id="toast-container"></div>
   </body></html>`,
  { url: 'https://biblioteca.futrono.cl/', pretendToBeVisual: true }
);

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Audio = class { play() { return Promise.resolve(); } };
globalThis.AudioContext = undefined;

// ---------------------------------------------------------------------------
// Supabase falso: devuelve datos plausibles y anota qué se le pidió
// ---------------------------------------------------------------------------
const llamadasRpc = [];

const perfilLibrero = {
  usuario_id: '11111111-1111-1111-1111-111111111111',
  email: 'librera@futrono.cl',
  nombre: 'María Antileo Huenchumán',
  telefono: '56912345678',
  cargo: 'Encargada de circulación',
  rol: 'librero',
  creado_en: '2026-03-01T12:00:00Z',
  actualizado_en: null,
  ultimo_acceso: '2026-07-26T14:30:00Z'
};

const respuestasRpc = {
  mi_perfil: () => [perfilLibrero],
  actualizar_mi_perfil: () => null,
  verificar_circulacion: () => [
    { funcion: 'prestar_libro', es_definer: true, diagnostico: 'Correcto' }
  ],
  verificar_rls: () => [
    { tabla: 'libros', rls_activo: true, politicas: 4, diagnostico: 'Correcto' }
  ],
  buscar_libros: () => [],
  estado_lector: () => [{ existe: false }],
  actualizar_contacto_lector: () => null
};

const consultaFalsa = () => {
  const encadenable = {
    select: () => encadenable,
    eq: () => encadenable,
    lt: () => encadenable,
    lte: () => encadenable,
    gte: () => encadenable,
    or: () => encadenable,
    order: () => encadenable,
    range: () => encadenable,
    limit: () => encadenable,
    update: () => encadenable,
    insert: () => encadenable,
    delete: () => encadenable,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolver) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolver)
  };
  return encadenable;
};

window.supabase = {
  createClient: () => ({
    from: consultaFalsa,
    rpc: (nombre, argumentos) => {
      llamadasRpc.push({ nombre, argumentos });
      const generar = respuestasRpc[nombre];
      return Promise.resolve(
        generar
          ? { data: generar(), error: null }
          : { data: null, error: { code: 'PGRST202', message: 'function not found' } }
      );
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: { id: perfilLibrero.usuario_id, email: perfilLibrero.email } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: () => Promise.resolve({ error: null })
    }
  })
};

// ---------------------------------------------------------------------------
// Carga de los módulos reales
// ---------------------------------------------------------------------------
const { CONFIG } = await import('../src/js/config.js');
const uiManager = (await import('../src/js/modules/ui.js')).default;

const usuario = { id: perfilLibrero.usuario_id, email: perfilLibrero.email };

console.log('\n1. Arranque del sistema con una cuenta de librero');
await uiManager.renderShell(usuario);

comprobar('el rol detectado es librero', uiManager.currentUserRole === 'librero', `salió "${uiManager.currentUserRole}"`);
comprobar('la ficha lateral muestra el nombre, no el correo',
  document.getElementById('current-user-name')?.textContent === perfilLibrero.nombre);
comprobar('la segunda línea muestra el correo',
  document.getElementById('current-user-sub')?.textContent === perfilLibrero.email);
comprobar('la insignia muestra el cargo escrito por la persona',
  document.getElementById('current-user-badge')?.textContent === perfilLibrero.cargo);
comprobar('la inicial del avatar es la del nombre',
  document.getElementById('current-user-initial')?.textContent === 'M');

console.log('\n2. Menú lateral del librero');
const botonesMenu = [...document.querySelectorAll('#nav-menu .nav-btn')].map(b => b.dataset.view);
comprobar('incluye Mesón', botonesMenu.includes('scanner'));
comprobar('incluye Lectores (antes no lo tenía y lo necesitaba para los avisos)',
  botonesMenu.includes('users'));
comprobar('incluye Mi perfil', botonesMenu.includes('profile'));
comprobar('NO incluye Administración', !botonesMenu.includes('admin'),
  'el librero no debe ver el panel de administración');

console.log('\n3. Vista Mi perfil');
await uiManager.switchView('profile');
const contenedor = document.getElementById('views-container');

comprobar('se dibujó el formulario de datos', !!document.getElementById('perfil-form'));
comprobar('se dibujó el formulario de contraseña', !!document.getElementById('password-form'));
comprobar('el nombre viene cargado', document.getElementById('perfil-nombre')?.value === perfilLibrero.nombre);
comprobar('el cargo viene cargado', document.getElementById('perfil-cargo')?.value === perfilLibrero.cargo);
comprobar('el correo se muestra como solo lectura',
  [...contenedor.querySelectorAll('input[readonly]')].some(i => i.value === perfilLibrero.email));
comprobar('el rol se muestra como solo lectura',
  [...contenedor.querySelectorAll('input[readonly]')].some(i => i.value === 'Librero'));
comprobar('no hay ningún control para cambiarse el rol a uno mismo',
  !contenedor.querySelector('select[id*="rol"], input:not([readonly])[id*="rol"]'));

console.log('\n4. Guardar el perfil');
document.getElementById('perfil-nombre').value = 'María Antileo Curiqueo';
document.getElementById('perfil-cargo').value = 'Jefa de biblioteca';
document.getElementById('perfil-telefono').value = '9 8765 4321';
document.getElementById('perfil-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 60));

const guardado = llamadasRpc.filter(l => l.nombre === 'actualizar_mi_perfil').pop();
comprobar('se llamó a actualizar_mi_perfil', !!guardado);
comprobar('se envió el nombre nuevo', guardado?.argumentos?.p_nombre === 'María Antileo Curiqueo');
comprobar('el teléfono se normalizó a formato internacional',
  guardado?.argumentos?.p_telefono === '56987654321', `salió "${guardado?.argumentos?.p_telefono}"`);
comprobar('NO se envía el rol al servidor (no se puede ascender a uno mismo)',
  guardado && !('p_rol' in guardado.argumentos));
comprobar('NO se envía el id de usuario (lo toma de la sesión)',
  guardado && !('p_usuario_id' in guardado.argumentos));

console.log('\n5. Validaciones del perfil');
const contarLlamadas = () => llamadasRpc.filter(l => l.nombre === 'actualizar_mi_perfil').length;

let antes = contarLlamadas();
document.getElementById('perfil-nombre').value = 'María';
document.getElementById('perfil-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 30));
comprobar('rechaza un nombre sin apellido', contarLlamadas() === antes);

antes = contarLlamadas();
document.getElementById('perfil-nombre').value = 'María Antileo';
document.getElementById('perfil-telefono').value = '123';
document.getElementById('perfil-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 30));
comprobar('rechaza un teléfono incompleto', contarLlamadas() === antes);

console.log('\n6. Vista Administración cerrada para el librero');
await uiManager.switchView('admin');
comprobar('muestra el mensaje de sección restringida',
  /solo para administradores/i.test(document.getElementById('views-container').textContent));
comprobar('no se dibujaron las pestañas de administración',
  !document.querySelector('.admin-tab-btn'));

console.log('\n7. Escaneo: la cámara debe poder apagarse y volver a encender');
const Scanner = (await import('../src/js/modules/scanner.js')).default;
let instanciasCreadas = 0;
// Se mockea Html5Qrcode (la API de bajo nivel), no Html5QrcodeScanner: desde
// que scanner.js dejó de usar la interfaz "enlatada" de la librería (ver el
// comentario al inicio de scanner.js), es esta la que se instancia.
window.Html5Qrcode = class {
  constructor() { instanciasCreadas++; }
  start() { return Promise.resolve(); }
  stop() { return Promise.resolve(); }
  clear() { return Promise.resolve(); }
};
// Desde el 22 de agosto de 2026 (Fase 2 de
// claude/reservas-whatsapp-meson-2026-08-22.md) la vista "scanner" del
// propio sistema (ui-base.js/mostrador.js) ya NO tiene cámara ni el div
// #reader que Scanner.start() necesita — todo el escaneo con cámara se mudó
// a escaneo-remoto.js, la página aparte del enlace sin sesión. Este bloque
// prueba scanner.js en sí mismo (el módulo compartido, ver el comentario al
// inicio de ese archivo), así que arma su propio #reader en vez de depender
// de switchView('scanner') para tenerlo.
document.body.appendChild(document.createElement('div')).id = 'reader';
// start() es asíncrono desde que la librería se carga bajo demanda (368 KB que
// antes se descargaban en todas las vistas).
await Scanner.start(() => {}, () => {});
comprobar('la cámara enciende la primera vez', instanciasCreadas === 1,
  `se crearon ${instanciasCreadas}`);
Scanner.stop();
comprobar('al detener se descarta la instancia', Scanner.html5Qrcode === null);
await Scanner.start(() => {}, () => {});
comprobar('la cámara vuelve a encender después de detenerla (era el fallo)',
  instanciasCreadas === 2, `se crearon ${instanciasCreadas} instancias`);

console.log('\n7b. El escáner ya no se descarga en el arranque');
const html = (await import('node:fs')).readFileSync('index.html', 'utf8');
comprobar('index.html no carga html5-qrcode',
  !/<script[^>]+html5-qrcode/.test(html));
// Se mira solo el contenido de la etiqueta, no los comentarios que la explican
const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || '';
const directiva = d => (csp.match(new RegExp(d + '\\s+([^;]+)')) || [])[1] || '';
comprobar('la CSP ya no permite scripts en línea',
  directiva('script-src').includes("'self'") && !directiva('script-src').includes('unsafe-inline'),
  `script-src = ${directiva('script-src').trim()}`);
comprobar('la CSP sigue bloqueando orígenes de terceros por defecto',
  directiva('default-src').includes("'self'"));
comprobar('la CSP permite únicamente los mosaicos de OpenStreetMap declarados para el mapa',
  directiva('img-src').includes('tile.openstreetmap.org'));
comprobar('la CSP permite el endpoint de rutas OSRM declarado para el Bibliomóvil',
  directiva('connect-src').includes('router.project-osrm.org'));
comprobar('la política de Vercel permite geolocalización solo en el propio sitio',
  fs.readFileSync('vercel.json', 'utf8').includes('geolocation=(self)'));
comprobar('no queda ningún manejador onclick/onerror en el HTML',
  !/\son(click|error|load)=/.test(html));

console.log('\n7b-bis. Los scripts del HTML sobreviven al empaquetado de Vite');
// Un <script src="/src/..."> CLÁSICO (sin type=module) no se copia a dist/:
// Vite solo empaqueta los módulos, así que en producción ese archivo daría
// 404. Pasó al probar a mover el guardia de arranque a un script clásico.
const sinComentarios = html.replace(/<!--[\s\S]*?-->/g, '');
const etiquetasScript = [...sinComentarios.matchAll(/<script([^>]*)>/g)].map(m => m[1]);
const classicosDeFuente = etiquetasScript.filter(a =>
  /src="\/src\//.test(a) && !/type="module"/.test(a));
comprobar('ningún script clásico apunta a /src/ (daría 404 en dist/)',
  classicosDeFuente.length === 0, classicosDeFuente.join(' | '));
comprobar('arranque.js y main.js se cargan como módulos, en ese orden',
  /<script type="module" src="\/src\/js\/arranque\.js"><\/script>/.test(html)
  && html.indexOf('/src/js/arranque.js') < html.indexOf('/src/js/main.js'));
const fuenteArranque = (await import('node:fs')).readFileSync('src/js/arranque.js', 'utf8');
comprobar('el vigía de carga escucha en fase de captura (alcanza scripts tardíos)',
  /addEventListener\('error'/.test(fuenteArranque) && /, true\)/.test(fuenteArranque),
  'sin captura, el error de un script insertado después se pierde');

console.log('\n7c. La CSP del <meta> no declara directivas que el navegador ignora');
// frame-ancestors, sandbox, report-uri y report-to solo funcionan como cabecera
// HTTP. Escribirlas en un <meta> es peor que omitirlas: el navegador las ignora,
// avisa en la consola, y quedan dando la impresión de una protección inexistente.
const soloCabecera = ['frame-ancestors', 'sandbox', 'report-uri', 'report-to'];
for (const d of soloCabecera) {
  comprobar(`la CSP del <meta> no incluye ${d}`, !csp.includes(d),
    `${d} está en el <meta> y el navegador lo ignora`);
}

console.log('\n7d. La protección por cabecera existe para Vercel');

comprobar('existe la configuración para Vercel (vercel.json)', fs.existsSync('vercel.json'));
comprobar('  ...y envía frame-ancestors',
  fs.readFileSync('vercel.json', 'utf8').includes("frame-ancestors 'none'"));
// Respaldo en JavaScript por si algún despliegue queda sin cabeceras
const arranque = fs.readFileSync('src/js/arranque.js', 'utf8');
comprobar('hay respaldo en JavaScript por si faltan las cabeceras',
  /window\.top\s*!==\s*window\.self/.test(arranque));

console.log('\n7e. escaneo-remoto.html (la página del enlace sin sesión) tiene su propia CSP correcta');
const htmlRemoto = fs.readFileSync('escaneo-remoto.html', 'utf8');
const cspRemoto = (htmlRemoto.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) || [])[1] || '';
const directivaRemoto = d => (cspRemoto.match(new RegExp(d + '\\s+([^;]+)')) || [])[1] || '';
comprobar('tiene su propia etiqueta <meta> de CSP', !!cspRemoto);
comprobar('su script-src no permite scripts en línea',
  directivaRemoto('script-src').includes("'self'") && !directivaRemoto('script-src').includes('unsafe-inline'));
comprobar('su default-src sigue bloqueando orígenes de terceros por defecto',
  directivaRemoto('default-src').includes("'self'"));
comprobar('permite hablar con Supabase (valida el token y agrega libros sin sesión)',
  directivaRemoto('connect-src').includes('supabase.co'));
comprobar('permite hablar con Open Library (autocompletar título y autor)',
  directivaRemoto('connect-src').includes('openlibrary.org'));
comprobar('no queda ningún manejador onclick/onerror en el HTML',
  !/\son(click|error|load)=/.test(htmlRemoto));
comprobar('solo carga su propio script, ningún <script src> de CDN externo',
  [...htmlRemoto.matchAll(/<script[^>]+src="([^"]+)"/g)].every(m => !/^https?:\/\//.test(m[1])));
comprobar('vercel.json también le manda Cache-Control: no-cache (igual que a index.html)',
  fs.readFileSync('vercel.json', 'utf8').includes('/escaneo-remoto.html'));

console.log('\n8. Regresión: administrador sin fila de rol en la base de datos');
// mi_perfil() crea la fila que falta con el rol de menor privilegio. Si el
// respaldo por CONFIG.ADMIN_EMAILS no se aplicara, el administrador quedaría
// atrapado como librero sin nadie que pudiera ascenderlo.
const oldAdminEmails = [...CONFIG.ADMIN_EMAILS];
CONFIG.ADMIN_EMAILS.push('admin@futrono.cl');
perfilLibrero.rol = 'librero';
perfilLibrero.email = CONFIG.ADMIN_EMAILS[0];
await uiManager.renderShell({ id: perfilLibrero.usuario_id, email: perfilLibrero.email });
comprobar('un correo de CONFIG.ADMIN_EMAILS ve la interfaz de administrador',
  uiManager.currentUserRole === 'admin', `salió "${uiManager.currentUserRole}"`);
comprobar('queda marcado el desajuste entre pantalla y servidor',
  uiManager.desajusteDeRol === true);
await uiManager.switchView('dashboard');
comprobar('el Dashboard avisa que el rol no está en la base de datos',
  /no está en la base de datos/i.test(document.getElementById('views-container').textContent));
comprobar('el aviso incluye el SQL para corregirlo',
  /insert into public\.usuarios/.test(document.getElementById('views-container').textContent));

// Un correo cualquiera no debe activar el respaldo
perfilLibrero.email = 'otra.persona@futrono.cl';
await uiManager.renderShell({ id: perfilLibrero.usuario_id, email: perfilLibrero.email });
comprobar('un correo que NO está en la lista sigue siendo librero',
  uiManager.currentUserRole === 'librero', `salió "${uiManager.currentUserRole}"`);
comprobar('y no muestra ningún aviso de desajuste', uiManager.desajusteDeRol === false);
CONFIG.ADMIN_EMAILS = oldAdminEmails;

console.log('\n9. Roles definidos en la configuración');
for (const rol of ['admin', 'librero', 'bibliomovil']) {
  const vistas = CONFIG.VIEWS_BY_ROLE[rol].map(v => v.id);
  comprobar(`el rol "${rol}" tiene Mi perfil`, vistas.includes('profile'));
  comprobar(`el rol "${rol}" no tiene vistas repetidas`, new Set(vistas).size === vistas.length);
}
comprobar('solo el rol admin ve Administración',
  CONFIG.VIEWS_BY_ROLE.admin.some(v => v.id === 'admin') &&
  !CONFIG.VIEWS_BY_ROLE.librero.some(v => v.id === 'admin') &&
  !CONFIG.VIEWS_BY_ROLE.bibliomovil.some(v => v.id === 'admin'));
comprobar('el rol bibliomóvil aterriza en la vista de ruta',
  CONFIG.VIEWS_BY_ROLE.bibliomovil[0].id === 'bibliomovil');
comprobar('el rol bibliomóvil ve Mesón, Catálogo, Lectores y Préstamos',
  ['scanner', 'catalog', 'users', 'loans'].every(id => CONFIG.VIEWS_BY_ROLE.bibliomovil.some(v => v.id === id)));
comprobar('el rol bibliomóvil no ve Reportes',
  !CONFIG.VIEWS_BY_ROLE.bibliomovil.some(v => v.id === 'reports'));
const asignarRolSql = fs.readFileSync('supabase/migrations/010_consolidacion.sql', 'utf8');
comprobar('asignar_rol acepta el rol bibliomóvil',
  /p_rol not in \('admin', 'librero', 'bibliomovil'\)/.test(asignarRolSql));
const inviteTs = fs.readFileSync('supabase/functions/invitar-personal/index.ts', 'utf8');
comprobar('invitar-personal acepta el rol bibliomóvil', /rol !== "bibliomovil"/.test(inviteTs));
comprobar('existe la migración de dominio del rol bibliomóvil',
  fs.existsSync('supabase/migrations/029_rol_bibliomovil.sql'));

console.log('\n10. Fase 1.1 — funcionamiento sin conexión (service worker, manifest)');
const viteConfigPwa = fs.existsSync('vite.config.js') ? fs.readFileSync('vite.config.js', 'utf8') : '';
comprobar('existe vite.config.js con configuración de PWA', /VitePWA/.test(viteConfigPwa));
comprobar('el plugin genera el único manifest en /manifest.json',
  /manifestFilename:\s*['"]manifest[.]json['"]/.test(viteConfigPwa) && !/rel="manifest"/.test(html));
comprobar('no queda un manifest paralelo en public/', !fs.existsSync('public/manifest.json'));
comprobar('index.html declara theme-color', /name="theme-color"/.test(html));

comprobar('proyecto usa Vite PWA', fs.readFileSync('package.json', 'utf8').includes('vite-plugin-pwa'));

const mainJs = fs.readFileSync('src/js/main.js', 'utf8');

console.log('\n11. Fase 1.2 — persistencia local (IndexedDB): el enganche, no la lógica interna');
// La lógica de persistencia.js (delta sync, lápidas, purga por antigüedad)
// tiene su propia prueba dedicada: pruebas/probar-persistencia.mjs. Aquí solo
// se comprueba que quedó ENGANCHADA donde debía, no que funcione — para eso
// hace falta IndexedDB de verdad, que jsdom no trae.
comprobar('existe src/js/modules/persistencia.js', fs.existsSync('src/js/modules/persistencia.js'));

const dbJs = fs.readFileSync('src/js/modules/db.js', 'utf8');
comprobar('db.js importa persistencia.js', /import\s+persistencia\s+from\s+['"]\.\/persistencia\.js['"]/.test(dbJs));
comprobar('estadoLector() guarda el resultado en el almacén local (para poder mostrarlo si se corta la conexión justo después)',
  /estadoLector\(rut\)[\s\S]*?persistencia\.guardarLectorConsultado\(\{\s*\.\.\.resultado/.test(dbJs));

comprobar('main.js importa persistencia.js', /import\s+persistencia\s+from\s+['"]\.\/modules\/persistencia\.js['"]/.test(mainJs));
comprobar('main.js arranca la sincronización en segundo plano después de iniciar sesión (no antes: sin sesión, RLS no deja leer nada)',
  /renderShell\([^)]*\)[\s\S]{0,80}iniciarSincronizacionEnSegundoPlano\(\)/.test(mainJs));
comprobar('la sincronización en segundo plano se repite sola mientras la pestaña sigue abierta',
  /setInterval\(\s*\(\)\s*=>\s*\{[\s\S]{0,200}persistencia\.sincronizarTodo\(\)/.test(mainJs));
comprobar('también se reintenta al recuperar la conexión (evento "online")',
  /addEventListener\(\s*['"]online['"][\s\S]{0,60}sincronizarTodo/.test(mainJs));

// ---------------------------------------------------------------------------
// 12. Fase 1.3 — cola de sincronización: el enganche, no la lógica interna
// (la lógica de SyncQueue, con IndexedDB y un Supabase falso controlable de
// verdad, se prueba aparte en pruebas/probar-sync-queue.mjs)
// ---------------------------------------------------------------------------
console.log('\n12. Fase 1.3 — cola de sincronización: el enganche, no la lógica interna');

const uiBaseJs = fs.readFileSync('src/js/modules/ui-base.js', 'utf8') + fs.readFileSync('src/js/modules/ui-router.js', 'utf8') + fs.readFileSync('src/js/modules/ui-modales.js', 'utf8');
// Los cinco lugares que escriben "r?.encolado" vivían todos en ui-base.js
// hasta la división del 22 de agosto de 2026; ahora quedaron repartidos entre
// src/js/vistas/prestamos.js (renovar, prestar x2) y src/js/vistas/mostrador.js
// (devolver, renovar de la ficha de circulación) — se juntan aquí solo para
// esta comprobación puntual, sin tocar uiBaseJs (las demás comprobaciones de
// esta sección sí son sobre contenido que se quedó en ui-base.js).
const todasLasVistasJs = fs.readdirSync('src/js/vistas')
  .filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(`src/js/vistas/${f}`, 'utf8'))
  .join('\n');
const uiCompletoJs = uiBaseJs + '\n' + todasLasVistasJs;

comprobar('db.js define la clase SyncQueue y exporta colaSync',
  /class SyncQueue/.test(dbJs) && /export const colaSync = new SyncQueue\(\)/.test(dbJs));
comprobar('db.js distingue un fallo de red de un rechazo real del servidor (esFalloDeRed)',
  /function esFalloDeRed\(error\)/.test(dbJs));
comprobar('registrarPrestamo() encola en vez de perder el préstamo cuando la red falla',
  /async registrarPrestamo[\s\S]{0,1200}_ejecutarRpcMuta\(\s*['"]prestar_libro['"]/.test(dbJs));
comprobar('devolverPrestamo() encola en vez de perder la devolución cuando la red falla',
  /async devolverPrestamo[\s\S]{0,1200}_ejecutarRpcMuta\(\s*['"]devolver_prestamo['"]/.test(dbJs));
comprobar('renovarPrestamo() encola en vez de perder la renovación cuando la red falla',
  /async renovarPrestamo[\s\S]{0,1200}_ejecutarRpcMuta\(\s*['"]renovar_prestamo['"]/.test(dbJs));
comprobar('consultarLibro() cae a la copia local cuando la red falla (nunca inventa un "no existe")',
  /async consultarLibro[\s\S]{0,600}consultarLibroSinConexion/.test(dbJs));
comprobar('estadoLector() cae a la copia local cuando la red falla (nunca inventa un "no existe")',
  /async estadoLector[\s\S]{0,600}estadoLectorSinConexion/.test(dbJs));
comprobar('el respaldo sin conexión de estadoLector() nunca devuelve existe:false ' +
  '(evitaría un duplicado al reconectar): lanza un error claro en su lugar',
  /async function estadoLectorSinConexion[\s\S]{0,400}throw new Error/.test(dbJs));

comprobar('main.js importa colaSync desde db.js',
  /import\s*\{\s*colaSync\s*\}\s*from\s*['"]\.\/modules\/db\.js['"]/.test(mainJs));
comprobar('main.js reintenta la cola pendiente al iniciar sesión y en cada ciclo de sincronización',
  /iniciarSincronizacionEnSegundoPlano[\s\S]{0,400}colaSync\.reintentarPendientes\(\)/.test(mainJs));

comprobar('db.js se suscribe él mismo al evento "online" para reintentar la cola ' +
  '(no depende de que main.js se acuerde de hacerlo)',
  /addEventListener\(\s*['"]online['"][\s\S]{0,60}colaSync\.reintentarPendientes\(\)/.test(dbJs));

comprobar('la interfaz distingue el resultado "encolado" del éxito normal en los catorce lugares que ' +
  'escriben (renovar, devolver x2, prestar x2, reservar, y las cuatro altas de libro/lector — la ' +
  'persona del mesón ve un aviso distinto, no un falso "listo"; algunas líneas usan r?.encolado dos ' +
  'veces, una para el mensaje y otra para el tipo de toast)',
  (uiCompletoJs.match(/r\?\.encolado/g) || []).length > 8);

// ---------------------------------------------------------------------------
// 13. Fase 1.4 — indicador de conexión: el enganche, no la lógica interna
// (colaSync.alCambiar()/estadoConexion en sí no tienen una prueba dedicada
// aparte: son puro "pegamento" entre piezas ya probadas — persistencia.js
// en probar-persistencia.mjs, SyncQueue en probar-sync-queue.mjs — así que
// comprobar el enganche estructural es lo que de verdad vale la pena aquí)
// ---------------------------------------------------------------------------
console.log('\n13. Fase 1.4 — indicador de conexión: el enganche, no la lógica interna');

comprobar('existe src/js/modules/estado-conexion.js', fs.existsSync('src/js/modules/estado-conexion.js'));

const estadoConexionJs = fs.readFileSync('src/js/modules/estado-conexion.js', 'utf8');
comprobar('estado-conexion.js se suscribe a colaSync para enterarse de cambios sin tener que preguntar por encuesta',
  /colaSync\.alCambiar\(/.test(estadoConexionJs));
comprobar('estado-conexion.js escucha los eventos "online"/"offline" del navegador',
  /addEventListener\(\s*['"]online['"]/.test(estadoConexionJs) &&
  /addEventListener\(\s*['"]offline['"]/.test(estadoConexionJs));
comprobar('estado-conexion.js expone un suscribir() que avisa de inmediato con el estado actual',
  /suscribir\(fn\)[\s\S]{0,200}fn\(this\.obtener\(\)\)/.test(estadoConexionJs));

comprobar('db.js expone alCambiar() en SyncQueue para que el indicador no tenga que hacer polling',
  /alCambiar\(fn\)/.test(dbJs));
comprobar('SyncQueue avisa a sus escuchas al encolar una operación nueva',
  /async encolar\([\s\S]{0,500}this\._avisar\(\)/.test(dbJs));
comprobar('SyncQueue avisa "sincronizando" al empezar Y al terminar de reintentar (no solo al final)',
  (dbJs.match(/this\._avisar\(\)/g) || []).length >= 3);

comprobar('main.js importa estadoConexion y lo inicia junto con el resto de la sincronización en segundo plano',
  /import\s+estadoConexion\s+from\s+['"]\.\/modules\/estado-conexion\.js['"]/.test(mainJs) &&
  /iniciarSincronizacionEnSegundoPlano[\s\S]{0,200}estadoConexion\.iniciar\(\)/.test(mainJs));

comprobar('ui-base.js importa estadoConexion', /import\s+estadoConexion\s+from\s+['"]\.\/estado-conexion\.js['"]/.test(uiBaseJs));
comprobar('renderShell monta un elemento para el indicador de conexión en la franja de título',
  /id="estado-conexion"/.test(uiBaseJs));
comprobar('renderShell se suscribe al estado de conexión (y se des-suscribe primero, por si se llama de nuevo)',
  /this\._detenerEstadoConexion\?\.\(\)[\s\S]{0,200}estadoConexion\.suscribir\(/.test(uiBaseJs));
comprobar('el indicador cubre las cuatro situaciones que pide la sección 7: en línea, sin conexión, sincronizando, N pendientes',
  /_renderIndicadorConexion/.test(uiBaseJs) &&
  /!enLinea/.test(uiBaseJs) && /sincronizando\)/.test(uiBaseJs) &&
  /pendientes > 0/.test(uiBaseJs) && /'En línea'/.test(uiBaseJs));
comprobar('el indicador nunca depende solo del color: cada estado trae también un ícono y un texto propios',
  /aria-label.*Estado de conexión/.test(uiBaseJs));

// ---------------------------------------------------------------------------
// 14. Codificación UTF-8 limpia — sin BOM, bytes de control C1 ni mojibake
// ---------------------------------------------------------------------------
console.log('\n14. Codificación UTF-8 limpia — sin BOM, caracteres de control C1 ni mojibake');

function listarArchivosTexto(dir, acum = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'vendor'].includes(entrada.name)) continue;
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      listarArchivosTexto(ruta, acum);
    } else if (/\.(html|js|mjs|css|sql)$/i.test(entrada.name)) {
      acum.push(ruta);
    }
  }
  return acum;
}

const archivosFuente = listarArchivosTexto('.');
const conBom = [];
const conControlC1 = [];
const conMojibake = [];
const patronMojibake = /Ã[¡©­³º±¼½]|Â[°¡¿]|â€[œ˜™”•]|ï»¿/;

for (const ruta of archivosFuente) {
  if (ruta.endsWith('probar-interfaz.mjs')) continue;
  const texto = fs.readFileSync(ruta, 'utf8');
  if (texto.charCodeAt(0) === 0xFEFF) conBom.push(ruta);
  if (/[\u0080-\u009f]/.test(texto)) conControlC1.push(ruta);
  if (patronMojibake.test(texto)) conMojibake.push(ruta);
}

comprobar('ningún archivo fuente (.html/.js/.css/.sql) empieza con BOM UTF-8 (rompe psycopg)',
  conBom.length === 0);
comprobar('ningún archivo fuente contiene caracteres de control C1 (0x80-0x9F, rompe parse5)',
  conControlC1.length === 0);
comprobar('ningún archivo fuente contiene secuencias de doble codificación (mojibake)',
  conMojibake.length === 0);

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pasadas} comprobaciones correctas, ${fallidas} con fallo`);
process.exit(fallidas === 0 ? 0 : 1);
