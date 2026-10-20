-- ============================================================================
-- 031: Clave de operación para reintentos idempotentes de circulación
-- ============================================================================
-- Problema que resuelve
-- ---------------------
-- La cola sin conexión (SyncQueue, ver src/js/modules/db.js) reintenta tal
-- cual la llamada que falló. Eso es seguro mientras el fallo signifique "el
-- servidor nunca se enteró", pero hay un caso en que no se puede saber: el
-- tiempo límite del cliente (conTiempoLimite, 15 s). Si el servidor SÍ
-- alcanzó a registrar el préstamo pero la respuesta tardó más que eso, el
-- cliente lo encola igual — y al reconectar, el reintento creaba un SEGUNDO
-- préstamo fantasma (con stock, es invisible hasta que el inventario no
-- cuadra), consumía una renovación extra, o dejaba un aviso falso de
-- "ya fue devuelto" en Diagnóstico.
--
-- Qué hace esta migración
-- ------------------------
-- Agrega tres columnas opcionales a `prestamos` para guardar la clave
-- (UUID) que el cliente asigna a cada operación ANTES del primer intento y
-- reusa en cada reintento:
--
--   · clave_operacion           — la del préstamo (prestar_libro)
--   · clave_ultima_renovacion   — la de la última renovación aplicada
--   · clave_devolucion          — la de la devolución aplicada
--
-- más un índice único parcial sobre `clave_operacion`: es la garantía de
-- última línea de que un préstamo no puede nacer dos veces con la misma
-- clave, ni siquiera si dos reintentos llegaran a la vez.
--
-- Lo que NO hace:
--   · No toca ninguna función. prestar_libro(), renovar_prestamo() y
--     devolver_prestamo() aprenden a usar la clave en
--     010_consolidacion.sql, que sigue siendo la única definición viva.
--   · No exige la clave a nadie: las columnas admiten NULL y el parámetro
--     nuevo de las funciones es opcional, así que cualquier cliente que no
--     la mande se comporta exactamente como antes.
--
-- Orden de aplicación en una base ya desplegada:
--   1. Aplicar esta migración (031).
--   2. Volver a ejecutar 010_consolidacion.sql (trae las firmas nuevas).
--   3. Recién entonces publicar el front-end que manda la clave. Si el
--      orden se invierte, no se rompe nada: el cliente detecta que la
--      función con clave aún no existe y reintenta sin ella (se pierde la
--      idempotencia hasta aplicar el SQL, no la circulación).
-- ============================================================================

alter table public.prestamos
  add column if not exists clave_operacion uuid null,
  add column if not exists clave_ultima_renovacion uuid null,
  add column if not exists clave_devolucion uuid null;

comment on column public.prestamos.clave_operacion is
  'Clave de idempotencia del préstamo: la genera el cliente antes del primer intento y la reusa en cada reintento sin conexión. Repetir prestar_libro() con la misma clave devuelve este préstamo en vez de crear otro (ver 010_consolidacion.sql).';
comment on column public.prestamos.clave_ultima_renovacion is
  'Clave de idempotencia de la última renovación aplicada: repetir renovar_prestamo() con la misma clave no renueva de nuevo.';
comment on column public.prestamos.clave_devolucion is
  'Clave de idempotencia de la devolución aplicada: repetir devolver_prestamo() con la misma clave no es un error.';

-- Un préstamo por clave, como máximo. Parcial: los préstamos sin clave
-- (históricos, o de clientes que no la mandan) no participan.
create unique index if not exists prestamos_clave_operacion_uq
  on public.prestamos (clave_operacion)
  where clave_operacion is not null;
