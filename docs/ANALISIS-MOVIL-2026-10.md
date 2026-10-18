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

---

## 6. Qué queda para una segunda iteración (opcional)

1. **Cámara directa en el teléfono autenticado:** re-integrar `Html5Qrcode` (API low-level) en `Mostrador` solo para `isMobilePhone`, sin pasar por QR-remoto.
2. **Búsqueda de lector offline con índice local:** hoy `db.obtenerLectores` cae a local solo si hay copia; indexar por nombre en IndexedDB.
3. **Mapa offline vectorial (PMtiles):** para tramos sin señal; por ahora el plan en línea recta + `urlGoogleMaps` resuelve.
4. **Gestos:** swipe desde el borde para abrir drawer + pull-to-refresh en catálogo (con guardas de sync).

---

## 7. Conclusión

La versión móvil dejó de ser “el escritorio encogido”. Ahora el teléfono tiene su propio shell pensado para el mesón y la ruta: menos toques, targets grandes, estado legible al sol y flujos verticales. El escritorio no se tocó; la deuda de los 12 fallos se cerró sin cambiar reglas de negocio.

> Nota de despliegue: es solo front-end. No requiere migración. Publicar `dist/` basta.
