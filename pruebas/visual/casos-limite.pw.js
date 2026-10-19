import { test, expect } from '@playwright/test';
import { abrirAplicacion, sinDesborde, contrasteTexto } from './apoyo.js';

async function cajaEnPantalla(page, caja) {
  const r = await caja.boundingBox();
  const { width, height } = page.viewportSize();
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.y).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
  expect(r.y + r.height).toBeLessThanOrEqual(height + 1);
  await sinDesborde(caja);
}

async function liberar(page, indice = 0) {
  await page.evaluate(indice => window.__controlPruebasUI.pendientes.splice(indice, 1)[0].resolver(), indice);
  // Deja terminar las microtareas de las respuestas liberadas y el repintado.
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

for (const [ancho, alto] of [[320, 568], [640, 360]]) {
  test(`seleccionar lector al prestar: ${ancho}×${alto}, letra grande`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, alto, escala: 1.3, vista: 'catalog' });
    const acceso = page.locator('.loan-book-btn').first();
    await acceso.click();
    const input = page.locator('#lector-search-input');
    await input.fill('Prueba');
    await expect(page.locator('#lector-search-results button')).toHaveCount(2);
    expect(await contrasteTexto(input)).toBeGreaterThanOrEqual(4.5);
    await cajaEnPantalla(page, input.locator('../..'));
    await expect(page.locator('.ui-modal-overlay')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(acceso).toBeFocused();
  });
}

test('Escape cierra solo el aviso superior y devuelve el foco a la lista', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'loans' });
  await page.evaluate(() => window.uiManager.showBulkNotifyModal(window.uiManager._loansCache));
  const lista = page.locator('.ui-modal-overlay').first();
  const avisar = lista.locator('[data-notify-id]').first();
  await avisar.click();
  await expect(page.locator('.ui-modal-overlay')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-modal-overlay')).toHaveCount(1);
  await expect(avisar).toBeFocused();
  await expect(lista).not.toHaveAttribute('inert');
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
});

test('el diálogo toma el foco, bloquea el fondo y limpia el bloqueo al cambiar de sesión', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'catalog' });
  await page.locator('.edit-book-btn').first().click();
  await expect(page.locator('#edit-book-title')).toBeFocused();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  expect(await page.locator('.ui-dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.evaluate(() => window.uiManager.renderLogin());
  await expect(page.locator('.ui-modal-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-abierto/);
  await expect(page.locator('#login-screen')).not.toHaveAttribute('inert');
  await page.locator('#email-input').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#email-input')).toBeFocused();
});

test('los errores no quedan detrás del diálogo', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'catalog' });
  await page.locator('.edit-book-btn').first().click();
  await page.evaluate(() => window.uiManager.showToast('No se pudo guardar. Revisa los datos e inténtalo otra vez.', 'error'));
  const aviso = page.locator('#toast-container > div');
  await expect(aviso).toBeVisible();
  await cajaEnPantalla(page, aviso);
  expect(await aviso.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
});

for (const pantalla of ['renderNuevaPassword', 'renderCompletarInvitacion']) {
  test(`acceso con poco alto: ${pantalla}`, async ({ page }) => {
    await abrirAplicacion(page, { ancho: 640, alto: 360, escala: 1.3 });
    await page.evaluate(pantalla => window.uiManager[pantalla](), pantalla);
    const panel = page.locator('.login-panel');
    expect((await panel.boundingBox()).y).toBeGreaterThanOrEqual(0);
    await sinDesborde(panel);
    const guardar = panel.locator('button[type="submit"]');
    await guardar.scrollIntoViewIfNeeded();
    await expect(guardar).toBeInViewport();
    await panel.locator('input').first().scrollIntoViewIfNeeded();
    await expect(panel.locator('input').first()).toBeInViewport();
  });
}

for (const ancho of [768, 1024]) {
  test(`formularios con ancho útil, no solo sin overflow: ${ancho}px al 130 %`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, escala: 1.3, vista: 'catalog' });
    for (const [vista, selector] of [
      ['catalog', '#add-book-form input:not([type="checkbox"])'],
      ['users', '#add-user-form input:not([type="checkbox"]):not([type="radio"])'],
      ['profile', '#perfil-form input, #password-form input']
    ]) {
      await page.evaluate(vista => window.uiManager.switchView(vista), vista);
      if (vista === 'users') {
        await page.locator('#new-user-minor').check();
        await expect(page.locator('#new-guardian-fields')).toBeVisible();
      }
      for (const input of await page.locator(selector).all()) {
        expect((await input.boundingBox()).width, `${vista}: ${await input.getAttribute('id')}`).toBeGreaterThanOrEqual(180);
      }
    }
  });
}

test('nombres y correos completos en las tarjetas de lectores', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 320, escala: 1.3, vista: 'users' });
  for (const texto of await page.locator('#users-cards-mobile p').all()) await sinDesborde(texto);
});

test('las leyendas de los gráficos no desaparecen en tableta con letra grande', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 1024, escala: 1.3 });
  for (const texto of await page.locator('[id$="-legend"] .flex-1').all()) await sinDesborde(texto);
});

test('el reporte impreso no incluye la barra móvil ni recorta páginas', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'reports' });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#mobile-bottom-nav')).toBeHidden();
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('#reporte-chart')).toHaveCSS('object-fit', 'contain');
  await expect(page.locator('#views-container')).toHaveCSS('animation-name', 'none');
  for (const etiqueta of await page.locator('#report-sheet .reporte-etiqueta').all()) {
    expect(await contrasteTexto(etiqueta)).toBeGreaterThanOrEqual(4.5);
  }
  await expect(page.locator('.app-shell')).toHaveCSS('overflow', 'visible');
  const alto = await page.locator('.app-shell').evaluate(el => ({ visible: el.clientHeight, total: el.scrollHeight }));
  expect(alto.total).toBeLessThanOrEqual(alto.visible + 1);
  await expect(page.locator('#report-sheet h2')).toHaveCSS('color', 'rgb(28, 25, 23)');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.uiManager.switchView('users'));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.ficha-lector').first()).toHaveCSS('opacity', '1');
});

test('una vista lenta no desplaza al inicio la sección nueva', async ({ page }) => {
  await abrirAplicacion(page);
  await page.evaluate(() => {
    window.__controlPruebasUI.pausas.add('rpc:buscar_libros');
    window.__navegacionPendiente = window.uiManager.switchView('catalog');
  });
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(1);
  await page.evaluate(() => window.uiManager.switchView('users'));
  await page.locator('#views-container').evaluate(el => el.scrollTo({ top: 240, behavior: 'instant' }));
  await page.evaluate(() => window.__controlPruebasUI.pausas.clear());
  await liberar(page);
  await page.evaluate(() => window.__navegacionPendiente);
  await expect.poll(() => page.locator('#views-container').evaluate(el => el.scrollTop)).toBe(240);
});

test('una búsqueda anterior no reemplaza al lector que se acaba de buscar', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'catalog' });
  await page.locator('.loan-book-btn').first().click();
  await page.evaluate(() => window.__controlPruebasUI.pausas.add('tabla:lectores'));
  await page.locator('#lector-search-input').fill('Uno');
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(1);
  await page.locator('#lector-search-input').fill('Extensos');
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(2);
  await liberar(page, 1);
  await expect(page.locator('#lector-search-results')).toContainText('Extensos');
  await liberar(page);
  await expect(page.locator('#lector-search-results')).toContainText('Extensos');
  await expect(page.locator('#lector-search-results')).not.toContainText('Uno');
});

test('una búsqueda lenta no invalida el filtro nuevo del catálogo', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'catalog', datos: { agotados: true } });
  await page.evaluate(() => window.__controlPruebasUI.pausas.add('rpc:buscar_libros'));
  await page.locator('#catalog-search-input').fill('Subterra');
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(1);
  await page.evaluate(() => window.__controlPruebasUI.pausas.clear());
  await page.locator('[data-filter="prestados"]').click();
  await expect(page.locator('.ficha-libro')).toHaveCount(0);
  await liberar(page);
  await expect(page.locator('.ficha-libro')).toHaveCount(0);
});

async function liberarTodas(page) {
  await page.evaluate(() => {
    window.__controlPruebasUI.pausas.clear();
    window.__controlPruebasUI.pendientes.splice(0).forEach(p => p.resolver());
  });
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

test('el texto escrito en los campos sigue legible al cambiar de tema', async ({ page }) => {
  await abrirAplicacion(page, { tema: 'light' });
  for (const tema of ['light', 'dark', 'light']) {
    if (await page.locator('html').evaluate(el => el.classList.contains('dark')) !== (tema === 'dark')) {
      await page.locator('#mobile-header .dark-mode-toggle').click();
    }
    for (const [vista, selector] of [['catalog', '#new-book-title'], ['users', '#new-user-name'], ['profile', '#perfil-nombre'], ['scanner', '#manual-scan-input']]) {
      await page.evaluate(vista => window.uiManager.switchView(vista), vista);
      const input = page.locator(selector);
      await input.fill('Texto de prueba');
      expect(await contrasteTexto(input), `${vista}, ${tema}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('la lista de lectores conserva la última búsqueda si las respuestas se invierten', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'users' });
  await page.evaluate(() => window.__controlPruebasUI.pausas.add('tabla:lectores'));
  await page.locator('#user-search-input').fill('Uno');
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(1);
  await page.locator('#user-search-input').fill('Extensos');
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(2);
  await liberar(page, 1);
  await expect(page.locator('#users-cards-mobile')).toContainText('Extensos');
  await liberar(page);
  await expect(page.locator('#users-cards-mobile')).toContainText('Extensos');
});

test('el reporte mantiene el último período elegido ante una respuesta tardía', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'reports' });
  await page.evaluate(() => window.__controlPruebasUI.pausas.add('tabla:prestamos'));
  await page.locator('[data-period="dia"]').click();
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.__controlPruebasUI.pausas.clear());
  await page.locator('[data-period="anio"]').click();
  await expect(page.locator('#report-sheet h2')).toContainText('Este año');
  await liberarTodas(page);
  await expect(page.locator('#report-sheet h2')).toContainText('Este año');
});

test('el listado de préstamos conserva el último filtro ante una respuesta tardía', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'loans' });
  await page.evaluate(() => window.__controlPruebasUI.pausas.add('tabla:prestamos'));
  await page.locator('.loan-filter-btn[data-filter="vencidos"]').click();
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.__controlPruebasUI.pausas.clear());
  await page.locator('.loan-filter-btn[data-filter="porVencer"]').click();
  const activo = page.locator('.loan-filter-btn[data-filter="porVencer"]');
  await expect(activo).toHaveClass(/bg-patrimonio-lago/);
  await liberarTodas(page);
  await expect(activo).toHaveClass(/bg-patrimonio-lago/);
});

for (const tema of ['light', 'dark']) {
  test(`vistas vacías en ${tema}, sin desbordes ni errores`, async ({ page }) => {
    const errores = await abrirAplicacion(page, { ancho: 320, escala: 1.3, tema, datos: { vacio: true } });
    for (const vista of ['dashboard', 'catalog', 'users', 'loans', 'reports', 'bibliomovil']) {
      await page.evaluate(vista => window.uiManager.switchView(vista), vista);
      await expect(page.locator('#retry-view-btn')).toHaveCount(0);
      await expect(page.locator('#views-container')).not.toContainText(/NaN|undefined/);
      await sinDesborde(page.locator('#views-container'));
    }
    expect(errores).toEqual([]);
  });
}

test('cancelar una búsqueda pendiente no reabre el diálogo ni cambia el foco', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'catalog' });
  const abrir = page.locator('.loan-book-btn').first();
  await abrir.click();
  await page.evaluate(() => window.__controlPruebasUI.pausas.add('tabla:lectores'));
  await page.locator('#lector-search-input').fill('Prueba');
  await expect.poll(() => page.evaluate(() => window.__controlPruebasUI.pendientes.length)).toBe(1);
  await page.keyboard.press('Escape');
  await liberarTodas(page);
  await expect(page.locator('.ui-modal-overlay')).toHaveCount(0);
  await expect(abrir).toBeFocused();
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
});

test('los avisos de éxito, error e información conservan contraste', async ({ page }) => {
  await abrirAplicacion(page);
  for (const tipo of ['success', 'error', 'info']) {
    await page.evaluate(tipo => window.uiManager.showToast('Mensaje de prueba legible', tipo), tipo);
    const aviso = page.locator('#toast-container > div').last();
    expect(await contrasteTexto(aviso), tipo).toBeGreaterThanOrEqual(4.5);
  }
});

for (const ancho of [844, 1024]) {
  test(`diálogo con texto largo en pantalla ancha y baja: ${ancho}×360`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, alto: 360, escala: 1.3 });
    await page.evaluate(() => { void window.uiManager.showConfirm(`Revisa este identificador: ${'EjemploSinEspacios'.repeat(20)}`); });
    const dialogo = page.locator('.ui-dialog');
    await cajaEnPantalla(page, dialogo);
    const cancelar = dialogo.locator('[data-action="cancel"]');
    await cancelar.scrollIntoViewIfNeeded();
    await expect(cancelar).toBeInViewport();
    await cancelar.click();
    await expect(dialogo).toHaveCount(0);
  });
}

test('la hoja de ruta conserva su impresión independiente y limpia al terminar', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'bibliomovil' });
  await page.evaluate(() => {
    window.__impresionesPrueba = 0;
    window.print = () => { window.__impresionesPrueba++; };
    window.uiManager._bibliomovilPlan = {
      origen: { nombre: 'Salida de prueba', lat: -40.13, lon: -72.4 },
      paradas: [{ id: 'parada-prueba', nombre: 'Parada de prueba', lat: -40.14, lon: -72.41 }]
    };
    window.uiManager._imprimirHojaRutaBibliomovil();
  });
  const hoja = page.locator('#hoja-ruta-bibliomovil');
  await expect(hoja).toBeHidden();
  expect(await page.evaluate(() => window.__impresionesPrueba)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(hoja).toBeVisible();
  await expect(page.locator('.app-shell')).toBeHidden();
  await expect(hoja.locator('li')).toHaveCount(2);
  await expect(hoja).toContainText('Parada de prueba');
  expect(await contrasteTexto(hoja.locator('h1'))).toBeGreaterThanOrEqual(4.5);
  await sinDesborde(hoja);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await expect(hoja).toHaveCount(0);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/imprimiendo-hoja-ruta/);
});
