# BiblioNexo — Puesta en marcha

Sistema de gestión de préstamos de la Biblioteca Pública Municipal de Futrono.
La aplicación usa ES Modules empaquetados con Vite y ofrece modo PWA/offline.

## 1. Migraciones de Supabase

Las migraciones están en `supabase/migrations/` (001–026) y se aplican con la
CLI, no pegando archivos manualmente en SQL Editor:

```bash
supabase link --project-ref TU_REFERENCE_ID
supabase migration list --linked
supabase db push
```

Si se trata de una base antigua en la que las migraciones `001–009` se aplicaron
manualmente, compara primero el historial remoto con el esquema real. **No
registres versiones como aplicadas sin verificarlas**. El procedimiento
conservador para establecer una línea base está en [MIGRACIONES.md](MIGRACIONES.md),
junto con el inventario completo 001–026 y los pasos de verificación.

Las migraciones 018 y 023 configuran tareas automáticas de Supabase; también
hay que desplegar las Edge Functions de `supabase/functions/` y revisar los
recursos externos que dichas funciones requieren. Aplicar una migración no las
despliega. La guía [SUPABASE-PASO-A-PASO.md](SUPABASE-PASO-A-PASO.md) incluye
los comandos de despliegue, el motivo de `--no-verify-jwt` para las tareas con
secreto propio y la comprobación de `pg_cron`.

## 2. Instalar, probar y construir

Se requiere Node.js 22.x (ver `package.json`). Desde la raíz del repositorio:

```bash
npm ci
npm test
npm run test:legacy
npm run test:legacy:contraste
npm run build
npm run verify:build
```

Las pruebas de PostgreSQL necesitan `pgserver` y `psycopg`, o una base de prueba
indicada mediante `DATABASE_URL`. No ejecutes las pruebas que crean datos contra
la base de producción. Los cinco jobs del CI están descritos en
`.github/workflows/pruebas.yml`.

## 3. Configurar autenticación

En Supabase → **Authentication**:

- **URL Configuration:** fija el *Site URL* con el dominio de publicación y
  agrega los destinos de retorno permitidos. Es necesario para recuperación de
  contraseña e inicio con Google.
- **Providers:** habilita Google solo si se usará ese método de inicio.
- Crea o invita al personal y asigna los roles desde Administración → Personal.

## 4. Publicar con HTTPS y revisar permisos

Las cabeceras de producción se definen en `vercel.json`. La cámara y la
ubicación del Bibliomóvil requieren un contexto seguro (HTTPS) y permiso del
navegador. Las políticas RLS de Supabase son la barrera real de autorización;
ocultar botones en la interfaz no sustituye la revisión de RLS.

Después de aplicar cambios, revisa en Administración → Diagnóstico/Cumplimiento
y prueba las operaciones con cuentas reales de `admin` y `librero`. Los
verificadores SQL y las pruebas automatizadas están documentados en
[MIGRACIONES.md](MIGRACIONES.md).

## 5. Datos configurables

La dirección y el teléfono que se agregan a los avisos están en
`src/js/config.js`, sección `BIBLIOTECA`; confirma que sean los datos vigentes
antes de utilizar el sistema.

El límite visible de préstamos también está configurado en `src/js/config.js`,
pero la decisión efectiva se valida en las funciones SQL del servidor. Si se
cambia el límite, actualiza y prueba ambas partes.

## 6. Bibliomóvil: mapa, ruta y privacidad

La sección Bibliomóvil permite marcar el origen, agregar y reordenar paradas,
calcular un trazado vial orientativo y abrirlo en Google Maps u OpenStreetMap.
El plan queda en el almacenamiento local del navegador; mosaicos y cálculo
vial requieren internet. La ubicación actual se consulta solo después de que el
personal pulsa el botón y autoriza el navegador.

Los proveedores de mapas reciben solicitudes de mosaicos y, al calcular una
ruta, las coordenadas de los puntos (no el nombre de la parada ni datos del
lector). **No ingreses domicilios particulares ni datos personales** y confirma
el recorrido vial antes de salir. La política `privacidad.html` y
`CUMPLIMIENTO-LEGAL.md` describen el tratamiento y deben ser revisadas por
Jurídica municipal antes de considerarlas vigentes.
