import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import UIRouter from '../ui-router.js';

/**
 * Título del documento y encabezado principal del área de trabajo.
 *
 * Nacieron con la auditoría de octubre de 2026 sobre las «20 señales de un
 * sitio vibecodeado», que en BiblioNexo encontraron dos reales:
 *
 *   · señal 5 — `document.title` no se tocaba nunca, así que las nueve vistas
 *     del panel eran la misma pestaña para el navegador (y nueve entradas
 *     idénticas en el historial).
 *   · señal 10 — la aplicación autenticada no tenía ningún `<h1>`: la franja
 *     de título empezaba en `<h2>` y las secciones dentro en `<h3>`.
 */

const BASE = 'BiblioNexo — Biblioteca Municipal de Futrono';

// El shell real lo arma `renderShell()`, que necesita sesión, listeners y
// media query. Para probar el título basta el fragmento que `switchView()`
// consulta: la franja de título y el contenedor de la vista.
function montarFranja() {
  // `switchView()` baja el scroll al cambiar de vista, igual que una app
  // nativa. jsdom no implementa `window.scrollTo` y lo avisa en cada llamada:
  // tres líneas de ruido por prueba, sin significado. Se reemplaza, no se
  // ignora el aviso, para que una prueba futura pueda notar si el scroll
  // desaparece de verdad del código.
  window.scrollTo = () => {};
  document.body.innerHTML = `
    <p id="page-kicker">Panel</p>
    <h1 id="page-title">Dashboard</h1>
    <main id="views-container"></main>
  `;
}

describe('UIRouter — título de la pestaña por vista', () => {
  const sustituidos = new Map();

  // Se reemplazan solo los renderizadores que la prueba invoca, y se devuelven
  // al terminar: el resto del módulo es el mismo de producción.
  function falsoRenderizador(nombre) {
    sustituidos.set(nombre, UIRouter[nombre]);
    UIRouter[nombre] = async () => {
      document.getElementById('views-container').innerHTML = '<h3>vista simulada</h3>';
    };
  }

  afterEach(() => {
    for (const [nombre, original] of sustituidos) UIRouter[nombre] = original;
    sustituidos.clear();
    document.body.innerHTML = '';
    document.title = BASE;
  });

  it('pone el nombre de la vista delante del del sistema', () => {
    expect(UIRouter._tituloDocumento({ id: 'catalog', label: 'Catálogo', section: 'Operación' }))
      .toBe('Catálogo — BiblioNexo');
  });

  it('deja el Dashboard con el título de la portada, sin sufijo', () => {
    expect(UIRouter._tituloDocumento({ id: 'dashboard', label: 'Dashboard', section: 'Panel' })).toBe(BASE);
  });

  it('no rompe con una vista desconocida ni con una etiqueta vacía', () => {
    expect(UIRouter._tituloDocumento(undefined)).toBe(BASE);
    expect(UIRouter._tituloDocumento({ id: 'rara', label: '   ' })).toBe(BASE);
  });

  it('actualiza el título al cambiar de vista', async () => {
    montarFranja();
    UIRouter.currentUserRole = 'librero';
    falsoRenderizador('renderCatalog');

    await UIRouter.switchView('catalog');

    expect(document.title).toBe('Catálogo — BiblioNexo');
    expect(document.getElementById('page-title').textContent).toBe('Catálogo');
    expect(document.getElementById('page-kicker').textContent).toBe('Operación');
  });

  it('restaura el título de la portada al volver al Dashboard', async () => {
    montarFranja();
    UIRouter.currentUserRole = 'librero';
    falsoRenderizador('renderCatalog');
    falsoRenderizador('renderDashboard');

    await UIRouter.switchView('catalog');
    expect(document.title).toBe('Catálogo — BiblioNexo');

    await UIRouter.switchView('dashboard');
    expect(document.title).toBe(BASE);
  });
});

describe('UIRouter — jerarquía de encabezados del shell', () => {
  // `import.meta.url` no sirve para esto bajo el entorno jsdom de Vitest: la
  // URL del módulo es del servidor de pruebas, no del disco. Vitest se ejecuta
  // desde la raíz del repositorio (así lo hace `npm test`), y de ahí se resuelve.
  const fuente = readFileSync(resolve(process.cwd(), 'src/js/modules/ui-router.js'), 'utf8');

  // La plantilla del shell se lee como texto, no montándola: `renderShell()`
  // exige sesión, `matchMedia` y una decena de controles, y lo que se quiere
  // vigilar aquí es solo qué etiqueta usa la franja de título.
  it('la franja de título es un H1, no un H2', () => {
    expect(fuente).toMatch(/<h1 id="page-title"/);
    expect(fuente).not.toMatch(/<h2 id="page-title"/);
  });
});
