import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const htmlPath = path.join(DIST, 'index.html');
assert.ok(fs.existsSync(htmlPath), 'Falta dist/index.html. Ejecuta npm run build antes de esta prueba.');

const pagina = fs.readFileSync(htmlPath, 'utf8');
const enlacesManifest = [...pagina.matchAll(/<link\b[^>]*rel=["']manifest["'][^>]*>/gi)];
assert.equal(enlacesManifest.length, 1, `Se esperaba un único link de manifest; se encontraron ${enlacesManifest.length}.`);
assert.match(enlacesManifest[0][0], /href=["']\/manifest\.json["']/i, 'El único manifest debe apuntar a /manifest.json.');

const manifestPath = path.join(DIST, 'manifest.json');
assert.ok(fs.existsSync(manifestPath), 'Falta dist/manifest.json.');
assert.ok(!fs.existsSync(path.join(DIST, 'manifest.webmanifest')), 'No debe generarse un segundo manifest alternativo.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.lang, 'es-CL', 'El idioma del manifest debe coincidir con la aplicación.');
assert.equal(manifest.start_url, '/index.html');
assert.equal(manifest.scope, '/');
assert.equal(manifest.short_name, 'BiblioNexo');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'El manifest debe declarar ambos íconos.');
for (const icon of manifest.icons) {
  const assetPath = path.join(DIST, icon.src.replace(/^\//, ''));
  assert.ok(fs.existsSync(assetPath), `No existe el ícono ${icon.src} declarado por el manifest.`);
}

const referencias = [...pagina.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map(match => match[1])
  .filter(url => url.startsWith('/assets/'));
for (const url of referencias) {
  assert.ok(fs.existsSync(path.join(DIST, url.slice(1))), `No existe el recurso empaquetado ${url}.`);
}
assert.ok(!/\b(?:src|href)=["']\/src\//.test(pagina), 'El build no debe dejar referencias a /src/.');

for (const archivo of ['index.html', 'escaneo-remoto.html', 'privacidad.html', '404.html']) {
  const ruta = path.join(DIST, archivo);
  assert.ok(fs.existsSync(ruta), `Falta dist/${archivo}.`);
  const contenido = fs.readFileSync(ruta, 'utf8');
  const recursosVendor = [...contenido.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(url => url.startsWith('/vendor/'));
  assert.ok(recursosVendor.length > 0, `dist/${archivo} no referencia recursos locales de vendor.`);
  for (const recurso of recursosVendor) {
    assert.ok(fs.existsSync(path.join(DIST, recurso.slice(1))), `No existe el recurso local ${recurso} usado por ${archivo}.`);
  }
}

console.log('Build: manifest único válido (es-CL), íconos y recursos locales empaquetados encontrados.');

/* ------------------------------------------------------------------ *
 * Señales públicas (auditoría de octubre de 2026)
 * ------------------------------------------------------------------ *
 * Canonical, Open Graph, robots.txt, sitemap.xml y llms.txt se generan a
 * partir de una sola constante de `vite.config.js`. Que el build los deje en
 * su sitio, con URL absoluta y todos apuntando al MISMO origen, es lo que esta
 * parte comprueba — sin copiar acá el dominio, para que el día que llegue el
 * dominio propio la prueba no sea un segundo lugar que actualizar.
 */
const PAGINAS = ['index.html', 'privacidad.html', 'escaneo-remoto.html', '404.html'];
const leidas = new Map(PAGINAS.map(nombre => [nombre, fs.readFileSync(path.join(DIST, nombre), 'utf8')]));

// Los HTML de este proyecto explican sus decisiones en comentarios, y esos
// comentarios citan justamente las etiquetas que esta prueba busca (un
// `rel="canonical"` mencionado es un comentario, no una etiqueta). Las
// comprobaciones de presencia y ausencia se hacen sobre el marcado limpio;
// la de los tokens se hace sobre TODO el archivo, porque un token sin
// sustituir dentro de un comentario delata la misma página mal procesada.
const sinComentarios = new Map([...leidas].map(([nombre, html]) => [nombre, html.replace(/<!--[\s\S]*?-->/g, '')]));

// Ningún token puede quedar a la vista: si un HTML nuevo no está en
// `build.rollupOptions.input`, `senalesPublicas()` no lo procesa y esto lo
// agarra. Un `href="__ORIGEN__/"` servido es peor que no tener canonical.
for (const [nombre, contenido] of leidas) {
  assert.ok(!/__ORIGEN__|__IMAGEN_SOCIAL__/.test(contenido),
    `dist/${nombre} tiene un token de vite.config.js sin sustituir.`);
}

// La portada define el origen esperado; las demás señales tienen que coincidir.
const enlacesCanonical = [...leidas.get('index.html').matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/gi)];
assert.equal(enlacesCanonical.length, 1, 'dist/index.html debe tener un único rel="canonical".');
const ORIGEN = new URL(enlacesCanonical[0][1]).origin;
assert.match(ORIGEN, /^https:\/\/[^/]+$/, 'El canonical de la portada debe ser una URL https absoluta, sin ruta.');
assert.equal(new URL(enlacesCanonical[0][1]).pathname, '/', 'El canonical de la portada debe apuntar a la raíz, no a /index.html.');

const metaDe = (contenido, nombre) => {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${nombre}["'][^>]*content=["']([^"']*)["']`, 'i');
  return (contenido.match(re) || [])[1];
};
const absolutasMismoOrigen = (contenido, claves, archivo) => {
  for (const clave of claves) {
    const valor = metaDe(contenido, clave);
    assert.ok(valor !== undefined, `dist/${archivo} no tiene <meta ${clave}>.`);
    let url;
    try {
      url = new URL(valor);
    } catch {
      assert.fail(`dist/${archivo}: ${clave}="${valor}" no es una URL absoluta (Open Graph descarta las relativas).`);
    }
    assert.equal(url.origin, ORIGEN, `dist/${archivo}: ${clave} apunta a otro origen que el canonical.`);
  }
};
absolutasMismoOrigen(leidas.get('index.html'), ['og:url', 'og:image', 'twitter:image'], 'index.html');
absolutasMismoOrigen(leidas.get('privacidad.html'), ['og:url', 'og:image'], 'privacidad.html');

// La imagen social declarada tiene que existir y ser la que se recorta.
const imagen = metaDe(leidas.get('index.html'), 'og:image');
const rutaImagen = path.join(DIST, new URL(imagen).pathname.replace(/^\//, ''));
assert.ok(fs.existsSync(rutaImagen), `La og:image declarada no está en el build: ${new URL(imagen).pathname}.`);
assert.match(leidas.get('index.html'), /og:image:width["']\s+content="1200"/, 'La og:image debe declarar 1200 de ancho.');
assert.match(leidas.get('index.html'), /og:image:alt["']\s+content="[^"]/, 'Toda og:image necesita su texto alternativo.');
assert.equal(metaDe(leidas.get('index.html'), 'twitter:card'), 'summary_large_image',
  'Sin twitter:card, X no usa la imagen grande.');

// Las dos páginas con `noindex` no deben contradecirse con un canonical.
for (const archivo of ['404.html', 'escaneo-remoto.html']) {
  const contenido = sinComentarios.get(archivo);
  assert.match(contenido, /<meta\s+name="robots"\s+content="[^"]*noindex/, `dist/${archivo} perdió su noindex.`);
  assert.ok(!/rel=["']canonical["']/.test(contenido), `dist/${archivo}: un noindex y un canonical juntos son una señal contradictoria.`);
}
// `/privacidad.html` es la otra página pública: canonical propio, sin noindex.
assert.match(sinComentarios.get('privacidad.html'), /rel="canonical"/, 'dist/privacidad.html debe llevar su canonical.');
assert.ok(!/name="robots"/.test(sinComentarios.get('privacidad.html')), 'La política de privacidad no debe llevar noindex.');

// Los tres archivos que no pertenecen a ninguna ruta de la aplicación.
const robots = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const llms = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');
assert.match(robots, new RegExp(`^Sitemap: ${ORIGEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap\\.xml$`, 'm'),
  'El robots.txt debe anunciar el sitemap en el mismo origen del canonical.');
assert.ok(!/^Disallow:.*\.(?:css|js)/m.test(robots),
  'Bloquear .css o .js en robots.txt impide que los buscadores rendericen la página.');
for (const [bloque, nombre] of [[robots, 'robots.txt'], [llms, 'llms.txt']]) {
  assert.ok(bloque.trim().length > 40, `dist/${nombre} está casi vacío.`);
}
const entradas = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
assert.equal(entradas.length, 2, 'Se esperaban las dos páginas públicas en el sitemap.');
for (const loc of entradas) {
  assert.equal(new URL(loc).origin, ORIGEN, `El sitemap tiene una entrada de otro origen: ${loc}.`);
  assert.ok(!/escaneo-remoto|404/.test(loc), `El sitemap no debe incluir rutas con noindex: ${loc}.`);
}
assert.match(sitemap, /<urlset[^>]*sitemaps\.org/, 'El sitemap debe usar el esquema estándar.');
// Un sitemap mal formado se ignora en silencio, sin error visible en ningún
// lado. La comprobación de arriba lee las etiquetas `<loc>` con regex y no
// alcanza a ver un `<url>` mal cerrado o un resto de array de JavaScript
// convertido a texto (comas sueltas), que es como se ve un `.join()` puesto
// sobre la lista equivocada.
const sitemapLimpio = sitemap.replace(/<!--[\s\S]*?-->/g, '');
assert.ok(!/,/.test(sitemapLimpio), 'El sitemap.xml tiene comas: algo se serializó como lista en vez de como líneas.');
assert.equal((sitemap.match(/<url>/g) || []).length, entradas.length,
  'Cada <loc> debe estar dentro de su propio <url>.');
// Enlace del robots.txt roto = 404 en el rastreo.
for (const url of [...llms.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1])) {
  assert.equal(new URL(url).origin, ORIGEN, `llms.txt enlaza a otro origen: ${url}.`);
}

// Source maps anunciados pero ausentes: el comentario de un vendorizado que no
// trae su `.map` deja un 404 colgado en la consola (pasaba con chart.umd.js).
const pila = [DIST];
while (pila.length) {
  const carpeta = pila.pop();
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) { pila.push(ruta); continue; }
    if (!entrada.name.endsWith('.js')) continue;
    const codigo = fs.readFileSync(ruta, 'utf8');
    for (const referencia of codigo.matchAll(/\/\/[#@]\s*sourceMappingURL=(\S+)/g)) {
      const destino = referencia[1].startsWith('/')
        ? path.join(DIST, referencia[1].slice(1))
        : path.resolve(path.dirname(ruta), referencia[1]);
      assert.ok(fs.existsSync(destino), `${path.relative(DIST, ruta)} anuncia ${referencia[1]} y ese archivo no existe.`);
    }
  }
}

console.log('Señales públicas: canonical y Open Graph absolutos en un solo origen, noindex coherente, robots/sitemap/llms generados y sin source maps huérfanos.');
