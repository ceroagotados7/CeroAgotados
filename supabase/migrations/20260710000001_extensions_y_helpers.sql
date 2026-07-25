-- Cero Agotados — extensiones y utilidades base
-- ================================================

-- Búsqueda difusa/por prefijo del catálogo maestro (f1-buscar).
create extension if not exists pg_trgm;
-- Normaliza acentos para búsquedas ("ibuprofeno" ~ "ibuprofén").
create extension if not exists unaccent;

-- Trigger genérico: mantiene updated_at en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
