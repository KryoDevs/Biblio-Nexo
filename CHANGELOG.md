# Changelog — BiblioNexo

Todos los cambios relevantes de esta auditoría y sesión de mejoras se documentan en este archivo.
El proyecto utiliza [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en español.

---

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
