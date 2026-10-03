# Changelog — BiblioNexo

Todos los cambios relevantes de esta auditoría y sesión de mejoras se documentan en este archivo.
El proyecto utiliza [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/) en español.

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
