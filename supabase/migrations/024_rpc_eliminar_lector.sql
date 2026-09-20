-- Migración 020: RPC para eliminar lector
-- Pasa el borrado (y la anonimización por clave foránea) al servidor,
-- protegiendo la operación con SECURITY DEFINER y verificando rol de administrador,
-- lo que evita el fallo silencioso de RLS cuando un librero intentaba ejecutarlo.

create or replace function public.eliminar_lector(
    p_id uuid,
    p_motivo text default 'Derecho de supresión (ARCO)'
) returns void
language plpgsql
security definer
set search_path = public
as 
begin
    -- Verificar rol de administrador (evita el falso positivo de RLS)
    if not public.es_admin() then
        raise exception 'No autorizado';
    end if;

    begin
        delete from public.lectores where id = p_id;
    exception
        when foreign_key_violation then
            -- Si tiene historial (préstamos o reservas), lo anonimizamos
            -- en lugar de borrarlo, para mantener la integridad de los datos.
            update public.lectores
            set 
                nombre = 'Lector Eliminado',
                rut = 'Anonimizado-' || p_id::text || '-' || (extract(epoch from now()) * 1000)::bigint::text,
                email = null,
                telefono = null,
                motivo_bloqueo = p_motivo,
                bloqueado_manual = true
            where id = p_id;
    end;
end;
;
