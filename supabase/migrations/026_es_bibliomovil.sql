-- Migración 026: Columna booleana para el Bibliomóvil
-- Evita depender de `ubicacion ilike '%bibliom%'`, que es susceptible a typos (Punto 8).
alter table public.libros add column if not exists es_bibliomovil boolean default false;
update public.libros set es_bibliomovil = true where ubicacion ilike '%bibliom%';
