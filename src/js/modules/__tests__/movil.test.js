import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MOVIL_QUERY,
  esMovil,
  escucharMovil,
  vigilarTeclado,
  actualizarColorDeTema
} from '../movil.js';

/**
 * La condición de teléfono y sus tres efectos verificables en JS.
 *
 * Nacieron en la ronda de octubre de 2026 que pidió «que se vea bien en
 * TODOS los teléfonos». El rediseño móvil anterior se había validado a mano
 * en DevTools con cuatro tamaños, todos verticales, y el teléfono en horizontal
 * seguía recibiendo el layout de escritorio. Este archivo no prueba cómo se ve
 * nada —prueba las tres decisiones de JS que determinan cómo se ve: qué
 * condición se consulta, quién avisa cuando el aparato gira, y qué hace la
 * interfaz cuando el teclado tapa el campo que se está escribiendo.
 */

const HOJA = readFileSync(resolve(process.cwd(), 'src/assets/css/styles.css'), 'utf8');
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function fingeMatchMedia({ matches, soportaAdd = true, lanza = false }) {
  const listeners = new Set();
  const viejos = new Set();
  const mql = {
    matches,
    media: MOVIL_QUERY,
    addEventListener: soportaAdd ? (_t, cb) => listeners.add(cb) : undefined,
    removeEventListener: soportaAdd ? (_t, cb) => listeners.delete(cb) : undefined,
    addListener: !soportaAdd ? (cb) => viejos.add(cb) : undefined,
    removeListener: !soportaAdd ? (cb) => viejos.delete(cb) : undefined
  };
  const original = window.matchMedia;
  window.matchMedia = () => {
    if (lanza) throw new TypeError('matchMedia no entiende esa cadena');
    return mql;
  };
  return {
    mql,
    cambiar(valor) {
      mql.matches = valor;
      for (const cb of listeners) cb(mql);
      for (const cb of viejos) cb(mql);
    },
    restore() { window.matchMedia = original; }
  };
}

describe('movil — la condición de teléfono', () => {
  it('es la misma cadena que usan los @media de la hoja de estilos', () => {
    // Si alguien «simplifica» el CSS a `(max-width: 768px)` y deja el JS como
    // está, el teléfono apaisado vuelve a quedarse sin drawer. Es el defecto
    // original, y la única defensa barata es que el test lea las dos mitades.
    const css = sinComentarios(HOJA);
    const bloques = [...css.matchAll(/@media\s*([^{]+)\{/g)].map(m => m[1].trim());
    const deTelefono = bloques.filter(b => b.includes('max-width: 768px'));
    expect(deTelefono.length).toBeGreaterThanOrEqual(7);
    for (const bloque of deTelefono) {
      expect(bloque).toBe(MOVIL_QUERY);
    }
  });

  it('cubre el teléfono apaisado por alto, no por ancho', () => {
    expect(MOVIL_QUERY).toContain('max-height: 480px');
    expect(MOVIL_QUERY).toContain('orientation: landscape');
  });

  it('pregunta a matchMedia cuando el navegador la tiene', () => {
    const finge = fingeMatchMedia({ matches: true });
    try {
      expect(esMovil(window)).toBe(true);
      finge.cambiar(false);
      expect(esMovil(window)).toBe(false);
    } finally {
      finge.restore();
    }
  });

  it('cae a las dimensiones si matchMedia falla, y no asume escritorio', () => {
    const finge = fingeMatchMedia({ matches: false, lanza: true });
    try {
      // iPhone 15 Pro en horizontal: 844 px de ancho — «escritorio» para la
      // consulta vieja — pero 390 de alto.
      expect(esMovil({ matchMedia: window.matchMedia, innerWidth: 844, innerHeight: 390 })).toBe(true);
      // Un escritorio normal no se vuelve móvil por este camino.
      expect(esMovil({ matchMedia: window.matchMedia, innerWidth: 1440, innerHeight: 900 })).toBe(false);
      // Un monitor vertical angosto (1024×768 no, pero 700×1200 sí por ancho).
      expect(esMovil({ matchMedia: window.matchMedia, innerWidth: 700, innerHeight: 1200 })).toBe(true);
    } finally {
      finge.restore();
    }
  });

  it('funciona sin window (node, workers, etapas tempranas del arranque)', () => {
    expect(esMovil(null)).toBe(false);
  });
});

describe('movil — escuchar la rotación', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    delete document.body.dataset.tecladoVigilado;
  });

  it('avisa en cada cambio y deja de avisar al desuscribirse', () => {
    const finge = fingeMatchMedia({ matches: false });
    try {
      const cb = vi.fn();
      const dejar = escucharMovil(cb, window);
      finge.cambiar(true);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenLastCalledWith(true);
      dejar();
      finge.cambiar(false);
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      finge.restore();
    }
  });

  it('soporta el Safari viejo, que solo tenía addListener', () => {
    const finge = fingeMatchMedia({ matches: false, soportaAdd: false });
    try {
      const cb = vi.fn();
      const dejar = escucharMovil(cb, window);
      finge.cambiar(true);
      expect(cb).toHaveBeenCalledWith(true);
      dejar();
      finge.cambiar(false);
      expect(cb).toHaveBeenCalledTimes(1);
    } finally {
      finge.restore();
    }
  });

  it('no rompe si el navegador no tiene matchMedia en absoluto', () => {
    const original = window.matchMedia;
    delete window.matchMedia;
    try {
      expect(() => escucharMovil(() => {}, window)).not.toThrow();
      expect(esMovil(window)).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('movil — teclado abierto', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    delete document.body.dataset.tecladoVigilado;
  });

  it('baja la barra de navegación al escribir y la devuelve al salir', async () => {
    document.body.innerHTML = '<input id="q" type="search"><button id="b">ok</button>';
    const dejar = vigilarTeclado(document);
    const campo = document.getElementById('q');
    campo.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.body.classList.contains('entrada-activa')).toBe(true);

    campo.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0)); // la decisión va pospuesta un turno
    expect(document.body.classList.contains('entrada-activa')).toBe(false);
    dejar();
  });

  it('no esconde la barra por enfocar un botón o una casilla', () => {
    document.body.innerHTML = '<button id="b">ok</button><input id="c" type="checkbox">';
    const dejar = vigilarTeclado(document);
    for (const id of ['b', 'c']) {
      document.getElementById(id).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    }
    expect(document.body.classList.contains('entrada-activa')).toBe(false);
    dejar();
  });

  it('no hace parpadear la barra al saltar de un campo a otro', async () => {
    document.body.innerHTML = '<input id="a" type="text"><input id="b" type="text">';
    const dejar = vigilarTeclado(document);
    document.getElementById('a').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    document.getElementById('a').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const b = document.getElementById('b');
    b.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    // Foco real en el campo siguiente antes de que corra el timeout.
    Object.defineProperty(document, 'activeElement', { value: b, configurable: true });
    await new Promise(r => setTimeout(r, 0));
    expect(document.body.classList.contains('entrada-activa')).toBe(true);
    delete document.activeElement;
    dejar();
  });

  it('se instala una sola vez aunque renderShell corra varias veces', () => {
    document.body.innerHTML = '<input id="q" type="text">';
    const spy = vi.spyOn(document, 'addEventListener');
    vigilarTeclado(document);
    const primeras = spy.mock.calls.length;
    vigilarTeclado(document);   // segundo inicio de sesión en la misma pestaña
    vigilarTeclado(document);   // cambio de rol
    expect(spy.mock.calls.length).toBe(primeras);
    spy.mockRestore();
    const dejar = vigilarTeclado(document);
    expect(typeof dejar).toBe('function');
  });
});

describe('movil — color de la barra de estado', () => {
  afterEach(() => {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
  });

  it('reescribe el meta existente y no agrega un segundo theme-color', () => {
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#7A431D">');
    actualizarColorDeTema(true);
    const metas = document.head.querySelectorAll('meta[name="theme-color"]');
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute('content')).toBe('#1C1917');
    actualizarColorDeTema(false);
    expect(document.head.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#7A431D');
  });

  it('prefiere el meta sin `media`, que es el que gana en el navegador', () => {
    document.head.insertAdjacentHTML('beforeend',
      '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000"><meta name="theme-color" content="#7A431D">');
    actualizarColorDeTema(true);
    expect(document.head.querySelector('meta[name="theme-color"]:not([media])').getAttribute('content')).toBe('#1C1917');
    expect(document.head.querySelector('meta[media]').getAttribute('content')).toBe('#000');
  });

  it('lo crea si la página no lo declaraba, y no explota sin head', () => {
    expect(() => actualizarColorDeTema(true)).not.toThrow();
    expect(document.head.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#1C1917');
    expect(() => actualizarColorDeTema(true, { querySelector: null })).not.toThrow();
  });
});
