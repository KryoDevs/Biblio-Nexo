# Registro de Cambios — Fase 3 (Loop de Corrección y Mejora)

- **Proyecto**: BiblioNexo — Biblioteca Pública Municipal de Futrono N° 332 «Escritor Ramón Quichiyao Figueroa»
- **Fecha**: 3 de octubre de 2026
- **Rama**: `arena/01a10005-biblio-nexo`

---

## ⚠️ Migraciones SQL que debes ejecutar en Supabase

Si tu proyecto en Supabase ya tiene ejecutadas las migraciones hasta la `026` o si ya habías intentado ejecutar la `027_prestamos_coordenadas.sql` anterior, abre el **SQL Editor** de tu proyecto en Supabase y ejecuta en este orden:

1. **`supabase/migrations/010_consolidacion.sql`** — Actualiza la fuente única de verdad de todas las funciones RPC (`prestar_libro` de 5 argumentos con soporte de coordenadas del Bibliomóvil, `estadisticas_paradas()` con control de acceso `es_personal()` y `SET search_path = public`, y `manifiesto_funciones()` con las 56 funciones consolidadas).
2. **`supabase/migrations/027_prestamos_coordenadas.sql`** — Añade de forma idempotente (`ADD COLUMN IF NOT EXISTS`) las columnas `parada_nombre`, `parada_lat` y `parada_lng` a `public.prestamos`.
3. **`supabase/migrations/028_reparar_sobrecarga_prestar_libro_y_paradas.sql`** — Elimina la sobrecarga obsoleta de 2 argumentos `public.prestar_libro(bigint, text)` (que provocaba `ERROR: function public.prestar_libro(integer, unknown) is not unique` en PostgreSQL) y crea el índice parcial `idx_prestamos_parada_nombre`.

Para verificar que la base de datos quedó limpia, ejecuta en el SQL Editor de Supabase:

```sql
select * from public.verificar_definiciones();
```

Todas las filas deben mostrar el diagnóstico **`Correcto`**.

---

## Iteración 1 — `[B-01]`, `[B-02]`, `[B-03]`, `[M-02]` (Base de datos y funciones consolidadas)

- **Qué fallaba**:
  1. `supabase/migrations/027_prestamos_coordenadas.sql` comenzaba con BOM UTF-8 (`EF BB BF`), haciendo que `probar_librero.py` abortara con `psycopg.errors.SyntaxError: syntax error at or near "\ufeff"`.
  2. Sus sentencias `ALTER TABLE public.prestamos ADD COLUMN ...` carecían de `IF NOT EXISTS`, fallando al re-ejecutar migraciones.
  3. Redefinía `public.prestar_libro(bigint, text, text, numeric, numeric)` y creaba `public.estadisticas_paradas()` fuera de `010_consolidacion.sql`. Al coexistir con `public.prestar_libro(bigint, text)` de `010_consolidacion.sql`, PostgreSQL lanzaba `function public.prestar_libro(integer, unknown) is not unique` (provocando 36 fallos en `probar-migraciones.py`).
  4. `public.estadisticas_paradas()` era `SECURITY DEFINER` sin `SET search_path = public` y sin verificar `if not public.es_personal()`, exponiendo conteos y coordenadas a usuarios sin sesión (`anon`).
  5. `pruebas/verificar_consolidacion.py` usaba una expresión regular sensible a mayúsculas y solo comparaba contra funciones ya existentes en `010`, dejando pasar funciones en mayúsculas o nuevas fuera de `010`.
- **Causa raíz**: Creación manual de la migración `027` guardada con BOM UTF-8 y sin trasladar las definiciones de funciones a `010_consolidacion.sql` ni eliminar la firma anterior de 2 argumentos.
- **Cambio aplicado**:
  - Se consolidaron `public.prestar_libro(bigint, text, text, numeric, numeric)` y `public.estadisticas_paradas()` (con guarda `if not public.es_personal()`, `SET search_path = public` y entrada en `manifiesto_funciones()`) dentro de `supabase/migrations/010_consolidacion.sql`, incluyendo un `DROP FUNCTION IF EXISTS public.prestar_libro(bigint, text);` antes de crear la firma de 5 argumentos con valores por defecto.
  - Se reescribió `supabase/migrations/027_prestamos_coordenadas.sql` en UTF-8 limpio sin BOM y con `ADD COLUMN IF NOT EXISTS`.
  - Se creó `supabase/migrations/028_reparar_sobrecarga_prestar_libro_y_paradas.sql` con `DROP FUNCTION IF EXISTS public.prestar_libro(bigint, text)` e índice parcial `idx_prestamos_parada_nombre`.
  - Se fortaleció `pruebas/verificar_consolidacion.py` con `re.IGNORECASE` y detección de cualquier función `public.*` declarada en migraciones posteriores a `010`.
  - Se añadieron pruebas de regresión en `pruebas/probar-migraciones.py` para `estadisticas_paradas()` (acceso denegado a `anon`, conteo por parada para personal) y `prestar_libro` con coordenadas de parada.
- **Archivos modificados**:
  - `supabase/migrations/010_consolidacion.sql`
  - `supabase/migrations/027_prestamos_coordenadas.sql`
  - `supabase/migrations/028_reparar_sobrecarga_prestar_libro_y_paradas.sql`
  - `pruebas/verificar_consolidacion.py`
  - `pruebas/probar-migraciones.py`
  - `pruebas/probar_librero.py`
- **Resultado de las pruebas**:
  - `python3 pruebas/verificar_consolidacion.py`: **OK** (58 funciones declaradas, 56 en manifiesto, 50 `SECURITY DEFINER` con control de acceso).
  - `python3 pruebas/verificar_llamadas_rpc.py`: **OK** (47 llamadas RPC coinciden).
  - `python3 pruebas/probar-migraciones.py`: **212 pasadas, 0 fallidas** (antes: 173 pasadas, 36 fallidas).
  - `python3 pruebas/probar_librero.py`: **130 correctas, 0 con fallo** (antes: abortaba por error de sintaxis).
- **Commit**: `a247377` — `fix(sql): consolida prestar_libro y estadisticas_paradas con guarda de acceso e idempotencia`

---

## Iteración 2 — `[B-04]`, `[M-01]` (Codificación UTF-8, eliminación de BOM, caracteres C1 y mojibake)

- **Qué fallaba**:
  - `src/js/config.js`, `index.html` y `src/js/modules/scanner.js` tenían BOM UTF-8 y secuencias mojibake (`CatÃ¡logo`, `PrÃ©stamos`, `MesÃ³n`, `BibliomÃ³vil`, `AdministraciÃ³n`, `No se encontrÃ³ ninguna cÃ¡mara en este dispositivo.`).
  - `index.html` contenía el byte de control C1 `0x81`, causando advertencias `parse5 error code control-character-in-input-stream` durante `npm run build`.
  - `probar-escaneo-remoto.mjs` fallaba en la prueba `si no hay ninguna cámara en el dispositivo, lo dice explícitamente`.
  - Existía el archivo temporal `test_html.mjs` en la raíz del repositorio.
- **Causa raíz**: Guardado previo de archivos en Windows-1252/UTF-8 con BOM que corrompió tildes, eñes, comillas tipográficas y comentarios.
- **Cambio aplicado**:
  - Se restauraron `src/js/config.js`, `index.html` y `src/js/modules/scanner.js` en UTF-8 limpio sin BOM ni caracteres de control C1.
  - Se eliminó el archivo basura `test_html.mjs`.
  - Se añadió la sección 14 en `pruebas/probar-interfaz.mjs` (`Codificación UTF-8 limpia — sin BOM, caracteres de control C1 ni mojibake`) que inspecciona todos los archivos `.html`, `.js`, `.css` y `.sql` del proyecto.
- **Archivos modificados**:
  - `index.html`
  - `src/js/config.js`
  - `src/js/modules/scanner.js`
  - `pruebas/probar-interfaz.mjs`
  - `test_html.mjs` (eliminado)
- **Resultado de las pruebas**:
  - `node pruebas/probar-interfaz.mjs`: **104/104 correctas**.
  - `node pruebas/probar-escaneo-remoto.mjs`: **13/13 correctas** (antes: 12/13).
  - `npm run build`: **0 advertencias de `parse5`**.
- **Commit**: `a39fc06` — `fix(encoding): elimina BOM UTF-8, caracteres C1 y mojibake en index.html, config.js y scanner.js`

---

## Iteración 3 — `[B-05]`, `[M-03]` (Estructura HTML, catálogo, avisos por parada y CSP en Bibliomóvil)

- **Qué fallaba**:
  1. En `src/js/vistas/bibliomovil.js`, un `</div> <!-- End TAB RUTA -->` huérfano cerraba prematuramente el contenedor principal de la vista y dejaba `<div id="tab-catalogo" class="biblio-tab-content hidden space-y-6">` permanentemente oculto sin botones `.biblio-tab-btn` en el DOM.
  2. El método `_notificarParadaBibliomovil(parada)` nunca se invocaba desde ningún botón de las paradas de la ruta.
  3. El código muerto `_conectarMesonMovil` y sus métodos auxiliares re-importaban dinámicamente `../modules/db.js` (generando la advertencia `[INEFFECTIVE_DYNAMIC_IMPORT]` en Vite) y consultaban IDs inexistentes y columnas erróneas (`lector.nombres`, `lector.apellidos`).
  4. `_alElegirPuntoEnMapaBibliomovil` llamaba a `fetch('https://nominatim.openstreetmap.org/reverse?...')`, bloqueado en consola por la directiva CSP `connect-src` y contrario al aviso de privacidad de la vista.
- **Causa raíz**: Refactorización incompleta al unificar el recorrido y el catálogo del Bibliomóvil en una sola vista.
- **Cambio aplicado**:
  - Se corrigió el marcado HTML de `renderBibliomovil()`, mostrando tanto `#tab-ruta` como `#tab-catalogo` por defecto e incorporando botones `.biblio-tab-btn` (`Todo`, `Mapa y ruta`, `Catálogo`) con `aria-pressed` para alternar o mostrar ambas secciones.
  - Se añadió el botón de acción `data-route-action="notify"` (`Avisar a lectores con préstamos en esta parada`) en cada parada de `#bibliomovil-route-stops`, conectado a `_notificarParadaBibliomovil(parada)` usando la importación estática `db.obtenerPendientesPorParada(parada.nombre)`.
  - Se eliminaron los métodos muertos de `_conectarMesonMovil` y la llamada no autorizada a Nominatim.
  - Se añadieron comprobaciones en `pruebas/probar-vistas.mjs` para verificar la visibilidad del catálogo, el filtro de secciones y el botón de aviso por parada.
- **Archivos modificados**:
  - `src/js/vistas/bibliomovil.js`
  - `pruebas/probar-vistas.mjs`
- **Resultado de las pruebas**:
  - `node pruebas/probar-vistas.mjs`: **OK**.
  - `npm run build`: **0 advertencias `[INEFFECTIVE_DYNAMIC_IMPORT]`**.
- **Commit**: `a7a5a2b` — `fix(bibliomovil): repara estructura HTML, pestañas de recorrido/catálogo, avisos por parada y cumplimiento CSP`

---

## Iteración 4 — `[B-06]`, `[M-02]` (Estadísticas por parada del Bibliomóvil en Reportes y CSV)

- **Qué fallaba**:
  - `db.obtenerReporte(desde, hasta)` no incluía los datos de `estadisticas_paradas()` y `src/js/vistas/reportes.js` no mostraba en pantalla ni en el archivo CSV la distribución de préstamos por parada del Bibliomóvil.
- **Causa raíz**: La función RPC `estadisticas_paradas()` solo se invocaba en `obtenerEstadisticas()` pero nunca se conectó a la vista de Reportes.
- **Cambio aplicado**:
  - En `src/js/modules/db/reportes.js`, `obtenerReporte()` consulta `supabase.rpc('estadisticas_paradas')` en paralelo y expone `porParada` en el objeto devuelto.
  - En `src/js/vistas/reportes.js`, se renderiza el bloque `#reporte-paradas` («Préstamos por parada del Bibliomóvil») con barra de proporción, coordenadas opcionales y estado vacío claro en español, además de incluir la tabla de paradas en `_exportarReporteCsv()`.
  - Se agregaron pruebas en `pruebas/probar-vistas.mjs`.
- **Archivos modificados**:
  - `src/js/modules/db/reportes.js`
  - `src/js/vistas/reportes.js`
  - `pruebas/probar-vistas.mjs`
- **Resultado de las pruebas**:
  - `node pruebas/probar-vistas.mjs`: **113/113 pasadas**.
  - `python3 pruebas/verificar_llamadas_rpc.py`: **OK**.
- **Commit**: `ba063ce` — `feat(reportes): muestra estadísticas de préstamos por parada del Bibliomóvil y las incluye en CSV`

---

## Iteración 5 — `[B-07]` (Estructura semántica de tabla en la vista Lectores)

- **Qué fallaba**:
  - En `src/js/vistas/lectores.js`, `renderUsers()` insertaba `${this._renderUserRows(users)}` (que devuelve filas `<tr><td>...</td></tr>`) dentro de un `<div id="users-tbody">`. Al asignar `innerHTML` sobre un `<div>`, el parser HTML5 eliminaba las etiquetas `<tr>` y `<td>`, rompiendo la estructura tabular y la actualización parcial `renderUsers(true)`.
- **Causa raíz**: Sustitución accidental de `<table>/<tbody id="users-tbody">` por `<div id="users-tbody">` sin cambiar `_renderUserRows()`.
- **Cambio aplicado**:
  - Se envolvió `#users-tbody` en una `<table class="w-full text-sm text-left">` con su `<thead ...>` accesible (`scope="col"`) y `<tbody id="users-tbody">`.
  - Se añadió una aserción en `pruebas/probar-vistas.mjs` que verifica que `#users-tbody` es un `TBODY` y conserva sus elementos `<tr>`.
- **Archivos modificados**:
  - `src/js/vistas/lectores.js`
  - `pruebas/probar-vistas.mjs`
- **Resultado de las pruebas**:
  - `node pruebas/probar-vistas.mjs`: **113/113 pasadas**.
- **Commit**: `59c366d` — `fix(lectores): envuelve #users-tbody en tabla semántica para conservar las filas <tr> y celdas <td>`

---

## Iteración 6 — `[B-08]`, `[M-04]` y Fase 4 (Corrección de estados hover, modo oscuro y consistencia visual)

- **Qué fallaba**:
  - En `src/js/modules/ui-router.js`, un reemplazo masivo anterior había transformado `hover:bg-white/10` en `hover:bg-white dark:bg-stone-800/10` en los botones del menú lateral (`.nav-btn`, `#perfil-btn`, `#logout-btn`), dejando fondo blanco sólido (`#FFFFFF`) con texto blanco al pasar el cursor en modo claro.
  - En `ui-modales.js`, `catalogo.js`, `lectores.js` y `prestamos.js`, varios botones de cancelar/cerrar tenían `hover:bg-stone-100 dark:bg-stone-700` (fondo gris permanente en modo oscuro en vez de `dark:hover:bg-stone-800`).
  - `showConfirm` y `showPrompt` en `ui-modales.js` carecían de clases `dark:*`.
  - Las tarjetas de `dashboard.js` usaban `rounded-[2rem] shadow-soft-xl` en lugar del estándar del sistema de diseño `rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600`.
- **Causa raíz**: Reemplazo automático de clases `bg-white` y `bg-stone-100` sin distinguir modificadores `hover:` ni opacidad `/10`.
- **Cambio aplicado**:
  - Se corrigió `hover:bg-white/10` en `src/js/modules/ui-router.js`.
  - Se agregaron variantes `dark:*` completas y bordes `rounded-2xl` en `showConfirm`, `showPrompt`, `showNotifyModal` y `showNotifyReservaModal` (`src/js/modules/ui-modales.js`).
  - Se unificaron las tarjetas del Dashboard (`src/js/vistas/dashboard.js`) al estilo «Patrimonio de Futrono» (`catalog-card bg-patrimonio-card dark:bg-stone-900 rounded-2xl shadow-sm border border-stone-300 dark:border-stone-600 p-5`).
  - Se corrigieron los estados `dark:hover:bg-stone-800` y `dark:hover:bg-stone-700` en `reportes.js`, `mostrador.js`, `catalogo.js`, `lectores.js` y `prestamos.js`.
- **Archivos modificados**:
  - `src/js/modules/ui-router.js`
  - `src/js/modules/ui-modales.js`
  - `src/js/vistas/dashboard.js`
  - `src/js/vistas/reportes.js`
  - `src/js/vistas/mostrador.js`
  - `src/js/vistas/catalogo.js`
  - `src/js/vistas/lectores.js`
  - `src/js/vistas/prestamos.js`
- **Resultado de las pruebas**:
  - `node pruebas/probar-contraste.mjs`: **13/13 pares cumplen WCAG 2.1 AA, 0 regresiones de color**.
  - `python3 pruebas/verificar_clases_tailwind.py`: **Todas las clases usadas están compiladas**.
  - `npm test` y `npm run test:legacy`: **100 % en verde**.
- **Commit**: `fd968e6` — `style(ui): corrige estados hover en menú lateral y modales, y unifica estética Patrimonio de Futrono y modo oscuro`
