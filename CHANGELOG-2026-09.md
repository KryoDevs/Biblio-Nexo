# Mejoras y correcciones - Septiembre 2026

**13 de septiembre de 2026** - Corrección de errores y limpieza inicial (Parte 1)

✅ **1. CI no ejecutaba pruebas legacy**
- **Hallazgo:** El flujo de CI en `.github/workflows/pruebas.yml` (job `interfaz`) solo llamaba a `npm run test` (Vitest), omitiendo todos los scripts `pruebas/probar-*.mjs`. Vitest, por defecto, ignoraba estos archivos al no tener terminación `.test.js`. Además, el test `probar-interfaz.mjs` tenía un bug en su expresión regular que solo afectaba la ejecución limpia.
- **Acción:** Se agregó explícitamente la ejecución de los comandos legacy (`npm run test:legacy:interfaz`, etc.) al job de la interfaz en GitHub Actions, y se corrigió el comentario. Se corrigió el bug de la expresión regular en la prueba.
- **Archivos tocados:**
  - `[MOD] .github/workflows/pruebas.yml`
  - `[MOD] pruebas/probar-interfaz.mjs`

✅ **2. Archivo .gitignore corrupto**
- **Hallazgo:** La última línea de `.gitignore` que intentaba ignorar `dist/` estaba corrupta con bytes nulos (UTF-16).
- **Acción:** Se reescribió la línea corrupta con formato UTF-8 limpio para que el ignorado de `dist/` funcione.
- **Archivos tocados:**
  - `[MOD] .gitignore`

✅ **3. Falta de respaldo offline en obtenerLibros()**
- **Hallazgo:** La búsqueda de libros `obtenerLibros()` no tenía una vía de escape al catálogo local en caso de falla de red.
- **Acción:** Se modificó `db/libros.js` envolviendo la llamada al RPC y la consulta de respaldo en un bloque `try/catch`. Si el error es un timeout o falta de red (`!navigator.onLine`), cae transparentemente a `persistencia.buscarLibrosLocales()`.
- **Archivos tocados:**
  - `[MOD] src/js/modules/db/libros.js`

✅ **4. Fallo silencioso en eliminarLector()**
- **Hallazgo:** La eliminación de lectores se hacía llamando directamente a `delete()`. Al estar protegida por RLS (solo admin), un librero que intentara borrar un lector recibía un 'falso éxito' de la API (0 filas afectadas sin error). Además, la lógica de anonimización exigía un segundo viaje al servidor.
- **Acción:** Se creó la migración `020_rpc_eliminar_lector.sql` con una función `SECURITY DEFINER` que verifica `es_admin()`, realiza el borrado, y anonimiza si hay error 23503, todo en una transacción.
- **Archivos tocados:**
  - `[NEW] supabase/migrations/020_rpc_eliminar_lector.sql`
  - `[MOD] src/js/modules/db/lectores.js`


✅ **5. Remover carpeta dist/ del control de versiones**
- **Hallazgo:** La carpeta de compilación dist/ estaba siendo versionada en Git debido a un error previo en el .gitignore.
- **Acción:** Se ejecutó git rm -r --cached dist/ para destrackearla del historial sin borrar los archivos locales, manteniendo el repositorio limpio.
- **Archivos tocados:**
  - [DEL] dist/* (del historial de git)


✅ **6. Archivo diff huérfano**
- **Hallazgo:** Existía un archivo offline-atrasados-sin-conexion.diff en la raíz. Tras revisarlo, todos los cambios que proponía ya estaban integrados en el código de IndexedDB y probados.
- **Acción:** Se eliminó el archivo por ser basura residual.
- **Archivos tocados:**
  - [DEL] offline-atrasados-sin-conexion.diff
✅ **7. Scripts de automatización residuales (.cjs)**
- **Hallazgo:** Se encontraron 19 archivos *.cjs (fix_*.cjs, prep_*.cjs, patch_*.cjs, find_*.cjs) que eran andamios de refactorización antiguos. Sus cambios ya formaban parte de la base de código.
- **Acción:** Se eliminaron todos del repositorio para limpiarlo.
- **Archivos tocados:**
  - [DEL] *.cjs (19 archivos eliminados)

✅ **8. Eliminación de capa de repositorios (duplicidad)**
- **Hallazgo:** La capa de acceso a datos estaba duplicada en repositorios/*.js. Estos archivos no aportaban lógica, simplemente llamaban a los métodos homónimos en db.js, agregando una capa de indirección inútil.
- **Acción:** Se reemplazaron todos los imports de repositorios/*.js en las vistas (src/js/vistas/*.js) y en ui-base.js por un import directo a db.js. Luego se eliminó por completo la carpeta src/js/repositorios/.
- **Archivos tocados:**
  - [MOD] src/js/vistas/*.js (todas las vistas)
  - [MOD] src/js/modules/ui-base.js
  - [DEL] src/js/repositorios/ (carpeta eliminada por completo)

✅ **9. Limpieza de restos muertos e imports**
- **Hallazgo:** Tras un escaneo del árbol de dependencias, no se encontraron archivos huérfanos en src/js/ (la limpieza previa fue efectiva). Solo se detectó que la función escapeHtml estaba siendo importada pero no utilizada en un par de vistas.
- **Acción:** Se eliminó el import de escapeHtml de los archivos correspondientes.
- **Archivos tocados:**
  - [MOD] src/js/vistas/bibliomovil.js
  - [MOD] src/js/vistas/catalogo.js
 
? **10. Correcci�n de codificaci�n del Changelog** 
- **Hallazgo:** El archivo ten�a mezcla de saltos de l�nea y bytes corruptos (Latin-1) que romp�an palabras y emojis. 
- **Acci�n:** Se reescribieron los bloques afectados en UTF-8 puro y se normalizaron todos los saltos de l�nea a LF. 
- **Archivos tocados:** 
  - [MOD] CHANGELOG-2026-09.md

✅ **10. Corrección de codificación del Changelog**
- **Hallazgo:** El archivo tenía mezcla de saltos de línea y bytes corruptos (Latin-1) que rompían palabras y emojis.
- **Acción:** Se reescribieron los bloques afectados en UTF-8 puro y se normalizaron todos los saltos de línea a LF.
- **Archivos tocados:**
  - [MOD] CHANGELOG-2026-09.md

✅ **11. Refactorización de eliminar_lector y anonimización**
- **Hallazgo:** El RPC de eliminar lector carecía de comprobación de filas afectadas, pudiendo retornar éxito falso. Además, reusaba el flag 'bloqueado_manual', distorsionando las vistas de reportes.
- **Acción:** Se movió la función a '010_consolidacion.sql', se agregó 'row_count', y se introdujo la nueva columna 'anonimizado_en' mediante '025_anonimizacion_lectores.sql'. '024' (ex '020') fue vaciada.
- **Archivos tocados:**
  - [MOD] supabase/migrations/010_consolidacion.sql
  - [MOD] supabase/migrations/024_rpc_eliminar_lector.sql
  - [NEW] supabase/migrations/025_anonimizacion_lectores.sql


## 2026-09-29: Plan de Saneamiento Definitivo (Fases 1 a 4)
- **Fase 1 (Quick Wins)**:
  - Limpieza de `config.js` estricta usando variables `.env` en producción.
  - Corrección de bugs de UI/UX en `escaneo-remoto.js`, previniendo reintentos infinitos sin red.
  - El usuario completó las optimizaciones UX (`UX1`, `UX2`, botones disable en formularios).
- **Fase 2 (Deuda Técnica)**:
  - Extracción completa del God Object `ui-base.js`.
  - Creación de `src/js/modules/ui-router.js` para manejar la navegación de la SPA.
  - Extracción definitiva de los métodos de diálogos modales hacia `src/js/modules/ui-modales.js`.
- **Fase 3 (Pruebas y Offline)**:
  - Se añadieron tests Vitest exhaustivos para `eliminar_lector()` interceptando casos RLS.
  - Se añadieron tests Vitest para comprobar lógica de filtros en IndexedDB.
  - Se actualizaron las vistas `bibliomovil.js` y `catalogo.js` para delegar el filtrado de stock y modo ruta localmente a `persistencia.js`.
- **Fase 4 (Futuro)**:
  - Se creó el documento de arquitectura `ALEPH500_SIP2.md` documentando el túnel seguro y microservicio SIP2-REST.
  - Se añadió la tarea de hardware pendiente (Cifrado BitLocker en PC local y nombramiento del DPO municipal) al documento `CUMPLIMIENTO-LEGAL.md` por la Ley 21.719.
