# Changelog — BiblioNexo

Todos los cambios relevantes de esta auditoría y sesión de mejoras se documentan en este archivo.
El proyecto utiliza [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en español.

---

## [1.4.0] — 2026-10-11

### Añadido (`feat`)
- **Adaptabilidad a teléfonos y tablets**: el menú lateral pasa a cajón hasta 1024px (el mismo
  umbral del botón que lo abre — antes, en un iPad en vertical no había forma de navegar), con
  cierre al elegir sección, con `Escape`, con botón propio y sin desplazar la página de atrás.
- **Barra de accesos rápidos** en teléfono y tablet (`CONFIG.VISTAS_RAPIDAS` ∩ `VIEWS_BY_ROLE`,
  máximo cuatro + «Más»): las tareas del día a un toque.
- **Tablas adaptables**: hasta 768px cada fila se lee como ficha con la etiqueta de su columna
  (`data-etiqueta`), sin duplicar HTML ni lógica. 12 tablas convertidas.
- **Alto y recorte de pantalla**: helpers en `100dvh`, `viewport-fit=cover`,
  `interactive-widget=resizes-content` y `env(safe-area-inset-*)` en cajón, barra inferior,
  avisos y área de trabajo.
- **Área táctil**: `.boton-icono` de 44px en pantalla táctil, 40px de alto mínimo en los botones
  de las vistas y campos de 16px por debajo de 1024px (iOS no hace zoom al enfocar).
- **Modo oscuro completo**: base `#0c0a09`, foco del teclado en ámbar sobre fondo oscuro, sellos
  y esqueletos, mapa del Bibliomóvil con mosaicos invertidos y controles de Leaflet, acentos de
  marca aclarados en un solo bloque del CSS (incluido el menú lateral, oscuro en los dos temas) y
  `theme-color` que sigue al tema elegido.
- **`public/tema-inicial.js`**: script clásico en el `<head>` que aplica el tema antes del primer
  pintado — se acabó el destello blanco al cargar con el modo oscuro guardado.

### Corregido (`fix`)
- **`h-screen` en el cargador de arranque, el mensaje de error crítico y las pantallas de
  ingreso**: `100vh` es más alto que la pantalla visible de un teléfono, así que el pie de los
  formularios y el botón de reintentar quedaban debajo de la barra del navegador.
- **Páginas del correo sin tema**: `renderNuevaPassword` y `renderCompletarInvitacion` no
  aplicaban la preferencia guardada (se entra por el enlace, sin pasar por el ingreso).
- **Ocho colores que viajaban como variable** (`${color}` ternarios en Administración, Préstamos,
  Catálogo, Dashboard y Reportes) quedaban en `rose-700`/`amber-700` sobre tarjeta oscura
  (2,5:1–3,2:1). Ahora llevan su pareja oscura y hay un escáner que los vigila.
- **Interruptor del modo oscuro en Mi perfil**: el carril tenía dos clases oscuras a la vez
  (`dark:bg-patrimonio-lago` y `dark:bg-stone-700`), así que podía verse encendido estando
  apagado; ahora cada estado tiene su pareja por tema.
- **Panel de vidrio del ingreso**: usaba un azulado fuera de la paleta; pasa a la familia stone.
- **Aviso de éxito**: texto blanco sobre esmeralda 500 daba 2,56:1; ahora es el 700 (5,5:1).
- **Diálogos**: tope de alto con scroll interno para que los botones no queden fuera de la
  ventana con el teclado abierto o el teléfono en horizontal.
- **Páginas fuera del panel**: el 404 usa `dvh`; el escaneo remoto (que siempre se abre desde un
  teléfono) declara el viewport con teclado y muesca; la política de privacidad convierte su
  tabla de datos personales en fichas y reduce el margen en pantalla angosta.

### Corregido en la segunda pasada (revisión con navegador real)

La primera parte de la ronda se revisó leyendo el código y con las suites. Después se abrió el
banco de vista previa en un Chromium de verdad, a 360, 390, 768 y 1024px, y aparecieron cuatro
cosas que ninguna suite podía ver. Tres de ellas afectaban a **teléfonos reales**:

- **El menú lateral seguía ocupando lugar dentro de la fila, en teléfono y tablet**: la regla base
  de escritorio (`#sidebar { position: relative }`) estaba más abajo en el archivo que el bloque
  del cajón y, con la misma especificidad, le ganaba por puro orden de cascada. Medido en un marco
  de 358px: el cajón quedaba en `position: relative` con una transformación de -308px y el área de
  trabajo se reducía a **50px** de ancho; la aplicación entera se veía recortada. Las dos formas
  del menú viven ahora en consultas de medios que no pueden coincidir (`max-width: 1023.98px` y
  `min-width: 1024px`), así que el orden del archivo dejó de importar, y la suite lo vigila.
- **El panel de notificaciones se abría fuera de la pantalla**: cuelga de la campana, que está
  pegada al borde derecho, y con sus 320px de ancho natural se alineaba por la derecha y desbordaba
  por la izquierda. Medido: entre -46 y 258 en una pantalla de 358px, con el título
  «Notificaciones» cortado. En pantalla angosta pasa a ocupar el ancho disponible, y la franja de
  título recibe una capa propia para que el panel no quede pintado detrás del contenido (el
  `backdrop-filter` de la franja la volvía el bloque contenedor del `fixed`).
- **La tarjeta de un libro se desbordaba 47px a lo ancho**: el título largo empujaba la fila de
  datos más allá de la tarjeta, así que en el teléfono la mitad derecha (autor, ISBN, sellos) se
  perdía con el nombre del libro serrado por el borde. La fila lleva `w-full` y el contenedor de
  datos `min-w-0` — que ya estaba, pero no alcanzaba sin el `w-full` de la fila.
- **La veta de madera de los botones mostraba costuras**: el mosaico de 120px no cierra en los
  bordes (el ruido de `feTurbulence` no es sin fin), así que cada unión dejaba una línea vertical
  recta en medio del botón, visible sobre todo en los botones anchos. Ahora la mancha se estira al
  tamaño del botón.
- **El velo del cajón no se veía en modo oscuro**: un velo oscuro sobre el papel casi negro del
  modo nocturno no se distingue. En modo oscuro sube de opacidad.
- **El botón «Preparar datos sin conexión» y «Prestar»** usaban un `#5E3214` escrito a mano, que no
  es el tono de hover de la paleta (`#633414`); ahora usan `.btn-madera`, que además les da la veta
  y la microinteracción del resto de los botones de madera.

### Pruebas
- Nueva suite `pruebas/probar-adaptabilidad.mjs` (88 comprobaciones, sin navegador), enganchada a
  `npm run test:legacy` y al trabajo de interfaz de la CI. Además de los contratos de la primera
  pasada, vigila los cuatro arreglos de la segunda: que el cajón sea fijo dentro de su consulta de
  medios y que no quede ninguna regla `#sidebar` con `position` fuera de una (el choque de cascada
  que recortaba el área de trabajo), que la franja y el panel de notificaciones se acomoden en
  pantalla angosta, que la fila de la tarjeta de libro ocupe el ancho de su tarjeta y que la veta
  de los botones no se repita.
- `probar-contraste.mjs`: pares del tema oscuro y de los avisos, y los avisos entran al escaneo de
  regresiones (incluida la corrección del propio escáner, que leía `bg-[#10b981]` como expresión
  regular).
- `generar-vista-previa.mjs`: diez pantallas con el cascarón real, cada una en un marco del ancho
  elegido (360, 390, 768, 1024 o completo), con modo oscuro y cajón abierto.
- Detalle completo en `docs/auditoria/06-adaptabilidad-movil-y-modo-oscuro-2026-10-11.md`.

## [1.3.0] — 2026-10-03

### Añadido (`feat`)
- **Catálogos separados**: el catálogo de la biblioteca (sede) y el del Bibliomóvil (ruta) ya no
  comparten títulos. Nueva migración `030_separacion_catalogo_bibliomovil.sql` (`es_bibliomovil` pasa a
  `not null` con `default false`, índice `(es_bibliomovil, titulo)`), `buscar_libros()` compara con
  `coalesce`, y `db.cambiarColeccionLibro()`. En la interfaz: cada vista pide su colección, insignia
  «Bibliomóvil» en el ejemplar, botón «Al Bibliomóvil / A la sede» (admin), casilla en el alta y
  selector «Colección» al editar.
- **Mi perfil rediseñado**: encabezado de identidad, datos editables, contraseña con requisitos en
  vivo, preferencias (tamaño de letra y modo oscuro), actividad de la cuenta, accesos rápidos y sesión.
- **Bibliomóvil**: cabecera con resumen operativo (títulos, disponibles, en préstamo, recorrido y
  distancia), tarjeta de «Preparación sin conexión», distancia entre paradas, estados vacíos que
  explican qué hacer y **hoja de ruta imprimible** con membrete institucional.
- **Herramientas**: `pruebas/generar-vista-previa.mjs` (revisión visual con datos de ejemplo, sin
  credenciales) y detector de clases Tailwind mal formadas en `verificar_clases_tailwind.py`.

### Corregido (`fix`)
- **Libro invisible**: un ejemplar con `es_bibliomovil` en `NULL` no aparecía en ninguna de las dos
  colecciones. Ahora `NULL` cuenta como sede en el servidor y en la copia sin conexión, y la 030
  elimina el `NULL` de la base.
- **Copia local sin conexión**: el alta de un libro no guardaba su colección (nacía como de sede).
- **Carrera de búsqueda en el catálogo**: una respuesta lenta podía pisar resultados más nuevos.
- **Mi perfil**: un fallo de red se mostraba como «falta ejecutar la migración 008»; ahora se distingue
  y ofrece reintentar.
- **Texto de contraseña**: no mencionaba mayúscula ni número, requisitos que el validador exige.
- **Cuatro clases Tailwind mal formadas** (`dark:bg-stone-800/50/60` y `/50/70`) que dejaban fondos sin
  pintar en modo oscuro.
- **Bibliomóvil**: la etiqueta «Preparar datos sin conexión» se revertía a otro texto tras sincronizar;
  se eliminó `_filtrarLibros()`, código muerto que repetía la regla de disponibilidad.
- **Estados vacíos**: ahora distinguen «colección vacía» de «búsqueda sin resultados» y explican cómo
  agregar ejemplares.

### Pruebas (`test`)
- `probar-vistas.mjs` (+6 comprobaciones): cada catálogo pide su colección, botón de mover, vacíos.
- `probar-migraciones.py` (+2): columna `es_bibliomovil` y separación real de colecciones en PostgreSQL.
- `persistencia.test.js` (6 pruebas): ejercita `filtrarLibrosLocales()` real, no una copia.
- `bibliomovil-ruta.test.js`: semántica `NULL` = sede, actualizada y documentada.

### Documentación (`docs`)
- `docs/auditoria/05-catalogo-bibliomovil-perfil-2026-10-03.md`: informe completo, errores con causa
  raíz, errores visuales, rediseño, mejoras del Bibliomóvil y 15 sugerencias con sus beneficios.

---

## [1.2.0] — 2026-10-03

### Añadido (`feat`)
- **Rol operativo `bibliomovil`**: menú propio (aterriza en la ruta), invitaciones y cambio de rol desde Administración → Personal, validación en `asignar_rol` (`010_consolidacion.sql`), dominio SQL (`029_rol_bibliomovil.sql`) y Edge Function `invitar-personal`. El Dashboard de ruta ofrece accesos al mapa y al mesón de parada; el catálogo de sede oculta el alta de libros.
- **Jerarquía visual y animaciones**: entrada de vistas, menú lateral escalonado, panel de ingreso, diálogos, esqueletos con brillo, tarjetas `elevate-hover`, kicker de sección en la franja de título e indicador de conexión con modo oscuro.

### Pruebas (`test`)
- Cobertura del rol `bibliomovil` en `probar-interfaz.mjs` y `probar-vistas.mjs` (menú, aterrizaje, restricción de Administración, dashboard de ruta y catálogo sin alta).

---

## [1.1.0] — 2026-10-03

### Corregido (`fix`)
- **Base de datos y migraciones SQL (`010`, `027`, `028`)**:
  - Eliminado el BOM UTF-8 (`\ufeff`) al inicio de `supabase/migrations/027_prestamos_coordenadas.sql` que provocaba un error fatal de sintaxis en `psycopg`.
  - Añadido `IF NOT EXISTS` a las sentencias `ALTER TABLE public.prestamos ADD COLUMN` para garantizar idempotencia.
  - Consolidada la versión de 5 parámetros de `public.prestar_libro(bigint, text, text, numeric, numeric)` en `supabase/migrations/010_consolidacion.sql` y eliminada la sobrecarga obsoleta de 2 argumentos (`public.prestar_libro(bigint, text)`) mediante `028_reparar_sobrecarga_prestar_libro_y_paradas.sql`, resolviendo el fallo `function public.prestar_libro(integer, unknown) is not unique`.
  - Añadida la guarda `if not public.es_personal() then raise exception ...`, `SET search_path = public` y registro en `manifiesto_funciones()` para `public.estadisticas_paradas()`, impidiendo que usuarios anónimos (`anon`) consulten estadísticas territoriales sin sesión.
- **Codificación UTF-8 (`index.html`, `src/js/config.js`, `src/js/modules/scanner.js`)**:
  - Eliminados los encabezados BOM UTF-8, el carácter de control C1 (`0x81`, que producía advertencias `parse5 error code control-character-in-input-stream` en Vite) y todas las cadenas con doble codificación (mojibake) en etiquetas del menú lateral, metadatos de la biblioteca y mensajes de error de cámara.
  - Eliminado el archivo temporal `test_html.mjs` de la raíz del repositorio.
- **Vista Bibliomóvil (`src/js/vistas/bibliomovil.js`)**:
  - Reparado el cierre prematuro `</div>` en `renderBibliomovil()` que dejaba inaccesible la sección `#tab-catalogo`.
  - Incorporados botones accesibles de filtro de sección (**Todo**, **Mapa y ruta**, **Catálogo**) y el botón de aviso por WhatsApp en cada parada (`data-route-action="notify"`).
  - Eliminado el código muerto `_conectarMesonMovil` y sus importaciones dinámicas redundantes de `db.js` (que generaban advertencias `[INEFFECTIVE_DYNAMIC_IMPORT]` en Vite).
  - Eliminada la petición no autorizada a `nominatim.openstreetmap.org/reverse` que violaba la directiva CSP `connect-src` y el aviso de privacidad del recorrido.
- **Vista Lectores (`src/js/vistas/lectores.js`)**:
  - Envuelto `#users-tbody` dentro de una estructura semántica `<table>` + `<thead>` + `<tbody id="users-tbody">` para que el navegador no descarte las etiquetas `<tr>` y `<td>` devueltas por `_renderUserRows()`.

### Añadido (`feat`)
- **Estadísticas por parada del Bibliomóvil en Reportes (`src/js/modules/db/reportes.js`, `src/js/vistas/reportes.js`)**:
  - `db.obtenerReporte()` incluye ahora el resultado de `estadisticas_paradas()` en `porParada`.
  - La vista **Reportes** muestra la sección **«Préstamos por parada del Bibliomóvil»** (`#reporte-paradas`) con barras de proporción y coordenadas, e incluye el desglose en la exportación a CSV.
- **Migración `028_reparar_sobrecarga_prestar_libro_y_paradas.sql`**:
  - Retira la sobrecarga antigua de `prestar_libro(bigint, text)` en bases existentes y crea el índice parcial `idx_prestamos_parada_nombre`.

### Estilo y Accesibilidad (`style`)
- **Sistema de diseño «Patrimonio de Futrono» y modo oscuro (`ui-router.js`, `ui-modales.js`, `dashboard.js`, `reportes.js`, `mostrador.js`, `catalogo.js`, `lectores.js`, `prestamos.js`)**:
  - Corregida la clase `hover:bg-white dark:bg-stone-800/10` por `hover:bg-white/10` en los botones del menú lateral, evitando que el botón quedara blanco sobre texto blanco al pasar el cursor.
  - Añadido soporte completo de modo oscuro y bordes `rounded-2xl` en `showConfirm()` y `showPrompt()`, y corregidos los estados hover de botones secundarios (`dark:hover:bg-stone-800`).
  - Unificadas las tarjetas del Dashboard con `rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600`.

### Pruebas y Documentación (`test`, `docs`)
- Ampliado `pruebas/verificar_consolidacion.py` (insensible a mayúsculas/minúsculas y detección de funciones nuevas declaradas fuera de `010_consolidacion.sql`).
- Añadida la sección 14 en `pruebas/probar-interfaz.mjs` para impedir regresiones de BOM UTF-8, caracteres C1 o mojibake en archivos fuente.
- Añadidas pruebas de regresión en `pruebas/probar-migraciones.py` y `pruebas/probar-vistas.mjs`.
- Creada la documentación completa de auditoría en `docs/auditoria/` (`01-informe-inicial.md`, `02-registro-cambios.md`, `03-mejoras-visuales.md`, `04-resumen-final.md`) y actualizados `README.md`, `LEEME.md`, `CLAUDE.md` y `MIGRACIONES.md`.
