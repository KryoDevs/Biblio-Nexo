# Banco de pruebas

Ejecuta toda la aplicación en un navegador simulado, con la base de datos
reemplazada por datos de prueba. Sirve para detectar errores antes de publicar,
sin tocar tu proyecto real de Supabase.

## Cómo ejecutarlo

Desde la raíz del repositorio (una sola vez, instala jsdom y
fake-indexeddb — quedaron fijados en `package.json` a partir del 29 de
agosto de 2026, antes había que instalarlos a mano):

```bash
npm install
node pruebas/probar-vistas.mjs
```

O con los atajos ya armados en `package.json` (agrupan varias pruebas
relacionadas):

```bash
npm run test:interfaz   # probar-interfaz, probar-vistas, probar-escaneo-remoto
npm run test:offline    # probar-persistencia, probar-sync-queue, probar-estado-conexion
```

Termina con código 0 si todo pasa, y 1 si algo falla.

## Qué revisa

- **Funciones puras**: validación de RUT chileno (incluido el dígito
  verificador K), normalización de teléfonos, cálculo de días de vencimiento
  sin corrimiento de zona horaria, y los cuatro rangos de reporte.
- **Seguridad**: que un título con `<script>` quede escapado y no se ejecute.
- **Vistas**: renderiza dashboard, reportes, catálogo, usuarios, préstamos y
  escáner, con ambos roles, y verifica que ninguna quede vacía ni muestre
  "undefined" o "NaN" en pantalla.
- **Casos límite**: libros sin ISBN ni autor, préstamos con relaciones nulas
  (datos huérfanos), lectores sin correo ni teléfono, listas vacías.
- **Modales**: que se abran, se cierren y deshabiliten las vías de contacto
  que no correspondan.
- **Exportación CSV**: que no lance errores y que escape correctamente las
  comillas dobles.
- **Gráficos**: que todos sean de anillo y que ninguno reciba valores negativos.

## Al agregar una vista nueva

Añade su nombre al arreglo de vistas dentro de la sección
`=== Vistas (render completo) ===` y quedará cubierta automáticamente.

---

## Pruebas agregadas en la versión 11

### `probar-interfaz.mjs` — la aplicación en un navegador simulado

Monta la interfaz real sobre un DOM (jsdom) con un Supabase falso, y comprueba
el arranque con rol librero, el menú que le corresponde, la vista Mi perfil, sus
validaciones, y que la cámara del mesón vuelva a encender tras apagarla.

---

## Pruebas agregadas para la Fase 1 (funcionamiento sin conexión)

### `probar-persistencia.mjs` — la copia local en IndexedDB (Fase 1.2)

Prueba `js/modules/persistencia.js` con IndexedDB en memoria (sin navegador)
y un Supabase falso propio. Cubre exactamente lo que exige
`CUMPLIMIENTO-LEGAL.md`, sección "9 bis": que el catálogo se replique entero
por delta, que los lectores NUNCA entren en bloque (solo consultados o con
préstamo activo), que una lápida de borrado del servidor purgue la copia
local (el derecho de supresión), y que un lector sin actividad se purgue solo
por antigüedad.

```bash
npm install jsdom fake-indexeddb --no-save
node pruebas/probar-persistencia.mjs
```

**Importante:** instala las dos juntas, en el mismo comando. Como este
proyecto no tiene `package.json` (a propósito, ver `.gitignore`), cada
`npm install <paquete>` sin uno recalcula todo `node_modules` desde cero y
puede desinstalar silenciosamente lo que ya tenías. Ya pasó una vez armando
esta prueba: instalar `fake-indexeddb` solo se llevó `jsdom` por delante.

### `probar-sync-queue.mjs` — la cola de sincronización y el respaldo sin conexión (Fase 1.3)

Prueba la clase `SyncQueue` de `js/modules/db.js` (la cola de escrituras
pendientes: préstamo, devolución, renovación) y el respaldo sin conexión de
`estadoLector()`/`consultarLibro()`, que se apoya en la copia local de la
Fase 1.2. Usa IndexedDB en memoria (igual que `probar-persistencia.mjs`) más
un Supabase falso con control total sobre qué responde cada llamada RPC —
así se puede simular, a voluntad, un fallo de red, un rechazo real del
servidor, o una migración que falta.

Cubre lo que exige `PROMPT-produccion.md`, sección 7 (1.3): que un fallo de
RED se encole y nunca se pierda; que un rechazo REAL del servidor (con
código) se lance tal cual y jamás se encole; que la cola reproduzca la
MISMA llamada que se habría hecho con conexión, sin reinventar ninguna
lógica de negocio; la espera exponencial y el aviso visible, tanto en un
rechazo real al reintentar como al acumular varios fallos de red seguidos;
y que `estadoLector()`/`consultarLibro()` caigan a la copia local sin
inventar nunca un "no existe" que no se pueda comprobar sin conexión.

```bash
npm install jsdom fake-indexeddb --no-save
node pruebas/probar-sync-queue.mjs
```

### `probar-estado-conexion.mjs` — el indicador de conexión (Fase 1.4)

Prueba `js/modules/estado-conexion.js`: que junte bien las tres señales (en
línea/sin conexión del navegador, "sincronizando" mientras `colaSync`
reintenta, y cuántas operaciones quedan pendientes) y avise a quien esté
suscrito en el momento correcto, por empuje (push) y no por encuesta
(polling). No repite ninguna prueba de `probar-sync-queue.mjs`: aquí no
importa SI un reintento tiene éxito o fracasa, solo que el indicador nunca
se quede "pegado" en `sincronizando:true` pase lo que pase.

```bash
npm install jsdom fake-indexeddb --no-save
node pruebas/probar-estado-conexion.mjs
```

### Sección 10 de `probar-interfaz.mjs` — el service worker y el manifest (Fase 1.1)

No es un archivo aparte: son comprobaciones estructurales agregadas a
`probar-interfaz.mjs` que verifican `sw.js` (los tres eventos del ciclo de
vida, caché versionada, qué precarga y qué NO precarga a propósito) y
`manifest.json` (JSON válido, campos obligatorios), sin necesitar un
navegador real para eso.

```bash
npm install jsdom
node pruebas/probar-interfaz.mjs
```

### `probar_librero.py` — la base de datos de verdad

Levanta un PostgreSQL local, ejecuta las ocho migraciones y prueba el sistema
con dos identidades reales (una admin y una librero), usando el mismo mecanismo
que usa Supabase para saber quién eres.

Lo importante: **primero reinstala las funciones como estaban antes de la
migración 008 y demuestra el fallo**, y recién después aplica la corrección y
verifica que el librero puede trabajar sin haber ganado permisos de más.

```bash
pip install pgserver "psycopg[binary]"
python3 pruebas/probar_librero.py
```

`00_base_supabase.sql` reconstruye lo que Supabase provee de fábrica (esquema
`auth`, roles `anon` y `authenticated`, `auth.uid()`) más las tablas base, para
que las migraciones se puedan ejecutar fuera de Supabase.

---

## Pruebas agregadas en la versión 13

### `verificar_consolidacion.py` — la regla de la consolidación

Lee los archivos SQL (no la base de datos) y falla si alguien vuelve a la
costumbre de redefinir una función en un archivo nuevo en vez de editar la 010.
Comprueba tres cosas:

- ninguna migración posterior a la 010 redefine funciones consolidadas
- el manifiesto cubre todas las funciones declaradas
- las 15 funciones que escriben son `security definer`

Esa última es la que habría atajado el fallo del librero en el momento de
escribirlo.

```bash
python3 pruebas/verificar_consolidacion.py
```

### `probar_librero.py` ahora corre en cualquier parte

Acepta `DATABASE_URL` para usar un PostgreSQL existente (así funciona en
integración continua), o levanta uno con `pgserver` si no se le indica nada.

```bash
# Con PostgreSQL propio
DATABASE_URL=postgresql://usuario:clave@localhost:5432/basededatos \
  python3 pruebas/probar_librero.py

# Sin instalar nada
pip install pgserver "psycopg[binary]" && python3 pruebas/probar_librero.py
```

Incluye un bloque nuevo que comprueba que `verificar_definiciones()` detecta las
tres formas de deriva y que reejecutar la 010 las repara.

### En Windows: preparar pgserver antes de la primera corrida

`pgserver` no trae `share/postgresql/timezone` en su paquete para Windows (el
porqué está en la sección siguiente). Antes de la primera corrida en Windows,
prepáralo:

    python pruebas/preparar_timezone_pgserver.py

Busca una instalación de PostgreSQL para Windows ya en el equipo y le copia la
carpeta de zonas horarias a `pgserver`. Si no encuentra ninguna, dice cómo
instalar una (`winget install PostgreSQL.PostgreSQL.17`) o cómo indicarle la
ruta con `--donante`. Es idempotente: correrlo de nuevo cuando ya está listo no
hace nada.

**Esa carpeta vive dentro de `site-packages`, no en este repositorio.**
Cualquier reinstalación de `pgserver` —`pip install --upgrade`, rehacer el
entorno virtual, un equipo nuevo— la borra sin avisar. Si `probar_librero.py`
vuelve a mostrar comprobaciones OMITIDAS después de haber corrido las 90, corre
este script de nuevo antes de sospechar de otra cosa.

### Limitación conocida: timezone en el entorno local de Windows

`pgserver`, el PostgreSQL embebido que usa `probar_librero.py` para no depender
de un servidor externo, no trae la carpeta `share/postgresql/timezone` en su
paquete para Windows. Sin ella, Postgres no resuelve ninguna zona horaria real
(cae a GMT), y `prestar_libro`, `renovar_prestamo`, `devolver_prestamo`,
`estado_lector` y `consultar_libro` la necesitan (todas llaman a
`hoy_chile()`, que hace `timezone('America/Santiago', now())`).

`probar_librero.py` lo detecta con una única comprobación al arrancar
(`select timezone('America/Santiago', now())`). Si falla exactamente por esa
causa, los 12 casos que dependen de esas cinco funciones se marcan OMITIDO,
no FALLO, con aviso explícito. Si la comprobación falla por cualquier otra
causa —conexión caída, esquema a medio aplicar— la suite se detiene con error
en vez de omitir: un entorno roto no es lo mismo que un entorno sin tzdata, y
tratarlo igual escondería un problema real. Si la comprobación pasa, las cinco
funciones corren igual que el resto de la suite, y cualquier fallo suyo cuenta
como FALLO real, sin excepción.

Importa especialmente porque son las mismas funciones donde ya ocurrió el
colapso silencioso del rol librero (ver `CLAUDE.md` y `MIGRACIONES.md`): sin
esta distinción, la única suite que las prueba contra PostgreSQL real —esta—
quedaría ciega justo ahí, pero solo en este paquete. En el trabajo
`base-de-datos` de `.github/workflows/pruebas.yml` este mismo script corre
contra la imagen oficial `postgres:16` (con tzdata completo de fábrica, a
diferencia de `pgserver`), así que ahí la comprobación pasa y las cinco
funciones se prueban de verdad, autenticadas: cada llamada pasa por
`como(LIBRERO, …)` o `como(ADMIN, …)` —el helper que hace
`set role authenticated` más `set_config('request.jwt.claim.sub', …)`, la
misma simulación de sesión que usa el resto del script. No hay, en el código,
un camino sin esa guarda para estas cinco funciones.

Mientras no se corra `preparar_timezone_pgserver.py` (sección anterior), un
resultado de `probar_librero.py` en Windows de 85 comprobaciones correctas,
0 con fallo y 13 omitidas es el esperado, no una regresión. (Antes de la
Fase 1.2 —lápidas de eliminación, migración 015— era 78 y 12: esa sección
agregó 7 comprobaciones, una de ellas sensible al mismo huso horario que las
demás omitidas en Windows. La comprobación nueva del ítem 11 —que el
anónimo no puede deshacer un escaneo con un token inventado— no depende del
huso horario, así que solo sube el conteo de correctas.)

Al inspeccionar el paquete directamente (no en la salida de la suite), la
carencia se manifiesta como `could not open directory
".../pgserver/pginstall/share/postgresql/timezone"`. Es la pista útil para
quien tenga que depurar el paquete a mano.

## Pruebas agregadas en esta ronda (ítems 11-13, "pulido, no urgente")

### `probar-escaneo-remoto.mjs` — la lista de lo escaneado, con portada y "deshacer" (ítem 11)

Cuatro comprobaciones nuevas, al final del archivo: que escanear agregue una
fila a `#er-escaneados` con su portada de Open Library (miniatura por ISBN,
igual que el panel del personal — ver `js/modules/portadas.js`); que
"Deshacer" sobre un libro repuesto reste exactamente lo que esa acción sumó,
sin tocar nada más; que "Deshacer" sobre un libro recién creado lo elimine
del catálogo; y que, si el servidor rechaza el deshacer, el botón se
reactive y la fila NO desaparezca (para poder reintentar o entender por qué).

El simulador de RPC (`respuestaRpc`) ganó una rama para
`deshacer_libro_remoto`, con la misma convención que ya usaba
`agregar_libro_remoto`: `libro_id` es la posición (1-indexada) del libro en
el arreglo `libros` de prueba.

**Nota para quien agregue más pruebas a este archivo:** tanto `libros` como
la lista `escaneados` (dentro de `js/escaneo-remoto.js`) son estado en
memoria que persiste entre pruebas del mismo archivo — igual que ya pasaba
con `libros`. Las comprobaciones sobre la lista de escaneados usan
conteos relativos ("una fila menos", no "cero filas"), no absolutos, por eso.

### `probar-migraciones.py` — `deshacer_libro_remoto()` contra PostgreSQL real

Cinco comprobaciones nuevas en la sección "Escaneo remoto sin sesión": que
deshacer un `'creado'` elimine el libro; que deshacer un `'incrementado'`
reste exactamente lo agregado; que NO reste ejemplares que ya se prestaron
(nunca deja `stock` por debajo de cero ni `copias_totales` por debajo de las
copias en uso); que NO elimine un libro que ya tiene algún préstamo asociado
(aunque el "estado" fuera `'creado'`, para no dejar un préstamo apuntando a
un libro inexistente); y que rechace un token inventado, igual que las demás
funciones del escaneo remoto.

### `probar_librero.py` — permisos de `anon` y el conteo del manifiesto

Una comprobación nueva: el anónimo no puede llamar a `deshacer_libro_remoto`
con un token inventado (la única barrera sigue siendo el token, nunca el
rol). Los dos conteos hardcodeados del manifiesto (`verificar_definiciones()`)
subieron de 40 a 41 funciones, por la función nueva.

### Corrección de seguridad en `deshacer_libro_remoto` (mismo día, más tarde)

La primera versión confiaba en `p_accion`/`p_cantidad` del celular, y
CUALQUIER enlace vigente podía deshacer una acción sobre cualquier libro del
catálogo, no solo los que había tocado. La corrección le bajó la firma a
`(p_token, p_libro_id)`: ahora deriva sola, desde `auditoria`, qué hizo ESE
enlace en concreto. Detalle completo en `PROMPT-produccion.md` §17.

- `probar-migraciones.py`: +3 pruebas × dos escenarios de esquema
  (130 → 136) — un enlace no puede deshacer lo que hizo otro (la que
  reproduce el hueco cerrado), y ni un 'creado' ni un 'incrementado' se
  pueden deshacer dos veces con el mismo enlace.
- `probar-escaneo-remoto.mjs`: mismo conteo (13) — el simulador de RPC ganó
  un "historial" en memoria para simular la comprobación nueva, pero la
  prueba del enlace ajeno no tiene sentido a nivel de interfaz (cada página
  solo conoce un token a la vez) y por eso vive solo en `probar-migraciones.py`.
- `probar_librero.py`: mismo conteo (106), solo se ajustó la firma de la
  llamada en la prueba del token inventado.

---

## Pulido de esta ronda: las tres suites que faltaban, enganchadas a CI

`probar-vistas.mjs`, `probar-migraciones.py` y `probar-escaneo-remoto.mjs`
corrían solo a mano hasta ahora — desde hoy, las tres corren en cada envío
(ver la tabla de "Integración continua" más abajo). Al hacerlo aparecieron
dos problemas reales que nadie había visto porque nunca se habían corrido en
un entorno automatizado, a una hora cualquiera del día:

### `probar-vistas.mjs` calculaba "hoy" con la fecha UTC del runner, no con la de Chile

`_diasRestantes()` y `_estadoPrestamo()` (en `js/modules/ui-base.js`) usan a
propósito `hoyEnChile()`, NO la hora del dispositivo, para no depender de un
reloj mal configurado ni discrepar del servidor (ver el comentario en
`ui-base.js` mismo). Pero el `hoy`/`iso()` que arma los datos de prueba en
`probar-vistas.mjs` usaba `new Date().toISOString()` — la fecha en UTC.
Entre las 00:00 y las ~03:00-04:00 UTC (Chile está detrás de UTC), esa fecha
va un día ADELANTE de la fecha real en Chile, así que dos pruebas fallaban
solas varias horas al día, sin que nadie tocara el código: exactamente el
tipo de intermitencia que habría hecho perder la confianza en esta suite si
se hubiera enganchado a CI tal como estaba. Se corrigió para que `hoy` se
calcule con el mismo criterio que `hoyEnChile()` (mismo archivo,
`js/modules/db.js`), a mediodía local para que sumar/restar días con
`setDate()` nunca cruce de día por el desfase horario.

`masFechaHoras()` (para los enlaces de escaneo remoto, que sí son una marca
de tiempo real, no una fecha calendario) se dejó aparte, calculada desde el
instante real (`new Date()`) — si hubiera heredado el `hoy` de mediodía de
Chile, un enlace recién creado podría nacer ya "vencido" cuando el mediodía
de Chile queda en el pasado respecto al instante real.

### `verificar_llamadas_rpc.py` — chequeo nuevo, sin base de datos

Cruza cada `rpc('nombre', {...})` del código JS contra la firma que esa
función tiene HOY en las migraciones (tomando la última definición de cada
nombre, por orden de archivo). Nace directamente de lo que casi pasó con la
corrección de seguridad de `deshacer_libro_remoto()`: la función bajó de 4 a
2 parámetros y `js/escaneo-remoto.js` sí se actualizó a mano en el mismo
cambio, pero nada más que la revisión humana lo garantizaba. Verificado que
detecta el caso real: reintroducir `p_accion`/`p_cantidad` en la llamada lo
marca de inmediato como error, con el archivo y la línea exactos.

No es un parser de JS ni de SQL — es una lectura de texto, con los mismos
límites que cualquier chequeo de este tipo (ver el docstring del script). Si
no reconoce una llamada real porque está escrita de forma muy distinta a las
que ya existen, anota el caso aquí en vez de forzar el patrón del script.

```bash
python3 pruebas/verificar_llamadas_rpc.py
```

---

## Vista previa de la interfaz (revisión de diseño, 3 de octubre de 2026)

`pruebas/generar-vista-previa.mjs` monta las vistas Catálogo (sede), Bibliomóvil, Catálogo del
Bibliomóvil y Mi perfil con datos de ejemplo —sin sesión de Supabase— y las deja en
`dist/preview/index.html`, con el CSS que ya compiló el build. Sirve para revisar aspecto, jerarquía y
modo oscuro sin credenciales ni base de datos.

```bash
npm run build
node pruebas/generar-vista-previa.mjs
npx serve dist        # abrir /preview/
```

No forma parte de la aplicación ni de la suite: `dist/` está en `.gitignore` y la página no se publica.

---

## Verificaciones agregadas en esta ronda

- **`verificar_clases_tailwind.py`** ahora revisa **todo** `src/` (no solo las páginas estáticas)
  buscando clases mal formadas: dos modificadores de opacidad pegados
  (`dark:bg-stone-800/50/60`). Tailwind no genera nada para esas clases y el elemento se queda sin
  estilo **sin ningún error**; había cuatro así, todas en modo oscuro.
- **`probar-vistas.mjs`**: comprueba que cada catálogo pide su colección (`false` = sede,
  `true` = Bibliomóvil), que el librero no ve el botón de mover ejemplares, y que los estados vacíos
  distinguen «colección vacía» de «búsqueda sin resultados».
- **`probar-migraciones.py`**: que `libros.es_bibliomovil` quede `not null` con `default false`, que
  cada colección devuelva solo sus ejemplares y que ningún libro quede fuera de las dos.
- **`probar-despliegue-manual.py`**: lee los bloques SQL **del documento**
  `docs/despliegue/030-separacion-catalogos-sql-editor.md` (la guía para pegar en el editor SQL de
  Supabase cuando no se puede usar la CLI), reproduce el bug en una base anterior a esta ronda, los
  aplica uno por uno y valida las consultas del Paso 5 y la reversa. Existe para que el documento y
  las migraciones no se separen: si alguien corrige una cosa y olvida la otra, la prueba falla.
- **`persistencia.test.js`** (Vitest): ejercita la función real `filtrarLibrosLocales()`, con el campo
  `stock` que de verdad usa la copia local, la semántica `NULL` = sede, los filtros de disponibilidad y
  la búsqueda sin tildes.

---

## Integración continua

`.github/workflows/pruebas.yml` corre cinco trabajos en cada envío:

| Trabajo | Qué hace |
|---|---|
| `consolidacion` | Lee los archivos SQL, segundos. Incluye `verificar_consolidacion.py` y, desde esta ronda, `verificar_llamadas_rpc.py` |
| `interfaz` | DOM simulado con jsdom: `probar-interfaz.mjs`, y desde esta ronda `probar-vistas.mjs` y `probar-escaneo-remoto.mjs` — más IndexedDB en memoria con fake-indexeddb (`probar-persistencia.mjs`, Fase 1.2; `probar-sync-queue.mjs`, Fase 1.3; `probar-estado-conexion.mjs`, Fase 1.4) |
| `migraciones` | Desde esta ronda: `probar-migraciones.py` contra PostgreSQL embebido (`pgserver`), sin servicio aparte |
| `base-de-datos` | PostgreSQL 17 real (antes 16) |
| `reconstruccion` | Rehace la base con el CLI de Supabase desde cero, contra PostgreSQL 17 (antes 16) |

El último es el más valioso: si la base se puede reconstruir desde los archivos,
los archivos son coherentes.
