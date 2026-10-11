# 06 — Adaptabilidad a teléfonos, tablets y modo nocturno (11 de octubre de 2026)

Ronda de trabajo pedida por la biblioteca: «que el sistema funcione en teléfonos
y tablets, y que se arreglen los problemas visuales del modo nocturno». Este
documento guarda **qué se encontró, qué se cambió y por qué**, más lo que quedó
fuera a propósito, para que la próxima ronda no repita el análisis.

Todo el trabajo está en la rama `arena/fd65c42e-biblio-nexo`, con un commit por
tarea (ver la sección «Cómo se verificó»).

---

## 1. Qué estaba roto de verdad

No fueron «detalles de diseño»: cada punto de esta lista dejaba a una persona sin
poder trabajar.

| # | Problema | Dónde | Qué pasaba en un equipo real |
|---|---|---|---|
| 1 | El menú lateral se ocultaba por debajo de 1024px, pero el botón para abrirlo desaparecía a los 768px | `ui-router.js` (`md:hidden`) + CSS | **En un iPad en vertical (768px exactos) no había ninguna forma de cambiar de sección.** El menú estaba fuera de la pantalla y el botón, oculto. |
| 2 | Contenedores de `100vh` | `index.html`, `renderShell`, pantallas de ingreso | `100vh` mide la ventana *más alta posible*: en un teléfono queda 60–100px más alto que lo que se ve, así que el pie de los formularios y el botón de guardar terminaban debajo de la barra del navegador. |
| 3 | Tablas de 4 a 6 columnas | Catálogo, Lectores, Administración (11 tablas) | En 360px, la mitad de los datos quedaba fuera de la pantalla con una barra de desplazamiento horizontal que nadie descubre. |
| 4 | Modales sin tope de alto | 15 overlays | Con el teclado abierto o el teléfono en horizontal, la caja crecía fuera de la ventana y los botones de abajo (Guardar, Cancelar) quedaban inalcanzables. |
| 5 | Zonas del recorte de pantalla | Todo el cascarón | La muesca tapaba la franja de título y la barra de gestos, la barra de accesos rápidos. |
| 6 | Campos por debajo de 16px | Formularios | iOS hace zoom automático al enfocar y descuadra la pantalla justo cuando la persona va a escribir el RUT. |
| 7 | Botones de ícono de 32px | Cascarón, préstamos, catálogo | Superficie táctil por debajo de los 44px recomendados (WCAG 2.5.8 pide 24px como mínimo). |
| 8 | Acentos de marca como tinta clara sobre fondo oscuro | 24 usos (ingreso, menú, títulos) | La madera (#7A431D), el bosque (#2C4A3E) y el lago (#1B3B48) son tintas para papel claro: sobre `stone-900` quedan entre **1,5:1 y 2,2:1**. La segunda mitad del logotipo («Nexo») era lo primero que desaparecía. |
| 9 | El menú lateral es oscuro en los DOS temas | Marca, sellos | El mismo problema del punto 8, pero **también de día**: el «Nexo» del menú lateral nunca se leyó bien. |
| 10 | Franja del navegador desincronizada | `index.html` (`theme-color`) | Quien activaba el modo oscuro con el teléfono en claro seguía viendo una franja color madera sobre una pantalla negra. |
| 11 | Destello blanco al cargar | Arranque | El tema se aplicaba desde `_initDarkMode()`, que corre cuando la pantalla ya se está dibujando: en cada carga, quien usa modo oscuro veía un destello blanco. |
| 12 | Pantallas del correo sin tema | `renderNuevaPassword`, `renderCompletarInvitacion` | Se entra por el enlace del correo, sin pasar por el ingreso: la preferencia guardada no se aplicaba nunca. |
| 13 | Colores que viajan como variable | 8 sitios en `admin.js`, `prestamos.js`, `catalogo.js`, `dashboard.js`, `reportes.js` | Los escáneres de clases miraban solo `class="…"`; los `${color}` ternarios quedaron fuera. Números en `rose-700`/`amber-700` sobre tarjeta oscura: entre 2,5:1 y 3,2:1. |
| 14 | Interruptor del modo oscuro con dos estados oscuros a la vez | `perfil.js` | El carril tenía `dark:bg-patrimonio-lago` **y** `dark:bg-stone-700`: ganaba el que estuviera después en el CSS compilado, así que en modo oscuro el interruptor podía verse *encendido* estando apagado. |
| 15 | Página legal apretada | `privacidad.html` | Tres columnas de frases largas en 360px. Se abre desde el teléfono al aceptar el consentimiento (Ley 21.719). |
| 16 | Páginas fuera del panel sin el viewport del teléfono | `404.html`, `escaneo-remoto.html` | El 404 usa `h-screen`; el escaneo remoto —que se abre **siempre** desde un teléfono— no encogía la ventana con el teclado, así que el botón «Agregar» quedaba debajo. |
| 17 | Aviso de éxito por debajo de AA | `ui-modales.js` | Texto blanco sobre verde esmeralda 500 = **2,56:1**. |

---

## 2. Qué se cambió (y por qué así)

### 2.1 Un solo umbral para el menú: 1024px

El botón del menú y el modo cajón viven ahora en el mismo corte (`lg`, 1024px).
Es la decisión que sostiene todo lo demás: por debajo del corte hay menú
lateral deslizable + barra inferior de accesos rápidos; por encima, el menú
fijo de siempre. El cajón se cierra al elegir una sección, con `Escape`, con
el botón de cerrar o tocando fuera, y la página de atrás no se desplaza
mientras está abierto (`body.menu-abierto`). El botón lleva `aria-expanded`
y `aria-controls`.

### 2.2 Barra de accesos rápidos (solo teléfono y tablet)

En un teléfono, el menú lateral obliga a dos toques por cada cambio de sección.
La barra de abajo deja las cuatro tareas del día a un toque, con el mismo
origen de datos que el menú (`CONFIG.VIEWS_BY_ROLE` ∩ `CONFIG.VISTAS_RAPIDAS`):
si un rol no tiene esa sección, no aparece; y solo se muestran cuatro, el resto
va en «Más», que abre el cajón completo.

### 2.3 Alto real, recorte de pantalla y teclado

- `.pantalla-completa` y `.pantalla-minima` usan `100dvh` (con `100vh` como
  respaldo para navegadores antiguos).
- `viewport-fit=cover` en `index.html`, `404.html` y `escaneo-remoto.html`, más
  `env(safe-area-inset-*)` en el cajón, la barra inferior, los avisos y el área
  de trabajo.
- `interactive-widget=resizes-content`: en Android, el teclado encoge la ventana
  en vez de taparla.
- Los campos de formulario pasan a 16px por debajo de 1024px para que iOS no
  haga zoom al enfocar.

### 2.4 Tablas adaptables (el MISMO HTML)

En pantalla angosta (≤768px) cada fila se dibuja como ficha: el encabezado
desaparece y cada celda muestra su etiqueta a la izquierda y el dato a la
derecha, con el texto del `<th>` copiado en `data-etiqueta`. No hay filas
duplicadas ni lógica nueva, así que el orden, la paginación y los filtros siguen
funcionando igual. La tabla de parámetros de Administración se dejó como está a
propósito: es una lista de nombre y valor (dos columnas, una de ellas un campo
de formulario), no una tabla de datos.

### 2.5 Modo nocturno

- **Acentos de marca, en un solo lugar.** En vez de repetir la variante oscura
  en más de veinte usos (y que el que se olvide se vea mal sin que nadie lo
  note), el CSS aclara el mismo matiz bajo `.dark`: madera `#E7B98D`, bosque
  `#6EE7B7`, lago `#7DD3FC`. El menú lateral, que es oscuro en los dos temas,
  recibe la misma aclaración para la marca.
- **Superficies.** Fondo base `#0c0a09`, texto `#e7e5e4`, cabeceras de tarjeta,
  bordes de celda, resalte de fila, esqueletos de carga, marcas de agua, sellos
  de estado y mapa del Bibliomóvil (mosaicos invertidos + controles y globos de
  Leaflet en la paleta oscura).
- **Foco del teclado.** El anillo de foco era color lago (pensado para papel
  claro): sobre el fondo oscuro quedaba a 1,1:1. En modo oscuro usa el ámbar
  `#F6B26B`, el mismo que ya se usaba sobre el menú lateral.
- **Tema antes del primer pintado.** `public/tema-inicial.js` es un script
  clásico (no módulo) en el `<head>`, así que la clase ya está puesta cuando el
  navegador pinta el `<body>`. Lee exactamente las mismas dos reglas que
  `_initDarkMode()` y no es una segunda fuente de verdad.
- **Franja del navegador.** `#meta-color-tema` se reescribe según el tema
  elegido; la etiqueta con `media="(prefers-color-scheme: dark)"` se desactiva
  (`media="not all"`) cuando la persona eligió un tema a mano, para que el
  sistema no gane por accidente.
- **Las tres pantallas del correo** (ingreso, contraseña nueva, completar
  invitación) aplican el tema por su cuenta.

### 2.6 Lo que se decidió NO tocar

- **`escaneo-remoto.html` sigue siendo clara, siempre.** Es una página sin
  sesión, pensada para leerse al sol con la cámara encendida, y con `html {
  color-scheme: light }` sus controles nativos también quedan claros: el
  conjunto es coherente. Darle modo oscuro implicaría mantener dos juegos de
  colores en un archivo que se compila a mano. Queda anotado como limitación
  conocida, no como pendiente.
- **`404.html` y la política de privacidad** tampoco tienen modo oscuro: son
  páginas estáticas sin sesión. Sí se adaptaron al teléfono (viewport, fichas,
  márgenes).
- **`arquitectura.html`** es un diagrama técnico generado, no una pantalla del
  sistema; queda fuera de esta ronda.
- **Colores de estado en tarjetas claras.** Las alertas ámbar/rosa mantienen su
  fondo claro con borde oscuro en los dos temas (`bg-amber-50` +
  `dark:border-amber-800`): cambiar el relleno en modo oscuro habría cambiado
  la jerarquía visual de esos avisos.

---

## 3. Cómo se verificó

Tres suites automáticas y una herramienta de revisión visual:

```bash
npm run test:legacy:adaptabilidad   # 80 comprobaciones (nueva en esta ronda)
npm run test:legacy:contraste       # AA en claro y en oscuro
npm run test:legacy:interfaz        # 112 comprobaciones (jsdom)
npm test                            # Vitest
npm run build && npm run verify:build
```

La suite nueva (`pruebas/probar-adaptabilidad.mjs`) lee los archivos fuente —no
necesita navegador— y vigila lo que se rompe solo:

- **Ventana**: `viewport-fit=cover`, `interactive-widget`, `100dvh`, ningún
  `h-screen`, y que `index.html` aplique el tema antes del primer pintado.
- **Menú angosto**: el corte de 1024px en el cajón y en el botón, el foco fuera
  del cajón cerrado, `Escape`, el bloqueo del desplazamiento de fondo, el panel
  de notificaciones dentro de la pantalla y la barra de accesos rápidos
  coherente con `VIEWS_BY_ROLE`.
- **Área táctil**: `.boton-icono` de 44px en pantalla táctil, 40px de alto
  mínimo en los botones de las vistas y campos de 16px.
- **Tablas**: que toda tabla con encabezado sea adaptable y que cada celda
  tenga su etiqueta (con la tabla de parámetros exenta y el motivo escrito).
- **Diálogos**: `role="dialog"` + `aria-modal` y el tope de alto con scroll
  interno.
- **Modo nocturno**: el fondo y el color base, `color-scheme`, el anillo de
  foco, 19 reglas oscuras con nombre propio, y dos escáneres de regresión —
  uno sobre `class="…"` y otro sobre los colores que viajan como variable— más
  la prohibición de escribir los acentos de marca como variante oscura de
  Tailwind (quedarían invisibles).
- **Páginas fuera del panel**: 404, escaneo remoto y política de privacidad.

`probar-contraste.mjs` se amplió con los pares del tema oscuro y los de los
avisos; los valores concretos están en el propio archivo, no en este documento.

### Revisión visual, sin credenciales

```bash
npm run build && node pruebas/generar-vista-previa.mjs
npx serve dist        # abrir /preview/
```

`generar-vista-previa.mjs` ahora monta **diez pantallas con el cascarón real**
(menú, franja de título y barra inferior) con datos de ejemplo, cada una dentro
de un marco del ancho elegido: teléfono de 360px, teléfono grande de 390px,
tablet en vertical de 768px, tablet en horizontal de 1024px o ancho completo,
con botones para alternar modo oscuro y abrir el cajón. Es la única forma de
ver la adaptación de verdad: las media queries responden al ancho de la
**ventana**, y un contenedor angosto dentro de una página ancha no las activa.

---

## 4. Detalle de archivos

| Archivo | Qué se hizo |
|---|---|
| `index.html` | `viewport-fit=cover` + `interactive-widget=resizes-content`; dos `theme-color`; cargador de arranque en `pantalla-completa`; script clásico del tema en el `<head>`. |
| `public/tema-inicial.js` | **Nuevo.** Aplica el tema antes del primer pintado (script clásico, se copia tal cual al build). |
| `src/assets/css/styles.css` | Bloques nuevos: adaptabilidad (cajón a 1024px, Área táctil, tablas adaptables, barra inferior, diálogos), modo nocturno (base, foco, sellos, mapa, acentos de marca, cabeceras, esqueletos), página legal en pantalla angosta y panel de vidrio en la familia stone. |
| `src/js/modules/ui-router.js` | Cajón con botón de cerrar, `Escape`, bloqueo del fondo, `aria-expanded`, cierre al girar la tablet; barra de accesos rápidos; franja del navegador según el tema. |
| `src/js/modules/ui-base.js` | Pantallas de ingreso, contraseña nueva e invitación con `dvh`, `my-auto`, botón de ícono de 44px y `_initDarkMode()` en las tres. |
| `src/js/modules/ui-modales.js` | Aviso de éxito en esmeralda 700 (AA) y alto máximo de los diálogos. |
| `src/js/vistas/*.js` | Parejas `dark:` faltantes, tablas adaptables con `data-etiqueta`, botones táctiles, apilado del mesón y del formulario de alta, e interruptor del tema con sus dos estados. |
| `src/js/config.js` | `CONFIG.VISTAS_RAPIDAS` (las cuatro tareas del día por rol). |
| `404.html`, `escaneo-remoto.html`, `privacidad.html` | Viewport del teléfono, alto en `dvh` y tabla de datos personales en fichas. |
| `pruebas/probar-adaptabilidad.mjs` | **Nueva suite** (80 comprobaciones), enganchada a `npm run test:legacy` y a la CI. |
| `pruebas/probar-contraste.mjs` | Pares del tema oscuro y de los avisos; los avisos entran al escaneo de regresiones. |
| `pruebas/generar-vista-previa.mjs` | Diez pantallas con cascarón real, marcos por ancho de equipo, modo oscuro y cajón abierto. |
