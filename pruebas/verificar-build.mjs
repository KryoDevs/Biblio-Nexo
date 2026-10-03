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
