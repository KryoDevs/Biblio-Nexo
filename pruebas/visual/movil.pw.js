import { test, expect } from '@playwright/test';
import { abrirAplicacion, sinDesborde, menuCerrado, contrasteTexto } from './apoyo.js';

for (const ancho of [320, 360, 393, 412, 640, 767, 768, 769, 1024, 1440]) {
  for (const tema of ['light', 'dark']) {
    test(`estructura sin desplazamiento lateral: ${ancho}px, ${tema}`, async ({ page }) => {
      await abrirAplicacion(page, { ancho, tema });
      const contenido = await page.locator('#views-container').boundingBox();
      const sidebar = page.locator('#sidebar');
      await sinDesborde(page.locator('#views-container'));
      if (ancho < 768) {
        expect(contenido.x).toBe(0);
        expect(contenido.width).toBe(ancho);
        await expect(sidebar).toHaveCSS('position', 'fixed');
        await expect(sidebar).toHaveCSS('visibility', 'hidden');
        await menuCerrado(page);
        await sinDesborde(page.locator('#mobile-header'));
        for (const selector of ['#sidebar-toggle-btn-mobile', '#notificaciones-btn-mobile', '#mobile-header .dark-mode-toggle', '.mobile-nav-btn']) {
          for (const boton of await page.locator(selector).all()) {
            const r = await boton.boundingBox();
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x + r.width).toBeLessThanOrEqual(ancho + 1);
            expect(r.width).toBeGreaterThanOrEqual(44);
            expect(r.height).toBeGreaterThanOrEqual(44);
          }
        }
        const barra = await page.locator('#mobile-bottom-nav').boundingBox();
        expect(barra.y + barra.height).toBe(740);
        await expect(page.locator('#mobile-menu-btn')).toHaveClass(/is-active/);
      } else {
        await expect(sidebar).toHaveCSS('position', 'relative');
        await expect(sidebar).not.toHaveAttribute('inert');
        expect(contenido.x).toBe((await sidebar.boundingBox()).width);
        expect(contenido.x + contenido.width).toBe(ancho);
        await expect(page.locator('#mobile-header')).toBeHidden();
        await expect(page.locator('#mobile-bottom-nav')).toBeHidden();
        await expect(page.locator('.franja-titulo')).toBeVisible();
      }
    });
  }
}

for (const [ancho, alto, escala] of [[320, 568, 1], [393, 740, 1], [640, 360, 1.3]]) {
  test(`menú: abrir, cerrar, navegar y desplazar a ${ancho}×${alto}, escala ${escala}`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, alto, escala });
    for (const apertura of ['sidebar-toggle-btn-mobile', 'mobile-menu-btn']) {
      await page.locator(`#${apertura}`).click();
      await expect(page.locator('#sidebar')).toHaveCSS('visibility', 'visible');
      await expect(page.locator('#sidebar')).toHaveAttribute('aria-modal', 'true');
      await expect(page.locator('#app-main')).toHaveAttribute('inert', '');
      await expect(page.locator('#sidebar-close-btn')).toBeFocused();
      await expect(page.locator('#sidebar-toggle-btn-mobile')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#mobile-menu-btn')).toHaveAttribute('aria-expanded', 'true');
      expect((await page.locator('#views-container').boundingBox()).x).toBe(0);
      await sinDesborde(page.locator('#sidebar'));
      await expect(page.locator('body')).not.toHaveCSS('touch-action', 'none');
      await expect(page.locator('#nav-menu')).toHaveCSS('touch-action', 'pan-y');
      // Una actualización asíncrona del badge no puede cerrar el menú.
      await page.evaluate(() => window.uiManager._actualizarBadgeAtrasados());
      await expect(page.locator('#sidebar')).toHaveClass(/active/);
      // Regenerar la navegación conserva estado y un destino de foco válido.
      await page.evaluate(() => window.uiManager.renderNavMenu());
      await expect(page.locator('#sidebar')).toHaveClass(/active/);
      await expect(page.locator('#mobile-menu-btn')).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#logout-btn')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#sidebar-close-btn')).toBeFocused();
      await page.keyboard.press('Escape');
      await menuCerrado(page);
      await expect(page.locator(`#${apertura}`)).toBeFocused();
    }
    await page.locator('#mobile-menu-btn').click();
    await page.locator('#sidebar-close-btn').click();
    await menuCerrado(page);
    await page.locator('#mobile-menu-btn').click();
    await page.locator('#sidebar-overlay').click({ position: { x: ancho - 8, y: 100 } });
    await menuCerrado(page);
    await page.locator('#mobile-menu-btn').click();
    await page.locator('#nav-menu [data-view="catalog"]').click();
    await expect(page.locator('#add-book-form')).toBeVisible();
    await menuCerrado(page);
    await page.locator('#mobile-menu-btn').click();
    await page.locator('#perfil-btn').click();
    await expect(page.locator('#perfil-form')).toBeVisible();
    await menuCerrado(page);
  });
}

test('rotación, cambio de altura y remontaje no dejan overlay ni bloqueos', async ({ page }) => {
  await abrirAplicacion(page);
  await page.locator('#mobile-menu-btn').click();
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(page.locator('#sidebar-overlay')).toBeHidden();
  await expect(page.locator('#sidebar')).not.toHaveAttribute('inert');
  await expect(page.locator('#app-main')).not.toHaveAttribute('inert');
  await page.setViewportSize({ width: 393, height: 520 });
  await menuCerrado(page);
  expect((await page.locator('.app-shell').boundingBox()).height).toBe(520);
  await page.locator('#mobile-menu-btn').click();
  await page.evaluate(() => window.uiManager.renderShell({ email: 'personal.pruebas@biblionexo.test' }));
  await menuCerrado(page);
  await page.locator('#mobile-menu-btn').click();
  await page.locator('#logout-btn').click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/mobile-drawer-open/);
});

for (const [ancho, alto, escala] of [[320, 568, 1], [393, 740, 1], [640, 360, 1.3]]) {
  test(`notificaciones dentro de la pantalla: ${ancho}×${alto}`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, alto, escala });
    await page.locator('#notificaciones-btn-mobile').click();
    const panel = page.locator('#notificaciones-panel-mobile');
    await expect(panel).toBeVisible();
    // Una lista larga debe desplazarse dentro del panel, sin tapar la barra.
    await page.locator('#notificaciones-lista-mobile').evaluate(lista => {
      const item = lista.firstElementChild;
      for (let i = 0; i < 15; i++) lista.append(item.cloneNode(true));
    });
    const caja = await panel.boundingBox();
    const barra = await page.locator('#mobile-bottom-nav').boundingBox();
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(ancho);
    expect(caja.y + caja.height).toBeLessThanOrEqual(barra.y - 4);
    await sinDesborde(panel);
    await expect(page.locator('#notificaciones-close-mobile')).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(page.locator('#notificaciones-btn-mobile')).toBeFocused();
    await page.locator('#notificaciones-btn-mobile').click();
    await page.locator('#sidebar-toggle-btn-mobile').click();
    await expect(panel).toBeHidden();
    await page.locator('#sidebar-close-btn').click();
    await page.locator('#notificaciones-btn-mobile').click();
    await page.locator('#notificaciones-lista-mobile [data-go-view]').first().click();
    await expect(page.locator('#mobile-page-title')).toHaveText('Préstamos');
    await expect(panel).toBeHidden();
    await expect(page.locator('#notificaciones-btn-mobile')).toHaveAttribute('aria-expanded', 'false');
  });
}

for (const ancho of [320, 393, 767]) {
  test(`formulario de libros sin columnas implícitas a ${ancho}px`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, vista: 'catalog' });
    const campos = await page.locator('#add-book-form input:not([type="checkbox"])').all();
    const primero = await campos[0].boundingBox();
    for (const campo of campos) {
      const r = await campo.boundingBox();
      expect(Math.abs(r.x - primero.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.width - primero.width)).toBeLessThanOrEqual(1);
      expect(r.height).toBeGreaterThanOrEqual(44);
    }
    await sinDesborde(page.locator('#add-book-form'));
  });
}

test('estado de conexión largo no empuja los botones ni dice En línea mientras sincroniza', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 320, escala: 1.3 });
  for (const estado of [
    { enLinea: false, sincronizando: false, pendientes: 125 },
    { enLinea: true, sincronizando: true, pendientes: 125 }
  ]) {
    await page.evaluate(estado => window.uiManager._renderIndicadorConexion(estado), estado);
    await sinDesborde(page.locator('#mobile-header'));
    const boton = await page.locator('#notificaciones-btn-mobile').boundingBox();
    expect(boton.x + boton.width).toBeLessThanOrEqual(320);
  }
  await expect(page.locator('#estado-conexion-mobile')).toContainText('Sincronizando');
});

for (const [ancho, escala] of [[320, 1], [320, 1.3], [393, 1.3], [767, 1], [768, 1.3], [1024, 1.3]]) {
  test(`vistas completas y tarjetas sin recortes: ${ancho}px, escala ${escala}`, async ({ page }) => {
    const errores = await abrirAplicacion(page, { ancho, escala });
    for (const vista of ['dashboard', 'catalog', 'users', 'loans', 'scanner', 'bibliomovil', 'reports', 'admin', 'profile']) {
      await test.step(vista, async () => {
        await page.evaluate(vista => window.uiManager.switchView(vista), vista);
        await expect(page.locator('#retry-view-btn')).toHaveCount(0);
        await sinDesborde(page.locator('#views-container'));
        for (const tarjeta of await page.locator('.ficha-libro, .ficha-libro-datos, .ficha-libro-acciones, .ficha-prestamo, .metricas-grid > .catalog-card, .catalog-toolbar, .perfil-resumen, .bibliomovil-cabecera').all()) {
          await sinDesborde(tarjeta);
        }
      });
    }
    expect(errores).toEqual([]);
  });
}

for (const [ancho, alto, escala] of [[320, 568, 1], [393, 740, 1.3], [640, 360, 1.3]]) {
  test(`diálogos completos y alcanzables: ${ancho}×${alto}, escala ${escala}`, async ({ page }) => {
    await abrirAplicacion(page, { ancho, alto, escala, vista: 'catalog' });
    for (const tipo of ['libro', 'lector', 'aviso', 'confirmar', 'entrada']) {
      await page.evaluate(tipo => {
        const ui = window.uiManager;
        if (tipo === 'libro') ui.showEditBookModal(ui._booksCache[0]);
        if (tipo === 'lector') ui.showEditUserModal({ id: 1, nombre: 'Lector de Prueba', rut: '11111111-1', email: 'lector@biblionexo.test', telefono: '56911111111' });
        if (tipo === 'aviso') ui.showNotifyModal({ fecha_devolucion_esperada: '2026-10-05', lectores: { nombre: 'Lector de Prueba', email: 'lector@biblionexo.test' }, libros: ui._booksCache[0] });
        if (tipo === 'confirmar') void ui.showConfirm('Confirmación de prueba, sin modificar datos.');
        if (tipo === 'entrada') void ui.showPrompt('Ingresa un valor de prueba.');
      }, tipo);
      const dialogo = page.locator('.ui-dialog');
      await expect(dialogo).toBeVisible();
      const caja = await dialogo.boundingBox();
      expect(caja.x).toBeGreaterThanOrEqual(0);
      expect(caja.y).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width).toBeLessThanOrEqual(ancho + 1);
      expect(caja.y + caja.height).toBeLessThanOrEqual(alto + 1);
      await sinDesborde(dialogo);
      const ultimo = dialogo.locator('button').last();
      await ultimo.scrollIntoViewIfNeeded();
      await expect(ultimo).toBeInViewport();
      await page.keyboard.press('Escape');
      await expect(dialogo).toHaveCount(0);
    }
    // Simula la reducción de área disponible al abrir el teclado Android.
    await page.locator('.edit-book-btn').first().click();
    await page.setViewportSize({ width: ancho, height: 320 });
    const caja = await page.locator('.ui-dialog').boundingBox();
    expect(caja.y).toBeGreaterThanOrEqual(0);
    expect(caja.y + caja.height).toBeLessThanOrEqual(320);
  });
}

test('encabezados, acciones y estados legibles en modo oscuro', async ({ page }) => {
  await abrirAplicacion(page, { vista: 'catalog' });
  for (const [vista, selector] of [
    ['catalog', '.catalog-card-header h3, .toggle-collection-btn, .reserve-book-btn, .stamp'],
    ['loans', '.ficha-prestamo-datos .rounded'],
    ['profile', '.stamp']
  ]) {
    await page.evaluate(vista => window.uiManager.switchView(vista), vista);
    const textos = page.locator(selector);
    expect(await textos.count()).toBeGreaterThan(0);
    for (const texto of await textos.all()) {
      const contraste = await contrasteTexto(texto);
      expect(contraste, `${vista}: ${await texto.innerText()}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('el menú admite un gesto táctil sin desplazar el fondo', async ({ page, context }) => {
  await abrirAplicacion(page, { ancho: 393, alto: 420 });
  await page.locator('#mobile-menu-btn').click();
  await expect(page.locator('#sidebar-close-btn')).toBeFocused();
  const nav = page.locator('#nav-menu');
  const caja = await nav.boundingBox();
  const cdp = await context.newCDPSession(page);
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height - 20;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let paso = 1; paso <= 8; paso++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - paso * (caja.height - 40) / 8 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => nav.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator('#views-container').evaluate(el => el.scrollTop)).toBe(0);
});

test('el foco del menú también funciona con animaciones activas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await abrirAplicacion(page);
  await page.locator('#mobile-menu-btn').click();
  await expect(page.locator('#sidebar-close-btn')).toBeFocused();
  await page.keyboard.press('Escape');
  await menuCerrado(page);
});

test('el inicio de sesión se puede recorrer en un teléfono horizontal', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 640, alto: 360, sesion: false, escala: 1.3 });
  await sinDesborde(page.locator('#login-screen'));
  const panel = page.locator('.login-panel');
  expect((await panel.boundingBox()).y).toBeGreaterThanOrEqual(0);
  const acceso = page.locator('#login-form button[type="submit"]');
  await acceso.scrollIntoViewIfNeeded();
  await expect(acceso).toBeInViewport();
});

for (const rol of ['librero', 'bibliomovil']) {
  test(`navegación móvil con rol ${rol}`, async ({ page }) => {
    await abrirAplicacion(page, { ancho: 320, rol });
    await page.locator('#mobile-menu-btn').click();
    await expect(page.locator('#nav-menu [data-view="admin"]')).toHaveCount(0);
    await page.locator('#nav-menu [data-view="catalog"]').click();
    await menuCerrado(page);
    await expect(page.locator('#mobile-bottom-nav [data-mobile-view="catalog"]')).toHaveAttribute('aria-current', 'page');
    await sinDesborde(page.locator('#views-container'));
  });
}

test('el último control y los avisos quedan por encima de la navegación inferior', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 320, alto: 568 });
  const ultimo = page.locator('[data-quick-view="loans"]');
  await ultimo.scrollIntoViewIfNeeded();
  const boton = await ultimo.boundingBox();
  const barra = await page.locator('#mobile-bottom-nav').boundingBox();
  expect(boton.y + boton.height).toBeLessThanOrEqual(barra.y);
  await page.evaluate(() => window.uiManager.showToast('Aviso de prueba con texto suficientemente largo para ocupar varias líneas.', 'info'));
  const aviso = page.locator('#toast-container > div');
  await expect(aviso).toBeVisible();
  const caja = await aviso.boundingBox();
  expect(caja.x).toBeGreaterThanOrEqual(0);
  expect(caja.x + caja.width).toBeLessThanOrEqual(320);
  expect(caja.y + caja.height).toBeLessThanOrEqual(barra.y);
});

test('reserva de espacio con área segura superior e inferior simulada', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 393, alto: 740 });
  // El navegador sin dispositivo físico devuelve env() = 0. Sustituimos esos
  // valores en la MISMA hoja compilada para comprobar la geometría con notch.
  // Esto no pretende probar el teclado ni las barras del sistema operativo.
  const css = await page.evaluate(async () => {
    const enlace = [...document.querySelectorAll('link[rel="stylesheet"]')].find(el => /assets\/styles-/.test(el.href));
    return (await (await fetch(enlace.href)).text())
      .replaceAll('env(safe-area-inset-top)', '24px')
      .replaceAll('env(safe-area-inset-bottom)', '34px');
  });
  await page.addStyleTag({ content: css });
  const barra = await page.locator('#mobile-bottom-nav').boundingBox();
  expect(barra.height).toBe(106);
  expect(barra.y + barra.height).toBe(740);
  await page.locator('#mobile-menu-btn').click();
  const cerrar = await page.locator('#sidebar-close-btn').boundingBox();
  const salir = await page.locator('#logout-btn').boundingBox();
  expect(cerrar.y).toBeGreaterThanOrEqual(24);
  expect(salir.y + salir.height).toBeLessThanOrEqual(740 - 34);
});

test('marca, contexto y conexión legibles con letra grande en 320px', async ({ page }) => {
  await abrirAplicacion(page, { ancho: 320, escala: 1.3 });
  for (const vista of ['dashboard', 'admin', 'bibliomovil']) {
    await page.evaluate(vista => window.uiManager.switchView(vista), vista);
    for (const selector of ['.mobile-brand > div > span:first-child', '#mobile-page-title', '#estado-conexion-mobile > span']) {
      await sinDesborde(page.locator(selector));
    }
  }
});
