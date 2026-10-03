# Informe Inicial de Auditoría Técnica, Seguridad y Producto — BiblioNexo

**Fecha:** 3 de octubre de 2026  
**Repositorio:** `KryoDevs/Biblio-Nexo`  
**Rama de trabajo activa:** `arena/01a10005-biblio-nexo` (basada en `01112a7afe74b530038919bf33ea7c2d07ea62e7`)  
**Alcance:** Código fuente (`src/`), páginas HTML (`index.html`, `escaneo-remoto.html`, `404.html`, `privacidad.html`), estilos (`src/assets/css/styles.css`), migraciones SQL (`supabase/migrations/001`–`027`), funciones Edge (`supabase/functions/`), configuración (`vite.config.js`, `vercel.json`, `package.json`) y suites de pruebas (`pruebas/`, `src/js/modules/__tests__/`).

---

## 0. Verificación del Contexto contra el Código Real y Línea Base (Fase 0)

Antes de listar hallazgos, se contrastó cada supuesto del contexto con el estado real del repositorio en el commit `01112a7`:

1. **Build step y estructura de carpetas (`src/js/` + Vite + PWA):**
   - A diferencia de las primeras versiones sin empaquetado, el proyecto **sí cuenta hoy con un paso de compilación** mediante **Vite 6**, **Tailwind CSS v4 (`@tailwindcss/postcss`)** y **`vite-plugin-pwa` (Workbox)** configurados en `package.json` y `vite.config.js`.
   - El código fuente vive bajo `src/js/` (`src/js/main.js`, `src/js/arranque.js`, `src/js/config.js`, `src/js/supabase-init.js`, `src/js/escaneo-remoto.js`, `src/js/modules/*.js`, `src/js/modules/db/*.js` y `src/js/vistas/*.js`), mientras que las librerías locales autoalojadas viven en `public/vendor/js/` (`supabase.js`, `chart.umd.js`, `html5-qrcode.min.js`, `qrcode.min.js`).
2. **Estado real de `pruebas/probar-vistas.mjs`:**
   - El supuesto de que `probar-vistas.mjs` estaba roto por buscar una subcarpeta `biblionexo/` ya fue resuelto en commits previos (usa `fs.cpSync(raiz, tmp)` sobre `src/js`). Actualmente **pasa 99 de 99 pruebas**, aunque emite advertencias de parseo HTML5 (`parse5 error code control-character-in-input-stream`) provocadas por corrupción de codificación en `index.html`.
3. **Regla arquitectónica de migraciones SQL (`010_consolidacion.sql` vs. nuevas migraciones):**
   - El repositorio implementa en `supabase/migrations/010_consolidacion.sql`, `MIGRACIONES.md` y `pruebas/verificar_consolidacion.py` la regla de que **`010_consolidacion.sql` es la fuente única de verdad para todas las funciones RPC**, mientras que las migraciones posteriores (`011`–`027`) declaran cambios de esquema (tablas, columnas, índices, políticas).
   - Justamente el commit `01112a7` agregó `027_prestamos_coordenadas.sql` redefiniendo `prestar_libro` fuera de `010_consolidacion.sql`, lo que rompió simultáneamente `probar-migraciones.py` (36 fallos) y `probar_librero.py`.

### Resultados de la Línea Base de Pruebas (Estado Inicial en `01112a7`)

| Suite / Comando | Estado Inicial | Resultado Detallado | Causa de Fallo / Observación |
|---|---|---|---|
| `python3 pruebas/verificar_consolidacion.py` | ⚠️ Pasa con falso negativo | `0 errores` reportados | **Falso negativo:** su expresión regular era sensible a mayúsculas (`create or replace function`), por lo que no detectó `CREATE OR REPLACE FUNCTION` en mayúsculas dentro de `027_prestamos_coordenadas.sql`. |
| `python3 pruebas/verificar_llamadas_rpc.py` | ✅ Pasa | `46 llamadas RPC` válidas | Coinciden con las firmas SQL declaradas. |
| `python3 pruebas/verificar_clases_tailwind.py` | ✅ Pasa | `124 clases` verificadas | Todas las clases de `escaneo-remoto.html` y `404.html` existen en `public/vendor/css/tailwind.css`. |
| `npm test` (Vitest) | ✅ Pasa | `39 pasadas, 0 fallidas` (6 archivos) | Pruebas unitarias en `src/js/modules/__tests__/`. |
| `node pruebas/probar-interfaz.mjs` | ✅ Pasa | `59 pasadas, 0 fallidas` | Comprobaciones estáticas de HTML, CSS y JS. |
| `node pruebas/probar-vistas.mjs` | ⚠️ Pasa con avisos | `99 pasadas, 0 fallidas` | Emite múltiples `parse5 error code control-character-in-input-stream` por bytes de control C1 (`0x81`) en `index.html`. |
| `node pruebas/probar-escaneo-remoto.mjs` | ❌ **FALLA** | `48 pasadas, 1 fallida` | Falla la prueba *"el botón de cámara avisa claro cuando el navegador no tiene cámara"* porque `src/js/modules/scanner.js` tiene mojibake (`No se encontrÃ³ ninguna cÃ¡mara`). |
| `node pruebas/probar-estado-conexion.mjs` | ✅ Pasa | `16 pasadas, 0 fallidas` | Estado online/offline del navegador. |
| `node pruebas/probar-persistencia.mjs` | ✅ Pasa | `32 pasadas, 0 fallidas` | Caché local en IndexedDB y limpieza al cerrar sesión. |
| `node pruebas/probar-sync-queue.mjs` | ✅ Pasa | `27 pasadas, 0 fallidas` | Cola offline de préstamos y devoluciones. |
| `npm run test:legacy:contraste` | ✅ Pasa | `21 pasadas, 0 fallidas` | Pares de color base cumplen WCAG AA. |
| `npm run build && npm run verify:build` | ⚠️ Pasa con avisos | Build generado + PWA verificada | Vite emite advertencias `parse5 error code control-character-in-input-stream` en `index.html` y `[INEFFECTIVE_DYNAMIC_IMPORT]` de `db.js` en `src/js/vistas/bibliomovil.js`. |
| `python3 pruebas/probar-migraciones.py` | ❌ **FALLA GRAVE** | `170 pasadas, 36 fallidas` | `027_prestamos_coordenadas.sql` no es idempotente y duplica la firma de `prestar_libro`, provocando ambigüedad `function public.prestar_libro(integer, unknown) is not unique` y fallo `DUPLICADA` en `verificar_definiciones()`. |
| `python3 pruebas/probar_librero.py` | ❌ **FALLA FATAL** | `SyntaxError` al aplicar `027` | `027_prestamos_coordenadas.sql` comienza con BOM UTF-8 (`\ufeff`), rechazado por `psycopg` al ejecutar el archivo SQL. |

---

## 1. ✅ Lo que está bien

1. **Arquitectura de Circulación Atómica en PostgreSQL (`010_consolidacion.sql`):**
   - Las operaciones críticas (`prestar_libro`, `devolver_prestamo`, `renovar_prestamo`, `reservar_libro`, `retirar_reserva`, `cancelar_reserva`, `ajustar_copias`, `corregir_inventario`) usan bloqueos de fila (`FOR UPDATE`) y bloqueos consultivos por lector (`pg_advisory_xact_lock`), impidiendo condiciones de carrera de stock o préstamos paralelos que excedan el cupo.
2. **Defensa en Profundidad con RLS y Manifiestos de Autodiagnóstico (`010_consolidacion.sql`, `013`, `019`):**
   - Todas las tablas de negocio (`libros`, `lectores`, `prestamos`, `usuarios`, `auditoria`, `parametros`, `errores`, `elementos_eliminados`, `enlaces_escaneo_remoto`, `respaldos_log`, `reservas`) tienen `ROW LEVEL SECURITY` habilitado y verificado por `verificar_rls()`, `verificar_politicas()` y `verificar_circulacion()`.
3. **Cumplimiento Técnico de la Ley 21.719 de Protección de Datos Personales (`CUMPLIMIENTO-LEGAL.md`, `privacidad.html`, `015_lapidas_eliminaciones.sql`):**
   - Incluye registro de consentimiento e identificación de apoderado para menores de edad, exportación ARCO (`exportar_datos_lector`), anonimización irreversible (`anonimizar_lector` / `eliminar_lector`), purga por antigüedad (`purgar_datos_antiguos`), borrado de IndexedDB al cerrar sesión (`persistencia.limpiarTodo()`) y tabla de lápidas (`elementos_eliminados`) para propagar supresiones a equipos offline.
4. **Escaneo Remoto sin Sesión Acotado por Token SHA-256 (`014_enlaces_escaneo_remoto.sql`, `src/js/escaneo-remoto.js`):**
   - El token nunca se almacena en texto plano en la base de datos (solo su hash SHA-256), vence automáticamente, puede revocarse al instante y las funciones remotas revalidan el token en cada lectura/escritura.
5. **Protección contra XSS y Política de Seguridad de Contenido (CSP) Estricta (`vercel.json`, `index.html`, `src/js/modules/utilidades.js`):**
   - `script-src 'self'` bloquea scripts en línea y manejadores `onclick=`. Las vistas sanean los datos provenientes de la base con ` ui.escapeHtml()` antes de interpolarlos en plantillas HTML, y las URLs de portadas pasan por `ui.safeUrl()`.
6. **Soporte PWA y Operación Offline del Mesón (`vite.config.js`, `src/js/modules/persistencia.js`):**
   - Cuenta con manifiesto PWA completo, Service Worker con Workbox, sincronización incremental por `actualizado_en`, limpieza por lápidas y cola de sincronización (`sync_queue`) con detección de conflictos (código `P0001`).
7. **Gestión de Ciclo de Vida de Cámara y Suscripciones Realtime (`src/js/modules/scanner.js`, `src/js/modules/ui-router.js`):**
   - Al cambiar de vista en `switchView()`, el router detiene explícitamente el lector de cámara (`stopViewScanner()`) y libera el canal Realtime si se sale del mesón (`_desuscribirCanalEscaneo()`).
8. **Sin Claves Secretas Expuestas en el Repositorio:**
   - Se verificó el árbol de archivos e historial de Git: solo se incluye la `anon key` pública de Supabase en `src/js/config.js` y `.env.example` (diseñada para ser pública junto con RLS). No existen claves `service_role` comprometidas.

---

## 2. ❌ Lo que está mal (Bugs y Fallas con Causa Raíz y Solución)

### [B-01] Severidad: CRÍTICA — `supabase/migrations/027_prestamos_coordenadas.sql` (líneas 1–89) y `supabase/migrations/010_consolidacion.sql` (líneas 521–576, 2875–2938)
- **Qué falla:**
  1. `probar_librero.py` aborta inmediatamente con `SyntaxError: syntax error at or near "\ufeff"` al ejecutar `027_prestamos_coordenadas.sql`.
  2. Reaplicar `027_prestamos_coordenadas.sql` falla con `column "parada_nombre" of relation "prestamos" already exists`.
  3. Tras aplicar `027` y `010`, toda llamada de 2 argumentos `public.prestar_libro(libro_id, rut)` falla en PostgreSQL con `AmbiguousFunction: function public.prestar_libro(integer, unknown) is not unique`, haciendo caer 36 pruebas en `probar-migraciones.py`.
  4. `verificar_definiciones()` reporta `prestar_libro` como `DUPLICADA` y desconoce `estadisticas_paradas`.
- **Por qué falla (causa raíz):**
  1. El archivo `027_prestamos_coordenadas.sql` fue guardado con **BOM UTF-8 (`EF BB BF`)** y texto con doble codificación CP1252 (`AÃ±adir`, `prÃ©stamos`).
  2. Las sentencias `ALTER TABLE public.prestamos ADD COLUMN ...` (líneas 2–4) omitieron la cláusula `IF NOT EXISTS`.
  3. `027` declaró `CREATE OR REPLACE FUNCTION public.prestar_libro(bigint, text, text, numeric, numeric)` con 5 parámetros (3 con `DEFAULT NULL`), pero **no eliminó** la versión de 2 parámetros `public.prestar_libro(bigint, text)` ni actualizó `010_consolidacion.sql`. En PostgreSQL, cambiar la lista de parámetros en `CREATE OR REPLACE FUNCTION` **no reemplaza** la función anterior: crea una sobrecarga adicional. Al existir ambas firmas (`(bigint, text)` y `(bigint, text, text, numeric, numeric)` con defaults), cualquier invocación con 2 argumentos resulta ambigua para el motor SQL.
- **Cómo se solucionará:**
  - Limpiar el BOM y la codificación de `027_prestamos_coordenadas.sql`, dejando en `027` únicamente los cambios de esquema idempotentes (`ADD COLUMN IF NOT EXISTS`).
  - Consolidar en `010_consolidacion.sql` los prerrequisitos de columna (`ADD COLUMN IF NOT EXISTS`), el `DROP FUNCTION IF EXISTS` de ambas firmas de `prestar_libro`, la definición única de 5 parámetros con valores por defecto, la función `estadisticas_paradas()` y su entrada en `manifiesto_funciones()`.
  - Agregar además una migración `028_reparar_sobrecarga_prestar_libro_y_paradas.sql` (idempotente) para que, si `027` ya fue corrida en un proyecto Supabase remoto, limpie la sobrecarga duplicada de 2 argumentos y deje instaladas las definiciones seguras.

---

### [B-02] Severidad: ALTA (Seguridad) — `supabase/migrations/027_prestamos_coordenadas.sql` (líneas 69–88)
- **Qué falla:**
  - La función `public.estadisticas_paradas()` fue declarada como `SECURITY DEFINER` sin `SET search_path = public` y **sin comprobar `if not public.es_personal()`**, otorgando `GRANT EXECUTE ... TO authenticated` pero dejando además el privilegio `EXECUTE` por defecto a `PUBLIC` (y por tanto al rol anónimo `anon`).
- **Por qué falla (causa raíz):**
  - En PostgreSQL, toda función recién creada tiene `EXECUTE` concedido a `PUBLIC` a menos que se revoque explícitamente (lo cual `010_consolidacion.sql` hace al final solo para las funciones listadas en `manifiesto_funciones()`). Al crearse fuera de `010`, sin `es_personal()` y sin `SET search_path`, cualquier persona con la `anon key` pública puede invocar `estadisticas_paradas()` sin iniciar sesión, y además una función `SECURITY DEFINER` sin `search_path` fijo incumple la directriz de seguridad de Supabase (`function_search_path_mutable`).
- **Cómo se solucionará:**
  - Incorporar `public.estadisticas_paradas()` en `010_consolidacion.sql` (y en `028`) como `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public`, con guarda inicial `if not public.es_personal() then raise exception 'Debes iniciar sesión para consultar las estadísticas de paradas.' using errcode = 'P0001'; end if;` e incluirla en `manifiesto_funciones()` para que el bloque `$permisos$` revoque `PUBLIC` y `anon`.

---

### [B-03] Severidad: ALTA — `pruebas/verificar_consolidacion.py` (líneas 40–66, 179–185)
- **Qué falla:**
  - El verificador estático `verificar_consolidacion.py` reportó *"La consolidación está intacta"* a pesar de que `027_prestamos_coordenadas.sql` redefinía `prestar_libro` y creaba `estadisticas_paradas` sin guarda de acceso.
- **Por qué falla (causa raíz):**
  1. `funciones_en(texto)` en la línea 42 usa `re.findall(r'create or replace function public\.(\w+)', texto)` **sin `re.IGNORECASE`**, por lo que `CREATE OR REPLACE FUNCTION` en mayúsculas en `027` fue invisible.
  2. En la línea 59 solo calculaba la intersección `funciones_en(archivo) & consolidadas`, ignorando funciones RPC nuevas creadas fuera de `010_consolidacion.sql` (como `estadisticas_paradas`).
- **Cómo se solucionará:**
  - Hacer insensible a mayúsculas/minúsculas (`re.I`) la detección de funciones en `verificar_consolidacion.py` y verificar también que ninguna migración posterior a `010` declare funciones RPC nuevas fuera de `010_consolidacion.sql` (salvo las excepciones internas de trigger/cron documentadas).

---

### [B-04] Severidad: ALTA — Corrupción de codificación UTF-8 (Mojibake + BOM + caracteres de control C1) en `src/js/config.js` (líneas 1–86), `index.html` (líneas 1–115), `src/js/modules/scanner.js` (líneas 1–274) y `test_html.mjs`
- **Qué falla:**
  1. En `src/js/config.js`, el menú lateral muestra textos corruptos en toda la aplicación: `CatÃ¡logo`, `PrÃ©stamos`, `MesÃ³n`, `BibliomÃ³vil`, `AdministraciÃ³n`, `GestiÃ³n`, `OperaciÃ³n`, y los datos oficiales de la biblioteca se ven como `Biblioteca PÃºblica Municipal de Futrono` / `NÂ° 332 â€œEscritor RamÃ³n Quichiyao Figueroaâ€`.
  2. En `src/js/modules/scanner.js`, los mensajes de error de cámara tienen mojibake (`No se encontrÃ³ ninguna cÃ¡mara en este dispositivo`), haciendo **fallar `probar-escaneo-remoto.mjs`** (`48 pasadas, 1 fallida`).
  3. En `index.html`, el `<title>`, la `<meta name="description">`, el texto accesible `<span class="sr-only">` y los comentarios contienen mojibake y bytes de control C1 (`0x81`), provocando errores `parse5 error code control-character-in-input-stream` durante `npm run build` y `probar-vistas.mjs`.
  4. Quedó en la raíz del repositorio un archivo temporal de depuración `test_html.mjs` con BOM y mojibake.
- **Por qué falla (causa raíz):**
  - En el commit `01112a7`, estos archivos fueron abiertos/escritos en Windows con una herramienta (p. ej. PowerShell `Set-Content` / `Get-Content` en CP1252/Latin-1) que interpretó bytes UTF-8 como Windows-1252 y los volvió a codificar en UTF-8 con BOM (`\ufeff`).
- **Cómo se solucionará:**
  - Restaurar la codificación UTF-8 limpia (sin BOM ni secuencias CP1252) en `src/js/config.js`, `index.html` y `src/js/modules/scanner.js`, eliminar el archivo basura `test_html.mjs` y añadir una prueba en `probar-interfaz.mjs` que detecte BOM UTF-8, caracteres de control C1 (`\u0080`–`\u009f`) o secuencias típicas de mojibake (`Ã¡`, `Ã©`, `Ã­`, `Ã³`, `Ãº`, `Ã±`, `â€`) en los archivos fuente.

---

### [B-05] Severidad: ALTA — `src/js/vistas/bibliomovil.js` (líneas 1–276, 305–465, 1089–1112): Estructura HTML rota, pestaña de catálogo inaccesible, código muerto y violación de CSP / privacidad
- **Qué falla:**
  1. **HTML mal formado y pestaña inaccesible (líneas 173–178):** En la línea 174 hay un `</div> <!-- End TAB RUTA -->` huérfano que cierra prematuramente el contenedor principal de la vista (`<div class="space-y-6">`), dejando a `<div id="tab-catalogo" class="biblio-tab-content hidden space-y-6">` fuera del árbol esperado. Además, `_conectar EventosBibliomovil()` (líneas 258–274) busca botones `.biblio-tab-btn` que **no existen en el HTML**, por lo que `#tab-catalogo` queda oculto (`hidden`) permanentemente y el personal no puede ver el catálogo del Bibliomóvil ni en pestaña ni en bloque.
  2. **Violación de CSP y de la nota de privacidad al pulsar el mapa (líneas 1094–1106):** `_alElegirPuntoEnMapaBibliomovil()` ejecuta `fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=...')` en cada clic sobre el mapa. `nominatim.openstreetmap.org` **no está permitido en `connect-src`** ni en `index.html` ni en `vercel.json` (el navegador bloquea la petición por CSP), y contradice el aviso de privacidad de la propia vista (línea 134: *"Al calcular ruta solo se envían las coordenadas a OSRM"*).
  3. **Código muerto y roto en `_conectarMesonMovil()` (líneas 305–423) e importaciones dinámicas redundantes (líneas 338, 396, 444):** `src/js/vistas/bibliomovil.js` ya importa `db` estáticamente en la línea 2, pero vuelve a hacer `await import('../modules/db.js')` dentro de `_conectarMesonMovil` y `_notificarParadaBibliomovil` (generando el aviso de Vite `[INEFFECTIVE_DYNAMIC_IMPORT]`). Peor aún, `_conectarMesonMovil` busca IDs inexistentes en el DOM (`#biblio-rut-input`, `#biblio-libro-search`) y usa campos inexistentes del esquema (`lector.nombres`, `lector.apellidos` en vez de `lector.nombre`).
- **Por qué falla (causa raíz):**
  - Durante la refactorización del modo ruta en `01112a7`, se eliminó la barra superior de pestañas (`Ruta` / `Mesón Móvil` / `Catálogo`) para reemplazar el mesón móvil por el modal `abrirModalPrestamoBibliomovil()`, pero quedaron a medio borrar el cierre `</div> <!-- End TAB RUTA -->`, la clase `hidden` de `#tab-catalogo` y el método antiguo `_conectarMesonMovil()`. Asimismo, se agregó una geocodificación inversa hacia Nominatim sin revisar la CSP ni la política de privacidad.
- **Cómo se solucionará:**
  - Corregir la jerarquía de etiquetas `<div>` en `renderBibliomovil()` e incorporar una barra de pestañas clara y accesible (**Recorrido y Mapa** / **Catálogo del Bibliomóvil**) o visualización directa con conmutador, para que tanto el planificador de ruta como el inventario del Bibliomóvil sean 100% accesibles.
  - Eliminar la llamada no autorizada a `nominatim.openstreetmap.org` en `_alElegirPuntoEnMapaBibliomovil()` (respetando la CSP y la privacidad).
  - Eliminar el método muerto `_conectarMesonMovil()` y usar la importación estática `db` en `_notificarParadaBibliomovil()`.

---

### [B-06] Severidad: MEDIA — `src/js/vistas/reportes.js` (líneas 10–137) y `src/js/modules/db/reportes.js` (líneas 94–99): Estadísticas por parada del Bibliomóvil se consultan pero nunca se muestran
- **Qué falla:**
  - `db.obtenerDatosReportes()` consulta `supabaseClient.rpc('estadisticas_paradas')` y retorna `porParada` en el objeto de datos, pero `src/js/vistas/reportes.js` **nunca lee `datos.porParada` ni dibuja la sección en pantalla**.
- **Por qué falla (causa raíz):**
  - El commit `01112a7` tituló *"feat(bibliomovil): añade estadísticas geográficas y recordatorios masivos por WhatsApp"*, conectó la consulta en `src/js/modules/db/reportes.js`, pero olvidó implementar el bloque visual correspondiente en `src/js/vistas/reportes.js`.
- **Cómo se solucionará:**
  - Incorporar en `src/js/vistas/reportes.js` una tarjeta/sección de **Préstamos por Parada del Bibliomóvil** (con tabla/barras de participación, coordenadas formateadas y estado vacío claro cuando aún no hay préstamos geolocalizados), y añadir el mock de `estadisticas_paradas` en `pruebas/probar-vistas.mjs`.

---

### [B-07] Severidad: MEDIA — `src/js/vistas/lectores.js` (líneas 45–134): `<tr>` y `<td>` inyectados dentro de un `<div>` sin `<table>`
- **Qué falla:**
  - En `renderUsers()`, el contenedor `#users-tbody` es un `<div id="users-tbody" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">` (línea 45), pero `_renderUserRows()` (líneas 69–133) devuelve etiquetas `<tr><td colspan="6">...</td></tr>`. Al asignarse vía `innerHTML` sobre un `<div>`, el parser HTML5 descarta las etiquetas `<tr>` y `<td>` por no estar dentro de `<table><tbody>`, rompiendo la grilla CSS (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3` pasa a apilar los elementos hijos internos de forma incoherente) y dejando clases huérfanas.
- **Por qué falla (causa raíz):**
  - Se intentó migrar la tabla de lectores a una grilla de tarjetas cambiando `<tbody id="users-tbody">` por `<div id="users-tbody" class="grid ...">`, pero `_renderUserRows()` siguió envolviendo cada tarjeta en `<tr class="..."><td colspan="6" class="...">` y el estado vacío en `<tr><td colspan="6">`.
- **Cómo se solucionará:**
  - Reestructurar `src/js/vistas/lectores.js` para que `#users-tbody` y `_renderUserRows()` utilicen contenedores semánticos coherentes (tarjetas `<article>` en la grilla con soporte completo para `<td colspan>` o tabla/tarjetas limpias compatibles con todas las pruebas de `probar-vistas.mjs`).

---

### [B-08] Severidad: MEDIA — `src/js/modules/ui-router.js` (línea 130): Error tipográfico de clase Tailwind en botones del menú lateral (`hover:bg-white` en vez de `hover:bg-white/10`)
- **Qué falla:**
  - En el menú lateral (`#sidebar-nav`, fondo oscuro `bg-patrimonio-lago`), los botones inactivos tienen la clase `text-stone-300 hover:bg-white dark:bg-stone-800/10 hover:text-white`. Al pasar el cursor por encima en modo claro, el fondo del botón se vuelve **blanco sólido (`#FFFFFF`)** y el texto también **blanco (`#FFFFFF`)**, dejando el ítem del menú completamente ilegible.
- **Por qué falla (causa raíz):**
  - Una sustitución automática global de `bg-white` por `bg-white dark:bg-stone-800` transformó `hover:bg-white/10` en `hover:bg-white dark:bg-stone-800/10`, rompiendo tanto el estado `:hover` en modo claro como el fondo en modo oscuro.
- **Cómo se solucionará:**
  - Corregir la clase en `src/js/modules/ui-router.js` a `text-stone-300 hover:bg-white/10 hover:text-white` y auditar todas las apariciones del patrón `bg-white dark:bg-stone-800/` en el código fuente.

---

### [B-09] Severidad: BAJA — `LEEME.md` y `MIGRACIONES.md` desactualizados respecto a las migraciones `027`+ y flujo de pruebas
- **Qué falla:**
  - `LEEME.md` y `MIGRACIONES.md` documentan únicamente las migraciones `001–026`, omitiendo `027_prestamos_coordenadas.sql` (y las correcciones de consolidación asociadas). Además, el repositorio tiene `LEEME.md` pero no un `README.md` que redirija o documente el proyecto para herramientas que buscan `README.md` por convención.
- **Por qué falla (causa raíz):**
  - El commit `01112a7` agregó la migración `027` sin actualizar el inventario de `MIGRACIONES.md` ni `LEEME.md`.
- **Cómo se solucionará:**
  - Actualizar `MIGRACIONES.md`, `LEEME.md`, `CLAUDE.md` y crear `README.md` y `CHANGELOG.md` en la Fase 5.

---

## 3. 🔧 Lo que se puede mejorar (Prioridad e Impacto Esperado)

| ID | Prioridad | Área / Archivos | Mejora Propuesta | Impacto Esperado |
|---|---|---|---|---|
| **M-01** | **Alta** | **Prueba automatizada anti-mojibake y anti-BOM** (`pruebas/probar-interfaz.mjs`) | Añadir una comprobación estática que recorra todos los archivos `.html`, `.js`, `.css` y `.sql` verificando ausencia de BOM UTF-8 (`\ufeff`), caracteres de control C1 (`\u0080`–`\u009f`) y secuencias de doble codificación (`Ã¡`, `Ã©`, `Ã­`, `Ã³`, `Ãº`, `Ã±`, `â€`). | Evita para siempre que ediciones en Windows vuelvan a romper los textos en español o las migraciones SQL en CI. |
| **M-02** | **Alta** | **Pruebas SQL de geolocalización de préstamos** (`pruebas/probar-migraciones.py`, `pruebas/probar-vistas.mjs`) | Agregar pruebas en `probar-migraciones.py` y `probar-vistas.mjs` que verifiquen: (a) `prestar_libro` con 2 argumentos y con 5 argumentos (parada y coordenadas), (b) `estadisticas_paradas()` con sesión de personal y bloqueo con rol `anon`, y (c) renderizado de la tabla de paradas en `renderReports()`. | Garantiza cobertura de extremo a extremo de la nueva funcionalidad geográfica del Bibliomóvil. |
| **M-03** | **Alta** | **Experiencia y diseño visual en Bibliomóvil** (`src/js/vistas/bibliomovil.js`) | Organizar la vista Bibliomóvil con navegación por pestañas claras (**Recorrido y Paradas** / **Catálogo en Ruta**), resumen visual del recorrido, indicadores claros de cada parada con botón directo para **Prestar en esta parada** y **Avisar por WhatsApp**, respetando la paleta "Patrimonio de Futrono". | El personal en terreno (desde tablet o móvil) comprende de inmediato cómo planificar la ruta, consultar el stock a bordo y registrar préstamos por parada. |
| **M-04** | **Media** | **Consistencia visual, jerarquía y Modo Oscuro ("Patrimonio de Futrono")** (`src/js/modules/ui-modales.js`, `src/js/vistas/*.js`, `src/assets/css/styles.css`) | Pulir modales (`showConfirm`, `showPrompt`), tarjetas de KPI en `dashboard.js` y `reportes.js`, estados vacíos/carga y contraste en modo claro y oscuro usando exclusivamente la familia `stone` y los tonos `patrimonio-*`, manteniendo 100% de aprobación en `probar-contraste.mjs`. | Interfaz uniforme, legible en interiores y en terreno, sin elementos desalineados ni textos de bajo contraste. |
| **M-05** | **Media** | **Claridad en tarjetas de Lectores y Préstamos** (`src/js/vistas/lectores.js`, `src/js/vistas/prestamos.js`, `src/js/vistas/mostrador.js`) | Mejorar la presentación visual de las fichas de lectores (estado habilitado/bloqueado/atrasado, insignias de préstamos activos, accesos rápidos a edición/historial) y la legibilidad del Mesón de Circulación en pantallas móviles. | Reduce errores operativos en el mostrador y agiliza la atención al público. |
| **M-06** | **Baja** | **Guía de convivencia con Aleph 500 y ejecución en Supabase** (`ALEPH500_SIP2.md`, `MIGRACIONES.md`, `/docs/auditoria/04-resumen-final.md`) | Documentar con precisión qué sentencias/migraciones deben ejecutarse en el SQL Editor / CLI de Supabase y las recomendaciones operativas para la convivencia con Aleph 500. | Facilita la puesta en producción segura por parte del equipo municipal. |
