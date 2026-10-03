-- ============================================================================
-- 027: Coordenadas y parada del Bibliomóvil en préstamos
-- ============================================================================
-- Agrega las columnas opcionales para registrar en qué parada del recorrido
-- del Bibliomóvil se efectuó cada préstamo y alimentar las estadísticas
-- geográficas de Reportes.
--
-- Siguiendo la regla de consolidación del proyecto (ver 010_consolidacion.sql
-- y MIGRACIONES.md), este archivo solo declara el cambio de esquema de forma
-- idempotente. La actualización de `public.prestar_libro` y la nueva función
-- `public.estadisticas_paradas` viven únicamente en `010_consolidacion.sql`.
-- ============================================================================

alter table public.prestamos
  add column if not exists parada_nombre text null,
  add column if not exists parada_lat numeric null,
  add column if not exists parada_lng numeric null;

comment on column public.prestamos.parada_nombre is
  'Nombre de la parada del Bibliomóvil donde se registró el préstamo (NULL cuando se presta en la sede fija).';
comment on column public.prestamos.parada_lat is
  'Latitud de la parada del Bibliomóvil al momento del préstamo.';
comment on column public.prestamos.parada_lng is
  'Longitud de la parada del Bibliomóvil al momento del préstamo.';
