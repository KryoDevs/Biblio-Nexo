-- ============================================================================
-- 028: Reparar sobrecarga de prestar_libro e índice para estadísticas de paradas
-- ============================================================================
-- 1. Asegura de forma idempotente las columnas de geolocalización de préstamos.
-- 2. Elimina la firma antigua de 2 parámetros `public.prestar_libro(bigint, text)`
--    si quedó conviviendo con la firma de 5 parámetros (3 con DEFAULT NULL),
--    evitando el error `function public.prestar_libro(integer, unknown) is not unique`
--    y el estado `DUPLICADA` en `public.verificar_definiciones()`.
-- 3. Crea un índice parcial sobre `prestamos(parada_nombre)` para que el
--    agrupamiento de `public.estadisticas_paradas()` no requiera recorrer préstamos
--    de la sede fija (donde `parada_nombre` es NULL).
--
-- NOTA: Si aplicas migraciones manualmente en el SQL Editor de Supabase,
-- ejecuta después `010_consolidacion.sql` para asegurar que `prestar_libro` y
-- `estadisticas_paradas` queden en su versión consolidada con `manifiesto_funciones()`.
-- ============================================================================

alter table public.prestamos
  add column if not exists parada_nombre text null,
  add column if not exists parada_lat numeric null,
  add column if not exists parada_lng numeric null;

drop function if exists public.prestar_libro(bigint, text);

create index if not exists idx_prestamos_parada_nombre
  on public.prestamos (parada_nombre)
  where parada_nombre is not null;
