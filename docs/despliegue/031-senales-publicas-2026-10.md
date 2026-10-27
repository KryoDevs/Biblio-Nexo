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
| 8 · datos sin estructura | ningún `application/ld+json` en el repo | `Library` + `WebApplication` en la portada, `PrivacyPolicy` en `/privacidad.html` |
| 14 · favicon | hay PNG de 192 y 512 pero ningún `.ico`, y el de 512 pesaba 572 KB | `/favicon.ico` con cinco tallas, íconos cuantizados y rutas absolutas |
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

## Datos estructurados, y lo que decidimos no poner

`index.html` declara un `@graph` con dos nodos: la `Library` (que es también
`GovernmentOrganization`, con la municipalidad como `parentOrganization` y
`Futrono` como `areaServed`) y la `WebApplication` BiblioNexo, con
`isAccessibleForFree: false` porque el contenido exige cuenta municipal.
`/privacidad.html` no repite la ficha de la biblioteca: declara su
`PrivacyPolicy` y **referencia los mismos `@id` absolutos**
(`https://<origen>/#biblioteca`), así la entidad tiene una sola definición en el
sitio y no seis copias que desincronizar.

Un detalle que vale la pena saber antes de tocar el CSP: un
`<script type="application/ld+json">` es un bloque de datos, no un script
ejecutable. El navegador nunca lo corre y `script-src 'self'` sin
`'unsafe-inline'` no lo bloquea — no hace falta abrir ninguna excepción.

**Adentro no hay dirección, teléfono, correo ni horarios, y es deliberado.**
`src/js/config.js` → `BIBLIOTECA` tiene `'Balmaceda 99, Futrono'` y
`'+56 63 248 1000'`, con un comentario del propio archivo que dice «ajusta estos
datos con los reales de la biblioteca antes de usarlo en producción»; y
`README.md` documenta otros distintos (`Balmaceda 68`, `+56 63 248 2633`). O sea
que son datos de ejemplo y están contradictorios entre archivos: publicado en
datos estructurados, un buscador los repite y nadie los despublica. La prueba los
prohíbe (`pruebas/verificar-build.mjs`, «el dato estructurado publica
"telephone" sin confirmar con la biblioteca»). Cuando la biblioteca confirme los
dos, se agregan al JSON-LD y esa comprobación se cambia por la que exija que
coincidan con `CONFIG.BIBLIOTECA`. Falta también el `sameAs` del catálogo de la
Dibam, cuyo URL no está en ningún archivo del repo: hay que pedirla.

## Íconos: el `.ico` que faltaba y por qué las rutas son absolutas

- `public/favicon.ico` nuevo, con las tallas 16, 24, 32, 48 y 64 en un solo
  archivo (34 KB). Sin él, el navegador pide `/favicon.ico` por su cuenta y
  recibe la 404 propia — ruido en la consola y en el rastreo.
- `icono-512x512.png` pasó de 572 KB a 153 KB y `icono-192x192.png` de 70 KB a
  26 KB: cuantizados a 256 colores con tramado (RMSE 2 %). El arte es una
  ilustración, no una foto, y estos archivos **no se dibujan en ninguna pantalla
  de la aplicación** — solo los consumen el manifest de la PWA y el escritorio
  del teléfono, donde el grano del tramado no se ve. Se verificó comparando el
  cielo y el agua a cuatro aumentos antes de quedárselos. El *precache* de la
  PWA bajó de 2511 KB a 2090 KB (**421 KB menos** en la instalación de cada
  computador del mesón).
- **Todas las rutas de íconos son absolutas** (`/favicon.ico`,
  `/icono-192x192.png`). Relativo funcionaba en `/` y en `/privacidad.html`, pero
  la 404 propia se sirve en la URL que alguien escribió mal: en
  `/prestamos/xd`, un `href="favicon.ico"` pide `/prestamos/favicon.ico` y da 404
  otra vez, en la página cuyo único trabajo es explicar que no se encontró nada.
  Con `base: './'` Vite deja intactas las rutas de `public/`; solo reescribe los
  assets que bundlea.
- `sizes` miente y el navegador elige mal: la prueba lee el IHDR de cada PNG (los
  bytes 16 a 24, dos enteros de 32 bits grandes) y exige que coincida con lo que
  declara el `<link>` y el `manifest.json`. Y del `.ico` comprueba que traiga al
  menos tres tallas dentro.

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
- **Confirmar los datos de contacto de la biblioteca** (dirección, teléfono y el
  `sameAs` del catálogo de la Dibam). `config.js` y `README.md` tienen valores
  distintos y ambos marcados como pendientes de confirmar: es un asunto de la
  biblioteca, no de este repositorio. Una vez confirmados, entran en
  `CONFIG.BIBLIOTECA`, en el JSON-LD y en la hoja de ruta impresa del
  Bibliomóvil, y la prueba que hoy prohíbe publicarlos se cambia por la que
  exige que las tres copias coincidan.
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
