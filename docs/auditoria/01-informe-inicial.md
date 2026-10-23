# Informe inicial de auditoría técnica, seguridad y producto — BiblioNexo

**Revisión:** 3 de octubre de 2026 (Fase 2)
**Repositorio:** `KryoDevs/Biblio-Nexo`
**Rama auditada:** `arena/01a100ab-biblio-nexo`
**Commit auditado:** `c2be79062eaf0017dee0a9e0ed3c08554ddf6666`
**Alcance:** aplicación, migraciones SQL 001–028, funciones Edge, documentación de proyecto, interfaz, operación offline y pruebas disponibles.

> **Actualización de línea base.** Esta revisión reemplaza el estado técnico descrito en la versión anterior de este informe, que correspondía a otra rama (`arena/01a10005-biblio-nexo`) y al commit `01112a7afe74b530038919bf33ea7c2d07ea62e7`. Sus conteos, fallos y hallazgos no se trasladan como estado actual sin volver a comprobarlos. `02-registro-cambios.md` sigue siendo el registro histórico y no se modifica.
>
> **Límite importante:** no se consultó Supabase remoto, no se ejecutó SQL contra producción ni se modificó código de aplicación o migraciones. Los resultados de PostgreSQL indicados abajo provienen de bancos de prueba locales y aislados. El estado desplegado debe verificarse por separado.

## 1. Síntesis ejecutiva

La línea base del repositorio está en buen estado de regresión: las pruebas JavaScript, los verificadores estáticos, las suites SQL locales y la compilación pasan. La circulación tiene validaciones en PostgreSQL, bloqueo de stock y cobertura para admin, librero y usuario anónimo; existe una vista Bibliomóvil con catálogo filtrado y planificación local de paradas.

Sin embargo, **no se recomienda activar un rol Bibliomóvil real ni dar por resuelta su separación de permisos**. El servidor todavía define `es_personal()` como «hay una sesión», no como «esta cuenta tiene un rol de personal autorizado». La configuración de menú reconoce `bibliomovil`, pero los RPC y la invitación no lo asignan ni lo restringen. Además, la ruta actual no es una visita programada en servidor, el préstamo desde el catálogo no transmite su parada y la cola offline no está vinculada a la cuenta que la creó ni es idempotente ante una respuesta ambigua.

Los principales bloqueos antes de habilitar el nuevo rol son, por tanto:

1. Definir una frontera de autorización real en RLS y en cada RPC, incluida la creación de perfiles.
2. Decidir y modelar rutas, asignaciones, visitas y paradas persistentes.
3. Aislar las copias y operaciones offline por usuario y evitar duplicados al reintentar.
4. Aprobar el alcance de datos personales visible desde el escáner remoto y desde el flujo de avisos.
5. Validar legalmente consentimiento y política de privacidad contra el comportamiento efectivo.

Esta revisión cierra la **auditoría/documentación de Fase 2**. No inicia implementación de Fase 3.

## 2. Alcance, método y límites de verificación

Se revisaron `CLAUDE.md`, `PROMPT-produccion.md`, `MIGRACIONES.md`, `CUMPLIMIENTO-LEGAL.md`, `pruebas/LEEME.md`, el código en `src/`, las páginas HTML, las funciones de `supabase/functions/`, las migraciones 001–028, las suites de `pruebas/` y los documentos de auditoría existentes.

| Evidencia | Qué se comprobó | Qué no demuestra |
|---|---|---|
| Código y migraciones del commit indicado | Comportamiento que el repositorio define hoy, rutas de llamada y reglas de autorización declaradas. | Que esos archivos sean las versiones desplegadas en Supabase o Vercel. |
| Pruebas JavaScript y verificadores estáticos | Contratos cubiertos por mocks, análisis del repositorio, clases compiladas y regresiones automatizadas. | Configuración real de Auth, permisos del proyecto Supabase ni comportamiento del navegador en todos los dispositivos. |
| Pruebas SQL con PostgreSQL local (`pgserver`) | Aplicación de las migraciones y flujos de roles/RLS contra un PostgreSQL aislado, con roles y extensiones sustitutas descritos por los scripts. | Historial, datos, extensiones, `pg_policies`, ACL o migraciones efectivamente presentes en producción. |
| Supabase remoto | **No consultado.** | No se verificaron migraciones aplicadas, políticas desplegadas, proveedores de Auth, cuentas/roles, Edge Functions ni secretos. |
| Revisión jurídica y operación municipal | **No realizada.** La política web está marcada como borrador. | No constituye dictamen legal ni aprobación de tratamiento, retención o comunicaciones. |

Las migraciones aplicadas no se editaron. Tampoco se ejecutaron las instrucciones SQL históricas que aparecen en `docs/auditoria/04-resumen-final.md`; primero habría que comparar, en modo de solo lectura y con autorización, el historial real de producción.

## 3. Qué está bien en el repositorio

1. **Circulación transaccional.** `prestar_libro()` serializa préstamos por lector y bloquea la fila del libro; el descuento de stock y la creación del préstamo ocurren en la misma transacción (`010_consolidacion.sql`). Devoluciones, renovaciones, reservas y ajustes tienen reglas de negocio en el servidor, no solo en la interfaz.
2. **Defensa RLS y pruebas negativas.** El manifiesto cubre 11 tablas protegidas; existen políticas para lectores, préstamos, catálogo y perfiles, y pruebas locales que comprueban que `anon` no accede a información personal ni a operaciones de circulación. Esto es evidencia del código probado localmente, no del despliegue actual.
3. **Separación de funciones administrativas.** Las operaciones sensibles de roles, borrado, bloqueo, exportación/anonimización, diagnóstico y administración comprueban permisos internos en sus funciones. La interfaz también aclara que ocultar una vista no es una frontera de seguridad.
4. **Escáner remoto con controles útiles.** Los enlaces se representan en la base por una huella del token, tienen vencimiento acotado y pueden revocarse; las funciones vuelven a validar el token al usarse. La lectura de datos personales que permite ese enlace sigue siendo una excepción de privacidad que requiere aprobación explícita (hallazgo A-04).
5. **Offline con medidas de minimización.** El catálogo se replica para consulta; los lectores guardados localmente se limitan a los consultados o con préstamos activos y existe una política local de retención de 30 días, además de lápidas para reflejar bajas. Estas medidas no resuelven el aislamiento entre cuentas en un navegador compartido (A-03).
6. **Planificador de ruta funcional en el cliente.** La ruta y las paradas se normalizan, se guardan localmente y la aplicación evita enviar las etiquetas de parada al servicio de trazado vial. Es una herramienta de planificación, no una agenda operativa sincronizada ni una asignación de trabajo en servidor.
7. **Calidad de compilación y accesibilidad visual.** La compilación Vite y la verificación del PWA pasan; la suite de contraste informa que los 13 pares evaluados cumplen los umbrales AA del propio verificador.
8. **Trazabilidad de funciones y RPC.** Los verificadores encuentran las funciones esperadas en la consolidación, cubren 47 llamadas RPC del cliente frente a 61 firmas declaradas en las migraciones y detectan clases Tailwind faltantes. El alcance de estos chequeos tiene límites descritos en A-10 y A-11.

## 4. Roles y permisos actuales: lectura del repositorio

Esta tabla describe el diseño presente, no una prueba de producción.

| Identidad | Evidencia del repositorio | Evaluación |
|---|---|---|
| `admin` | `es_admin()` consulta el perfil persistido; varias operaciones administrativas lo exigen. | Es la frontera de mayor privilegio prevista en el código. Su estado y configuración desplegados no se verificaron. |
| `librero` | Las políticas de `lectores`, `prestamos` y operaciones de circulación usan `es_personal()`. La interfaz muestra mesón, lectores, préstamos y catálogo. | El modelo operativo actual es «cualquier sesión autenticada cuenta como personal»; no equivale a una autorización individual de librero. |
| `bibliomovil` | `src/js/config.js` define un menú propio que incluye Bibliomóvil, Mesón, Catálogo, Lectores y Préstamos. | Es una definición de interfaz: `asignar_rol()` y `invitar-personal` solo aceptan `admin` y `librero`; las guardas SQL no limitan a Bibliomóvil. |
| Usuario autenticado sin perfil | `mi_perfil()` llama a `asegurar_perfil()`, que crea una fila propia como `librero`; además, la política de inserción propia permite ese rol. | La autoprovisión es una decisión de autorización que debe revisarse antes de introducir un rol restringido o aceptar cuentas no invitadas. |
| `anon` / escáner con enlace | RLS y las pruebas locales bloquean el acceso ordinario a lectores y préstamos. Algunas RPC públicas admiten un token de escaneo. | El token es una excepción intencional; no convierte en pública toda la base, pero permite leer estado y datos personales descritos en A-04. |

## 5. Hallazgos priorizados

**Prioridades:** P1 = bloqueante antes de activar el rol o ampliar el acceso operativo; P2 = corregir antes del despliegue estable de la funcionalidad; P3 = deuda documental/operativa. Las prioridades no certifican explotación en producción.

### A-01 — P1: la guarda `es_personal()` no distingue personal autorizado de cualquier cuenta autenticada

**Evidencia del repositorio:** `010_consolidacion.sql:225–235` implementa `es_personal()` como `auth.uid() IS NOT NULL`. Las políticas de `lectores` y `prestamos` llaman a esa función (`008_perfiles_y_permisos_librero.sql:546–571`); varios RPC de circulación también la usan. `asegurar_perfil()`/`mi_perfil()` crean el perfil propio con rol `librero` (`010_consolidacion.sql:1478–1526`), y `013_politicas_usuarios.sql:35–43` permite autoprovisionar esa fila.

**Impacto:** cualquier identidad con sesión satisface la guarda de personal; el rol guardado no decide esas lecturas/escrituras. Si el proyecto remoto permite autenticación de cuentas no previamente autorizadas —por ejemplo, por la configuración de Google u otro proveedor— esas cuentas podrían alcanzar operaciones y datos propios del personal. El repositorio incluye inicio con Google, pero su configuración remota no se verificó; por ello no se afirma que el acceso sea explotable hoy en producción.

**Recomendación:** definir una membresía explícita y comprobar rol/estado en cada política y RPC. El perfil ausente debe fallar cerrado y no autoconvertirse en librero. Mantener un mecanismo de bootstrap administrativo seguro para no perder el acceso inicial.

### A-02 — P1: `bibliomovil` existe en el menú, no como rol de servidor

**Evidencia del repositorio:** `src/js/config.js:37–82` asigna vistas al rol `bibliomovil`, incluyendo Lectores y Préstamos. `010_consolidacion.sql:1441–1458` solo acepta `admin`/`librero` en `asignar_rol()`; `supabase/functions/invitar-personal/index.ts:80–88` valida los mismos dos valores. Si un perfil `bibliomovil` se cargara por otra vía, `es_personal()` lo trataría igual que cualquier sesión autorizada.

**Impacto:** ocultar vistas no evita llamadas directas a la API; la base no implementa una matriz de permisos por rol Bibliomóvil. La interfaz además presenta lectores y préstamos generales a ese perfil.

**Recomendación:** aprobar primero una matriz de mínimo privilegio y aplicarla tanto en RLS como en guardas RPC y en la invitación/administración. La matriz propuesta y los casos de rechazo están en `02-plan-rol-bibliomovil.md`.

### A-03 — P1: la caché y cola offline no están particionadas por cuenta

**Evidencia del repositorio:** `persistencia.js:89–103, 137–158, 697–709` crea una única IndexedDB `biblionexo-local` y almacena lectores y operaciones pendientes sin propietario/UID. `auth.js:124–127` cierra sesión y recarga, pero no limpia ni separa esos almacenes. Tras iniciar sesión, `main.js:85–96, 143–149` activa sincronización y reintento de la cola.

**Impacto:** en un dispositivo compartido, otra sesión puede consultar datos personales que quedaron en caché; una operación pendiente iniciada por una cuenta puede reintentarse con la sesión siguiente. El problema puede afectar tanto privacidad como atribución/auditoría.

**Recomendación:** particionar las copias por usuario/dispositivo, asociar cada operación encolada al UID que la originó y detener el reintento si cambia la sesión. No borrar a ciegas una cola pendiente al cerrar sesión: preservar, poner en cuarentena y resolver bajo la identidad original para no perder préstamos/devoluciones.

### A-04 — P1 / decisión de privacidad: el escáner anónimo puede ver nombre y RUT con un token de sesión

**Evidencia del repositorio:** `consultar_libro_remoto()` acepta un token y un código de libro, devuelve `persona_nombre` y `persona_rut` de préstamos/reservas (`010_consolidacion.sql:1714–1735, 1850–1945`) y está concedida a `anon` (`010_consolidacion.sql:3378–3389`). El token es aleatorio, se guarda como hash, puede revocarse y dura de 1 a 24 horas; sin embargo, funciona como portador para consultar códigos del catálogo, no está ligado a una visita o a un único ISBN.

**Impacto:** una persona que obtenga el enlace puede consultar desde un celular sin iniciar sesión quién tiene o reservó los libros que escanee durante su vigencia. Es una excepción deliberada que el propio SQL documenta, no una exposición accidental sin control de token; su alcance y comunicación al titular igualmente necesitan decisión y revisión legal.

**Recomendación:** decidir si el flujo requiere nombre/RUT, reducir los campos al mínimo, limitar el alcance/duración del enlace y aprobar el texto de privacidad. Agregar pruebas de no exposición a `anon` sin token y de expiración/revocación.

### A-05 — P1: la planificación de paradas no está unida al préstamo ni a una visita operativa

**Evidencia del repositorio:** `src/js/vistas/bibliomovil.js:62, 90–93` carga el plan desde el navegador; `bibliomovil-ruta.js:72–94` guarda nombres/coordenadas en `localStorage`, sin usuario, fecha, asignación ni visita en servidor. Aunque `db.registrarPrestamo()` acepta ubicación (`src/js/modules/db.js:428–440`) y SQL guarda parada/coordenadas (`010_consolidacion.sql:563–629`), el flujo común `flujoPrestamo()` llega a `showConfirmarPrestamoModal()` sin ubicación (`src/js/vistas/prestamos.js:351–367, 374, 432`); el botón de catálogo llama ese flujo sin pasar parada (`src/js/vistas/catalogo.js:362–366`). El flag `es_bibliomovil` existe, pero el formulario de edición y su payload no lo ofrecen (`src/js/vistas/catalogo.js:276–330`, `src/js/modules/db/libros.js:82–90`).

**Impacto:** la ruta local no acredita que un préstamo ocurrió en una parada o turno vigente. El campo de parada histórico puede quedar vacío; el filtro actual no distingue visitas con el mismo nombre. El flag de libro identifica una categoría, no por sí solo cuántos ejemplares viajan a bordo.

**Recomendación:** modelar paradas estables y visitas fechadas/asignadas, relacionar el préstamo con una visita/parada y decidir si hace falta inventario móvil separado. Conservar las columnas históricas de texto/coordenadas y no reinterpretar préstamos antiguos automáticamente.

### A-06 — P2 (P1 para escritura offline): los reintentos pueden repetir una mutación tras un timeout ambiguo

**Evidencia del repositorio:** `conTiempoLimite()` compite la promesa con un temporizador mediante `Promise.race()` sin abortar la petición subyacente (`utilidades.js:20–30`). El cliente considera un error sin código como de red y encola/reintenta la llamada (`db.js:44–65, 408–424, 337–365`). La fila local tiene un ID, pero ese ID no se envía como clave de idempotencia a `prestar_libro()`; el RPC inserta el préstamo sin registrar una clave de operación (`010_consolidacion.sql:563–629`).

**Impacto:** si Postgres confirma la operación pero la respuesta se pierde o llega después del timeout, el cliente puede volver a enviarla y crear otro efecto. Las pruebas ejercitan errores y reintentos, pero no demuestran «commit realizado, respuesta perdida, reintento duplicado».

**Recomendación:** exigir una clave de operación única para las mutaciones offline y hacer que el servidor devuelva el resultado previo al recibir la misma clave. Añadir una prueba que fuerce respuesta ambigua después del commit. No ampliar escrituras offline de Bibliomóvil hasta resolverlo.

### A-07 — P2: los avisos por parada no corresponden a una fecha/visita y pueden incluir préstamos fuera de plazo de aviso

**Evidencia del repositorio:** `obtenerPendientesPorParada()` filtra solo por préstamo activo y nombre exacto de parada, sin fecha de vencimiento, visita ni paginación; limita la salida a 500 filas (`src/js/modules/db/prestamos.js:111–119`). La interfaz la entrega a un modal que describe «devoluciones atrasadas o próximas» (`src/js/vistas/bibliomovil.js:589–603`, `src/js/vistas/prestamos.js:195–217`). Además, `_textoAviso()` promete que el Bibliomóvil visitará la parada «mañana» cuando el préstamo tiene `parada_nombre`, aunque ese dato no contiene fecha (`src/js/modules/ui-base.js:346–377`).

**Impacto:** el nombre de parada no acredita una visita próxima; pueden entrar lectores con préstamos activos que no vencen pronto y quedar filas fuera del límite sin advertencia. El envío es iniciado manualmente por personal, no automático, pero el texto puede inducir a error.

**Recomendación:** filtrar por visita vigente y ventana de vencimiento, paginar sin truncamiento silencioso y generar el texto con la fecha real de esa visita. Mantener confirmación humana antes de abrir WhatsApp/correo.

### A-08 — P2: el consentimiento se valida en la interfaz, no en la frontera de datos

**Evidencia del repositorio:** el formulario comprueba la casilla y adjunta fecha/versión (`ui-base.js:458–530`), pero `consentimiento_fecha` y `consentimiento_version` se agregaron como columnas nullable (`007_correcciones_y_cumplimiento_legal.sql:353–359`) y la política de inserción de lectores solo exige `es_personal()` (`008_perfiles_y_permisos_librero.sql:553–560`). Una llamada directa autenticada puede omitir los campos que la interfaz exige.

**Impacto:** el control visible no garantiza que cada fila nueva tenga evidencia de consentimiento o datos de apoderado. La política de consentimiento dice que los datos no se comparten con terceros (`ui-base.js:464–480`); el envío no es automático, pero una acción manual abre enlaces prellenados de WhatsApp/correo (`ui-modales.js:155–215`). La política web, marcada como borrador, afirma que Bibliomóvil no consulta fichas aunque su botón obtiene lectores/préstamos por parada (`privacidad.html:62–79`, `bibliomovil.js:589–603`). Requiere revisión jurídica; no es un dictamen de incumplimiento.

**Recomendación:** aprobar el texto y finalidades con asesoría municipal, hacer coherentes formulario, política web y usos reales, y definir validación de consentimiento/apoderado en el servidor sin romper la migración de registros históricos nulos.

### A-09 — P2: la actualización Realtime del mesón intenta usar métodos que no están en `db`

**Evidencia del repositorio:** `src/js/vistas/mostrador.js:308–346` llama a `db.detenerEscucha()` y `db.escucharEscaneos()`; no se encontraron esos métodos en el objeto compuesto `db` de `src/js/modules/db.js`. El flujo atrapa el error sin aviso visible.

**Impacto:** el alta desde el celular puede persistir correctamente, pero la ficha del mesón podría no actualizarse ni mostrar el aviso en vivo esperado.

**Recomendación:** implementar el adaptador Realtime con ciclo de vida y pruebas de suscripción/desuscripción, o retirar el flujo de escucha si ya no se requiere. Verificarlo contra un proyecto de pruebas Supabase antes de afirmar estado en producción.

### A-10 — P2: los autodiagnósticos de políticas no comparan la expresión de autorización

**Evidencia del repositorio:** `verificar_politicas()` contrasta RLS activo, nombre/comando de políticas, políticas inesperadas, grants directos a `PUBLIC` y existencia de `SELECT` para `authenticated` (`010_consolidacion.sql:3188–3285`). No compara `roles`, `USING` ni `WITH CHECK`. `verificar_rls()` informa estado de RLS y conteos, no una matriz de permisos. Las pruebas SQL actuales ejercitan anon/admin/librero, pero no una matriz del rol Bibliomóvil.

**Impacto:** un cambio a una expresión permisiva puede conservar nombre y comando y no ser detectado por ese diagnóstico; el «Correcto» del diagnóstico no equivale a una revisión semántica completa.

**Recomendación:** fortalecer verificador y pruebas para cubrir rol, comando, `USING`, `WITH CHECK`, grants y llamadas directas a RPC; incluir rol ausente y `bibliomovil`.

### A-11 — P2: deuda conocida de `search_path` en funciones `SECURITY DEFINER`

**Evidencia del repositorio:** un conteo del SQL actual encontró 50 funciones `SECURITY DEFINER`: 39 usan `SET search_path = public` y 11 `SET search_path = ''`. El comentario de `010_consolidacion.sql:237–260` aún describe 30 funciones y la distribución 2/28. El verificador estático comprueba presencia de `SECURITY DEFINER` y guardas, no que cada ruta de búsqueda y dependencia sea segura.

**Impacto:** es una superficie que conviene endurecer y documentar; la explotabilidad depende, entre otras cosas, de los permisos reales para crear objetos en los esquemas y no se determinó para producción.

**Recomendación:** inventariar función por función, revisar dependencias de extensiones y ACL, y migrar de manera controlada a un `search_path` seguro con objetos calificados. No hacer un reemplazo global sin probar las funciones y sus dependencias.

### A-12 — P3: documentación de producto/privacidad y el informe anterior tienen líneas base distintas

**Evidencia del repositorio:** `PROMPT-produccion.md` todavía afirma «Sin build step» y que no existe `package.json` (por ejemplo, líneas 30–32 y 1006), mientras este commit compila con Vite y tiene scripts de build. La política `privacidad.html` se identifica como borrador y su descripción de Bibliomóvil no coincide con la consulta por parada. El informe `01` previo apuntaba a otra rama y describía fallos ya no presentes en esta línea base.

**Recomendación:** actualizar documentación de producto y privacidad después de aprobar la arquitectura y con revisión jurídica. Mantener `02-registro-cambios.md` como histórico; no usar `04-resumen-final.md` como autorización para ejecutar SQL en producción.

## 6. Pruebas ejecutadas en esta revisión

Todas las pruebas siguientes se ejecutaron localmente sobre el commit auditado, sin conectarse a Supabase remoto. Para las pruebas Python se instaló `pgserver` y `psycopg` en un entorno temporal bajo `/tmp`, fuera del repositorio.

| Comando / suite | Resultado observado |
|---|---|
| `npm test` | 6 archivos, 23 pruebas aprobadas, 0 fallidas. |
| `npm run test:legacy` — consolidación | Verificadores correctos: 58 funciones declaradas en `010`, 56 en el manifiesto, 19 funciones de escritura y 50 `SECURITY DEFINER` cubiertas por el chequeo de guardas; 47 llamadas RPC del cliente coinciden con firmas declaradas; 135 clases usadas están compiladas. |
| `npm run test:legacy` — interfaz | `probar-interfaz.mjs`: 104 comprobaciones; `probar-vistas.mjs`: 113; `probar-escaneo-remoto.mjs`: 13. Todas sin fallos. |
| `npm run test:legacy` — offline | Persistencia: 43; cola: 48; estado de conexión: 18. Todas sin fallos. |
| `npm run test:legacy:contraste` | Todos los 13 contrastes evaluados cumplen AA según el verificador del proyecto. |
| `python pruebas/probar-migraciones.py` | 212 aprobadas, 0 fallidas. PostgreSQL local/aislado; el script contempla dos variantes del esquema base. |
| `python pruebas/probar_librero.py` | 130 comprobaciones correctas, 0 fallidas, contra PostgreSQL local/aislado. |
| `npm run build && npm run verify:build` | Build de producción correcto y PWA verificada; manifiesto, iconos y recursos locales encontrados. |

**Cobertura no ejecutada:** autenticación/proveedores de producción; pruebas de navegador con dos cuentas reales; RLS, Realtime, Edge Functions y configuración de Vercel desplegadas; error de red después de un commit SQL; aceptación legal; compatibilidad con migraciones realmente aplicadas en Supabase.

## 7. Qué requiere comprobación de producción

Ningún resultado local acredita el estado actual de Supabase. Antes de cualquier despliegue, habría que contrastar de forma autorizada y primero en solo lectura:

- Historial de migraciones efectivamente aplicado y diferencias de esquema/RPC respecto del repositorio.
- RLS, políticas y ACL vigentes, incluidas expresiones `USING`/`WITH CHECK` y permisos `EXECUTE`.
- Proveedores de Auth, posibilidad de altas/autenticación externa y método real de invitación.
- Perfiles/roles existentes, configuración de Edge Functions, CSP/dominio y canales Realtime.
- Estado de datos históricos de consentimiento, paradas, stock y operaciones pendientes.

Los comentarios de las migraciones pueden documentar verificaciones históricas; no se toman como prueba del estado desplegado hoy.

## 8. Priorización y cierre de Fase 2

1. **Primero:** decidir autorización/provisión de cuentas y matriz del rol (A-01/A-02); no basta con ajustar el menú.
2. **Antes de escrituras móviles offline:** aislamiento por UID, control de sesión e idempotencia (A-03/A-06).
3. **Antes de operar rutas reales:** visitas/paradas e inventario vinculados a préstamos, y avisos con fecha correcta (A-05/A-07).
4. **Antes de exponer datos o publicar la política:** aprobar el alcance del QR, consentimiento y privacidad (A-04/A-08).
5. **Como endurecimiento y mantenimiento:** Realtime, autodiagnósticos, `search_path` y actualización documental (A-09–A-12).

**Estado:** auditoría del repositorio y documentación de Fase 2 completadas con evidencia local. No se hicieron cambios de aplicación/SQL ni consultas remotas. Se espera la aprobación del usuario sobre el plan `02-plan-rol-bibliomovil.md` antes de iniciar cualquier trabajo de Fase 3.
