-- Cero Agotados — catálogo maestro (entidad canónica de medicamentos)
-- ====================================================================
-- Los proveedores NO crean productos: activan ítems de este maestro y solo
-- les fijan precio (ver ofertas). Esto habilita comparar "manzana con manzana".
-- Escritura reservada al admin (gobernanza / curaduría = COO).

create table public.producto_maestro (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  principio_activo text,
  concentracion text,
  forma_farmaceutica text,      -- tableta, jarabe, ampolla, ...
  presentacion text,            -- "caja x 30 tabletas"
  laboratorio text,
  registro_sanitario text,      -- INVIMA
  codigo_barras text,
  categoria text,               -- analgésico, antibiótico, ...
  activo boolean not null default true,
  -- Vector de búsqueda (f1-buscar): nombre + principio activo + laboratorio.
  search_vector tsvector generated always as (
    to_tsvector(
      'spanish',
      coalesce(nombre, '') || ' ' ||
      coalesce(principio_activo, '') || ' ' ||
      coalesce(laboratorio, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_producto_search on public.producto_maestro using gin (search_vector);
create index idx_producto_nombre_trgm on public.producto_maestro using gin (nombre gin_trgm_ops);
create index idx_producto_categoria on public.producto_maestro (categoria);

create trigger trg_producto_updated before update on public.producto_maestro
  for each row execute function public.set_updated_at();

-- RLS: lo lee cualquier usuario autenticado; solo el admin escribe.
alter table public.producto_maestro enable row level security;

create policy producto_select on public.producto_maestro for select
  using (auth.uid() is not null);
create policy producto_admin_write on public.producto_maestro for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
