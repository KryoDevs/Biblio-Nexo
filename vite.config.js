import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'node:fs/promises';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * ORIGEN PÚBLICO — única fuente de verdad de la URL completa del sitio.
 *
 * `canonical`, Open Graph y el `<loc>` de un sitemap exigen URLs ABSOLUTAS:
 * una ruta relativa (`og:image: "icono-512x512.png"`, como estaba hasta la
 * auditoría de octubre de 2026) la descarta cualquier robot que lea la
 * página, y en WhatsApp o Slack simplemente no sale la vista previa. Con
 * `base: './'` — todo se sirve con rutas relativas para poder mudar el sitio
 * de host sin tocar nada — no hay forma de deducir el origen desde el HTML
 * estático, así que se resuelve acá, al construir.
 *
 * Mientras el sistema viva en el alias de Vercel, el valor por defecto
 * alcanza. Cuando el municipio entregue su dominio propio (el pendiente ⚫ de
 * `pendientes-checklist.md`), NO hay que tocar este archivo ni los HTML:
 * basta definir `VITE_ORIGEN_PUBLICO=https://<dominio>` en las variables de
 * entorno del proyecto en Vercel y volver a desplegar.
 */
const ORIGEN_PUBLICO = (process.env.VITE_ORIGEN_PUBLICO
  || 'https://biblio-nexo-fuckingkrio.vercel.app').replace(/\/+$/, '');

/** Imagen para compartir: 1200×630, el recorte que usan WhatsApp, Slack y los
 *  buscadores al armar la tarjeta de vista previa de un enlace. Vive en
 *  `public/compartir/` y se referencia con un token para que cambiarla sea
 *  editar una línea acá, no buscar en cuatro HTML. */
const IMAGEN_SOCIAL = '/compartir/biblionexo-social.jpg';

/**
 * Tokens que `senalesPublicas()` sustituye en los HTML al construir. Se resuelven
 * contra `ORIGEN_PUBLICO` en tiempo de build, no a mano en cada página, para que
 * el día que llegue el dominio propio haya UNA sola línea que cambiar (o,
 * mejor aún, una sola variable de entorno que definir en Vercel).
 *
 * `__IMAGEN_SOCIAL__` sale ya absoluta — con el origen incluido — porque un
 * `og:image` relativo no lo resuelve ningún lector de Open Graph, y así la
 * página no tiene que armar la URL pegando dos tokens.
 */
const TOKENS = {
  __IMAGEN_SOCIAL__: `${ORIGEN_PUBLICO}${IMAGEN_SOCIAL}`,
  __ORIGEN__: ORIGEN_PUBLICO
};

/**
 * Las dos únicas páginas que deben aparecer en un buscador.
 *
 * La aplicación en `/` es solo la puerta de entrada: todo el contenido real
 * está detrás del inicio de sesión y no tiene nada que indexar, pero la
 * portada sí conviene encontrarla. `/privacidad.html` es la que un vecino
 * tiene derecho a hallar sin abrir la app, y la que exige la Ley 21.719.
 * Las vistas internas no van ni en el sitemap: no tienen URL propia, cambian
 * con `switchView()` sin navegar.
 */
const PAGINAS_PUBLICAS = [
  {
    ruta: '/',
    titulo: 'Portada e inicio de sesión del sistema',
    prioridad: '1.0'
  },
  {
    ruta: '/privacidad.html',
    titulo: 'Política de privacidad y términos de uso',
    prioridad: '0.6'
  }
];

/**
 * `robots.txt`, `sitemap.xml` y `llms.txt`, generados al construir.
 *
 * Los tres son la señal «no existe» de la auditoría de octubre de 2026: no es
 * que el sitio bloqueara a nadie, es que no declaraba ninguna política.
 *
 * OJO con el sentido de la decisión: NO se bloquea a los rastreadores de IA
 * (GPTBot, ClaudeBot, CCBot…) ni a los buscadores. La plantilla que circula
 * por ahí para «cerrar un sitio» los prohíbe a todos y de paso bloquea `*.css`
 * y `*.js`; ese último detalle no cierra nada, impide que Google renderice la
 * página y la hunde en el índice. Para una biblioteca municipal, que la
 * portada y la política de privacidad se puedan encontrar y citar es un
 * objetivo, no un riesgo. Lo que sí se excluye son las dos rutas donde no hay
 * nada que leer.
 */
function archivosPublicos() {
  const hoy = new Date().toISOString().slice(0, 10);

  const robots = [
    '# robots.txt de BiblioNexo — Biblioteca Pública Municipal de Futrono.',
    '#',
    '# Lo genera vite.config.js (archivosPublicos): editar ahí, no en dist/.',
    '#',
    '# Sin "Disallow" contra los rastreadores de IA ni contra los buscadores.',
    '# Tampoco se bloquean .css ni .js: los buscadores los descargan para',
    '# renderizar la página, y negárselos cuesta índice, no privacidad.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# El enlace de escaneo remoto lleva en la URL un token de un solo uso:',
    '# indexarlo no publica nada útil y sí deja la puerta a la vista. La 404',
    '# se sirve sola y ya trae su propia etiqueta noindex.',
    'Disallow: /escaneo-remoto.html',
    'Disallow: /404.html',
    '',
    `Sitemap: ${ORIGEN_PUBLICO}/sitemap.xml`,
    ''
  ].join('\n');

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Lo genera vite.config.js (PAGINAS_PUBLICAS). Solo páginas públicas:',
    '     las vistas de la aplicación requieren sesión y no tienen URL propia',
    '     que indexar. Editar la lista ahí, no en dist/. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    PAGINAS_PUBLICAS.map(pagina => [
      '  <url>',
      `    <loc>${ORIGEN_PUBLICO}${pagina.ruta === '/' ? '/' : pagina.ruta}</loc>`,
      `    <lastmod>${hoy}</lastmod>`,
      '    <changefreq>monthly</changefreq>',
      `    <priority>${pagina.prioridad}</priority>`,
      '  </url>'
    ].join('\n')).join('\n'),
    '</urlset>',
    ''
  ].join('\n');

  const llms = [
    '# BiblioNexo',
    '',
    '> Sistema de gestión de préstamos, catálogo y Bibliomóvil de la Biblioteca',
    '> Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao',
    '> Figueroa», Región de Los Ríos, Chile.',
    '',
    '## Qué es',
    '',
    'Una aplicación web del personal de la biblioteca: préstamos y devoluciones',
    'con lector de código de barras, catálogo con datos de Open Library,',
    'reservas, notificaciones a lectores, planificador de rutas del',
    'Bibliomóvil y panel de administración. Se instala como PWA y sigue',
    'operando en el mesón cuando se cae la conexión.',
    '',
    'No es un catálogo público: no hay búsqueda abierta, ni inscripción',
    'autónoma de lectores, ni API pública. Todo el contenido protegido exige',
    'una cuenta municipal emitida por la biblioteca.',
    '',
    '## Páginas públicas',
    '',
    PAGINAS_PUBLICAS.map(pagina =>
      `- [${pagina.titulo}](${ORIGEN_PUBLICO}${pagina.ruta === '/' ? '/' : pagina.ruta})`
    ).join('\n'),
    '',
    '## Datos personales',
    '',
    'El sistema trata RUN, nombre, contacto e historial de préstamos de',
    'vecinos. La política de privacidad describe qué se guarda, por cuánto',
    'tiempo y cómo ejercer los derechos, conforme a la Ley 21.719 (vigencia',
    'plena desde el 1 de diciembre de 2026). No hay cookies de seguimiento ni',
    'analítica de terceros.',
    '',
    '## Contacto',
    '',
    'Las consultas sobre el catálogo o sobre cómo inscribirse como lector se',
    'responden en el mesón de la biblioteca, no por esta vía.',
    ''
  ].join('\n');

  return { 'robots.txt': robots, 'sitemap.xml': sitemap, 'llms.txt': llms };
}

/**
 * Plugin propio, sin dependencias. Hace dos cosas y nada más:
 *
 *   1. Sustituye en los HTML de entrada los tokens de la constante `TOKENS`
 *      (`__ORIGEN__`, `__IMAGEN_SOCIAL__`), para que `canonical`, `og:url` y
 *      `og:image` salgan con URL absoluta.
 *   2. Escribe `robots.txt`, `sitemap.xml` y `llms.txt` al cerrar el build, y
 *      los sirve también en `npm run dev` para poder verlos en local.
 *
 * El punto 2 va en `closeBundle`, después de que Workbox ya terminó, y no como
 * archivo estático en `public/`: los tres llevan la URL absoluta del sitio, y
 * generarlos del mismo `ORIGEN_PUBLICO` que alimentan las etiquetas de los HTML
 * es lo que impide que el sitemap y el canonical queden apuntando al dominio
 * viejo el día que cambie. (`globPatterns` de abajo no incluye `txt` ni `xml`,
 * así que tampoco entran al precache del service worker, que es lo otro que
 * se quería evitar.)
 *
 * `transformIndexHtml` corre sobre TODAS las páginas de
 * `build.rollupOptions.input`. Si un HTML nuevo no está en esa lista, el token
 * quedaría a la vista en el archivo servido: `pruebas/verificar-build.mjs` lo
 * comprueba y falla la prueba.
 */
function senalesPublicas() {
  let directorioSalida = resolve(__dirname, 'dist');

  return {
    name: 'biblionexo-senales-publicas',

    configResolved(config) {
      directorioSalida = resolve(config.root, config.build.outDir);
    },

    transformIndexHtml(html) {
      // De la clave más larga a la más corta: así un token no puede tragarse
      // el prefijo `__` de otro que venga pegado detrás.
      return Object.keys(TOKENS)
        .sort((a, b) => b.length - a.length)
        .reduce((codigo, token) => codigo.replaceAll(token, TOKENS[token]), html);
    },

    configureServer(servidor) {
      const archivos = archivosPublicos();
      servidor.middlewares.use((peticion, respuesta, siguiente) => {
        const ruta = (peticion.url || '').split('?')[0].replace(/^\//, '');
        if (!Object.hasOwn(archivos, ruta)) return siguiente();
        respuesta.setHeader('Content-Type',
          ruta.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
        respuesta.end(archivos[ruta]);
      });
    },

    async closeBundle() {
      const archivos = archivosPublicos();
      await mkdir(directorioSalida, { recursive: true });
      for (const [nombre, contenido] of Object.entries(archivos)) {
        await writeFile(resolve(directorioSalida, nombre), contenido, 'utf8');
      }
    }
  };
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
    hmr: { host: 'localhost' },
    cors: true,
    headers: { 'X-Frame-Options': 'ALLOWALL' },
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    cors: true
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        escaneo: resolve(__dirname, 'escaneo-remoto.html'),
        privacidad: resolve(__dirname, 'privacidad.html'),
        error404: resolve(__dirname, '404.html')
      }
    }
  },
  plugins: [
    senalesPublicas(),
    VitePWA({
      registerType: 'autoUpdate',
      // 'script' genera un archivo externo para registrar el SW en vez de un
      // script en línea — necesario porque el CSP de index.html tiene
      // script-src 'self' que bloquea scripts inline (fix crítico #2).
      injectRegister: 'script',
      // La aplicación usa /manifest.json desde index.html y los headers de Vercel.
      // Esta opción va al nivel del plugin, no dentro del contenido del manifest.
      manifestFilename: 'manifest.json',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        // Excluir rutas de supabase si las hubiera, aunque el SW usualmente solo intercepta get
        navigateFallback: 'index.html',
      },
      manifest: {
        name: "BiblioNexo — Biblioteca Municipal de Futrono",
        short_name: "BiblioNexo",
        description: "Sistema de gestión de préstamos de la Biblioteca Pública Municipal de Futrono.",
        id: "/index.html",
        start_url: "/index.html",
        scope: "/",
        display: "standalone",
        lang: "es-CL",
        dir: "ltr",
        background_color: "#F7F4EB",
        theme_color: "#7A431D",
        icons: [
          {
            src: "/icono-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icono-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js']
  }
});
