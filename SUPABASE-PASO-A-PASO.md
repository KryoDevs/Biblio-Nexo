# Puesta en marcha de Supabase

Guía operativa de despliegue. Para el inventario completo de migraciones,
reconstrucción local y reglas para modificar SQL, consulta
[MIGRACIONES.md](MIGRACIONES.md). **No copies y pegues las migraciones una por
una en SQL Editor**: el método normal es la CLI de Supabase.

## 0. Antes de aplicar cambios

1. Confirma el proyecto Supabase y su `project-ref`; nunca pruebes estas
   instrucciones sobre producción sin autorización.
2. Haz un respaldo recuperable y acuerda una ventana de mantenimiento.
3. Comprueba las versiones que el servidor ya conoce:

   ```bash
   supabase login
   supabase link --project-ref TU_REFERENCE_ID
   supabase migration list --linked
   ```

4. En proyectos antiguos, las migraciones `001–009` pueden haberse aplicado a
   mano y no figurar en el historial de la CLI. **No ejecutes `migration repair`
   a ciegas.** Compara los archivos, el historial remoto y el esquema; registra
   como aplicadas únicamente las versiones que hayas verificado. El caso de
   línea base está explicado paso a paso en [MIGRACIONES.md](MIGRACIONES.md).

La migración `003_rol_admin_y_contacto.sql` contiene un correo inicial de
administrador que debe revisarse antes de aplicarla a un proyecto nuevo. La
cuenta tiene que existir en `auth.users`; inicia sesión con ella al menos una
vez y verifica después que su fila de `public.usuarios` tiene `rol = 'admin'`.
Una dirección incluida en el JavaScript solo cambia lo que se ve en pantalla,
**no concede permisos en la base de datos**.

## 1. Aplicar las migraciones

Una vez revisado el historial, aplica solo lo pendiente y vuelve a comprobar:

```bash
supabase migration list --linked
supabase db push
supabase migration list --linked
```

El repositorio contiene las migraciones 001–030. La CLI las aplica en orden;
consulta [MIGRACIONES.md](MIGRACIONES.md) para sus propósitos y dependencias.
No edites ni vuelvas a ejecutar una migración histórica que ya se aplicó en
producción para “arreglarla”: prepara una migración nueva, salvo el caso
explícito de consolidación que documenta ese archivo.

**Cuando no se pueda usar la CLI** (por ejemplo, si solo se tiene acceso al panel web), la migración
030 tiene su propia guía con los bloques listos para pegar en el editor SQL, en
[`docs/despliegue/030-separacion-catalogos-sql-editor.md`](docs/despliegue/030-separacion-catalogos-sql-editor.md),
con la comprobación previa, la verificación posterior y la reversa. Es una excepción documentada, no
la vía normal: los bloques los valida `pruebas/probar-despliegue-manual.py` contra un PostgreSQL real.

Después de aplicar, con una sesión administrativa, ejecuta los diagnósticos:

```sql
select * from public.verificar_definiciones() where estado <> 'Correcto';
select * from public.verificar_rls();
select * from public.verificar_circulacion();
```

Investiga cualquier resultado distinto de `Correcto`; las funciones de
verificación no sustituyen la comprobación con una cuenta real de librero.

## 2. Desplegar las Edge Functions

`supabase db push` **no** publica código de Edge Functions. Revisa primero el
`project-ref` enlazado y despliega las funciones del repositorio:

```bash
supabase functions deploy invitar-personal
supabase functions deploy respaldo-automatico --no-verify-jwt
supabase functions deploy expirar-reservas --no-verify-jwt
```

Las dos funciones de tareas programadas validan un secreto propio en el
encabezado `x-cron-secret` mediante una RPC protegida. Se despliegan con
`--no-verify-jwt` porque `pg_cron` no envía un JWT de usuario; **no elimines la
validación del secreto** ni reutilices la `service_role` como secreto. La
función `invitar-personal` sí conserva la verificación JWT y comprueba el rol
`admin` real.

Las migraciones `018` y `023` crean tareas y secretos de Vault cuando las
extensiones están disponibles. Sus URLs de Edge Function contienen el
identificador del proyecto Futrono; si el destino es otro proyecto, revisa esos
endpoints y las variables de entorno antes de programar o ejecutar los jobs.
Verifica en Supabase que cada tarea esté activa y que haya una ejecución correcta
en `respaldos_log` / en el registro de la función. Aplicar las migraciones no
garantiza por sí solo que el runtime de las funciones esté desplegado.

## 3. Autenticación y cuentas del personal

En **Authentication → URL Configuration** configura el *Site URL* con el
origen HTTPS real y agrega las URLs de retorno necesarias. Sin esto, los enlaces
de recuperación e inicio OAuth pueden volver a una dirección incorrecta.

Habilita Google solo si la biblioteca utilizará ese proveedor y completa la
configuración requerida en Google Cloud y Supabase. Revisa también la política
de contraseñas y los flujos de correo con el proveedor de SMTP elegido.

Invita a cada integrante con una cuenta individual; no compartan credenciales.
El rol se asigna en Administración → Personal y se valida en `public.usuarios`
y en RLS. Prueba las tareas con una cuenta `admin` y otra `librero`.

## 4. Revisar RLS y operaciones de préstamo

RLS es la barrera de autorización real; ocultar controles en la interfaz no la
reemplaza. La migración 019 elimina las políticas de acceso total de las tablas
de negocio. Revisa el diagnóstico en Administración → Cumplimiento y prueba
explícitamente con un librero:

1. Buscar un libro y un lector.
2. Registrar un préstamo y confirmar que el stock baja.
3. Devolverlo y confirmar que el préstamo se cierra y el stock se restaura.
4. Confirmar que la cuenta no puede eliminar libros, cambiar RUT ni administrar
   personal.

No uses el usuario de base de datos con privilegios elevados para esta prueba:
no representa las políticas de la sesión autenticada.

## 5. Configurar el cliente y datos locales

La aplicación lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` de las variables
de entorno de Vite (`.env.example` muestra los nombres). La llave **anon/publishable**
es pública por diseño; nunca pongas `service_role` en `.env` del navegador,
`src/js/config.js` ni en el repositorio. En Vercel configura esas variables para
el build, o confirma que los valores de respaldo de `src/js/config.js` apuntan
al proyecto correcto.

Confirma los datos de la biblioteca en `src/js/config.js`, sección
`BIBLIOTECA`, y los parámetros de negocio en Administración → Cumplimiento →
Parámetros. Los límites que protegen préstamos se validan en SQL; cambiar solo
el valor que muestra la interfaz no modifica la regla del servidor.

## 6. Publicar y comprobar HTTPS

El despliegue previsto es Vercel: `vercel.json` declara `npm run build`, `dist`
y las cabeceras HTTP de seguridad. Publica el repositorio completo con
`public/vendor/` y revisa el resultado del build:

```bash
npm ci
npm test
npm run test:legacy
npm run test:legacy:contraste
npm run build
npm run verify:build
```

En el dominio publicado, revisa en **Network → Response Headers** que estén
`Content-Security-Policy`, `X-Frame-Options` y `Permissions-Policy`. La cámara y
la ubicación del Bibliomóvil requieren HTTPS y permiso explícito del navegador.
La sección Bibliomóvil usa mosaicos de OpenStreetMap y el servicio público OSRM;
lee [privacidad.html](privacidad.html) y no ingreses domicilios particulares
ni datos de lectores en el plan.

## 7. Respaldos y comprobación final

La migración 018 programa un respaldo automático en Storage y 023 expira
reservas apartadas. Confirma que las funciones estén desplegadas, las tareas de
`pg_cron` aparezcan activas y el bucket `respaldos` exista. Revisa los registros
de éxito/fallo y realiza una **prueba de restauración**: tener un archivo no
prueba que pueda recuperarse.

Lista de verificación previa al uso:

- [ ] La CLI no muestra migraciones pendientes; historial y esquema remoto coinciden.
- [ ] Los diagnósticos de RLS, definiciones y circulación no tienen fallos.
- [ ] Una cuenta de administrador y otra de librero pasan las pruebas de permisos.
- [ ] La invitación, recuperación de contraseña y correo funcionan con el dominio real.
- [ ] Las tres Edge Functions están desplegadas; cron y Storage fueron comprobados.
- [ ] La aplicación está en HTTPS y llegan las cabeceras de seguridad.
- [ ] Se probó el mapa, la selección de puntos y el enlace de navegación; se entiende
      que el cálculo vial requiere internet y usa un servicio público.
- [ ] Existe un respaldo y alguien probó restaurarlo.

Para pruebas locales de la base, usa una instancia de pruebas:

```bash
supabase start
supabase db reset
```

No apuntes las pruebas que crean o borran datos a la base de producción. Para
más detalles, scripts de PostgreSQL y guía de línea base, consulta
[MIGRACIONES.md](MIGRACIONES.md) y [LEEME.md](LEEME.md).
