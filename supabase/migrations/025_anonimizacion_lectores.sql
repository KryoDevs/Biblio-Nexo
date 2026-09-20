alter table public.lectores add column if not exists anonimizado_en timestamptz null;  
comment on column public.lectores.anonimizado_en is 'Fecha en que el lector fue eliminado/anonimizado conservando su historial por integridad referencial (PGRST foreign_key_violation).'; 
