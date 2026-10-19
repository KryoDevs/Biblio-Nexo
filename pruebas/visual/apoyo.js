import { expect } from '@playwright/test';
import { instalarDatosPrueba } from './datos-prueba.js';

export async function abrirAplicacion(page, { ancho = 393, alto = 740, tema = 'dark', escala = 1, rol = 'admin', vista = 'dashboard', sesion = true, datos = {} } = {}) {
  const errores = [];
  page.on('pageerror', error => errores.push(error.message));
  await page.setViewportSize({ width: ancho, height: alto });
  // Ninguna lectura ni escritura llega a servicios reales, tampoco los mapas.
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://localhost:4173'
    ? route.continue() : route.abort());
  await page.route('**/vendor/js/supabase.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `(${instalarDatosPrueba.toString()})(${JSON.stringify({ ...datos, rol, sesion })});`
  }));
  await page.addInitScript(({ tema, escala }) => {
    localStorage.setItem('theme', tema);
    localStorage.setItem('biblionexo-escala-fuente', String(escala));
  }, { tema, escala });
  await page.goto(`/?vista=${vista}`);
  await page.waitForFunction(() => window.__appBooted);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#retry-view-btn')).toHaveCount(0);
  expect(errores).toEqual([]);
  return errores;
}

export async function sinDesborde(locator) {
  const medidas = await locator.evaluate(el => ({ ancho: el.clientWidth, contenido: el.scrollWidth }));
  expect(medidas.contenido).toBeLessThanOrEqual(medidas.ancho + 1);
}

export async function menuCerrado(page) {
  await expect(page.locator('#sidebar')).not.toHaveClass(/\bactive\b/);
  await expect(page.locator('#sidebar')).toHaveAttribute('inert', '');
  await expect(page.locator('#sidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#sidebar-overlay')).toBeHidden();
  await expect(page.locator('#app-main')).not.toHaveAttribute('inert');
  await expect(page.locator('body')).not.toHaveClass(/mobile-drawer-open/);
  for (const id of ['sidebar-toggle-btn-mobile', 'mobile-menu-btn']) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-expanded', 'false');
  }
}


export async function contrasteTexto(texto) {
  return texto.evaluate(el => {
    const contexto = document.createElement('canvas').getContext('2d');
    const rgba = color => {
      contexto.clearRect(0, 0, 1, 1);
      contexto.fillStyle = color;
      contexto.fillRect(0, 0, 1, 1);
      return [...contexto.getImageData(0, 0, 1, 1).data];
    };
    const luminancia = rgb => {
      const [r, g, b] = rgb.slice(0, 3).map(c => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    let padre = el;
    let fondo;
    // Estas tarjetas tienen fondo opaco; saltar controles transparentes.
    do {
      fondo = rgba(getComputedStyle(padre).backgroundColor);
      padre = padre.parentElement;
    } while (fondo[3] === 0 && padre);
    const tinta = luminancia(rgba(getComputedStyle(el).color));
    const papel = luminancia(fondo);
    return (Math.max(tinta, papel) + 0.05) / (Math.min(tinta, papel) + 0.05);
  });
}
