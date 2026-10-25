# 031 — Señales públicas del sitio: canonical, Open Graph, robots, sitemap y llms.txt

- **Proyecto**: BiblioNexo — Biblioteca Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao Figueroa»
- **Fecha**: 25 de octubre de 2026
- **Rama**: `arena/f221bb84-biblio-nexo`
- **Origen**: auditoría de las «20 señales de que un sitio fue vibecodeado». Siete de las veinte estaban presentes en este proyecto; esta nota cierra seis de ellas. La séptima (el dominio propio) no es de código y sigue pendiente.

---

## Qué se activó

| Señal | Antes | Ahora |
|---|---|---|
| 5 · mismo `<title>` en todo | `document.title` no se tocaba nunca: las nueve vistas del panel eran la misma pestaña | `switchView()` lo escribe por vista (`_tituloDocumento`) |
| 7 · `og:image` | relativa (`icono-512x512.png`) → ninguna red social la resolvía, y era un ícono de 572 KB | imagen propia 1200×630 con URL absoluta, `og:image:width/height/alt`, `og:url` y `twitter:card` |
| 10 · ningún `<h1>` | la app autenticada partía en `<h2 id="page-title">` | la franja de título es `<h1>`; el tamaño lo siguen dando las clases |
| 11 · sin `canonical` | no existía | `/` y `/privacidad.html` llevan el suyo |
| 12 · sin `llms.txt` | no existía | generado en cada build |
| 13 · `robots.txt` | no existía (sin política declarada, no «bloqueando IA») | generado, con política explícita |
| 15 · sin `sitemap.xml` | no existía | generado con las dos páginas públicas |
| 18 · *source maps* | `vendor/js/chart.umd.js` anunciaba un `.map` que no existe | se borró el anuncio |

## Cómo se resuelve el origen (y qué pasa cuando llegue el dominio)

Una sola constante en `vite.config.js`:

```
VITE_ORIGEN_PUBLICO  →  si no está definida, el alias actual de Vercel
```

De ahí salen el `canonical`, `og:url`, `og:image`, el `Sitemap:` del
`robots.txt`, cada `<loc>` del sitemap y los enlaces del `llms.txt`. Es
deliberado: lo que mata el punto 7 no es faltar la imagen, es que cuatro
archivos distintos tengan que ponerse de acuerdo en un dominio.

**Cuando el municipio entregue `biblioteca.futrono.cl` (o el que sea), el
trabajo en este repositorio es cero.** En Vercel: *Settings → Environment
Variables → `VITE_ORIGEN_PUBLICO=https://biblioteca.futrono.cl`*, y el
siguiente despliegue actualiza las siete señales a la vez. Falta, por
supuesto, agregar el dominio al proyecto y apuntar su DNS — eso es lo que está
en `pendientes-checklist.md` ⚫.

Los HTML no llevan la URL escrita a mano: llevan los tokens `__ORIGEN__` e
`__IMAGEN_SOCIAL__`, que sustituye el plugin `senalesPublicas()`. Un token sin
sustituir en el `dist` es un fallo de `npm run verify:build`, no una página con
un enlace raro.

## Lo que se decidió no hacer, y por qué

- **`404.html` y `escaneo-remoto.html` no reciben `canonical` ni Open Graph.**
  Las dos traen `noindex`; un `canonical` le pide al buscador que indexe esa URL
  como la versión buena de algo, que es lo contrario. Y `/escaneo-remoto.html`
  lleva en la consulta un token de un solo uso: que un robot lo guarde o lo
  muestre en una tarjeta para compartir no publica nada y sí deja la puerta a
  la vista. Los comentarios de ambos archivos lo explican in situ, para que la
  próxima mano «mejorando el SEO» no los agregue por reflejo.
- **El `robots.txt` no bloquea a las IA ni a los buscadores.** La plantilla que
  circula para «cerrar un sitio» prohíbe GPTBot, ClaudeBot, CCBot y de paso
  `*.css`/`*.js`; ese último detalle no cierra nada: impide que Google
  renderice la página y le cuesta índice. Para una biblioteca municipal, que la
  portada y la política de privacidad se puedan encontrar y citar es un
  objetivo. Solo se excluyen las dos rutas mencionadas arriba.
- **No hay `noindex` en `/index.html`.** La portada es la página que un vecino
  puede llegar a buscar. El contenido detrás del inicio de sesión no se indexa
  solo: necesita credenciales, y no se le puede dar URL propia a una vista que
  cambia con `switchView()` sin navegar.
- **`sitemap.xml` tiene dos entradas, no veintidós.** Un sitemap con rutas que
  reenvían a un inicio de sesión se ignora igual, y mentirle al rastreador
  cuesta más de lo que rinde.

## La imagen para compartir

`public/compartir/biblionexo-social.jpg` — 1200×630, JPG de 108 KB, compuesta
(y no fotografiada) desde el ícono de la aplicación con la paleta del sistema:
degradado lago→bosque de fondo, acento de madera, `Newsreader`/`Plus Jakarta
Sans` sustituidas por DejaVu porque las del proyecto vienen en `.woff2`, un
formato que ImageMagick no lee.

Se regenera con:

```bash
python3 pruebas/generar-imagen-social.py
```

Necesita ImageMagick (`convert`) en la máquina y nada más: no es una
dependencia del proyecto ni participa del build, es una herramienta de
mantención. El script achica el cuerpo de los rótulos hasta que quepan en su
columna, así que cambiar el texto o el nombre del sistema no desarma la
composición; y **hay que volver a correrlo si cambia `public/icono-512x512.png`**,
porque el dibujo de la derecha sale de ahí y ninguna prueba compara los dos
archivos — un ícono nuevo con esta imagen vieja solo se nota a ojo.

Se eligió JPG y no PNG por dos cosas: pesa 108 KB en vez de ~500 KB, y
`globPatterns` del service worker (`{js,css,html,ico,png,svg,woff,woff2,ttf}`)
no incluye `jpg`, de modo que esta imagen no viaja en el *precache* que se baja
al instalar la PWA en el computador del mesón.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Origen público, imagen social, páginas indexables, textos de `robots`/`sitemap`/`llms` | `vite.config.js` (constantes de arriba, `archivosPublicos()`, `senalesPublicas()`) |
| Etiquetas `canonical`, Open Graph y Twitter | `index.html`, `privacidad.html` |
| `<title>` por vista y `<h1>` de la franja | `src/js/modules/ui-router.js` (`_tituloDocumento`, `switchView`, `renderShell`) |
| Comprobaciones | `pruebas/verificar-build.mjs`, segundo bloque («Señales públicas») y `src/js/modules/__tests__/ui-router.test.js` |
| Imagen para compartir (script) | `pruebas/generar-imagen-social.py` |
| Cabeceras HTTP (`X-Robots-Tag`, caché, CSP) | `vercel.json` — sin cambios, ya cubrían `/(.*)` |

## Lo que quedó afuera de esta ronda

- **Dominio propio** (señal 1). No es código; es el único punto de la lista que
  sigue abierto y el que más pesa, porque un enlace
  `biblio-nexo-fuckingkrio.vercel.app` es lo que hay que pegar en un acta
  municipal.
- **Datos estructurados** (señal 8): un bloque JSON-LD `Library` /
  `GovernmentOrganization` en `privacidad.html` y `index.html`, con
  `name`, `address`, `telephone`, `openingHours` y el `sameAs` del
  catálogo de la Dibam. Media hora, y es lo que convierte la página en algo
  que un buscador puede responder con un panel en vez de un enlace.
- **Contenido del `view source`** (señal 2). Para una app con sesión, que el
  HTML de la portada sea un spinner es correcto: no hay texto que
  prerenderar porque no hay texto público. Solo sería un problema si el
  catálogo se abriera al público — ahí haría falta una página de búsqueda
  pública renderizada en el servidor, no un `npm i prerender`.
- **`favicon.ico` y compresión de los íconos** (señal 14). El de 512 pesa
  572 KB para ser un ícono; se sirve en el *precache* de la PWA. Reducirlo a
  ~60 KB ahorraría medio megabyte en la instalación, pero hay que tocar
  `manifest.json` y volver a verificar las rutas de los íconos.
- **Errores de consola en producción** (señal 19). Verificado estáticamente:
  build limpio, 34 pruebas en verde, seis `console.error` que solo suenan en
  caminos de fallo reales, y el 404 del mapa de Chart.js ya no existe. Falta
  abrir la URL publicada con las herramientas de desarrollo y confirmarlo en
  vivo — eso lo hace una persona, no este entorno.
