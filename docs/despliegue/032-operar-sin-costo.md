# 032 — Operar Biblio-Nexo con costo cero

Restricción de trabajo: **nada de esto puede requerir pagar**. Ni Vercel Pro, ni
Supabase Pro, ni un SMTP de terceros, ni un dominio que haya que presupuestar.
Cuando algo de lo que sería razonable hacer cuesta, este documento lo anota como
riesgo con su alternativa gratuita, nunca como requisito.

Última verificación: **29 de octubre de 2026**, sobre el proyecto real de
Supabase (`vcngmgzxjoorjhcgqzpk`, región `sa-east-1`, Postgres 17, `ACTIVE_HEALTHY`)
y el proyecto de Vercel `biblio-nexo`. Los números de esta página salieron de
consultas ejecutadas ese día contra la base de producción; cada uno dice cómo
repetirlo. No son citas de la documentación de los proveedores: los planes
cambian, y un límite que se cita de memoria es un límite que no existe.

---

## La cuenta, pieza por pieza

| Pieza | Plan | Costo | Lo que da el nivel gratuito | Dónde está hoy | Qué se rompe al pasarse |
|---|---|---|---|---|---|
| Estático (HTML, JS, íconos, service worker) | Vercel **Hobby** | $0 | 1 M de peticiones de borde y 100 GB de transferencia al mes; 100 despliegues al día | la app completa pesa **2,17 MB en 40 archivos**; eso son ~47 000 cargas completas al día durante un mes | el plan no permite comprar exceso: deja de servir hasta el ciclo siguiente. Para una biblioteca de un pueblo de ~20 000 habitantes, esto no va a pasar |
| Base de datos | Supabase **Free** | $0 | **500 MB** de base de datos, 2 proyectos activos | **16 MB** medidos (`pg_database_size`) — un 3 % del límite | la base se pone en solo lectura y los escritorios dejan de prestar/devolver. Es el límite que hay que mirar de verdad |
| Autenticación | Supabase Free | $0 | 50 000 usuarios activos al mes | 3 usuarios en `public.usuarios` | nada realista |
| Almacenamiento | Supabase Free | $0 | **1 GB** de Storage | 4,5 MB en 62 archivos del bucket `respaldos` | el respaldo diario deja de subir —falla la copia, no la app, que sigue abriendo: ver «El respaldo» |
| Funciones (`respaldo-automatico`, `expirar-reservas`, `invitar-personal`) | Supabase Free | $0 | 500 000 invocaciones al mes | ~720 al mes (una por hora + una por día, las dispara `pg_cron`) | nada |
| Repositorio, CI y alarma diaria | GitHub Free (repo **público**) | $0 | minutos de Actions ilimitados en repo público | 2 trabajos: `Pruebas` en cada envío y `Sitio vivo` diario | si el repo pasara a privado hay 2 000 min/mes; y GitHub **apaga** las tareas programadas de un repo público tras 60 días sin ningún `push` |
| Correo de invitaciones | — | — | el SMTP compartido de Supabase **solo** entrega a direcciones del propio equipo de Supabase | no sirve para escribirle a una vecina | ver «Correo»; es el único punto sin respuesta gratis dentro de lo que se puede automatizar |

Para repetir la medición de la columna «dónde está hoy» (editor SQL de Supabase,
o `psql` con la cadena de conexión):

```sql
select pg_size_pretty(pg_database_size('postgres'))                     as bd,
       (select count(*) from public.libros)                             as libros,
       (select count(*) from public.usuarios)                           as personal,
       (select count(*) from public.respaldos_log where ok)             as respaldos_ok,
       pg_size_pretty(coalesce((select sum(bytes) from public.respaldos_log), 0)) as peso_respaldos,
       (select count(*) from storage.objects where bucket_id = 'respaldos')       as objetos_en_bucket;
```

---

## Las cuatro trampas (lo que sí puede costar, o sí puede doler)

### 1. `biblionexo.cl` se paga todos los años

Un dominio `.cl` no es gratis en ningún régimen: la renovación es anual. Es el
**único costo recurrente** que este proyecto puede tener, y no es de este
repositorio — es una línea en el presupuesto del municipio.

Mientras tanto el sitio ya abre en el alias `https://biblio-nexo-fuckingkrio.vercel.app`
con HTTPS válido. Ningún vecino necesita que la biblioteca tenga dominio propio
para devolver un libro, y canonical, Open Graph, `robots.txt` y `sitemap.xml`
están armados para que cambiar el origen sea **una** variable de entorno y un
despliegue (`docs/despliegue/031-senales-publicas-2026-10.md` tiene el detalle).

El orden, si el municipio sí presupuesta la renovación, está en ese documento:
primero el DNS en NIC Chile, después `VITE_ORIGEN_PUBLICO`, después desplegar.
Nunca al revés.

Y el corolario que hay que escribir antes de que pase: **si la renovación se deja
de pagar, hay que quitar `VITE_ORIGEN_PUBLICO` y volver a desplegar.** Si queda
fijada en `https://biblionexo.cl`, el `canonical`, el `sitemap` y la imagen que
se comparte por WhatsApp seguirán apuntando a un dominio que ya no resuelve, y
la app funcionará tan bien que nadie notará que los buscadores y los enlaces
compartidos se fueron al aire.

### 2. Vercel Hobby dice «uso personal, no comercial»

`vercel.com/docs/limits/fair-use-guidelines` (leído el 29/10/2026):

> «Hobby teams are restricted to non-commercial personal use only. All commercial
> usage of the platform requires either a Pro or Enterprise plan.»

Un sistema municipal de biblioteca no cobra, no vende y no muestra publicidad: no
es comercial en el sentido de lucro. Pero tampoco es *personal* — es el sitio de
una institución. Es un territorio gris, y un gris que Vercel puede resolver
pidiendo el plan Pro (US$ 20/mes) un martes cualquiera.

Lo que **no** hay que hacer: abrir la cuenta a nombre de una persona del equipo
para que parezca personal. Eso no arregla la cláusula, solo la esconde de quien
la va a leer cuando el sitio ya no se pueda mover en un tarde.

Lo que sí: los dos planes B son gratuitos y no tienen esa cláusula.

* **Cloudflare Pages** (el preferido). Sin límite de peticiones estáticas en el
  nivel gratuito. El trabajo de migración es mecánico: el mismo `npm run build`,
  y pasar los 12 bloques de `vercel.json` a un archivo `_headers` en la raíz de
  `dist/` (son `/*` con las 7 cabeceras de seguridad, `/assets/*` con
  `Cache-Control: public, max-age=31536000, immutable`, `/sw.js` y
  `/manifest.json` con `no-cache`, y `/(vercel.json|.gitignore|.vercelignore)` con
  `X-Robots-Tag: noindex`). Vercel no hace nada más aquí: no hay funciones
  serverless, no hay borde propio, no hay build de Vercel que perder.
* **GitHub Pages** (el último recurso, y funciona). Sirve `dist/` tal cual,
  `404.html` es la convención de Pages **y** la nuestra, y las cabeceras de
  seguridad no se pueden poner ahí — por eso cada HTML del proyecto lleva también
  su `<meta http-equiv="Content-Security-Policy">`: lo que en Vercel es
  redundancia, en Pages es la única línea de defensa.

En los dos casos hay que tocar una sola cosa más: las *Redirect URLs* y el *Site
URL* de Supabase Auth (Ajustes → Auth → URL). Y decirle al workflow diario cuál
es el origen nuevo (`SITIO_URL`, abajo).

### 3. El plan Free de Supabase **pausa** el proyecto

A los 7 días de baja actividad de base de datos, un proyecto Free se pausa y toda
su API responde **HTTP 540**. La app abre igual (el service worker la tiene
cacheada), así que el único síntoma es que no carga ningún dato. Y la pausa se da
justo en el período en que nadie toca el repositorio: en febrero la biblioteca
lleva semanas cerrada y el proyecto se queda sin consultas.

Reactivar es un clic en el panel y no se pierden datos, pero alguien tiene que
enterarse. Esto ya está cubierto dos veces, y a propósito:

* las migraciones 018 y 023 dejan cron internos (`respaldo-automatico` diario,
  `expirar-reservas` cada hora) que generan actividad de base de datos;
* `.github/workflows/sitio-vivo.yml` corre cada día a las 09:17 hora de Chile,
  hace una consulta real por la API REST con la anon key y **falla** si algo
  responde 540 — el fallo de un trabajo de Actions en un repo público es un
  correo al dueño del repo, que es el sistema de alarmas más barato que existe.

Lo que el workflow no puede hacer es reactivar (haría falta un token de API con
permisos, o sea un secreto, y este proyecto decide no tener secretos en CI). Es
alarma, no medicina.

### 4. El nombre del equipo aparece en la URL pública

`biblio-nexo-fuckingkrio.vercel.app` lleva el slug de la cuenta de Vercel en la
dirección que va a ver un vecino. Cambiar el slug es **gratis**, pero hay que
hacerlo en este orden o se rompe el inicio de sesión:

1. Supabase → Auth → *Site URL* y *Redirect URLs*: actualizar al alias nuevo.
2. Cambiar el slug en Vercel (Config → Teams).
3. Desplegar (el dominio de producción es un alias, no una variable, pero el
   `canonical` del build anterior queda citándolo por todas partes).
4. `Settings → Secrets and variables → Actions → Variables`: `SITIO_URL` al alias
   nuevo, para que la alarma diaria pruebe la dirección correcta.
5. `VITE_ORIGEN_PUBLICO` en Vercel, si se quiere que el HTML se declare con el
   alias nuevo desde el primer byte.

---

## El respaldo: lo que estaba grifo y cómo quedó

El plan Free no tiene respaldos administrados (ni PITR): la única copia del
catálogo son los JSON que `respaldo-automatico` sube cada noche al bucket privado
`respaldos`. Dos cosas estaban mal ahí, y ninguna se veía desde la app.

**1. No había retención.** La función subía un archivo por día y no borraba nada
— 62 archivos a los tres meses. Con el catálogo de prueba eso son 4,5 MB; con un
catálogo de 40 000 títulos y años de historial, cada JSON puede pesar decenas de
megabytes y **30 días de eso se comen el gigabyte entero**. Cuando Storage se
llena, lo que deja de funcionar es el respaldo, en silencio.

Ahora la función, después de subir y antes de anotar, elimina sus propios archivos
más viejos de `DIAS_CONSERVAR = 30` y también hasta entrar en un tope duro de
`LIMITE_TOTAL_BYTES = 300 MB`, y deja el resumen en `respaldos_log.mensaje`. Tres
decisiones de esa línea de código, cada una con su motivo:

* va **después** de la subida y con su propio `try/catch`: una retención que falla
  es una nota en la bitácora, jamás un respaldo perdido;
* compara por `created_at` del Storage y no por el nombre del archivo (la fecha
  del nombre lleva los `:` cambiados por `-`; reconstruirla para comparar sería
  una forma creativa de borrar lo que no había que borrar);
* filtra por prefijo `respaldo-`, para no tocar lo que una persona haya podido
  dejar en el bucket.

**Este cambio está en el repositorio pero no en la nube.** `supabase/functions/…`
no se despliega solo: hace falta

```bash
supabase functions deploy respaldo-automatico
```

y al día siguiente mirar `select ok, archivo, bytes, mensaje from public.respaldos_log order by id desc limit 3;`.

**2. Nadie había probado restaurar.** `SUPABASE-PASO-A-PASO.md` tenía la casilla
«Existe un respaldo y alguien probó restaurarlo» sin marcar, y era verdad. Ahora
hay herramienta y prueba:

* `pruebas/restaurar-respaldo.mjs` convierte un `respaldo-*.json` en
  `restauracion.sql` (una transacción, plpgsql, `jsonb_populate_record` — el
  tipado lo decide Postgres, no un escapado a mano);
* `pruebas/probar-restauracion.py` lo prueba de punta a punta contra un Postgres
  real, y corre en CI.

Esa prueba encontró tres formas concretas en que una restauración de este proyecto
fallaba, y las tres están cubiertas ahora:

| Falla | Síntoma | Lo que hace el restpositor |
|---|---|---|
| Columnas `generated always as identity` (`pruebas/00_base_supabase.sql` las crea así; el editor de Supabase usa `bigserial`) | `cannot insert a non-DEFAULT value into column "id"` | lee `pg_attribute` y añade `overriding system value` solo cuando hace falta |
| Secuencia sin alinear después de insertar ids explícitos | la restauración «funciona» y a la mañana siguiente el primer alta de un libro revienta con `duplicate key value` | `setval` por cada columna de secuencia, al máximo restaurado |
| El disparador de auditoría escribe en la misma tabla que se está restaurando | `duplicate key value violates unique constraint "auditoria_pkey"` en plena restauración | `disable trigger user` por tabla durante la transacción (las claves foráneas siguen activas; al final, `enable trigger user`) |

**El simulacro, que es lo que falta y es gratis** (veinte minutos, un lunes):

1. Crear un segundo proyecto Supabase Free (el plan permite dos activos; hoy hay
   uno) y aplicarle las migraciones `supabase/migrations/*.sql` en orden.
2. Bajar del bucket un `respaldo-*.json` reciente.
3. `node pruebas/restaurar-respaldo.mjs respaldo-….json` → `restauracion.sql`.
4. `psql "la cadena del proyecto de pruebas" -v ON_ERROR_STOP=1 -f restauracion.sql`.
5. Comparar los conteos: el propio archivo generado trae la lista de consultas.
6. Abrir la app con el `.env` apuntando al proyecto de pruebas y mirar dos
   fichas reales.
7. Borrar el proyecto de pruebas y marcar la casilla en `SUPABASE-PASO-A-PASO.md`.

Un respaldo que se restaura en un proyecto de pruebas es un respaldo. Uno que
nunca se restauró es un archivo en un cubo.

---

## Correo: el único punto que no resuelve gratis

`invitar-personal` manda la invitación con SMTP directo, y el servidor compartido
de Supabase solo entrega a direcciones del propio equipo de Supabase: para
escribirle a una persona que no es de este proyecto hace falta un relay. Opciones
reales:

* **el SMTP del municipio** (gratis, ya existe, ya tiene reputación): configurar
  `SMTP_HOST/PORT/USER/PASS` como secretos de la función y listo. Es la respuesta
  por defecto; hay que pedirla a quien administra el correo municipal, no
  comprarla.
* el nivel gratuito de un proveedor de envío: funciona, pero sin un dominio
  propio con SPF/DKIM propios los correos caen en spam — y un dominio propio es
  la trampa 1. Es decir: el correo auténticamente gratis depende del correo del
  municipio, no de un proveedor.
* **no mandar correo**: que el sistema genere el primer acceso y se entregue en
  persona, en el mesón, como se hace con una tarjeta de lector. Es una decisión
  de producto (hay que implementarla), no un gasto.

Aparte, y medido el 29/10/2026 contra el proyecto: las tres funciones están
desplegadas con `verify_jwt: false`. `invitar-personal` se defiende ella misma
(pide la sesión y comprueba que el rol sea `admin`, y devuelve 403 si no), así que
no es un agujero abierto; pero su propio encabezado dice «`verify_jwt = true` al
desplegar», y la configuración real dice lo contrario. Es de una línea:
`supabase functions deploy invitar-personal --no-verify-jwt` es lo que produjo
esto, y quitar esa bandera lo revierte. Decisión de quien despliega: con el rol
verificado en el código, el riesgo es bajo; el beneficio de cerrar la diferencia
entre el comentario y la nube, también.

---

## Cómo se ve venir sin pagar un servicio de monitoreo

`.github/workflows/sitio-vivo.yml` → `pruebas/verificar-sitio-vivo.mjs`. Dieciséis
comprobaciones en vivo contra el despliegue (no contra el repositorio): la
portada responde 200 y no quedaron tokens del build sin sustituir; canonical,
og:url, og:image y twitter:image declaran **un solo** origen y ese origen es este;
la imagen social se puede descargar y pesa más de 20 KB; `favicon.ico` es un
contenedor ICO con al menos 3 tamaños; los dos PNG miden lo que dicen medir (se
leen los bytes IHDR); el manifest existe y sus íconos responden; `robots.txt`
apunta al `sitemap.xml` del mismo origen y todas sus `<loc>` responden 200;
`/privacidad.html` existe, tiene su `<h1>` y su `PrivacyPolicy`;
`/escaneo-remoto.html` sigue siendo `noindex` y carga su módulo; `/sw.js` se sirve
como JavaScript y trae el precache; y la API de Supabase y su Auth responden (una
consulta real con la anon key, que es pública por diseño: este workflow **no tiene
secretos**).

Correrlo a mano, cuando toque algo del despliegue:

```bash
npm run preview &                                    # contra el build local
SITIO_URL=http://127.0.0.1:4173 npm run test:sitio   # sin tocar la nube: SIN_NUBE=1

npm run test:sitio                                   # contra el alias de Vercel
SITIO_URL=https://biblionexo.cl npm run test:sitio   # y contra el dominio, el día que apunte
```

El script distingue «no llegué» de «respondió mal», y cada falla dice qué hacer
(HTTP 540 → reactivar en el panel; un 404 en el favicon o el `sw.js` → se
desplegó un artefacto incompleto o alguien tocó `vercel.json`; canonical en otro
origen → falta desplegar con `VITE_ORIGEN_PUBLICO`).

---

## Lo que se quedó afuera, a propósito

* **Renderizado en el servidor / prerenderizado** (señal 2 de la auditoría): la
  portada es un envoltorio de la SPA y su contenido lo arma el arranque. Para una
  app con sesión eso es correcto y el costo de cambiarlo no es dinero, es el
  arranque entero. No se hizo.
* **`purpose: "maskable"` en los íconos** y los datos de contacto de la
  biblioteca: no son dinero ni límites, son decisiones de la biblioteca.
* **Servicios de uptime gratuitos** (UptimeRobot y compañía): funcionan, pero
  suman otra cuenta en la que hay que acordarse de mirar. Las Actions ya corren
  y ya mandan el correo.
* **PITR, réplicas, respaldos administrados**: todo eso es el salto a Supabase
  Pro, y es exactamente lo que esta restricción prohíbe. La respuesta gratis es
  la que está arriba: JSON diarios con retención y un simulacro probado.

Y la regla práctica para el día que alguien (o un modelo de lenguaje) diga «hay
que pagar X para esto»: volver a la tabla de arriba, buscar la fila, y preguntar
qué se rompe de verdad al pasarse. En este despliegue, casi todo lo que se rompe
al pasarse se ve venir desde una consulta de un segundo.
