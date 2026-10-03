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
