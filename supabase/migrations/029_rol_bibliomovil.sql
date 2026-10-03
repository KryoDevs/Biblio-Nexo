-- ============================================================================
-- 029: Rol operativo «bibliomóvil»
-- ============================================================================
-- El personal de ruta necesita un rol propio, distinto del librero de sede:
-- opera el mapa, el catálogo móvil, el mesón en parada y los lectores, pero
-- no administra el sistema ni ve reportes institucionales.
--
-- La función RPC `asignar_rol` se actualiza en `010_consolidacion.sql`
-- (fuente única de las funciones). Esta migración solo fija el dominio de
-- `public.usuarios.rol` para que ni un upsert directo acepte valores
-- inventados.
--
-- En bases ya desplegadas: aplica esta migración y vuelve a ejecutar
-- `010_consolidacion.sql` para que `asignar_rol` acepte el nuevo valor.
-- El Edge Function `invitar-personal` también debe redesplegarse.
-- ============================================================================

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('admin', 'librero', 'bibliomovil'));
