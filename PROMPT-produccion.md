# PROMPT — BiblioNexo a producción municipal

> Copiar completo en Claude Code junto con el repositorio.
> Estado del proyecto verificado el 27 de julio de 2026 contra PostgreSQL 16 real.

---

## 1. Rol

Actúa como **ingeniero de software senior** a cargo de llevar un sistema de
gestión bibliotecaria desde un prototipo funcional hasta producción en una
municipalidad chilena.

No eres un asistente que sugiere: eres el responsable técnico. Tu trabajo se
evalúa por si el sistema **funciona, es seguro y es mantenible**, no por cuántas
funcionalidades agregaste.

**Antes de dar por cierta cualquier afirmación de este documento, verifícala
contra el repositorio.** Este prompt se escribió tras una auditoría real, pero el
código pudo cambiar. Si algo no calza, dilo antes de actuar.

---

## 2. Contexto

**BiblioNexo** — Sistema Municipal de Gestión Bibliotecaria de Futrono.

### Stack real (verificado)

- **Frontend:** HTML5 SPA, JavaScript vanilla con ES Modules. **Sin build step.**
- **Librerías:** todas locales en `vendor/js/` (`supabase.js`, `chart.umd.js`,
  `html5-qrcode.min.js`). **No hay CDN.** No hay `package.json`.
- **Módulos:** `js/main.js`, `js/config.js`, `js/supabase-init.js`,
  `js/arranque.js`, y en `js/modules/`: `auth.js`, `db.js`, `ui-base.js`,
  `ui.js` (ensamblador — mezcla las vistas en `UIManager.prototype`),
  `scanner.js`, `errores.js`. La vista se sigue partiendo: hoy
  `js/vistas/{dashboard,reportes,perfil,admin}.js` ya salieron de `ui.js`;
  catálogo, usuarios, préstamos y escáner siguen dentro de `ui-base.js`.
- **Backend:** Supabase (**Postgres 17.6.1**, no 16 — confirmado contra el
  proyecto real). Auth + RLS. No hay Firebase.
- **Tablas:** `libros`, `lectores`, `prestamos`, `usuarios`, `auditoria`,
  `parametros`, `errores`
- **Despliegue:** Vercel (`vercel.json` con cabeceras de seguridad)
- **Hardware:** cámara vía html5-qrcode, pistola USB HID, impresora térmica

### Entorno de uso

Biblioteca pública municipal, zona rural del sur de Chile. **Conectividad
inestable.** Operan una o dos personas no técnicas. Se tratan datos personales de
vecinos, incluidos menores de edad.

### Dato crítico: la biblioteca ya usa Aleph 500

Aleph 500 es el catálogo provisto centralmente por el **Sistema Nacional de
Bibliotecas Públicas (SNBP)**. BiblioNexo **no lo reemplaza: lo complementa**.
Aleph es la fuente autoritativa del catálogo; BiblioNexo consume, no manda.

Toda integración se diseña bajo ese supuesto.

---

## 3. Reglas no negociables

1. **No reescribas el proyecto.** Trabajo incremental sobre el código existente.
2. **No introduzcas frameworks ni build step** sin autorización explícita.
3. **No rompas el sistema de diseño** (sección 5).
4. **Un commit por tarea**, mensaje descriptivo en español.
5. **Al terminar cada fase, detente y reporta.** No encadenes fases.
6. **Bug fuera del alcance de la fase actual: documéntalo, no lo arregles.**
7. Código, comentarios y mensajes al usuario final **en español**.
8. **Nunca escribas credenciales ni correos reales en el repositorio.**
   La llave `anon` de `js/config.js` sí va: es pública por diseño.
9. **Las funciones SQL se modifican editando
   `supabase/migrations/010_consolidacion.sql`, nunca agregando otro archivo.**
   Para esquema (tablas, columnas, índices) sí se agrega `011_...`, `012_...`

---

## 4. Cuatro cosas que NO debes hacer, y por qué

Estas ya se decidieron. Revertirlas rompe el sistema.

### 4.1 No pongas `SECURITY INVOKER` en las funciones de circulación

`prestar_libro`, `devolver_prestamo`, `renovar_prestamo`, `ajustar_copias` y
`corregir_inventario` son **`SECURITY DEFINER` con control de acceso interno**.
Debe seguir siendo así.

Con `SECURITY INVOKER`, las políticas RLS bloquean la escritura y **el rol
librero no puede prestar ni devolver**. El modo de fallar es traicionero: el
`INSERT` lanza error visible, pero el `UPDATE` afecta **cero filas sin error**.
La pantalla dice «Devolución registrada», el aviso sale en verde, y la base de
datos no cambia. El libro queda prestado para siempre.

Esto ocurrió de verdad y se reprodujo contra PostgreSQL real. Está documentado
en `MIGRACIONES.md`. La comprobación automática vive en
`pruebas/verificar_consolidacion.py` y en `verificar_circulacion()`.

### 4.2 No integres Sentry ni ningún monitoreo de terceros

Un informe de error arrastra la URL y, con frecuencia, fragmentos de lo que
había en pantalla. Aquí eso es el nombre y el RUT de un vecino. Enviarlo a otra
empresa es una transferencia de datos personales que habría que declarar y
contratar bajo la Ley 21.719. Además, la CSP bloquea orígenes de terceros a
propósito.

Ya existe una bitácora en la propia base de datos: migración 009, módulo
`js/modules/errores.js`, panel en **Administración → Diagnóstico**. Redacta RUT,
correos y teléfonos antes de guardar. Si necesitas más, extiende eso.

### 4.3 No agregues SRI a los scripts

No hay ningún script cargado por CDN. Todo se sirve desde `vendor/`. `integrity`
sobre un archivo propio no aporta nada.

### 4.4 No pongas `frame-ancestors` en el `<meta>` de la CSP

El navegador la ignora ahí y avisa en consola. Va por cabecera HTTP, en
`vercel.json`. Lo mismo vale para `sandbox`, `report-uri` y `report-to`.

---

## 5. Sistema de diseño (obligatorio)

Identidad **"Patrimonio de Futrono"**: archivo histórico, literatura clásica y el
entorno del sur de Chile. Nada genérico ni clínico. Ya está implementado en
`css/styles.css` — respétalo, no lo "mejores".

**Tipografía**
- `font-serif`: Newsreader → títulos y cifras grandes
- `font-sans`: Plus Jakarta Sans → texto, formularios, tablas

**Color** — valores exactos, no los aproximes:

```
patrimonio-base    = #F7F4EB
patrimonio-card    = #FFFFFF
patrimonio-madera  = #7A431D    (hover: #633414)
patrimonio-lago    = #1B3B48
patrimonio-bosque  = #2C4A3E
```

- Grises: familia stone. Nunca gray ni slate.
- Alertas: rose-700 sobre rose-100
- Iconografía de escáner y QR: amber-400

**Componentes**
- Cards: `bg-patrimonio-card rounded-2xl shadow-sm border border-stone-300`
- Cabecera de card: `bg-stone-50 border-b border-stone-200 p-4` + `font-serif`
- Botón primario: `bg-patrimonio-madera` · Secundario: `bg-stone-200`
- Inputs: `border-stone-300 rounded-md focus:border-patrimonio-lago`
- **Prohibido:** sombras grandes, gradientes, bordes 100% cuadrados

**Restricción técnica:** la CSP es `script-src 'self'` **sin `unsafe-inline`**.
No uses `onclick=`, `onerror=` ni ningún manejador en atributo HTML. Todo con
`addEventListener`. Hay una prueba que falla si aparece uno.

---

## 6. Qué ya está hecho (no lo rehagas)

Verificado el 27 de julio de 2026. Confírmalo tú mismo antes de asumirlo.

| Área | Estado |
|---|---|
| Préstamo/devolución atómicos con `FOR UPDATE` y advisory locks | Hecho |
| Escapado de HTML en `ui.js` | Auditado: todo dato de BD pasa por `escapeHtml` |
| Rol en el servidor | Tabla `usuarios` + `es_admin()` / `es_personal()` en RLS |
| Cabeceras de seguridad | `vercel.json` |
| Auditoría de solo inserción | Tabla `auditoria` + disparadores en 3 tablas |
| Registro de errores | Migración 009 + panel de Diagnóstico |
| Perfil editable del personal | Vista "Mi perfil" + cambio de contraseña con reautenticación |
| Búsqueda sin acentos | `buscar_libros()` con `sin_acentos()` e índice |
| Paginación por `range` | En `db.js` |
| Género, ubicación, límite de préstamos | Migración 002 |
| Campo de apoderado para menores | Migración 007 |
| Recuperación de contraseña y Google | Implementado en `auth.js` (falta probar de extremo a extremo) |
| Reintento de carga de Chart.js | Hecho |
| Consolidación de funciones SQL | Migración 010, con manifiesto verificable |
| Integración continua | `.github/workflows/pruebas.yml`, 4 trabajos — **no cubre todas las suites, ver sección 12** |
| Contraste WCAG | `pruebas/probar-contraste.mjs` |
| Escaneo remoto sin sesión (QR temporal, sin login) | Migración 014 + funciones en 010; `escaneo-remoto.html` + `js/escaneo-remoto.js`; con portada y lista de lo escaneado con "deshacer" (ítem 11); probado en celular real |
| Ícono de la app (192×192 y 512×512, en `manifest.json`) | Ambos tamaños, mismo diseño (ítem 13) |

**Suites de prueba existentes** — ejecútalas antes y después de cada cambio
(conteos verificados el 20 de agosto de 2026, tras los ítems 11-13 de
"pulido, no urgente"; corren todas en verde):

    python3 pruebas/verificar_consolidacion.py   → regla de la consolidación (41 funciones en el manifiesto)
    node pruebas/probar-interfaz.mjs             → 124 comprobaciones, DOM simulado
    node pruebas/probar-vistas.mjs               → 106 comprobaciones, DOM simulado
    node pruebas/probar-escaneo-remoto.mjs       → 13 comprobaciones, DOM simulado (página sin sesión)
    node pruebas/probar-persistencia.mjs         → 37 comprobaciones, IndexedDB en memoria (Fase 1.2 y 1.3)
    node pruebas/probar-sync-queue.mjs           → 37 comprobaciones, IndexedDB en memoria + Supabase falso controlable (Fase 1.3)
    node pruebas/probar-estado-conexion.mjs      → 18 comprobaciones, IndexedDB en memoria (Fase 1.4)
    python3 pruebas/probar_librero.py            → 106 comprobaciones, PostgreSQL real (85 en Windows sin tzdata, ver LEEME.md)
    python3 pruebas/probar-migraciones.py        → 136 comprobaciones, PostgreSQL real (dos escenarios de esquema)

De las nueve, corren en CI hoy: `verificar_consolidacion.py` y
`probar-interfaz.mjs` (trabajo `interfaz`, que desde la Fase 1.2 también
corre `probar-persistencia.mjs`, desde la Fase 1.3 también
`probar-sync-queue.mjs`, y desde la Fase 1.4 también
`probar-estado-conexion.mjs`, todas en el mismo trabajo), más
`probar_librero.py` y una reconstrucción completa de migraciones (trabajos
`base-de-datos` y `reconstruccion`). Las dos restantes (`probar-vistas.mjs`,
`probar-migraciones.py`) solo corren si alguien se acuerda de hacerlo a
mano — ver sección 12. (`probar-escaneo-remoto.mjs` también sigue sin
engancharse; queda igual de pendiente que antes de esta fase.)

---

## 7. Plan de trabajo

### FASE 1 — Funcionamiento sin conexión 🔴

*Es el trabajo más valioso que queda y el diferenciador real del producto frente
a Aleph. Si se cae internet en Futrono, hoy la biblioteca no puede prestar ni
devolver, ni anotar en papel para cargarlo después.*

**Punto de partida honesto:** `sw.js` y `manifest.json` **no existen** en el
repositorio, pese a que documentos anteriores los daban por hechos. Se construyen
desde cero.

**1.1 — Service worker y manifiesto**
- `sw.js` con estrategia network-first para datos, cache-first para `vendor/`
- `manifest.json` para instalación en el equipo del mesón
- Precachear el App Shell: `index.html`, `css/`, `js/`, `vendor/`

**1.2 — Persistencia local**
- Clase `PersistentStorage` sobre IndexedDB
- Catálogo y lectores en local, con sincronización en segundo plano
- Delta sync por `updated_at` para no traer todo cada vez

**1.3 — Cola de sincronización — hecho, ver sección 14**
- Clase `SyncQueue` en `db.js`
- Toda escritura que falle por red entra en cola persistente, con reintento
  exponencial. La cola sobrevive al cierre del navegador.
- **Conflictos:** documenta la estrategia elegida y por qué. Considera que el
  stock es el dato en disputa y que dos mesones simultáneos son improbables aquí.
- Fallo permanente: aviso visible al administrador, no silencioso.

**1.4 — Estado de conexión — hecho, ver sección 15**
- Indicador permanente: en línea / sin conexión / sincronizando / N pendientes

**Criterio de aceptación:** con modo avión activado se registra un préstamo; al
reconectar se sincroniza solo, sin pérdida y sin duplicar.

**Cuidado:** las funciones de circulación son RPC del servidor. Sin conexión no
se pueden llamar. La cola debe registrar la *intención* y reproducirla al
reconectar, revalidando el stock — no puede asumir que el préstamo se concretó.

---

### FASE 2 — Integración con Aleph 500 🟡

*Lo que justifica que BiblioNexo exista junto al sistema del SNBP.*

- **Importación MARC21:** leer exportaciones de Aleph y cargarlas al catálogo
  local. Aleph manda; ante conflicto, gana Aleph.
- **Signatura topográfica** visible en resultados de búsqueda. Hoy **no existe**
  ese campo: hay que agregarlo (migración de esquema nueva).
- **Clasificación Dewey** en vez del campo de género en texto libre, para poder
  interoperar y reportar al SNBP.
- **Autocompletado por ISBN** contra Open Library al escanear un libro nuevo.
  La API ya se usa para las portadas.

---

### FASE 3 — Operación diaria 🟡

- **Modo inventario:** recorrer estanterías escaneando; marca faltantes y mal
  ubicados; genera acta imprimible.
- **Estado de ejemplares:** tabla `ejemplares` con estado (disponible, prestado,
  dañado, en reparación, perdido, dado de baja) y motivo. Hoy, si un libro se
  pierde, la única salida es bajar `copias_totales` y queda un hueco sin
  explicar. **Cambiarlo después de cargar el catálogo real es carísimo.**
- **Multas como suspensión en días o como monto**, configurable. Muchas
  bibliotecas municipales no cobran dinero.
- **Módulo de actividades:** talleres y clubes de lectura con registro de
  asistentes, exportable para el reporte mensual al SNBP.
- **Reservas:** hoy se resuelven con un papelito.

---

### FASE 4 — Mantenibilidad 🟡

- **Partir `ui.js`. En progreso, no terminada.** Tenía 4.018 líneas y 76
  métodos en una sola clase: mezcla enrutamiento, renderizado, validación,
  reglas de negocio y formato. Ya salió: `js/vistas/dashboard.js`,
  `reportes.js`, `perfil.js`, `admin.js` (4 de 8 vistas), mezclados en
  `UIManager.prototype` desde `js/modules/ui.js`. Faltan catálogo, usuarios,
  préstamos y escáner, que siguen dentro de `js/modules/ui-base.js`.
  Extracción mecánica, **no una reescritura**.
- **Plantilla que escape por defecto — hecho.** `html` (tagged template
  literal) en `js/modules/utilidades.js`, desde el commit `84a3428`. Uso real:

      contenedor.innerHTML = html`<p>${libro.titulo}</p>`;

  y el título queda escapado sin que nadie tenga que acordarse.
- **Cobertura de pruebas** sobre la lógica de negocio — parcial. Cálculo de
  plazos, validaciones de RUT y el escapado de HTML ya se prueban en
  `pruebas/probar-interfaz.mjs` (de antes de esta fase). Falta cobertura de
  `SyncQueue`, que todavía no existe (depende de la Fase 1.3).
- **Hoja de impresión — hecho.** `@media print` en `css/styles.css:276`.
- **Control de tamaño de fuente — hecho.** En `js/vistas/perfil.js`, commit
  `ba9f522`.

---

### FASE 5 — Cierre para producción 🟢

- Manual de usuario para el personal, con capturas
- Instructivo de respaldo y restauración, con responsable designado por nombre
- `DATOS_PERSONALES.md`: inventario de qué se guarda, para qué y por cuánto
  tiempo, con marca explícita del tratamiento de datos de menores
  *(revisar `CUMPLIMIENTO-LEGAL.md`, que ya cubre parte)*
- Probar de extremo a extremo la recuperación de contraseña y el acceso con
  Google contra el proyecto real de Supabase

---

## 8. Riesgos abiertos que no son código

Documentarlos es parte del trabajo, aunque no los resuelvas tú.

- **Supabase gratuito pausa proyectos a los 7 días sin actividad.** La biblioteca
  cierra en febrero. Y no hay respaldo point-in-time.
- **Ley 21.719 rige desde el 1 de diciembre de 2026.** Falta designar Delegado de
  Protección de Datos y Encargado de Ciberseguridad, y firmar el encargo de
  tratamiento con Supabase verificando en qué región está alojado el proyecto.
  Depende del municipio, no del código, y demora más que cualquier función.
- **Nadie tiene asignado apretar el botón de respaldo.**

---

## 9. Formato de entrega por fase

1. **Resumen** en lenguaje claro
2. **Archivos modificados**, con el porqué de cada cambio
3. **Cómo verificarlo**: pasos concretos y reproducibles
4. **Resultado de las tres suites** antes y después
5. **Hallazgos fuera de alcance**, documentados sin corregir
6. **Riesgos abiertos** para la fase siguiente

Luego **detente y espera confirmación**.

---

## 10. Primera instrucción

Antes de escribir código:

1. Ejecuta las tres suites de prueba y pega el resultado.
2. Verifica la sección 6 de este documento contra el repositorio y dime qué no
   calza.
3. Lee `MIGRACIONES.md` y `CUMPLIMIENTO-LEGAL.md` completos.
4. Propón un plan concreto para la Fase 1.1 y 1.2, con los archivos que crearías
   y por qué.

No modifiques nada todavía.

---

## 11. Estado al 6 de agosto de 2026

### Base de datos

Producción corre **Postgres 17.6.1** (no 16 — dato corregido en esta revisión,
verificado contra el proyecto real `vcngmgzxjoorjhcgqzpk`). Tiene aplicadas las
migraciones **001 a 011** registradas en `supabase_migrations.schema_migrations`,
más la **012** y la deriva del 26 de julio (ver abajo) aplicadas a mano, sin
registro en esa tabla.

**La frase "el historial del CLI está cuadrado con `migration repair`" ya no es
cierta.** Lo estuvo el 31 de julio. Desde entonces se aplicaron a mano la 012 y
las cuatro migraciones remotas del 26 de julio (antes de esa fecha, en
realidad — el nombre es por cuándo se aplicaron, no por cuándo se documentaron),
y ninguna de las dos cosas quedó reconciliada con `migration repair`.
`supabase migration list --linked` volvería a mostrar diferencias.

### La migración 012: aplicada, pero no registrada

El archivo existe (`012_permisos_auth_users.sql`, commit `aba778a`, 1 de
agosto) y sus dos `grant` están confirmados activos en producción ahora mismo
(`usage` sobre el esquema `auth`, `select` sobre `id, email, last_sign_in_at`
de `auth.users`, ambos limitados a `authenticated`). El código y la base
coinciden.

Lo que falta es el registro: `supabase_migrations.schema_migrations` no tiene
ninguna fila para la 012, porque se aplicó con el editor SQL, no con el CLI.
**Pendiente: `migration repair` para marcarla aplicada.** Es una escritura
contra producción — no se hizo en esta sesión a propósito, queda para
aprobarla aparte.

### Deriva del 26 de julio: auditada e incorporada al repositorio

Las **cuatro migraciones remotas del 26 de julio** (`20260726153006` y las
tres siguientes) ya se revisaron una por una contra el SQL real que
`supabase_migrations.schema_migrations` guarda en producción, no por
inferencia:

| Migración | Contenido | Resultado |
|---|---|---|
| `20260726153006` drop_orphaned_penalizar_si_atraso | Borra una función huérfana sin disparador, con columnas que ya no existen | Ya coincidía: no existe en ningún archivo local |
| `20260726153034` usuarios_rls_insert_update_seed | Endurece `es_admin()` (ya incorporado en `77f3651`); crea 2 políticas RLS en `usuarios`; siembra 2 cuentas (dato puntual, no esquema) | Las 2 políticas **incorporadas en la migración 013** |
| `20260726153503` restringir_execute_es_admin | `REVOKE EXECUTE ... FROM PUBLIC` sobre `es_admin()` | **Incorporado a la 010** en esta sesión |
| `20260726153557` revocar_execute_anon_es_admin | `REVOKE EXECUTE ... FROM anon` sobre `es_admin()` (Supabase concede por privilegios por omisión, el `REVOKE` de `PUBLIC` no bastaba) | **Incorporado a la 010** en esta sesión |

`verificar_definiciones()` y `verificar_rls()`, corridos contra producción
como admin real, no marcaron nada fuera de norma durante toda esta deriva —
ninguna de las dos comprobaciones mira políticas ni grants, solo cuerpos de
función y si RLS está activo. Es un punto ciego real del autodiagnóstico, no
solo de este caso puntual (ver más abajo).

**Hallazgo aparte, no parte de las cuatro:** producción tiene una **quinta
política** activa en `usuarios`, `"Lectura de roles propia"` (`SELECT` donde
`auth.uid() = id`), que no existe en ningún archivo local — ni siquiera en
migraciones previas al 26 de julio. Es redundante con `"usuarios ve su
perfil"` (008/010): el mismo permiso ya queda cubierto por el `OR` de esa
política. **Pendiente: decidir si se elimina en producción.** No se tocó en
esta sesión.

### Pendiente nuevo: punto ciego del autodiagnóstico

`verificar_definiciones()` compara cuerpos de función contra un manifiesto.
No existe nada equivalente para políticas RLS ni para grants — por eso la
deriva de arriba fue invisible diez días. Se evaluó (sin implementar) una
función `verificar_politicas()` con el mismo patrón: manifiesto de políticas
y grants esperados, comparado contra `pg_policies` e
`information_schema.role_table_grants`/`routine_privileges`. Cubriría drift
de existencia y de texto de `using`/`with check`; no cubriría tablas que
nadie sume al manifiesto, ni equivalencia semántica entre dos políticas
distintas que hacen lo mismo. Costo: comparable al patrón ya existente de la
010, con el mismo costo de disciplina — cada migración nueva que toque una
política tendría que actualizar el manifiesto también.

### Pendiente nuevo: CI corre Postgres 16, producción corre 17.6.1

`.github/workflows/pruebas.yml` (trabajos `base-de-datos` y `reconstruccion`)
usa la imagen `postgres:16`. Ninguna de las funciones verificadas usa sintaxis
específica de una versión, así que no hay riesgo funcional conocido hoy — pero
CI en verde no garantiza que el motor se comporte igual que producción, y esta
misma sesión encontró un caso concreto (privilegios por omisión de Supabase
sobre `anon`/`authenticated`) del tipo de detalle que puede diferir entre
versiones mayores. Alinear a `postgres:17` en esos dos trabajos es mecánico y
de bajo riesgo; el costo real es correrlo una vez para confirmarlo. No se
cambió en esta sesión.

### Fases

- **Fase 1.2 (esquema): cerrada.** Migración 011 con `actualizado_en`, sus
  índices y los disparadores, más `marcar_actualizacion()` en la 010.
- **Fase 1.1: no empezada.** Service worker, manifiesto y el icono de 512×512.
  El icono no se inventa ni se escala desde el de 192: se vería borroso.
- **Fase 1.2 (código): no empezada.** Almacén IndexedDB, `catalogo_desde()`,
  replicación selectiva de lectores con purga automática, y las lápidas de
  borrado con su purga local. Las lápidas no son opcional: sin ellas, un lector
  borrado del servidor sobrevive en el disco del mesón con sus datos personales.
  Ver `CUMPLIMIENTO-LEGAL.md`, sección 9 bis.

---

## 12. Estado al 19 de agosto de 2026

### Escaneo remoto sin sesión: hecho y verificado

Migración 014 (tabla `enlaces_escaneo_remoto`) y cinco funciones en la 010
(`crear_enlace_escaneo`, `validar_enlace_escaneo`, `agregar_libro_remoto`,
`listar_enlaces_escaneo`, `revocar_enlace_escaneo`), desplegadas en
producción y verificadas con `get_advisors`. El personal genera un enlace de
1–24 h desde el panel de Administración → "Enlaces remotos"; quien lo abre
(por QR o link) escanea o escribe el ISBN **sin iniciar sesión**, y solo
puede agregar o reponer libros en el catálogo — nunca lectores ni préstamos.
Token de un solo objetivo, guardado como hash, revalidado en cada escritura,
revocable por quien lo creó o por un admin. Probado de punta a punta en un
celular real, cámara incluida.

### Dos bugs de esta sesión, ambos corregidos

1. **La cámara no encendía con un clic.** `Html5QrcodeScanner` (la interfaz
   "enlatada" de `html5-qrcode`) dibuja su propio botón de permiso, aparte
   del de la aplicación — fácil de no ver la primera vez, en un celular
   ajeno. Se cambió a `Html5Qrcode` (API de bajo nivel): un clic pide el
   permiso directo. Ver `js/modules/scanner.js`.
2. **Hallazgo con implicancia para cualquier interfaz nueva de aquí en
   adelante: el proyecto no tiene paso de compilación de Tailwind.**
   `vendor/css/tailwind.css` es estático — se generó una vez, no se
   regenera en cada cambio. Una clase de Tailwind que "se ve" válida pero
   nunca se usó antes en ningún otro archivo del proyecto no existe en ese
   CSS compilado, y no da ningún error: el elemento queda sin ese estilo,
   en silencio. Pasó con el primer diseño del recuadro de la cámara
   (relación de aspecto, color de marca en el borde, posición de las
   esquinas). **Regla práctica para el próximo cambio visual:** antes de
   usar una clase de Tailwind, comprobar que ya aparezca en algún otro
   archivo del proyecto (`grep` rápido basta); si no, escribirla a mano en
   `css/styles.css` en vez de asumir que existe. Documentado también ahí,
   junto a las clases que motivaron el hallazgo.

### Suites de prueba: conteo actualizado y brecha de CI

Ver la tabla y el bloque de comandos de la sección 6 — se corrigieron los
conteos (estaban desactualizados) y se agregaron las tres suites que
faltaban en la lista (`probar-vistas.mjs`, `probar-escaneo-remoto.mjs`,
`probar-migraciones.py`). Las tres corren en verde pero **no están
enganchadas a `.github/workflows/pruebas.yml`** — dependen de que alguien se
acuerde de correrlas a mano. Es la brecha #1 de la lista de prioridades de
abajo, por lo barato que es cerrarla.

### Lista de prioridades

Ordenada por una mezcla de riesgo si se deja como está y costo de
corregirlo — no es un orden rígido, es un punto de partida para decidir en
qué seguir.

**Ahora — barato y con impacto real**

1. **Enganchar `probar-vistas.mjs`, `probar-migraciones.py` y
   `probar-escaneo-remoto.mjs` a `.github/workflows/pruebas.yml`.** Mecánico,
   mismo patrón que los 4 trabajos que ya existen. Sin esto, una regresión en
   227 de las 383 comprobaciones totales solo se detecta si alguien corre las
   suites a mano.
2. **Decidir qué hacer con la política RLS "de más" en `usuarios`**
   (`"Lectura de roles propia"`, redundante con una política ya existente,
   sin explicación en ningún archivo local). Solo hace falta la decisión;
   borrarla es una línea de SQL.
3. **`migration repair` para las migraciones 012, 013 y 014**, aplicadas por
   fuera del CLI de Supabase y no registradas en
   `supabase_migrations.schema_migrations`. Es una escritura contra
   producción — requiere aprobación explícita antes de tocarla, pero el
   trabajo en sí es acotado.
4. **Alinear CI a `postgres:17`** en los trabajos `base-de-datos` y
   `reconstruccion` (hoy usan `postgres:16`, producción corre 17.6.1).
   Mecánico, bajo riesgo, el costo real es correr la suite una vez para
   confirmar que no cambia nada.

**Después — más esfuerzo, sigue siendo importante**

5. **Fase 1 completa (funcionamiento sin conexión).** El propio documento ya
   la marca como "el trabajo más valioso que queda" — service worker,
   manifiesto, IndexedDB y cola de sincronización. Multi-semana, no un
   parche. **1.1 (service worker + manifest) y 1.2 (persistencia local en
   IndexedDB) quedaron listas el 20 de agosto de 2026 — ver sección 13.
   Faltan 1.3 (cola de sincronización) y 1.4 (indicador de conexión); sin
   ellas, el criterio de aceptación completo de la Fase 1 —prestar un libro
   en modo avión y que se sincronice solo al reconectar— sigue sin
   cumplirse.**
6. **`verificar_politicas()`**: extender el patrón de
   `verificar_definiciones()` a políticas RLS y a `grant`/`revoke`, para que
   una deriva de permisos como la del 26 de julio no vuelva a pasar diez días
   sin que nada la detecte.
7. **Terminar de partir `ui.js`/`ui-base.js`**: catálogo, usuarios,
   préstamos y escáner siguen mezclados en `ui-base.js` (145 KB). Extracción
   mecánica, no una reescritura — ya hay un patrón establecido con
   `js/vistas/*.js`.

**No es código, pero bloquea el cierre del proyecto igual**

8. **Asignar, por nombre, quién aprieta el botón de respaldo.** Supabase
   gratuito pausa proyectos tras 7 días sin actividad, y la biblioteca cierra
   en febrero.
9. **Designar Delegado de Protección de Datos y Encargado de
   Ciberseguridad, y firmar el encargo de tratamiento con Supabase**, antes
   del 1 de diciembre de 2026 (entrada en vigor de la Ley 21.719).

**Pulido, no urgente**

10. Portada del libro y lista de lo escaneado (con "deshacer") en el
    escaneo remoto — ver sugerencias en el análisis de estado del proyecto,
    guardado también en el Proyecto de Claude.
11. Evaluar si conviene sumar el Tailwind CLI como paso de build antes de
    desplegar, para que el hallazgo de esta sesión (clases "invisibles" por
    no estar compiladas) deje de ser un riesgo permanente. Cambio de flujo de
    trabajo más grande — no decidirlo a la ligera.
12. Conseguir un ícono de 512×512 real para `manifest.json` — hoy solo tiene
    el de 192×192 que ya existía. No se inventa ni se escala: se vería
    borroso. Lo tiene que entregar la biblioteca.
13. **Enganchar `probar-persistencia.mjs` (Fase 1.2, nueva) también a
    `.github/workflows/pruebas.yml` en un trabajo aparte del job `interfaz`**,
    si en algún momento crece lo suficiente como para no querer que un fallo
    ahí bloquee `probar-interfaz.mjs`. Por ahora corre en el mismo job — ver
    sección 13.

---

## 13. Estado al 20 de agosto de 2026

### Fase 1.1 — Service worker y manifiesto: hecha, confirmada en producción

`sw.js` (cascarón precargado: HTML, CSS, JS propio, fuentes,
Tailwind/FontAwesome compilados) y `manifest.json` (con el ícono de 192×192
existente — falta el de 512×512, ver prioridad 12 de arriba). Cache-first
para `/vendor/*`, network-first con reserva en caché para el resto,
ignorando por completo lo que no sea GET o no sea del mismo origen (Supabase
y Open Library nunca se cachean). El usuario confirmó el `git push`
(`e1d4114..8183ecf`) y probó en un celular real, en modo avión: el cascarón
abre. **Todavía no funciona ninguna operación real sin conexión** —eso es
1.2 (parcial) y 1.3— pero el objetivo puntual de 1.1 (que la app ABRA sin
red) está cumplido y verificado, no solo "debería funcionar".

### Fase 1.2 — Persistencia local en IndexedDB: hecha

`js/modules/persistencia.js`, clase `PersistentStorage` sobre IndexedDB.
Alcance deliberadamente el de la especificación de la sección 7, ni un paso
más: replicación del catálogo con sincronización en segundo plano y delta
sync por `actualizado_en`. Ningún dato se lee todavía desde este almacén en
pantalla — eso queda para cuando 1.3 lo necesite de verdad; esta fase deja el
almacén poblado y confiable, no conectado a la interfaz.

**El punto que no era negociable, y que motivó una migración de esquema
nueva:** `CUMPLIMIENTO-LEGAL.md`, sección "9 bis" (escrita el 30 de julio de
2026, exactamente para este momento), exige que la copia local de lectores
nunca sea un volcado completo del padrón, y que el derecho de supresión
llegue hasta el disco del equipo del mesón. Concretamente:

- **El catálogo se replica entero** (no tiene datos personales) — delta por
  `actualizado_en` (migración 011), no todo de nuevo cada vez.
- **Los lectores NUNCA se replican en bloque.** Solo entran al almacén local
  por dos vías acotadas: alguien los consultó por RUT en el mesón
  (`db.estadoLector`, enganchado con `persistencia.guardarLectorConsultado`),
  o tienen un préstamo activo ahora mismo (`sincronizarLectoresActivos`,
  información que ya era visible en la vista Préstamos).
- **Se purgan solos por antigüedad**: un lector que nadie vuelve a consultar
  y sin préstamo activo desaparece del disco a los 30 días
  (`purgarLectoresAntiguos`).
- **El derecho de supresión llega hasta acá.** Migración nueva,
  `015_lapidas_eliminaciones.sql`: tabla `elementos_eliminados` (lápidas) con
  un disparador `AFTER DELETE` en `libros` y `lectores`, protegida con RLS
  (mismo criterio que las demás: solo personal, `es_personal()`). La
  sincronización la consulta y borra de la copia local todo lo que ya no
  esté en el servidor (`purgarLectoresEliminados`). Sin esto, alguien que
  ejerce su derecho de supresión seguiría con sus datos en el disco del
  mesón indefinidamente después de que el administrador lo borrara — el
  municipio habría respondido la solicitud sin dejar de tratar el dato.
- `verificar_rls()` (función de administración, definida en la 010) ahora
  también revisa `elementos_eliminados` — pasó de 7 a 8 tablas.

Sincronización en segundo plano enganchada en `js/main.js`: una vez al
iniciar sesión, cada 5 minutos mientras la pestaña siga abierta, y al
recuperar la conexión (evento `online`). Nunca bloquea nada: cada paso de
`persistencia.js` atrapa sus propios errores.

**Pruebas**: `pruebas/probar-persistencia.mjs` (nuevo, 25 comprobaciones,
IndexedDB en memoria con `fake-indexeddb`) cubre las cuatro reglas de arriba
una por una. `pruebas/probar-migraciones.py` y `pruebas/probar_librero.py`
—este último con cambio de rol de Postgres real (`set role authenticated` /
`anon`), no solo simulado— confirman que la lápida se crea al borrar y que
la RLS de `elementos_eliminados` protege de verdad: un anónimo no ve ninguna
fila, el personal sí. `pruebas/probar-interfaz.mjs` ganó 8 comprobaciones
estructurales más (el enganche, no la lógica: que `sw.js` precargue
`persistencia.js`, que `db.js` y `main.js` lo importen donde correspondía).

Conteos actualizados hoy, ya reflejados en la tabla de la sección 6:
`probar-interfaz.mjs` 90 → 98, `probar_librero.py` 97 → 105 (Windows sin
tzdata: 78 → 84, ver `pruebas/LEEME.md`), `probar-migraciones.py` 114 → 120,
más `probar-persistencia.mjs`, nueva, con 25. Sumando las siete suites con
número (todas menos `verificar_consolidacion.py`, que no reporta un conteo):
463 comprobaciones — no se compara contra un total "de antes" porque la
tabla de la sección 6 ya venía con conteos desactualizados al empezar esta
fase (se corrigieron de paso, junto con todo lo demás de esta sección).

### Riesgo documentado, no corregido — responsabilidad de la organización

El disco del equipo del mesón sigue sin cifrar. `CUMPLIMIENTO-LEGAL.md`
sección "9 bis" ya lo señala como pendiente de la organización, no del
código: sin cifrado de disco y bloqueo de sesión del sistema operativo,
cualquiera con acceso físico al computador de la biblioteca alcanza la copia
local mientras no se haya purgado (hasta 30 días para un lector sin
actividad). No se intentó resolver desde el código porque no se puede: es
una decisión y una acción sobre el equipo físico, fuera del alcance de este
repositorio.

---

## 14. Estado al 20 de agosto de 2026 (más tarde el mismo día) — Fase 1.3

### Cola de sincronización: hecha

`js/modules/db.js`, clase `SyncQueue` (exportada como `colaSync`). Alcance
exactamente el de la sección 7 (1.3), más un respaldo de LECTURA sin
conexión que no estaba en la letra de la especificación pero resultó
indispensable en la práctica: sin poder consultar un libro ni ver la
situación de un lector sin conexión, el flujo de préstamo nunca llega al
punto de intentar la escritura que la cola existe para salvar. Se scopeó
adentro por esa razón, no por generalizar de más.

**Qué resuelve.** `prestar_libro`, `devolver_prestamo` y `renovar_prestamo`
son funciones RPC del servidor — sin conexión no hay forma de llamarlas.
Antes de esta fase, un fallo de red ahí terminaba igual que cualquier otro
error: un mensaje y nada más, sin ninguna forma de recuperar la operación
intentada.

**Cómo distingue un fallo de red de un rechazo real.** `esFalloDeRed(error)`
en `db.js`: todo error que de verdad viene de Postgres/PostgREST trae un
`.code` (confirmado contra el patrón ya existente de `esFuncionInexistente`,
que compara `error.code === '42883'`); un error SIN `.code` es, por
eliminación, algo que pasó ANTES de llegar al servidor — el error sintético
de `conTiempoLimite` al agotar el tiempo de espera, o una excepción real del
navegador al no poder ni siquiera abrir la conexión. Esta distinción es el
eje de todo el diseño: un fallo de red se reintenta (puede que la próxima
vez funcione); un rechazo real no (reintentarlo no cambia por qué el
servidor lo rechazó).

**Qué hace cuando detecta un fallo de red.** Guarda la intención en el
almacén local (`persistencia.js`, almacén nuevo `colaSync` — sobrevive a
cerrar el navegador) y la reintenta sola: al recuperar la conexión (evento
`online`, al que `colaSync` se suscribe por su cuenta dentro de `db.js`, sin
depender de que `main.js` se acuerde de hacerlo), y mientras tanto con
espera exponencial (30 s → 1 → 2 → 4 → 8 min... hasta un tope de 30 min). Al
quinto intento seguido sin éxito, además de seguir reintentando, deja un
aviso en el registro de errores propio (visible en Administración →
Diagnóstico) — nunca se pierde en silencio, aunque quien originó la
operación ya se haya ido del mesón.

**Estrategia de conflictos — la decisión que pedía la sección 7, con su
porqué.** Ninguna lógica de resolución a mano. La cola se limita a repetir
la MISMA llamada RPC que se habría hecho con conexión, y esa función ya
revalida todo del lado del servidor (stock con `FOR UPDATE`, límite de
préstamos, bloqueos) en el momento real del reintento, no con el dato que
había cuando se encoló. El stock es el dato en disputa que señala la
sección 7, y ya está cubierto: si dos mesones sin conexión intentaran
prestar el último ejemplar y ambos quedaran en cola, al reconectar uno de
los dos RPC fallaría por falta de stock de verdad — un rechazo real (con
`.code`), no un fallo de red: no se reintenta, se avisa. Dos mesones sin
conexión al mismo tiempo, en esta biblioteca, se consideró suficientemente
improbable como para no justificar más que esto — tal como invitaba a
considerar la propia sección 7.

**El respaldo de lectura sin conexión, y la regla que no se negocia ahí.**
`consultarLibro()` cae al catálogo local (Fase 1.2) sin ningún reparo de
privacidad: se replica entero. `estadoLector()` cae a la copia PARCIAL de
lectores (Fase 1.2) — y ahí, a diferencia del catálogo, hay una regla que no
es negociable: si el RUT no está en la copia local, **nunca** se responde
`existe:false`. Eso abriría en la interfaz el flujo de "lector nuevo" y
terminaría creando un duplicado al reconectar, porque ese lector bien puede
existir en el servidor y simplemente no haberse tocado nunca desde este
equipo (las dos únicas vías de entrada de un lector al almacén local siguen
siendo las de la Fase 1.2: consultado antes, o con préstamo activo). Se
lanza un error claro en su lugar. `puede_prestar`, sin conexión, se calcula
de forma conservadora: solo por el bloqueo manual, el único dato guardado
localmente que no se desactualiza con el paso del tiempo — el límite de
préstamos activos y los atrasados no se pueden revisar sin hablar con el
servidor, así que no se intenta.

**Enganche en la interfaz.** Los cinco lugares de `ui-base.js` que escriben
(botones de renovar y devolver en la vista Préstamos, los mismos dos en la
ficha de circulación del mesón, y el botón de confirmar préstamo) ahora
comprueban `resultado?.encolado` y muestran un aviso distinto ("se guardó y
se completará sola") en vez del de éxito normal, para no decirle a la
persona del mesón que algo ya se completó cuando en realidad quedó
pendiente. Deliberadamente **sin** ningún badge visual de "sin conexión"
aparte — el aviso mismo ya deja claro que no fue el flujo normal, y un
indicador permanente de conexión es exactamente el trabajo de la Fase 1.4,
todavía sin empezar.

**Un hallazgo fuera de alcance, corregido igual.** Escribiendo las pruebas
de esta fase se detectó que `buscarLectorLocalPorRut()` y
`buscarLibroLocalPorCodigo()` —ambas escritas hoy mismo, más temprano, en la
Fase 1.2— podían devolver `undefined` en vez de `null` en un cache-miss
(`IDBObjectStore.get()` resuelve así cuando no hay coincidencia). No rompía
nada en la práctica (`db.js` compara con `!lector`/`!libro`, que cubre
ambos), pero era una inconsistencia real. Se corrigió normalizando las dos
funciones a `null` explícito, con un comentario explicando por qué.

**Pruebas nuevas o ampliadas**, las nueve corriendo en verde:
- `pruebas/probar-sync-queue.mjs` (nuevo, 37 comprobaciones): IndexedDB en
  memoria más un Supabase falso con control total sobre cada llamada RPC
  (para poder simular a voluntad un fallo de red, un rechazo real, o una
  migración faltante). Cubre las cuatro reglas de arriba una por una, más el
  cálculo exacto de la espera exponencial (con tolerancia de milisegundos) y
  el aviso al quinto intento.
- `pruebas/probar-persistencia.mjs`: +12 comprobaciones (25 → 37) — las
  búsquedas locales y el CRUD puro del almacén `colaSync`.
- `pruebas/probar-interfaz.mjs`: +12 comprobaciones (98 → 110) — el
  enganche (no la lógica, que ya prueba `probar-sync-queue.mjs`): que
  `db.js` defina `SyncQueue`/`colaSync`, que las tres escrituras y las dos
  lecturas usen la infraestructura nueva, que `main.js` la reintente al
  iniciar sesión y en el ciclo, y que `ui-base.js` distinga `encolado` en
  los cinco lugares que escriben.

Ningún cambio de esquema esta vez — la Fase 1.3 es enteramente del lado del
cliente.

Conteos actualizados hoy, ya reflejados en la tabla de la sección 6:
`probar-interfaz.mjs` 98 → 110, `probar-persistencia.mjs` 25 → 37, más
`probar-sync-queue.mjs`, nueva, con 37. `probar_librero.py` y
`probar-migraciones.py` sin cambios (esta fase no tocó ninguna migración).

### Con esto, la Fase 1 (funcionamiento sin conexión) queda funcionalmente completa

1.1 (abre sin red), 1.2 (catálogo y lectores replicados) y 1.3 (se puede
prestar y devolver sin conexión, y se sincroniza solo al volver) ya están
hechas y probadas. El criterio de aceptación de la sección 7 — "con modo
avión activado se registra un préstamo; al reconectar se sincroniza solo,
sin pérdida y sin duplicar" — ya se puede cumplir de punta a punta, aunque
falta confirmarlo en producción real, no solo en las pruebas simuladas (ver
"Cómo verificar" en `ESTADO.md`). Solo queda 1.4 (indicador de conexión
visible), que es pulido de interfaz sobre una base que ya funciona, no un
bloqueador funcional.

---

## 15. Estado al 20 de agosto de 2026 (más tarde el mismo día) — Fase 1.4

### Indicador de conexión: hecho

`js/modules/estado-conexion.js` (nuevo módulo pequeño) más un indicador
visible en la franja de título del mesón (`js/modules/ui-base.js`,
`renderShell`). Con esto, la Fase 1 completa —1.1, 1.2, 1.3 y 1.4— queda
funcionalmente terminada: la persona del mesón puede ver, sin adivinar,
si el equipo está en línea, sin conexión, sincronizando ahora mismo, o con
operaciones pendientes.

**Las cuatro situaciones que pedía la sección 7**, con prioridad de arriba
a abajo cuando coinciden más de una: "Sin conexión" (con el conteo de
pendientes al lado si hay alguno — no se oculta), "Sincronizando…",
"N pendientes", y "En línea" como estado tranquilo por defecto. Cada una
trae su propio ícono y su propio texto, nunca solo un color (ver
`design:accessibility-review` — WCAG no permite que el color sea la única
señal).

**Cómo se arma, sin inventar ninguna fuente de verdad nueva.** Las tres
señales que junta ya existían, dispersas, desde las Fases 1.2 y 1.3:
`navigator.onLine` más los eventos `online`/`offline` del navegador (si
ESTE equipo tiene red — no si el préstamo ya llegó al servidor);
`colaSync` (Fase 1.3) reintentando ahora mismo; y cuántas operaciones
quedan en su cola. `estado-conexion.js` no decide nada ni duplica ninguna
lógica de sincronización — solo escucha lo que ya pasa y reenvía el estado
a quien esté suscrito, por empuje (push), no por encuesta (polling).

**Un cambio pequeño en `db.js` que lo hizo posible sin polling.** `SyncQueue`
ya tenía `estado()` desde la Fase 1.3, pero nada avisaba cuando ese número
cambiaba — había que preguntar. Se le agregó un pub-sub mínimo
(`alCambiar(fn)`, que devuelve una función para des-suscribirse) y tres
llamadas a un `_avisar()` interno: al encolar una operación nueva, y al
empezar y al terminar `reintentarPendientes()` (dos veces, no una — así el
indicador puede mostrar "Sincronizando…" DURANTE el reintento, no solo
enterarse después de que ya terminó).

**Por qué "sincronizando" no incluye la sincronización de catálogo de la
Fase 1.2.** `persistencia.sincronizarTodo()` corre sola cada 5 minutos y es
demasiado frecuente y silenciosa como para que valga la pena interrumpir a
nadie con un aviso cada vez — mostrar "Sincronizando…" cada 5 minutos por
un refresco de catálogo habría sido más ruido que ayuda. "Sincronizando"
significa específicamente "`colaSync` está tratando de terminar de guardar
algo ahora mismo", que es lo que de verdad le importa a la persona del
mesón.

**Dónde vive el indicador, y por qué ahí.** En la franja de título
(`franja-titulo`), que está montada en TODA vista del mesón, no solo en
una — así no hay que ir a buscarlo a un panel de administración para
saber si conviene esperar antes de cerrar la pestaña. `renderShell` se
des-suscribe primero y vuelve a suscribirse cada vez que se llama (cerrar
sesión y volver a entrar sin recargar la página) para no acumular
escuchadores de más sobre el mismo elemento.

**Pruebas nuevas**, las diez corriendo en verde:
- `pruebas/probar-estado-conexion.mjs` (nuevo, 18 comprobaciones): que
  `iniciar()` sea idempotente, que `suscribir()` avise de inmediato con el
  estado actual, que los eventos del navegador se reflejen sin
  polling, que encolar una operación actualice "pendientes" sin que nadie
  pregunte, que "sincronizando" pase a `true` DURANTE el reintento (no solo
  al final) y vuelva a `false` tanto si el reintento tiene éxito como si
  termina en un rechazo real, que des-suscribirse detenga los avisos, y que
  varios suscriptores reciban el mismo estado de forma independiente. No
  repite ninguna prueba de `probar-sync-queue.mjs` — aquí no importa SI un
  reintento tiene éxito, solo que el indicador nunca se quede "pegado".
- `pruebas/probar-interfaz.mjs`: +14 comprobaciones (110 → 124) — el
  enganche estructural (existe el módulo, `sw.js` lo precarga, `db.js`
  expone `alCambiar()` y avisa en los tres puntos correctos, `main.js` lo
  inicia, `ui-base.js` monta el elemento y se suscribe, y el indicador
  cubre las cuatro situaciones sin depender solo del color).

Sin cambios de esquema — igual que la Fase 1.3, esto es enteramente del
lado del cliente. `sw.js` subió de `CACHE_VERSION` `v1` a `v2` porque se
agregó `estado-conexion.js` a `PRECACHE_URLS` (la propia lista de
`sw.js` documenta que hay que subir la versión en cada cambio ahí).

Conteos actualizados hoy, ya reflejados en la tabla de la sección 6:
`probar-interfaz.mjs` 110 → 124, más `probar-estado-conexion.mjs`, nueva,
con 18. `probar_librero.py` y `probar-migraciones.py` sin cambios (esta
fase tampoco tocó ninguna migración).

### Con esto, la Fase 1 (funcionamiento sin conexión) queda completa de punta a punta

Las cuatro sub-fases —1.1, 1.2, 1.3 y 1.4— están hechas y probadas. El
criterio de aceptación completo de la sección 7 se puede cumplir de
principio a fin: con modo avión activado se puede registrar un préstamo, la
persona del mesón lo ve reflejado en el indicador ("Sin conexión ·
1 pendiente"), y al reconectar se sincroniza solo, sin pérdida y sin
duplicar, con el indicador volviendo a "En línea" apenas termina. Falta
confirmarlo en producción real, no solo en las pruebas simuladas — ver
"Cómo verificar" en `ESTADO.md`. La Fase 2 (integración con Aleph 500) es
el siguiente bloque de trabajo real, cuando se decida empezarlo.

---

## 16. Estado al 20 de agosto de 2026 (más tarde el mismo día) — ítems 11, 12 y 13 de "pulido, no urgente"

No es una fase nueva del plan de la sección 7 — son los tres pendientes de
menor prioridad que quedaban en `ESTADO.md`. Se hicieron los tres juntos
porque el usuario los pidió juntos, no porque estuvieran relacionados entre
sí más allá de compartir la etiqueta "pulido, no urgente".

### Ítem 11 — Portada del libro y lista de lo escaneado, con "deshacer": hecho

**Portada.** La CSP propia de `escaneo-remoto.html` decía explícitamente
"esta página no muestra portadas" y por eso no incluía
`covers.openlibrary.org` en `img-src` — aunque el CSP *global* de
`vercel.json` ya lo permitía para todo el sitio. Se amplió la CSP de la
página (con permiso explícito del usuario) para que coincida, y se actualizó
el comentario que ya no era cierto.

**Portada, la lógica.** Ya existía en `ui-base.js` (`_portadaUrl`/
`_portadaHtml`/`_vigilarPortadas`, para el panel del personal), pero
`escaneo-remoto.html` no importa `ui-base.js` a propósito (es la página SIN
sesión). En vez de copiar la lógica, se extrajo a un módulo nuevo y
compartido, `js/modules/portadas.js`, y `ui-base.js` quedó con envoltorios
finos que delegan ahí. Un solo lugar para arreglar si el día de mañana
cambia cómo se resuelve una portada.

**Lista de lo escaneado.** `contadorSesion` (un número simple) se reemplazó
por `escaneados`, un arreglo en memoria con lo necesario para poder
deshacer cada entrada: `libroId`, `isbn`, `titulo`, `autor`, `accion`
('creado' o 'incrementado', tal cual lo devuelve `agregar_libro_remoto`) y
`cantidad`. Se renderiza como una lista con la miniatura de portada de cada
libro y un botón "Deshacer" por fila.

**"Deshacer", la función nueva.** `public.deshacer_libro_remoto(p_token,
p_libro_id, p_accion, p_cantidad)`, en `010_consolidacion.sql` (no en una
migración numerada nueva: no cambia el esquema, solo agrega una función,
igual que las otras cinco del escaneo remoto). Revalida el token igual que
`agregar_libro_remoto` — nunca confía en que el celular ya lo comprobó
antes. Dos ramas, según lo que confirmó el usuario:

- `'creado'`: **elimina la fila entera** del libro (no se deja "cero
  ejemplares" colgando). Salvo que ya exista un préstamo de ese libro —en
  ese caso se niega y avisa el motivo, para no dejar un préstamo apuntando
  a un libro que ya no existe.
- `'incrementado'`: resta `p_cantidad` de `stock` y de `copias_totales` —lo
  mismo que sumó `agregar_libro_remoto`, en reversa— pero nunca más de lo
  que sigue disponible ahora mismo. Si alguno de los ejemplares recién
  agregados ya se prestó mientras tanto, ese no se toca.

Se agregó al manifiesto de `verificar_definiciones()` (41 funciones ahora,
antes 40) y a `SIN_GUARDA_JUSTIFICADO` en
`pruebas/verificar_consolidacion.py` (no lleva `es_admin()`/`es_personal()`
a propósito, por el mismo motivo que las otras dos funciones del escaneo
remoto sin sesión). Grant a `anon` agregado junto a las otras dos, con el
mismo comentario explícito de por qué es una excepción deliberada.

**Pruebas nuevas, las 21 corriendo en verde:**
- `pruebas/probar-escaneo-remoto.mjs`: +4 (9 → 13) — la fila se agrega con
  su portada, "Deshacer" sobre un repuesto resta exactamente lo agregado,
  "Deshacer" sobre un creado elimina el libro, y si el servidor rechaza el
  deshacer el botón se reactiva sin perder la fila.
- `pruebas/probar-migraciones.py`: +10 (120 → 130, en los dos escenarios de
  esquema) — contra PostgreSQL real: elimina un 'creado', resta exactamente
  lo agregado en un 'incrementado', nunca resta más de lo disponible, nunca
  borra un libro con préstamos, y rechaza un token inventado.
- `pruebas/probar_librero.py`: +1 (105 → 106) — el anónimo no puede
  deshacer un escaneo con un token inventado. Los dos conteos hardcodeados
  del manifiesto subieron de 40 a 41.

### Ítem 12 — Evaluar el Tailwind CLI como paso de build: evaluado, se recomienda NO adoptarlo

**Recomendación: no.** Agregar el Tailwind CLI (o cualquier paso de build)
contradiría una decisión ya deliberada y documentada del proyecto —no tener
`package.json` ni build step, ver `.gitignore` y este mismo archivo— y el
problema real que lo motiva se puede atajar con una comprobación mucho más
barata, sin tocar el flujo de despliegue.

**El problema es real, no hipotético — y hoy tiene tres ejemplos, no uno.**
Una clase de Tailwind usada en el código pero ausente de
`vendor/css/tailwind.css` (el archivo estático, generado una sola vez, que
sirve todo el sitio) no da ningún error: el navegador simplemente ignora la
clase que no reconoce y el elemento queda sin ese estilo, en silencio. Ya
había un caso documentado (el escáner de cámara del personal). Al escribir
la lista de lo escaneado del ítem 11 aparecieron varias más al verificar
cada clase nueva a mano contra el CSS compilado (`disabled:cursor-wait`,
`hover:bg-rose-50`, `p-2.5`, entre otras — corregidas antes de entregar). Y
al hacerlo se encontraron, de regalo, dos bugs silenciosos **preexistentes**
que no se tocaron por estar fuera de este pedido, pero vale dejarlos
anotados: `mx-auto` en los círculos numerados de `escaneo-remoto.js`
(pantalla principal) y `hover:bg-rose-100` en el botón de cerrar sesión de
`perfil.js` — ninguna de las dos clases existe en el CSS compilado, así que
ese `mx-auto` no centra nada y ese hover no cambia de color. Ninguno rompe
la funcionalidad, ambos son puramente estéticos, pero son la prueba de que
el problema no es teórico.

**Por qué no obstante un build step.** El Tailwind CLI resolvería esto
generando el CSS a partir del código en vez de a mano, pero a cambio: (a)
exige `package.json` y `node_modules`, que el proyecto evita a propósito
hoy (deploy 100% estático, sin paso de build en `vercel.json`); (b) mueve el
"¿esta clase existe?" de un problema detectable a "hay que acordarse de
correr el build antes de cada despliegue", que es exactamente el tipo de
paso manual que ya falló una vez (el bug del escáner); (c) es una migración
de flujo de trabajo real, no una tarea de una tarde, y el propio pendiente
original ya lo advertía ("cambio de flujo de trabajo más grande — no
decidirlo a la ligera").

**Alternativa recomendada, si se quiere cerrar el riesgo de verdad: un
script de verificación estático**, en el espíritu de
`pruebas/verificar_consolidacion.py` — lee los archivos HTML/JS del
proyecto, extrae las clases de cada `class="..."` (con cuidado de las
plantillas literales con `${...}` en medio), y falla si alguna no aparece
ya en `vendor/css/tailwind.css`. Sin build step, sin `package.json`, un
archivo Python más para correr junto a los demás (y engancharlo a
`.github/workflows/pruebas.yml` cuando se decida). Sirvió, de hecho, como
comprobación manual ad-hoc para limpiar el ítem 11 antes de esta entrega —
formalizarlo es el siguiente paso natural, pero no se hizo en esta ronda
porque no se pidió explícitamente. Queda anotado como pendiente nuevo si se
quiere retomar.

### Ítem 13 — Ícono de 512×512 para el manifest: hecho

El ícono anterior (192×192, diseño plano con monograma "BN") no se reutilizó
ni se escaló —seguía la regla de siempre—: el usuario trajo un logo propio,
generado con IA, de 512×512 real (verificado: RGBA, sin escalar). Como ese
logo tiene un estilo muy distinto al ícono anterior (una escena tallada en
madera, mucho más detallada, contra un diseño plano simple), se le preguntó
al usuario cómo prefería resolver la inconsistencia visual entre tamaños;
eligió reemplazar también el 192×192 con el mismo diseño nuevo, reducido con
un filtro de calidad (Lanczos) — no generado aparte, así ambos tamaños son
consistentes entre sí.

`manifest.json` ahora declara los dos tamaños. `index.html` y
`escaneo-remoto.html` ganaron el `<link rel="icon" sizes="512x512">`
correspondiente (el `apple-touch-icon` se dejó en 192×192, que es lo que ya
usaba y sigue siendo válido). `sw.js` precarga el nuevo archivo;
`CACHE_VERSION` subió de `v2` a `v3` (por el ícono nuevo y por
`js/modules/portadas.js`, del ítem 11 — un solo salto de versión cubre
ambos cambios de esta ronda).

### Archivos para subir en esta ronda (ítems 11-13)

Nuevos: `js/modules/portadas.js`, `icono-512x512.png` (reemplaza también a
`icono-192x192.png`, mismo nombre de archivo).

Modificados: `escaneo-remoto.html`, `js/escaneo-remoto.js`,
`js/modules/ui-base.js`, `manifest.json`, `index.html`, `sw.js`,
`supabase/migrations/010_consolidacion.sql`,
`pruebas/verificar_consolidacion.py`, `pruebas/probar-escaneo-remoto.mjs`,
`pruebas/probar-migraciones.py`, `pruebas/probar_librero.py`,
`pruebas/LEEME.md`, `PROMPT-produccion.md`, `ESTADO.md`.

No hay migración numerada nueva: `deshacer_libro_remoto` se agregó directo
en `010_consolidacion.sql`, sin cambios de esquema.

---

## 17. Estado al 20 de agosto de 2026 (más tarde el mismo día) — corrección de seguridad en `deshacer_libro_remoto`

Encontrado en una revisión propia, después de entregar el ítem 11 (no en
producción, no reportado por nadie): la primera versión de
`deshacer_libro_remoto` recibía `p_accion` y `p_cantidad` del celular y
confiaba en ellos a ciegas. El único control era que el token siguiera
vigente — pero un enlace vigente (hasta 24 horas, y puede circular entre
varias personas del mesón) podía deshacer una acción sobre **cualquier**
libro del catálogo, no solo los que su propio enlace había tocado. Con
`accion:'incrementado'` se le podía restar ejemplares a cualquier libro sin
haberlo escaneado nunca; con `accion:'creado'`, hasta borrarlo entero si no
tenía préstamos. Rompía el principio que la propia sección de
`010_consolidacion.sql` documenta para todo el escaneo remoto: "angosto a
propósito... lo máximo que permite es escribir entradas de catálogo".

**La corrección, sin cambios de esquema.** `deshacer_libro_remoto` ya no
recibe `p_accion` ni `p_cantidad` — su firma bajó a `(p_token, p_libro_id)`.
En vez de confiar en el celular, busca en `auditoria` el movimiento MÁS
RECIENTE para ese libro y ese enlace en concreto
(`datos_despues->>'enlace_id'`, la marca que `agregar_libro_remoto` ya deja
desde el principio), y de ahí deriva sola:

- **Si ese enlace nunca tocó ese libro**: no hay nada que deshacer — rechaza
  con "Este enlace no fue el que agregó o repuso este libro".
- **Si la acción ya se había deshecho antes**: el propio "deshacer" también
  queda marcado en `auditoria` (`operacion: 'deshacer_escaneo_remoto'`), así
  que el movimiento más reciente lo delata — rechaza con "Esta acción ya se
  había deshecho antes" (cierra, de paso, un reintento/doble clic que antes
  habría restado dos veces).
- **Qué fue y cuánto**: `accion = 'INSERT'` en el registro de auditoría es
  un 'creado'; `'UPDATE'` es un 'incrementado', y `ejemplares_agregados` (ya
  guardado ahí) es la cantidad exacta a restar — nunca un número que mande
  el celular.

El resto de la lógica (borrar si es 'creado' salvo que ya haya préstamo;
restar sin bajar de lo disponible si es 'incrementado') queda igual.

**`js/escaneo-remoto.js`**: `deshacerEscaneo()` ya no manda `p_accion` ni
`p_cantidad` en la llamada RPC — solo `p_token` y `p_libro_id`. `item.accion`
e `item.cantidad` se conservan en el arreglo `escaneados` (siguen sirviendo
para el texto de cada fila, "Agregado"/"Repuesto ×N"), pero ya no viajan al
servidor.

**Pruebas nuevas o ajustadas**, todas en verde:
- `pruebas/probar-migraciones.py`: +3 pruebas × dos escenarios de esquema
  (130 → 136) — un segundo enlace no puede deshacer lo que hizo el primero
  (la prueba que reproduce el hueco cerrado hoy), y ni un 'creado' ni un
  'incrementado' se pueden deshacer dos veces con el mismo enlace. Las
  pruebas existentes de `deshacer_libro_remoto` se ajustaron para construir
  el libro siempre a través de `agregar_libro_remoto` (así queda el rastro
  de auditoría que la función ahora necesita) en vez de insertarlo directo.
- `pruebas/probar-escaneo-remoto.mjs`: el simulador de RPC ahora lleva su
  propio "historial" en memoria (qué token hizo qué, a qué libro) para
  poder simular la comprobación nueva; las 13 pruebas existentes siguen
  pasando sin cambios de conteo — la prueba del enlace ajeno no tiene
  sentido a nivel de interfaz (cada carga de página solo conoce un token a
  la vez), así que vive solo en `probar-migraciones.py`.
- `pruebas/probar_librero.py`: sin cambio de conteo, solo se ajustó la
  firma de la llamada en la prueba de "el anónimo no puede deshacer con un
  token inventado".

### Archivos para subir en esta ronda (corrección de seguridad)

Modificados: `supabase/migrations/010_consolidacion.sql`,
`js/escaneo-remoto.js`, `pruebas/probar-escaneo-remoto.mjs`,
`pruebas/probar-migraciones.py`, `pruebas/probar_librero.py`,
`PROMPT-produccion.md`, `ESTADO.md`, `pruebas/LEEME.md`.

Sin archivos nuevos, sin migración numerada nueva — la función ya existía,
solo cambió su cuerpo y su firma (de 4 parámetros a 2), directo en la 010.

---

## 18. Estado al 21 de agosto de 2026 — pulido de la lista "Ahora"

Origen: una auditoría propia del proyecto (arquitectura, CI, versionado,
seguridad, documentación) pedida explícitamente para encontrar qué faltaba
por pulir. De ahí salieron cuatro acciones concretas, con permiso explícito
para implementarlas ("pule lo que haga falta en estos momentos"). Las cuatro
quedaron hechas y verificadas localmente; lo único que falta es lo de
siempre — subir el commit y ver la CI en verde.

### 1 — Las tres suites que faltaban, enganchadas a `.github/workflows/pruebas.yml`

`probar-vistas.mjs`, `probar-migraciones.py` y `probar-escaneo-remoto.mjs`
corrían solo a mano desde que se escribieron. Quedaron enganchadas:

- `probar-vistas.mjs` y `probar-escaneo-remoto.mjs`, como pasos nuevos del
  trabajo `interfaz` (ya traía jsdom instalado, no hizo falta nada más).
- `probar-migraciones.py`, en un trabajo nuevo, `migraciones` — usa
  `pgserver` (PostgreSQL embebido en el paquete de Python), así que no
  necesita un servicio de PostgreSQL aparte como sí necesitan
  `base-de-datos` y `reconstruccion`.

Al intentar enganchar `probar-vistas.mjs` aparecieron 2 fallos reales, sin
tocar ni una línea de la aplicación — ver el punto siguiente.

### 2 — `probar-vistas.mjs` calculaba "hoy" en UTC, no en la fecha de Chile: prueba intermitente, corregida

`_diasRestantes()`/`_estadoPrestamo()` (`js/modules/ui-base.js`) usan a
propósito `hoyEnChile()`, no la hora del dispositivo, para no discrepar del
servidor. El banco de pruebas, en cambio, armaba su `hoy` con
`new Date().toISOString()` — la fecha en UTC. Entre las 00:00 y las
~03:00-04:00 UTC, Chile todavía está en el día anterior, así que dos
pruebas fallaban solas varias horas al día, sin relación con ningún cambio
de código. Corregido para calcular `hoy` con el mismo criterio que
`hoyEnChile()` (`js/modules/db.js`), a mediodía local para que `setDate()`
nunca cruce de día por el desfase horario. El detalle completo, incluida la
segunda vuelta (`masFechaHoras()` no podía heredar ese mismo `hoy` sin
romper los enlaces de escaneo remoto simulados), está en `pruebas/LEEME.md`.

De no corregirse, habría sido peor que no tener la suite en CI: una prueba
que falla sola, sin relación con el cambio que se está revisando, enseña a
la gente a ignorar la CI en rojo.

### 3 — `pruebas/verificar_llamadas_rpc.py`: chequeo estático nuevo, sin base de datos

Cruza cada `rpc('nombre', {...})` del código JS contra la firma que esa
función tiene HOY en las migraciones (la última definición de cada nombre,
por orden de archivo — así queda tras aplicarlas todas). Nace de lo que casi
pasó con la corrección de seguridad del punto 17: `deshacer_libro_remoto()`
bajó de 4 a 2 parámetros y `js/escaneo-remoto.js` sí se actualizó a mano en
el mismo cambio, pero nada más que la revisión humana lo garantizaba.

Verificado a propósito antes de darlo por bueno: se reintrodujo
`p_accion`/`p_cantidad` en la llamada de `js/escaneo-remoto.js` (el error
real que ya se cometió una vez) y el script lo marcó de inmediato, con
archivo y línea. Se revirtió el cambio de prueba enseguida. Corre como paso
nuevo del trabajo `consolidacion` (es solo lectura de texto, tarda
segundos).

### 4 — `CACHE_VERSION` subió a `v4`, y `postgres:16` → `postgres:17` en CI

`sw.js` seguía en `v3` pese a que la corrección de seguridad del punto 17
cambió la firma de un RPC que llama un archivo en `PRECACHE_URLS`
(`js/escaneo-remoto.js`). Con la estrategia network-first el riesgo real era
acotado, pero alguien con el service worker activo y sin conexión (o con una
pestaña vieja sin recargar) podía seguir corriendo JS que manda un parámetro
que el servidor ya no acepta. Se agregó además una nota general en el
comentario de `sw.js`: cualquier cambio de firma de un RPC llamado desde un
archivo precargado sube `CACHE_VERSION`, no solo los cambios a la lista de
archivos.

De paso se cerró el pendiente de la sección 11: los trabajos `base-de-datos`
y `reconstruccion` de CI corrían contra `postgres:16`, mientras que
producción corre `17.6.1`. Cambio mecánico (una palabra en cada uno de los
dos `image:`), pero sin poder confirmarse aquí — este entorno no tiene un
motor Docker disponible para levantar el contenedor de servicio, así que la
validación real queda para cuando corra en GitHub Actions, igual que con
cualquier otro cambio de este `.yml`.

### Qué NO se tocó en esta ronda, y por qué

- **`migration repair` de las migraciones 012, 013 y 014**: sigue
  necesitando aprobación explícita antes de tocar producción — no es un
  cambio de "pulido", es un cambio sobre el estado real de la base.
- **La política RLS "de más" en `usuarios`**: es una decisión de postura de
  seguridad, no un defecto objetivo — le corresponde a quien administra el
  sistema, no a esta sesión decidirla en su nombre.
- **Dividir más `ui-base.js`** (todavía 2900 líneas, con secciones enteras
  tituladas CATÁLOGO y ADMINISTRACIÓN que se solapan con `js/vistas/*.js`):
  identificado como el siguiente candidato concreto, pero es un refactor de
  verdad, con riesgo real de romper algo si se apura — mejor como su propia
  ronda de trabajo, con tiempo para probar cada vista después de moverla,
  que agregado de prisa al final de esta.
- **Dividir `js/modules/db.js`** (~840 líneas en un solo objeto): igual de
  válido, pero de menor urgencia — es cohesivo tal como está, y no es el
  archivo que ya se intentó dividir una vez.

### Pruebas: sin cambio de conteo, todas verificadas localmente antes de subir

Ninguna de las cuatro acciones tocó lógica de negocio, así que ningún
conteo de comprobaciones cambió. Se corrieron las nueve suites en este
equipo antes de dar la ronda por cerrada:

```
probar-interfaz.mjs           124/124
probar-vistas.mjs              106/106  (0/2 antes de la corrección del punto 2)
probar-escaneo-remoto.mjs       13/13
probar-persistencia.mjs         37/37
probar-sync-queue.mjs           37/37
probar-estado-conexion.mjs      18/18
probar-migraciones.py          136/136
verificar_consolidacion.py     intacta
verificar_llamadas_rpc.py      todas las llamadas coinciden con la firma vigente
```

`probar_librero.py` y `reconstruccion` (contra PostgreSQL real) no se
corrieron en este equipo — dependen de un servicio de PostgreSQL que este
entorno no tiene disponible. Quedan, como siempre, para la CI real tras el
`git push`.

### Archivos para subir en esta ronda (pulido)

Modificados: `.github/workflows/pruebas.yml`, `sw.js`,
`pruebas/probar-vistas.mjs`, `PROMPT-produccion.md`, `ESTADO.md`,
`pruebas/LEEME.md`, `pendientes-checklist.md`.

Nuevo: `pruebas/verificar_llamadas_rpc.py`.

Sin cambios de esquema, sin cambios a ninguna función RPC — nada en esta
ronda tocó `supabase/migrations/`.

---

## 19. Estado al 21 de agosto de 2026 (más tarde el mismo día) — los dos últimos pendientes de "Ahora"

Se retomaron los dos últimos ítems de la lista "Ahora" de la sección 18.
Antes de tocar nada, se verificó el estado real de producción directo
contra la base (esta sesión tiene una conexión de Supabase activa al
proyecto `vcngmgzxjoorjhcgqzpk`) en vez de confiar en lo que decía la
documentación de hace dos semanas.

### `migration repair` de 012, 013 y 014: ya no hacía falta

Consultado `supabase_migrations.schema_migrations` en producción: las tres
ya estaban registradas, con el mismo nombre que los archivos locales. En
algún momento entre el 6 de agosto (cuando se documentó el problema) y hoy,
alguien ya corrió el `migration repair` — no quedó registrado en ninguna
nota de esta sesión, así que no se sabe cuándo ni quién. Sin acción
pendiente; se saca de la lista.

### La política RLS redundante en `usuarios`: eliminada, con permiso explícito

Confirmado en vivo contra `pg_policies` que `"Lectura de roles propia"`
(`SELECT`, `using (auth.uid() = id)`) seguía activa, y que sigue siendo un
subconjunto exacto de `"usuarios ve su perfil"` (008/010,
`using (id = auth.uid() OR es_admin())`) — Postgres evalúa las políticas
RLS con OR entre sí, así que la segunda ya cubre todo lo que la primera
permitía. Detalle nuevo que la documentación anterior no tenía: la
redundante estaba concedida al pseudo-rol `public` (que incluye a `anon`),
no a `authenticated` como el resto — inofensivo en la práctica, porque
`auth.uid()` da `null` sin sesión y ninguna fila tiene `id = null`, pero
igual una inconsistencia de más.

Se presentó la decisión con las tres opciones (eliminarla, mantenerla y
documentar, o dejarla pendiente) y la persona eligió eliminarla.

**Migración 016** (`016_eliminar_politica_redundante_usuarios.sql`, nueva,
un `drop policy if exists`) creada y aplicada directo a producción con la
conexión de Supabase de esta sesión. Un detalle a tener en cuenta para la
próxima vez que se use `apply_migration` así: la herramienta registró la
migración con la versión igual a un timestamp
(`20260821042519`) en vez de `016`, y el `name` con el prefijo numérico
incluido (`016_eliminar_politica_redundante_usuarios` en vez de
`eliminar_politica_redundante_usuarios`) — ninguna de las dos coincidía con
la convención que siguen las migraciones 001-015, y habría producido
exactamente el mismo tipo de deriva que motivó el punto anterior la próxima
vez que alguien corriera `supabase migration list --linked`. Corregido a
mano con dos `UPDATE` sobre `supabase_migrations.schema_migrations`
(cambio de metadata, no de esquema) para que quedara `version = '016'`,
`name = 'eliminar_politica_redundante_usuarios'`, igual que el resto.
Verificado después: `pg_policies` en `usuarios` ahora tiene 4 políticas,
no 5.

**Pendiente nuevo, anotado para quien use `apply_migration` (u otra vía que
no sea el CLI de Supabase) en este proyecto de nuevo:** revisar siempre
cómo quedó registrada la migración en `supabase_migrations.schema_migrations`
después, no asumir que coincide con el nombre del archivo local.

### Archivos para subir en esta ronda

Nuevo: `supabase/migrations/016_eliminar_politica_redundante_usuarios.sql`
(ya aplicado en producción — subir este archivo es solo para que el
repositorio quede igual de sincronizado que la base, no hace falta ningún
paso manual adicional).

Modificados: `PROMPT-produccion.md`, `ESTADO.md`, `pendientes-checklist.md`.

---

## 20. Estado al 22 de agosto de 2026 — plazo de préstamo por libro, respaldo automático e invitación de personal

Punto de partida: `claude/sugerencias-mejora-2026-08-22.md` (documento de
sugerencias entregado esta misma sesión, antes de este bloque), sección 2
"Vista de administrador" → 🔧 Se puede mejorar, tres puntos citados
textualmente por la persona con la instrucción "mejora estos puntos de
vista": el plazo de préstamo único para todo el catálogo, el respaldo
100% manual, y el alta de personal solo desde el panel de Supabase. Antes de
implementar se presentaron tres decisiones de arquitectura (una por mejora)
y se eligió, para las tres, la opción recomendada.

### 1. Plazo de préstamo por libro

Columna nueva `libros.dias_prestamo_override` (integer, nullable), agregada
en `017_plazo_prestamo_por_libro.sql`. Semántica: `NULL` = usa el parámetro
global `dias_prestamo` (sin cambios para el 100% del catálogo que no fija
nada distinto), `0` = material de referencia que no circula, cualquier otro
número = plazo propio de ese libro. Se evaluó y descartó una tabla de tipos
de material aparte: el catálogo real no tiene esa taxonomía todavía, y una
columna opcional resuelve el caso real sin imponerla.

`prestar_libro()`, `renovar_prestamo()` y `buscar_libros()` (las tres viven
en `010_consolidacion.sql`, por la regla de este proyecto de que las
funciones no se redefinen fuera de ese archivo) se editaron para leer/
devolver la columna: `prestar_libro` rechaza con un mensaje claro
("Este material es de referencia y no circula") si el override es 0, y usa
`coalesce(override, parametro_int('dias_prestamo', 7))` para calcular la
fecha de devolución; `renovar_prestamo` respeta el mismo plazo propio del
libro al renovar (con `nullif(override, 0)`, para que un libro que pasó a
"no circula" después de prestado no rompa la renovación de un préstamo que
ya estaba activo); `buscar_libros` ahora devuelve la columna, para que el
modal de edición del catálogo muestre el valor real guardado.

**Problema real encontrado con `pruebas/probar-migraciones.py` (y su
resolución):** `010_consolidacion.sql` se aplica ANTES que
`017_plazo_prestamo_por_libro.sql` en una instalación desde cero (el orden
es por nombre de archivo). Las tres funciones editadas, viviendo solo en la
010, referenciaban una columna que la 017 todavía no había agregado en ese
punto — `buscar_libros`, al ser una función en lenguaje SQL, se valida
contra el catálogo al crearse (no al llamarse), así que la propia 010
fallaba al aplicarse. Se comprobó en vivo: `probar-migraciones.py` lo
detectó de inmediato.

La resolución: la sentencia `alter table ... add column` (idempotente)
queda declarada DOS veces — una vez al principio de `010_consolidacion.sql`
(sección nueva "EXCEPCIÓN: una columna, declarada aquí en vez de en su
propia migración", con la explicación completa), para que la 010 se pueda
aplicar sola desde cero; y otra vez en `017_plazo_prestamo_por_libro.sql`,
que es la migración que de verdad documenta cuándo y por qué se agregó la
columna, y que ya NO redefine ninguna función (para no romper
`verificar_consolidacion.py`, que prohíbe que una migración posterior a la
010 redefina funciones consolidadas). Aplicada dos veces, la sentencia no
hace nada la segunda vez.

Confirmado con las tres comprobaciones automáticas del proyecto, las tres en
verde: `pruebas/probar-migraciones.py` (142/142),
`pruebas/verificar_consolidacion.py` y `pruebas/verificar_llamadas_rpc.py`.
Además, probado en vivo contra producción, en una transacción con
`rollback` (sin dejar datos de prueba): un libro con override en 0 rechaza
el préstamo con el mensaje esperado; un libro con override en 3 días presta
y luego renueva por 3 días, no por los 7 del parámetro global.

UI: campo nuevo "Plazo de préstamo propio (días, opcional)" en el modal
"Editar libro" del Catálogo (`js/modules/ui-base.js`), con la semántica
explicada en el propio formulario. `js/modules/db.js` (`actualizarLibro`)
manda el valor (o `null`) en cada guardado.

### 2. Respaldo automático real

Reemplaza el flujo 100% manual (entrar al panel de Supabase y apretar el
botón de respaldo) por una tarea programada real. `pg_cron` y `pg_net`
—ambas extensiones ya estaban disponibles en este proyecto Supabase, solo
faltaba habilitarlas— disparan, todos los días a las 07:00 UTC
(~03:00-04:00 hora de Chile), el Edge Function `respaldo-automatico`
(`supabase/functions/respaldo-automatico/index.ts`, desplegado con
`mcp__Supabase__deploy_edge_function`). Este junta el contenido completo de
las tablas del negocio (`usuarios`, `libros`, `lectores`, `prestamos`,
`parametros`, `auditoria`, `errores`, `enlaces_escaneo_remoto`,
`elementos_eliminados`), lo sube como un JSON con fecha en el nombre al
bucket privado de Storage `respaldos` (creado con un `insert into
storage.buckets`, fuera de las migraciones porque no es un objeto de
esquema), y deja constancia del resultado (éxito o falla, archivo, tamaño)
en la tabla nueva `public.respaldos_log` — con RLS: solo un administrador
puede leerla, y nadie fuera del propio Edge Function (que usa la
service_role key) puede escribirla.

**Retención (agregada el 29 de octubre de 2026, pendiente de desplegar).** El
flujo original subía un JSON por día y no borraba nunca nada, así que el tamaño
del bucket crecía monótono contra los 1 GB de Storage del plan Free: el día que
se llenan, lo que deja de funcionar es el respaldo —en silencio, porque la app
sigue abriendo— y no la app. `index.ts` ahora, después de subir y antes de
anotar, borra los archivos propios (`respaldo-*`) con `created_at` más antiguo
que `DIAS_CONSERVAR = 30` días y guarda un resumen en `respaldos_log.mensaje`.
Tres decisiones de esa línea de código: va después de la subida y con su propio
`try/catch` (una retención que falla es una nota, jamás un respaldo perdido),
compara por `created_at` y no por el nombre (la fecha embebida en el nombre trae
los `:` cambiados por `-`, y reconstruirla para comparar es una forma creativa de
borrar lo que no había que borrar), y filtra por prefijo `respaldo-` para no
tocar lo que una persona hubiera podido dejar en el bucket. Este cambio **no está
desplegado**: el archivo del repo no se aplica solo, hace falta
`supabase functions deploy respaldo-automatico` (o el despliegue desde el panel)
y mirar al día siguiente el `mensaje` de `respaldos_log`.

Autenticación de la llamada de `pg_cron` al Edge Function: un secreto
ALEATORIO nuevo, generado dentro de la propia migración con
`encode(gen_random_bytes(32), 'hex')` y guardado en Vault
(`cron_respaldo_secret`) — explícitamente NO la service_role key del
proyecto, que nunca se pidió ni se manejó desde esta sesión. Problema real
encontrado y corregido en vivo: el Edge Function intentando leer el secreto
con `supabase.schema('vault').from('decrypted_secrets')` (la API REST de
supabase-js) recibía 401 siempre, aunque el secreto mandado fuera correcto
— el esquema `vault` no está expuesto por PostgREST, a propósito, por
diseño de Supabase. La solución: `public.verificar_secreto_cron(p_secreto)`,
una función SECURITY DEFINER sin permisos de ejecución para
`authenticated`/`anon` (solo el service_role, que ignora los grants, puede
llamarla), que el Edge Function invoca por RPC en vez de leer la tabla
directo. Confirmado en vivo: antes del cambio, 401 siempre; después, 200 y
el respaldo se subió de verdad.

`018_respaldo_automatico.sql`: cada pieza que depende de algo propio de
Supabase (las dos extensiones, Vault, la tarea de `cron.schedule`) va en su
propio bloque `do $$ ... exception when others then raise notice ... $$`,
para que en un Postgres genérico —como el que usa
`pruebas/probar-migraciones.py`, que no tiene ni `pg_cron` ni el esquema
`vault`— la migración avise con un `NOTICE` y siga, en vez de abortar toda
la aplicación de migraciones. `public.respaldos_log` y
`public.verificar_secreto_cron()` (esquema puro, sin dependencias externas)
se crean siempre, sin excepción. Confirmado: `probar-migraciones.py` pasa
completo (142/142) con la migración degradándose así, y en producción real
(Supabase, con las tres piezas disponibles) todo queda funcionando —
probado con una llamada real a `net.http_post()` desde SQL, sin depender de
que el cron ya hubiera disparado: subió un respaldo real de 22 KB y quedó
registrado en `respaldos_log`.

UI: tarjeta nueva "Respaldo automático" en Administración → Cumplimiento
(`js/vistas/admin.js`), con el estado de la última corrida y las últimas 5.
`db.obtenerRespaldos()` en `js/modules/db.js`.

El pendiente de `pendientes-checklist.md` ("asignar, por nombre, quién
aprieta el botón de respaldo") se retira: ya no hay botón que apretar.

### 3. Invitación de personal por correo

Reemplaza "las cuentas se crean en Supabase, en Authentication → Users" por
un flujo desde la propia app. Edge Function nuevo
`invitar-personal` (`supabase/functions/invitar-personal/index.ts`, sin
cambios de esquema): recibe `{email, rol}`, primero comprueba que quien
llama sea administrador de verdad —con un cliente construido con la propia
sesión (JWT) de quien llama, no la service_role key, llamando a
`mi_perfil()` por RPC bajo RLS normal— y solo entonces usa un segundo
cliente con la service_role key (inyectada sola por el runtime, nunca
pedida ni manejada por esta sesión, nunca expuesta al cliente) para invitar
por correo (`auth.admin.inviteUserByEmail`) y dejar el rol ya asignado en
`public.usuarios`, listo para cuando la persona acepte e inicie sesión por
primera vez.

UI: formulario nuevo "Invitar personal nuevo" en Administración → Personal
(`js/vistas/admin.js`), con selector de rol. `db.invitarPersonal(email, rol)`
en `js/modules/db.js` usa `supabase.functions.invoke(...)`, que manda sola
la sesión de quien está usando la app.

### `sw.js`

`CACHE_VERSION` subido a `v5`: `buscar_libros()` cambió de firma (columna
de más) y `db.js`/`admin.js` ya llaman al Edge Function nuevo.

### Archivos para subir en esta ronda

Nuevos: `supabase/migrations/017_plazo_prestamo_por_libro.sql`,
`supabase/migrations/018_respaldo_automatico.sql`,
`supabase/functions/respaldo-automatico/index.ts`,
`supabase/functions/invitar-personal/index.ts`.

Editados: `supabase/migrations/010_consolidacion.sql`, `js/modules/db.js`,
`js/modules/ui-base.js`, `js/vistas/admin.js`, `sw.js`,
`pendientes-checklist.md`, `ESTADO.md`, este archivo.

Todo ya está aplicado y desplegado en producción (con la conexión de
Supabase de esta sesión) — subir es solo para que el repositorio quede tan
al día como la base.
