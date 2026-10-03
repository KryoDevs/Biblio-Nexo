-- Migración 027: Agregar ubicación a préstamos
-- Permite guardar el nombre de la parada y sus coordenadas en el momento del préstamo
-- para poder generar reportes geográficos del Bibliomóvil.

ALTER TABLE public.prestamos ADD COLUMN parada_nombre TEXT DEFAULT NULL;
ALTER TABLE public.prestamos ADD COLUMN parada_lat NUMERIC(10, 7) DEFAULT NULL;
ALTER TABLE public.prestamos ADD COLUMN parada_lng NUMERIC(10, 7) DEFAULT NULL;

-- Actualizar la función prestar_libro para aceptar los nuevos parámetros opcionales
DROP FUNCTION IF EXISTS public.prestar_libro(bigint, text);
DROP FUNCTION IF EXISTS public.prestar_libro(bigint, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.prestar_libro(
  p_libro_id bigint, 
  p_lector_rut text, 
  p_parada_nombre text DEFAULT NULL, 
  p_parada_lat numeric DEFAULT NULL, 
  p_parada_lng numeric DEFAULT NULL
)
RETURNS TABLE (prestamo_id bigint, fecha_devolucion_esperada date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lector_id bigint;
  v_stock int;
  v_override int;
  v_prestamo_id bigint;
  v_hoy date := public.hoy_chile();
  v_dias int;
  v_estado record;
BEGIN
  IF NOT public.es_personal() THEN
    RAISE EXCEPTION 'Debes iniciar sesión para registrar un préstamo.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_lector_id FROM public.lectores WHERE rut = p_lector_rut;
  IF v_lector_id IS NULL THEN
    RAISE EXCEPTION 'RUT no encontrado.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(v_lector_id);

  SELECT * INTO v_estado FROM public.estado_lector(p_lector_rut);
  IF NOT v_estado.puede_prestar THEN
    RAISE EXCEPTION '%', v_estado.motivo_rechazo USING ERRCODE = 'P0001';
  END IF;

  SELECT stock, dias_prestamo_override INTO v_stock, v_override FROM public.libros WHERE id = p_libro_id FOR UPDATE;
  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Libro no encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_override = 0 THEN
    RAISE EXCEPTION 'Este material es de referencia y no circula.' USING ERRCODE = 'P0001';
  END IF;
  IF v_stock < 1 THEN
    RAISE EXCEPTION 'No hay ejemplares disponibles de este libro.' USING ERRCODE = 'P0001';
  END IF;

  v_dias := COALESCE(v_override, public.parametro_int('dias_prestamo', 7));

  UPDATE public.libros SET stock = stock - 1 WHERE id = p_libro_id;

  INSERT INTO public.prestamos (libro_id, lector_id, fecha_prestamo, fecha_devolucion_esperada, estado, parada_nombre, parada_lat, parada_lng)
  VALUES (p_libro_id, v_lector_id, v_hoy, v_hoy + v_dias, 'activo', p_parada_nombre, p_parada_lat, p_parada_lng)
  RETURNING id INTO v_prestamo_id;

  RETURN QUERY SELECT v_prestamo_id, v_hoy + v_dias;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prestar_libro(bigint, text, text, numeric, numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.estadisticas_paradas()
RETURNS TABLE (parada_nombre text, cantidad bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT p.parada_nombre, COUNT(*) as cantidad
    FROM public.prestamos p
    WHERE p.parada_nombre IS NOT NULL
    GROUP BY p.parada_nombre
    ORDER BY cantidad DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.estadisticas_paradas() TO authenticated;
