# Aplicar la separación de catálogos desde el editor SQL de Supabase

- **Qué resuelve**: que el catálogo de la biblioteca y el del Bibliomóvil dejen de mostrar los mismos
  títulos, y que un libro sin marcar no desaparezca de ninguna de las dos vistas.
- **Migración**: `supabase/migrations/030_separacion_catalogo_bibliomovil.sql` más la versión vigente
  de `buscar_libros()` que vive en `supabase/migrations/010_consolidacion.sql`.
- **Cuándo usar esta vía manual**: cuando no se puede usar la CLI de Supabase (`supabase db push`), que
  es el método normal del proyecto (ver `SUPABASE-PASO-A-PASO.md`). Aquí los mismos cambios, listos
  para pegar.
- **Antes de empezar**: haz un respaldo recuperable y trabaja en una ventana sin uso de la aplicación
  (el bloque 2 reemplaza una función que la aplicación usa para listar el catálogo; tarda menos de un
  segundo, pero conviene no hacerlo mientras alguien presta un libro).

Los pasos se ejecutan en el **Panel de Supabase → SQL Editor → New query**. Cada bloque se pega
completo y se ejecuta con **Run** (o `Ctrl` + `Enter`), en orden. No hace falta nada más: el editor
funciona con permisos de administrador de la base y aplica el script como una sola transacción.

---

## Paso 1 — Comprobar qué hay aplicado (solo lectura)

```sql
-- ¿Existe la columna, y admite NULL? (si la fila no aparece, falta aplicar la 026)
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'libros'
  and column_name  = 'es_bibliomovil';
```

Si la columna existe y `is_nullable` dice `YES`, hay filas sin marcar que ahora mismo no aparecen en
ninguna colección: es justo lo que arregla esta migración. Si la consulta no devuelve nada, no pasa
nada: el bloque siguiente crea la columna.

---

## Paso 2 — Bloque 1: normalizar la columna de colección

```sql
-- ============================================================================
-- 030: Separación del catálogo del Bibliomóvil y del catálogo de la biblioteca
-- ============================================================================
-- Problema que resuelve
-- --------------------
-- La columna `libros.es_bibliomovil` se agregó en la 026 para marcar los
-- ejemplares que circulan en la ruta, pero quedó a medias en dos sentidos:
--
--   1. La columna admite NULL (`default false` no alcanza a las filas que ya
--      existían ni a un insert que omite la columna). Y `buscar_libros()`
--      comparaba `l.es_bibliomovil = p_es_bibliomovil`, que con NULL da NULL:
--      un libro sin marcar no aparecía ni filtrando por sede ni por móvil.
--      En la práctica se veía en el catálogo (p_es_bibliomovil = null no filtra)
--      pero desaparecía en cuanto se pedía una colección concreta.
--   2. La interfaz pedía el catálogo completo (p_es_bibliomovil = null), así que
--      el catálogo de la biblioteca y el del Bibliomóvil mostraban los mismos
--      títulos mezclados. En la ruta, el personal no podía saber si un
--      ejemplar estaba en el móvil o en el estante de la sede, y en la sede se
--      prestaban ejemplares que estaban físicamente en el camión.
--
-- Qué hace esta migración
-- -----------------------
--   a) Normaliza los NULL a `false` (sede) y deja la columna `not null`,
--      para que «sin marcar» y «de sede» sean la misma cosa de una vez por
--      todas y no dependan de un `coalesce` en cada consulta.
--   b) Agrega el índice que usan las dos vistas al listar por colección.
--
-- Lo que NO hace:
--   · No cambia el dominio de los libros existentes. Los que ya tenían
--     `es_bibliomovil = true` (marcados a mano o por el script de la 026)
--     siguen en el Bibliomóvil.
--   · No toca ninguna función. `buscar_libros()` se ajusta en
--     `010_consolidacion.sql`, que es la única definición viva de las
--     funciones del sistema (ver la cabecera de ese archivo).
-- ============================================================================

-- La columna la creó la 026. Se repite aquí de forma idempotente para que esta
-- migración también funcione sola —por ejemplo, pegada a mano en el editor SQL
-- de Supabase— en una base donde la 026 no se haya aplicado todavía. Si ya
-- existe, no hace nada.
alter table public.libros
  add column if not exists es_bibliomovil boolean default false;

alter table public.libros
  alter column es_bibliomovil set default false;

-- Las filas anteriores a la 026 quedaron en NULL. Sin esto, «sede»
-- (p_es_bibliomovil = false) no las devolvería nunca.
update public.libros set es_bibliomovil = false where es_bibliomovil is null;

alter table public.libros
  alter column es_bibliomovil set not null;

comment on column public.libros.es_bibliomovil is
  'true = ejemplar asignado al catálogo del Bibliomóvil (circula en la ruta). false = ejemplar del catálogo de la biblioteca (sede). Nunca NULL desde la migración 030.';

-- Las dos vistas listan filtrando por esta columna y ordenan por título; el
-- índice compuesto evita el recorrido completo de la tabla + ordenamiento.
create index if not exists libros_bibliomovil_titulo_idx
  on public.libros (es_bibliomovil, titulo);
```

---

## Paso 3 — Bloque 2: actualizar la función de búsqueda

```sql
-- ── buscar_libros ── (última versión: 007_correcciones_y_cumplimiento_legal.sql)
drop function if exists public.buscar_libros(text, int, int);
drop function if exists public.buscar_libros(text, int, int, boolean, text);
create or replace function public.buscar_libros(
  p_busqueda text default '', p_limite int default 50, p_desplazamiento int default 0,
  p_es_bibliomovil boolean default null, p_filtro_stock text default 'todos'
)
returns table (
  id bigint, isbn text, titulo text, autor text, genero text, ubicacion text,
  portada_url text, copias_totales int, stock int, dias_prestamo_override int,
  es_bibliomovil boolean, total_coincidencias bigint
)
language sql
stable
set search_path = public
as $$
  with filtrados as (
    select l.* from public.libros l
    where (p_busqueda is null or p_busqueda = ''
       or public.sin_acentos(l.titulo) like '%' || public.sin_acentos(p_busqueda) || '%'
       or public.sin_acentos(l.autor)  like '%' || public.sin_acentos(p_busqueda) || '%'
       or l.isbn like '%' || p_busqueda || '%')
      and (p_es_bibliomovil is null
           or coalesce(l.es_bibliomovil, false) = p_es_bibliomovil)
      and (p_filtro_stock = 'todos' or
          (p_filtro_stock = 'disponibles' and l.stock > 0) or
          (p_filtro_stock = 'prestados' and l.stock = 0))
  )
  select f.id::bigint, f.isbn::text, f.titulo::text, f.autor::text, f.genero::text,
         f.ubicacion::text, f.portada_url::text, f.copias_totales::int, f.stock::int,
         f.dias_prestamo_override::int, f.es_bibliomovil::boolean,
         (select count(*) from filtrados)::bigint
  from filtrados f
  order by f.titulo
  limit p_limite offset p_desplazamiento;
$$;
grant execute on function public.buscar_libros(text, int, int, boolean, text) to authenticated;
```

---

## Paso 4 — Avisar a la API que la función cambió

```sql
-- PostgREST mantiene un caché del esquema; sin esto, la aplicación puede seguir
-- llamando a la versión anterior durante unos minutos.
notify pgrst, 'reload schema';
```

---

## Paso 5 — Verificar que quedó bien

```sql
-- 1) Columna: tiene que quedar NOT NULL y sin ninguna fila en NULL
select is_nullable,
       column_default,
       (select count(*) from public.libros where es_bibliomovil is null) as filas_en_null
from information_schema.columns
where table_schema = 'public' and table_name = 'libros' and column_name = 'es_bibliomovil';

-- 2) Cada colección por separado (los números son los que debería ver la biblioteca)
select case when es_bibliomovil then 'Bibliomóvil' else 'Biblioteca (sede)' end as coleccion,
       count(*)   as titulos,
       coalesce(sum(stock), 0) as ejemplares_disponibles
from public.libros
group by 1
order by 1;

-- 3) Las mismas dos cuentas, pero pasando por la función que usa la aplicación
select (select count(*) from public.buscar_libros('', 100000, 0, false, 'todos')) as sede,
       (select count(*) from public.buscar_libros('', 100000, 0, true,  'todos')) as movil,
       (select count(*) from public.buscar_libros('', 100000, 0, null,  'todos')) as todas,
       (select count(*) from public.libros) as total;
```

Lo esperado: **sede + móvil = total** en la última consulta, `filas_en_null` en `0` y `is_nullable` en
`NO`. Si `sede + móvil` no da `total`, no sigas y avísame: significa que el bloque 1 no terminó de
normalizar.

---

## Paso 6 — Comprobar en la aplicación

1. Abre el sistema con una cuenta de administrador y entra a **Catálogo**: deben aparecer solo los
   ejemplares de la sede (sin los que tienen la insignia *Bibliomóvil*).
2. En la fila de un libro de la sede, usa **Al Bibliomóvil**; el libro sale del catálogo y aparece en
   **Bibliomóvil → Catálogo** con la insignia.
3. Prueba el camino de vuelta con **A la sede**.
4. Si el front-end todavía no tiene publicado este cambio (la insignia y el botón), el paso 6 no se
   verá: primero se publica el código y después se nota. El orden no importa para la base: la función
   acepta las dos formas de llamarla.

---

## Si algo sale mal (reversa)

El cambio no borra datos: la columna ya existía y la función solo cambió una comparación. Para volver
atrás alcanza con:

```sql
-- Deja la columna como estaba antes de la 030 (vuelve a admitir NULL)
alter table public.libros alter column es_bibliomovil drop not null;
drop index if exists public.libros_bibliomovil_titulo_idx;
```

y volver a crear `buscar_libros()` con el cuerpo anterior (el que estaba en el repositorio antes de
esta ronda, línea `and l.es_bibliomovil = p_es_bibliomovil`). Si hiciste respaldo antes de empezar,
restaurarlo es la vía más simple.

---

## Este documento está verificado

Los bloques de los pasos 2, 3 y 4 no son una transcripción a mano: la prueba
`pruebas/probar-despliegue-manual.py` los **lee de este mismo archivo**, arma una base PostgreSQL en el
estado anterior a esta ronda (migraciones 001–029 y la versión antigua de `buscar_libros()`),
reproduce el bug (un libro sin marcar no aparece en ninguna colección), los aplica uno por uno,
comprueba las consultas del paso 5 y verifica que pegarlos de nuevo no rompa nada. Corre también en
cada envío de código (`.github/workflows/pruebas.yml`, trabajo «Migraciones»).

```bash
python3 pruebas/probar-despliegue-manual.py    # 12 comprobaciones
```

Si alguna vez editas este documento, ejecuta esa prueba antes de compartirlo.

---

## Después de aplicar

- El cambio es compatible con el front-end viejo y con el nuevo, así que se puede publicar el sitio
  antes o después de este paso.
- Si además aplicas las migraciones por CLI, la `030` ya quedó registrada a mano: `supabase migration
  list --linked` puede no reconocerla. Es el mismo caso previsto en `MIGRACIONES.md` para las
  migraciones aplicadas a mano: verifica el esquema real y registra como aplicada solo esa versión
  (`supabase migration repair --status applied 030 --linked`).
