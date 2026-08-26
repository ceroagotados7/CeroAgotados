-- Cero Agotados — búsqueda tolerante a tildes y errores de tecleo
-- ================================================================
-- Quien busca un medicamento escribe "acetaminofen", no "Acetaminofén", y a
-- veces se come una letra. Antes de esta migración "acetaminofen" devolvía
-- 0 resultados de 150 posibles: la búsqueda comparaba el texto tal cual.
--
-- La solución es materializar una versión normalizada (sin tildes, en
-- minúsculas) de los campos buscables e indexarla con trigramas, para poder
-- comparar por parecido además de por contenido literal.

-- unaccent() es STABLE, no IMMUTABLE, así que no sirve en columnas generadas ni
-- en índices. Este envoltorio fija el diccionario y la vuelve indexable.
create or replace function public.f_unaccent(texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select public.unaccent('public.unaccent', texto)
$$;

comment on function public.f_unaccent is
  'unaccent() indexable (IMMUTABLE): quita tildes y diacríticos para búsquedas.';

alter table public.producto_maestro
  add column if not exists nombre_norm text
    generated always as (public.f_unaccent(lower(coalesce(nombre, '')))) stored,
  add column if not exists principio_norm text
    generated always as (public.f_unaccent(lower(coalesce(principio_activo, '')))) stored,
  -- Un solo campo con todo lo buscable: contra este se mide el parecido cuando
  -- el usuario escribe mal y ninguna coincidencia literal funciona.
  add column if not exists busqueda_norm text
    generated always as (
      public.f_unaccent(lower(
        coalesce(nombre, '') || ' ' ||
        coalesce(principio_activo, '') || ' ' ||
        coalesce(laboratorio, '')
      ))
    ) stored;

comment on column public.producto_maestro.busqueda_norm is
  'Nombre + principio activo + laboratorio, sin tildes y en minúsculas. '
  'Alimenta la búsqueda tolerante a errores de tecleo.';

create index if not exists idx_producto_busqueda_norm_trgm
  on public.producto_maestro using gin (busqueda_norm gin_trgm_ops);

create index if not exists idx_producto_nombre_norm_trgm
  on public.producto_maestro using gin (nombre_norm gin_trgm_ops);

create index if not exists idx_producto_principio_norm_trgm
  on public.producto_maestro using gin (principio_norm gin_trgm_ops);
