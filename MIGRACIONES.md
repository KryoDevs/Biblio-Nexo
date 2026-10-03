# Migraciones de BiblioNexo (001–030)

Este documento describe el estado del repositorio al **3 de octubre de 2026**.
Las migraciones se encuentran en `supabase/migrations/` y se aplican por número,
con la CLI de Supabase o siguiendo el orden documentado abajo. No se debe asumir
qué hay aplicado en una base remota: primero se compara el historial del servidor
con estos archivos.

## Inventario

| Migración | Propósito |
|---|---|
| `001_prestamos_atomicos.sql` | Préstamos y devoluciones atómicos para evitar carreras de stock. |
| `002_generos_ubicacion_limite.sql` | Género, ubicación y límite de préstamos. |
| `003_rol_admin_y_contacto.sql` | Rol administrador y contacto inicial (revisar el correo de configuración antes de aplicarla). |
| `004_reportes_portadas_zona_horaria.sql` | Fechas, portadas y reglas de horario de Chile. |
| `005_renovaciones_auditoria_busqueda.sql` | Renovaciones, auditoría y búsqueda sin acentos. |
| `006_bloqueo_inventario_admin.sql` | Bloqueos, conciliación de inventario y controles administrativos. |
| `007_correcciones_y_cumplimiento_legal.sql` | Correcciones del esquema y medidas de cumplimiento. |
| `008_perfiles_y_permisos_librero.sql` | Perfiles y permisos del personal librero. |
| `009_registro_de_errores.sql` | Registro técnico de errores. |
| `010_consolidacion.sql` | Definiciones consolidadas de RPC (58 funciones, 56 en manifiesto) y manifiestos de verificación. |
| `011_marcas_de_sincronizacion.sql` | Marcas de cambios y disparadores para sincronización delta. |
| `012_permisos_auth_users.sql` | Permisos mínimos necesarios sobre `auth.users`. |
| `013_politicas_usuarios.sql` | Políticas RLS de perfiles y asignación de roles. |
| `014_enlaces_escaneo_remoto.sql` | Enlaces temporales y acotados para escaneo remoto. |
| `015_lapidas_eliminaciones.sql` | Lápidas para propagar eliminaciones a las copias locales. |
| `016_eliminar_politica_redundante_usuarios.sql` | Retira una política RLS redundante. |
| `017_plazo_prestamo_por_libro.sql` | Permite fijar el plazo de préstamo por título. |
| `018_respaldo_automatico.sql` | Registro, secreto y programación del respaldo (extensiones de Supabase cuando están disponibles). |
| `019_eliminar_politicas_acceso_total.sql` | Elimina políticas RLS de acceso total en tablas de negocio. |
| `020_permitir_eliminar_libro_con_historial.sql` | Permite eliminar libros sin préstamos activos y conserva el historial. |
| `021_papelera_libros.sql` | Lista y restaura libros eliminados desde auditoría. |
| `022_reservas.sql` | Lista de espera y reservas de ejemplares. |
| `023_expirar_reservas.sql` | Programación de expiración de reservas apartadas. |
| `024_rpc_eliminar_lector.sql` | Marcador histórico; la implementación de la RPC vive en la consolidación 010. |
| `025_anonimizacion_lectores.sql` | Fecha de anonimización en el registro del lector. |
| `026_es_bibliomovil.sql` | Marca explícita (`es_bibliomovil`) para el catálogo del Bibliomóvil. |
| `027_prestamos_coordenadas.sql` | Agrega de forma idempotente `parada_nombre`, `parada_lat` y `parada_lng` a `public.prestamos` para préstamos realizados en ruta del Bibliomóvil. |
| `028_reparar_sobrecarga_prestar_libro_y_paradas.sql` | Elimina la sobrecarga obsoleta `public.prestar_libro(bigint, text)` (dejando como única firma la de 5 argumentos con `DEFAULT NULL` consolidada en `010_consolidacion.sql`) y crea el índice parcial `idx_prestamos_parada_nombre`. |
| `029_rol_bibliomovil.sql` | Restringe `public.usuarios.rol` a `admin`, `librero` o `bibliomovil`. La RPC `asignar_rol` se actualiza en `010_consolidacion.sql`; en bases ya desplegadas hay que reaplicar la 010 y redesplegar `invitar-personal`. |
| `030_separacion_catalogos_bibliomovil.sql` | Deja `libros.es_bibliomovil` en `not null default false` (normaliza los `NULL` a sede) e indexa `(es_bibliomovil, titulo)`. `buscar_libros()` compara con `coalesce` en la 010. Se puede aplicar a mano con la guía `docs/despliegue/030-separacion-catalogos-sql-editor.md`. |

Las funciones auxiliares de los respaldos y cron requieren además desplegar las
Edge Functions correspondientes (`supabase/functions/`) y configurar los
recursos de Supabase que sus migraciones documentan. Aplicar SQL no despliega
por sí solo una Edge Function. Despliega `invitar-personal` con la verificación
JWT predeterminada; `respaldo-automatico` y `expirar-reservas` se invocan desde
`pg_cron` sin JWT de usuario y deben desplegarse con `--no-verify-jwt`: esas
dos funciones validan en su código un secreto aleatorio independiente en el
encabezado `x-cron-secret`. No quites esa comprobación ni uses la `service_role`
como secreto. Las URLs programadas en 018 y 023 apuntan al proyecto de Futrono;
si el destino es otro proyecto, revísalas antes de ejecutar esas migraciones.

## Primera conexión a una base ya existente

1. Vincula el proyecto y mira el historial remoto:

   ```bash
   supabase link --project-ref TU_REFERENCE_ID
   supabase migration list --linked
   ```

2. **No ejecutes `migration repair` a ciegas.** En instalaciones antiguas, las
   migraciones `001–009` pudieron aplicarse a mano y no aparecer en el historial
   de la CLI. Comprueba el esquema real y registra como aplicadas únicamente las
   versiones que ya verificaste. Solo si la base coincide exactamente con esa
   línea base, este es el comando histórico:

   ```bash
   supabase migration repair --status applied \
     001 002 003 004 005 006 007 008 009 --linked
   ```

   Si también se aplicaron versiones posteriores manualmente, compáralas una
   por una antes de registrar el estado. No marques las 026 como aplicadas si
   las funciones, columnas o políticas que introducen no existen.

3. Vuelve a revisar la lista y aplica lo pendiente:

   ```bash
   supabase migration list --linked
   supabase db push
   ```

La CLI aplica solo migraciones pendientes, en orden numérico. El comando no
actualiza ni despliega Edge Functions.

## Base nueva o prueba local

```bash
supabase start
supabase db reset
```

`db reset` vuelve a crear el esquema y aplica los archivos desde cero. En CI se
usa además PostgreSQL real para probar permisos y el CLI de Supabase para probar
la reconstrucción completa. La batería relevante está en
`.github/workflows/pruebas.yml`.

## Regla para cambiar funciones

`010_consolidacion.sql` es la fuente de verdad para las funciones de negocio que
ya consolida. Si se modifica una de esas funciones, hay que actualizar la 010,
el manifiesto que verifica las firmas y sus pruebas; una migración posterior no
debe redefinirla silenciosamente. El verificador estático lo comprueba:

```bash
python3 pruebas/verificar_consolidacion.py
python3 pruebas/verificar_llamadas_rpc.py
```

Las migraciones posteriores sí pueden agregar esquema o una función nueva que
no exista en la 010, pero deben declarar permisos y comprobaciones de acceso,
actualizar las pruebas y evitar duplicar una firma existente. Las columnas,
índices y tablas nuevas se agregan en una migración numerada posterior; si una
función de la 010 necesita una columna nueva desde una instalación limpia, la
columna debe existir antes de que la 010 compile (o llevar una declaración
idempotente previa, documentada expresamente).

## Verificación tras aplicar

Con una sesión de administrador:

```sql
select * from public.verificar_definiciones() where diagnostico <> 'Correcto';
select * from public.verificar_rls();
select * from public.verificar_circulacion();
```

La primera consulta debería devolver cero filas. Luego prueba con una cuenta
real de librero las operaciones normales de préstamo y devolución: una prueba
como superusuario no demuestra que las políticas RLS de producción estén bien.

## Pruebas del repositorio

```bash
npm ci
npm test
npm run test:legacy
npm run test:legacy:contraste
npm run build
npm run verify:build
python3 pruebas/verificar_consolidacion.py
python3 pruebas/verificar_llamadas_rpc.py
python3 pruebas/probar-migraciones.py
python3 pruebas/probar_librero.py
```

Las pruebas que requieren PostgreSQL necesitan `pgserver` y `psycopg` o una
variable `DATABASE_URL` con una base de prueba. Nunca ejecutes `probar_librero.py`
contra datos de producción: el script crea datos y roles de prueba.