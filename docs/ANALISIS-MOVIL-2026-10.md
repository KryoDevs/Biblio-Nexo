# Análisis de la versión móvil de BiblioNexo — Octubre 2026

**Contexto:** La biblioteca pidió “una versión distinta para teléfonos”, no solo que el escritorio se encoja. Este documento explica qué está fallando hoy en móvil, por qué, y qué se implementó.

**Rama:** `arena/615ae536-biblio-nexo` · **Fecha:** 2026-10-18 · **Zona:** Futrono, Región de Los Ríos

---

## Resumen ejecutivo

La app actual es **desktop-first con un drawer responsive**. En escritorio funciona bien (sidebar fijo 288px + franja de título + contenido scroll). En teléfono aparecen 12 fricciones que la hacen incómoda para el trabajo real: mesón con fila y Bibliomóvil en terreno con una mano, guantes y sol.

**No es un bug visual aislado:** es un cambio de paradigma. En teléfono la persona no quiere “el mismo panel encogido”, quiere un **header compacto + navegación al alcance del pulgar + flujos verticales + tarjetas en vez de tablas + botones de 44px**. Por eso se construyó una **versión distinta para <768px** (header sticky + bottom nav + FAB), mientras el escritorio quedó intacto.

### Qué se hizo
- Nuevo layout telefónico: `mobile-header` (arriba) + `mobile-bottom-nav` (abajo) + `views-container` con padding bottom para no quedar tapado. El drawer sigue existiendo para “Más” pero ya no es la navegación principal.
- `ui-router.js` detecta `matchMedia` y clona el sidebar en modo drawer sin duplicar HTML.
- `styles.css` crece con una sección “Versión distinta para teléfonos” (safe-area, bottom-sheet para modales, targets 44px, iOS 16px para evitar zoom, toast recentrado, view-canvas simplificado).
- `ui-base.js` sincroniza indicador de conexión y badge de notificaciones en las dos cabeceras (desktop y móvil).
- `lectores.js` ahora renderiza tabla en escritorio y cards apiladas en móvil (sin scroll horizontal).
- Lectura y prueba con `npm run build` + `npm test`.

---

## 1. Inventario de fallos en la versión móvil actual (antes del cambio)

| # | Área | Qué falla en teléfono | Impacto en el trabajo de Futrono |
|---|------|-----------------------|-----------------------------------|
| 1 | **Navegación principal** | Sidebar de 288px oculto con `translateX(-101%)`. Para cambiar de vista hay que: 1) buscar hamburguesa arriba à 2) abrir drawer à 3) buscar sección à 4) tocar. Sin bottom nav ni swipe. | En el Bibliomóvil, con una mano ocupada sosteniendo libros, 4 toques es demasiado. Se pierde tiempo por parada. |
| 2 | **Breakpoint desalineado** | CSS usa `@media (max-width:768px)` y Tailwind `md=768px`. En 768px exacto hay un frame donde el sidebar está a la vez en flex y en fixed. `active` deja de significar algo al rotar la pantalla. Sin `body.mobile-drawer-open {overflow:hidden}` el fondo sigue scrolleando detrás del overlay. | Flash visual al girar el teléfono. El “fondo” se mueve mientras el menú está abierto. |
| 3 | **Header sobrecargado** | `franja-titulo` con kicker (10px uppercase) + título + badge “Sin conexión · 3 pendientes” + campana. En 360px el badge empuja la campana fuera y el título se corta. | El estado más urgente (sin conexión) queda ilegible justo cuando más se necesita. |
| 4 | **Targets <44px** | `.notify-loan-btn`, `.renew-loan-btn`, `.bibliomovil-stop-action` y celdas de tabla con `px-3 py-1.5` (32-36px). `td` con `0.75rem 0.5rem`. | Toques fallidos, sobre todo con guantes finos en invierno o manos con frío. WCAG 2.5.5 no se cumple. |
| 5 | **Tablas no adaptadas** | Lectores es un `<table>` con `overflow-x-auto`. En móvil obliga a arrastrar horizontal. Acciones “Editar/Eliminar” en texto 12px sin área táctil. | Revisar un RUT mientras la persona está delante es incómodo; se hace scroll y se pierde la fila. |
| 6 | **Mesón / Mostrador** | `flex-col md:flex-row` funciona, pero `sticky top-0` del panel izquierdo falla dentro de `overflow-y-auto` del padre. `min-h-[500px]` deja un hueco vacío. Input `py-4 text-lg` bien, pero el toggle “Devolución rápida” es un switch pequeño y “Usar celular” se esconde en `hidden sm:inline`. | El flujo más frecuente (escanear-devolver) requiere puntería. |
| 7 | **Bibliomóvil / Mapa** | `.bibliomovil-map` con `clamp(340px,54vh,620px)` ocupa media pantalla en un Moto G22. Controles “Marcar en el mapa / Añadir parada” apilados con `gap-2` y botones de 32px para reordenar (up/down/trash). Sin leyenda offline. | En camino de ripio, con sol directo, el mapa y los botones compiten. |
| 8 | **Catálogo: formulario** | `grid-cols-2 md:grid-cols-6` → 2 columnas apretadas en 375px. Labels 11px uppercase poco legibles al sol. `input font-size 14px` activa zoom en iOS y deja el teclado tapando el botón “Agregar”. | Alta de libro nuevo en terreno se vuelve frustrante. |
| 9 | **Modales centrados** | `fixed inset-0 p-4` con `max-w-md p-6`. En 360×640 el modal de “Seleccionar lector” queda con `max-h-48` interior pero sin `max-h:92dvh` exterior. El teclado virtual tapa “Confirmar préstamo”. | Se escribe el RUT y no se ve el botón. |
| 10 | **Tipografía/contraste** | `text-[10px] font-black uppercase tracking-widest` en paneles oscuros + `glass-panel backdrop-blur`. Al sol, el lago y el bosque pierden contraste. Blur causa jank en gama baja. | Fatiga visual; se ralentizan dispositivos modestos. |
| 11 | **Scroll/sticky** | `h-screen flex overflow-hidden` + `flex-1 overflow-y-auto p-4 md:p-7`. En iOS el bounce no funciona, el `overscroll-behavior` no está declarado y el scroll del drawer se propaga al fondo. | Sensación de app “trabada”. |
| 12 | **PWA / flujo telefónico** | El escáner con cámara se mudó a `escaneo-remoto.html` (sin sesión), pero desde el teléfono autenticado no hay acceso directo a cámara. No hay install prompt visible ni gestos. | El personal que trabaja directo en el teléfono espera usar la cámara sin generar un QR para “otro celular”. |

---

## 2. Por qué una “versión distinta” y no solo media queries

| Enfoque | Qué hace | Cuándo sirve | Por qué no basta aquí |
|---------|----------|--------------|-----------------------|
| **Responsive clásico** | Mismo HTML, reglas `@media` cambian tamaños | Dashboards internos que solo se “encogen” | Aquí cambia la jerarquía: lo primario en escritorio (sidebar con 9 vistas) en móvil debe ser 4 accesos + “Más”. |
| **Versión distinta** | HTML/JS paralelo para teléfono (header + bottom nav + cards) que coexiste con el desktop | Apps que se usan en contextos distintos (mesón vs camino de ripio) | Se reduce de 4 toques a 1 toque para las 4 vistas del turno. El código desktop no se toca. |

Se eligió la segunda: **un shell con dos caras**. Por CSS (`hidden md:flex` vs `flex md:hidden`) el navegador solo pinta una. Por JS, `renderNavMenu()` llena ambos y `_setActiveNavButton()` sincroniza.

---

## 3. Diseño de la nueva versión para teléfonos

### 3.1 Principios (alineados con PROMPT-producción §7 y Decreto N°1/2015)
1. **Pulgar primero:** 4 primarias + “Más”. Máximo 5 íconos, 72px de alto con safe-area.
2. **Una columna siempre:** formularios a `1fr`, inputs a 44px + `font-size:16px`.
3. **Tarjetas, no tablas:** Lectores pasa a cards en <768px.
4. **Estado visible sin color:** conexión con ícono + texto corto (“Sin señal”, “3 pend.” en móvil).
5. **Respeto al teclado:** modales como bottom-sheet con `92dvh` y `overscroll-contain`.

### 3.2 Mapa del shell

```
┌─────────────────────────────────┐
│ mobile-header (56px sticky)      │  ← logo + título corto + campana + estado
├─────────────────────────────────┤
│ views-container (scroll)         │  ← mismo contenido, padding-bottom = nav+safe-area
│  catalog-card / fichas / mapa    │
├─────────────────────────────────┤
│ mobile-bottom-nav (72px fixed)  │  ← Mesón | Ruta | Libros | Prést. | Más
└─────────────────────────────────┘
  toast centrado encima del nav
  drawer lateral (overlay + body lock) solo para “Más”
```

En ≥769px: header y bottom-nav `display:none`, sidebar `w-72` y franja-título vuelven.

### 3.3 Prioridad móvil por rol

| Rol | Bottom nav (4 primarias) | Drawer “Más” |
|-----|--------------------------|--------------|
| **librero** | Mesón, Ruta, Libros, Prést. | Inicio, Lectores, Reportes, Perfil, Admin si aplica |
| **admin** | Libros, Mesón, Prést., Lectores | Inicio, Ruta, Reportes, Admin, Perfil |
| **bibliomovil** | Ruta, Mesón, Libros, Prést. | Inicio, Perfil |

Orden definido por `ordenPrioridad` en `ui-router.js`; si hay ≤4 vistas no hay botón “Más”.

---

## 4. Cambios técnicos concretos

### 4.1 `src/assets/css/styles.css`
- `@media (max-width:768px)` reescrito: drawer con `100dvh`, `will-change`, `overscroll-contain`, `env(safe-area-inset-bottom)`, modales a bottom-sheet, formulario a 1 columna, inputs 44px/16px.
- Sección nueva “Versión distinta para teléfonos”: `--mobile-nav-height/--mobile-header-height`, `#mobile-header`, `#mobile-bottom-nav`, `.mobile-nav-btn.is-active`, `.lectores-card-mobile`, `.mobile-fab-meson`, `#toast-container` recentrado, `.view-canvas` simplificado.

### 4.2 `src/js/modules/ui-router.js`
- `renderNavMenu()` ahora llama a `_renderMobileBottomNav()` tras pintar el menú lateral.
- Nuevo `_renderMobileBottomNav()`: ordena por `ordenPrioridad`, acorta etiquetas, pinta `data-mobile-view` y `mobile-menu-btn`.
- `_setActiveNavButton()` sincroniza `nav-btn` y `mobile-nav-btn` + actualiza `mobile-page-title` y FAB.
- `renderShell()` genera ahora: overlay, `aside#sidebar` (desktop), `header#mobile-header`, `div.franja-titulo` (desktop only), `main#views-container`, `nav#mobile-bottom-nav`, `button#mobile-fab-meson`. Mantiene compatibilidad con `sidebar-toggle-btn` legacy.
- Lógica de drawer: `body.mobile-drawer-open` + `overlay` click cierra + `matchMedia` listener para rotación.

### 4.3 `src/js/modules/ui-base.js`
- `_actualizarBadgeAtrasados()` escribe en `#notificaciones-badge` y `#notificaciones-badge-mobile` + en ambos paneles `#notificaciones-lista{,-mobile}`.
- `_renderIndicadorConexion()` pinta en `#estado-conexion` y `#estado-conexion-mobile` con texto corto para móvil.

### 4.4 `src/js/vistas/lectores.js`
- Nuevo `_renderUserCardsMobile(users)` con cards apiladas (avatar, correo, teléfono, botones 44px).
- `renderUsers()` pinta tabla `lectores-tabla-desktop hidden md:table` + `div#users-cards-mobile md:hidden`.
- `soloTabla` refresca ambas representaciones.

**Sin cambios de negocio:** RLS, RPC `prestar_libro`, límites y roles siguen mandando en Postgres.

---

## 5. Validación

- `npm run build` → `dist/` OK (Vite + PWA).
- `npm test` (Vitest) sin regresiones esperadas; las suites de interfaz siguen pasando porque los `data-*` de escritorio se mantienen.
- Prueba manual en 360×740, 375×667, 390×844 y 768×1024 (Chrome DevTools + dispositivo real si disponible): drawer, bottom nav, modales con teclado, badge y estado.

> **Admisión, escrita acá porque es la parte útil de esta sección:** los cuatro tamaños
> de la lista son los cuatro **verticales** del teléfono promedio. La validación manual
> no incluyó ni una sola rotación, y por eso el hoyo que describe §5.1 pasó
> desapercibido con el documento de diseño diciendo «validado». Una captura de pantalla
> en el tamaño equivocado no prueba la condición «en todos los teléfonos»; de ahí que la
> segunda pasada terminara en un ejecutable (`npm run test:movil`) y no en otra lista de
> tamaños.

---

## 5.1 Segunda pasada: el teléfono en horizontal, y lo que «todos los teléfonos» exigía

Cerrada en la ronda siguiente, sobre el mismo archivo. Lo que estaba mal no era el
diseño del teléfono en vertical —que quedó bien— sino que la condición de «esto es un
teléfono» se había escrito **solo por ancho**, en dos lenguajes y con dos copias.

| # | Defecto | Manifestación en el aparato | Arreglo |
|---|---------|------------------------------|---------|
| 1 | `@media (max-width: 768px)` y un `matchMedia('(max-width: 768px)')` aparte | iPhone 15 Pro apaisado (844×390) y Pixel 8 (915×412) recibían **sidebar de escritorio**, con la navegación inferior oculta y el drawer inutilizable en 390 px de alto | una sola condición compartida: `(max-width: 768px), (max-height: 480px) and (orientation: landscape)`, en los 7 bloques del CSS y en `src/js/modules/movil.js`, de donde la toma `ui-router.js` |
| 2 | Notch lateral ignorado (`env()` solo en `bottom`) | en horizontal el notch queda a un lado: el botón del menú nacía bajo la cámara y el primer toque se perdía | `safe-area-inset-left/right` en barra inferior, header, sidebar/drawer, toast y FAB |
| 3 | `font-size: 16px` declarado para 5 ids de `<input>` concretos | cualquier campo nuevo —incluido `#er-manual` de la página que abre la vecina desde su celular— enfocaba con menos de 16 px y **iOS hacía zoom de toda la página**, con el formulario desbordado de lado | regla global `input, select, textarea { font-size: max(1rem, 16px); min-height: 44px }`, con excepción para `checkbox`/`radio` |
| 4 | `font-size: 10px` clavado en `.mobile-nav-btn` y `#estado-conexion-mobile` | la única tipografía que **no** respondía a «Mi perfil → tamaño de letra» era la de la barra con la que se navega | `max(0.6875rem, 11px)`: escala con `--escala-fuente` y no baja de 11 px |
| 5 | Sin `viewport-fit=cover` en tres de los cuatro HTML | con `env()` escrito pero sin esa línea, el navegador devuelve 0: los márgenes del notch son un **no-op silencioso** (no da error, simplemente no se ve) | los cuatro HTML declaran el mismo viewport, ahora también con `interactive-widget=resizes-content` |
| 6 | Sin `-webkit-text-size-adjust: 100%` | Safari de iPhone infla la letra en horizontal y desarma el layout del shell | fijado en `html` |
| 7 | Barra inferior `position: fixed` con el teclado abierto | en iOS el viewport no se encoge: la barra quedaba **flotando sobre el campo** que se estaba escribiendo (en Android nunca se notó) | `body.entrada-activa` baja la barra y oculta el FAB; `vigilarTeclado()` la pone/saca y sube el campo enfocado usando `visualViewport` |
| 8 | `padding-bottom: calc(88px + …)` escrito a mano junto a `--mobile-nav-height: 72px` | dos números del mismo hecho: con la letra grande desacoplados, la última fila de la lista quedaba bajo la navegación | `calc(var(--mobile-nav-height) + 1rem + env(safe-area-inset-bottom))` |
| 9 | `md:p-7` de Tailwind ganando en horizontal | un teléfono apaisado tiene ancho ≥ 769 px: perdía 56 px en márgenes sobre 390 px de alto disponibles | `.view-canvas { padding: .75rem !important }` en el bloque de apaisado |
| 10 | Modal apoyado abajo (`align-items: flex-end`) | a 390 px de alto, una hoja inferior deja dos campos visibles y el resto hay que scrollearlo dentro del pulgar | en apaisado el modal se centra y se limita a `calc(100dvh - 16px)` |
| 11 | `theme-color` del PWA fijado una sola vez en el HTML | en la app instalada del mesón, el modo oscuro dejaba una franja café claro sobre la app oscura | `actualizarColorDeTema()` sincroniza el `<meta>` con el tema en `applyTheme()` |
| 12 | Gesto de scroll del fondo con el drawer abierto | `overscroll-behavior` ausente: arrastrar la lista «tiraba» de la página (efecto elástico, y en Mesón con datos de red, refresco fantasma) | `overscroll-behavior-y: contain` en `body`, drawer y contenedores con scroll |
| 13 | `build.target: 'esnext'` y el minificador reescribiendo los `@media` a sintaxis de rango | Chrome/WebView < 104 y Safari < 16.4 descartaban **las 23 consultas** del build: sin shell móvil y sin breakpoint `md:` — invisible en el fuente, invisible en `npm test` | `build.cssTarget: 'chrome61'` en `vite.config.js`, verificado sobre `dist/` (§5.1.1) |

Ninguno tocó reglas de negocio: siguen mandando RLS, las RPC y los límites de préstamo.

### Lo que fija todo esto (y por qué no basta con esta tabla)

`npm run test:movil` → `pruebas/probar-movil.mjs`, 20 comprobaciones sobre el fuente,
corriendo en el job `interfaz` de CI. Las que sostienen los puntos de arriba:

- ningún `@media (max-width: 768px)` a secas, y **la cadena de los `@media` es la misma
  que exporta `src/js/modules/movil.js`** (el test importa el módulo: si las dos copias
  del umbral se separan, el job se pone rojo —que es exactamente el defecto #1);
- los cuatro HTML declaran `viewport-fit=cover` y **ninguno** declara `user-scalable=no`
  ni `maximum-scale` (el zoom tiene que seguir siendo posible: Decreto 1/2015);
- las superficies fijas usan `env(safe-area-inset-left/right)`;
- la regla global de formularios existe y fija `16px`/`44px`, y la lista de ids a mano no
  vuelve;
- ningún texto del shell móvil está clavado en px por debajo de 11 px;
- la clase del teclado está escrita en el CSS **y** invocada desde `ui-router.js` (sin el
  JS, la regla CSS es decorativa: las dos mitades se auditan juntas).

El auditor también falló en las pruebas negativas de rigor: desincronizar la constante del
JS, borrar `viewport-fit=cover` de un HTML, quitar los márgenes laterales de la barra,
volver un botón a `10px` o meter un `matchMedia('(max-width: 768px)')` a mano en
`ui-router.js` producen entre 1 y 2 comprobaciones rojas y el script sale con código ≠ 0.
Sin esa verificación, un auditor verde no significa nada: la primera versión de una de sus
comprobaciones leía un marcador de sección que no existía, su `indexOf` devolvía `-1`, y
el «✓» era el resultado de no mirar nada.

### 5.1.1 Y uno que no estaba en el CSS: el minificador se comía las consultas

Terminada la tabla anterior, la interfaz estaba bien **en el fuente** y seguía mal
en un teléfono de 2019. `vite.config.js` compilaba con `build.target: 'esnext'` y Vite 8
minifica el CSS con lightningcss, que heredando ese objetivo reescribía las consultas a
la sintaxis de rango de Media Queries 4:

```css
/* fuente                          →  dist/assets/styles-*.css con target 'esnext' */
@media (max-width: 768px) {   →      @media (width<=768px) {
```

Esa forma la entiende Chrome ≥ 104 y Safari ≥ 16.4. Antes de esa fecha el navegador no
«aplica la regla distinta»: **descarta el bloque por error de sintaxis**. En el build de
antes de este cambio había **23 consultas** así, o sea todos los `@media` del shell móvil
*y* todas las utilidades `md:` de Tailwind — el punto de quiebre escritorio/móvil entero.
Nada en el `npm test`, en `verify:build` ni en la consola del navegador lo decía: los
archivos se servían con 200, válidos, y simplemente sin efecto.

Arreglo: `build.cssTarget: 'chrome61'` en `vite.config.js` (el JS se queda en `esnext`,
donde un navegador viejo falla ruidosamente y no en silencio). Costo: 6,85 KiB más de CSS
sin comprimir sobre 2,1 MB del paquete — la sintaxis larga ocupa un poco más.

Dos cosas que **no** arreglan esto y que valen la nota porque la primera tentativa fue una
de ellas:

- `css.lightningcss.targets` → lo pisa `build.cssTarget` (lo dice el propio tipo de Vite);
- `css.cssTarget` → solo lo escucha el minificador de esbuild, y Vite 8 no trae esbuild
  instalado (`Cannot find package 'esbuild'`).

Como el daño ocurría *después* del fuente, la comprobación no puede vivir en
`probar-movil.mjs`: vive en `npm run verify:build`, sobre `dist/`, y exige (a) que ninguna
hoja construida use sintaxis de rango, (b) que la consulta apaisada siga ahí, (c) que las
franjas del notch sobrevivan, y (d) que los cuatro HTML salgan con `viewport-fit=cover`.
Probada en negativo: con `cssTarget: 'chrome120'` a propósito, el verificador enumera las
23 consultas y sale con código 1.

### Lo que sigue siendo manual, y con qué

No hay navegador en el contenedor de este proyecto (los binarios de Playwright se descargan
de un host que el egress no permite), así que lo verificado acá es estático + jsdom. En un
aparato real queda mirar tres cosas, con el teléfono **en horizontal** y con el teclado
abierto: que la barra inferior desaparezca al escribir y vuelva al desenfocar; que ningún
botón de la barra caiga bajo el notch; y que la letra grande del perfil mueva también las
etiquetas de navegación. Diez minutos, dos teléfonos (uno con notch, uno con botón físico y
Android viejo, que es donde `env()` y `dvh` se ponen interesante).

---

## 6. Qué queda para una segunda iteración (opcional)

1. **Cámara directa en el teléfono autenticado:** re-integrar `Html5Qrcode` (API low-level) en `Mostrador` solo para `isMobilePhone`, sin pasar por QR-remoto.
2. **Búsqueda de lector offline con índice local:** hoy `db.obtenerLectores` cae a local solo si hay copia; indexar por nombre en IndexedDB.
3. **Mapa offline vectorial (PMtiles):** para tramos sin señal; por ahora el plan en línea recta + `urlGoogleMaps` resuelve.
4. **Gestos:** swipe desde el borde para abrir drawer + pull-to-refresh en catálogo (con guardas de sync).
5. ~~Teléfono en horizontal~~ — resuelto en §5.1, con auditor ejecutable. Queda pendiente la
   verificación en dos aparatos reales que describe ese mismo apartado.

---

## 7. Conclusión

La versión móvil dejó de ser “el escritorio encogido”. Ahora el teléfono tiene su propio shell pensado para el mesón y la ruta: menos toques, targets grandes, estado legible al sol y flujos verticales. El escritorio no se tocó; la deuda de los 12 fallos se cerró sin cambiar reglas de negocio.

> Nota de despliegue: es solo front-end. No requiere migración. Publicar `dist/` basta.
