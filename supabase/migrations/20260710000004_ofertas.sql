-- Cero Agotados — ofertas (el "catálogo del proveedor") e historial de precios
-- ============================================================================
-- Una oferta = un proveedor pone precio y stock a un ítem del catálogo maestro.
-- Es la tabla que alimenta la comparación por precio (f2-comparar) y el
-- catálogo del proveedor (p2-catalogo, p3-agregar).

create table public.ofertas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  producto_maestro_id uuid not null references public.producto_maestro (id) on delete restrict,
  precio numeric(12, 2) not null check (precio > 0),
  stock_disponible integer not null default 0 check (stock_disponible >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un proveedor tiene UNA oferta por producto (no duplica el mismo ítem).
  unique (organizacion_id, producto_maestro_id)
);
create index idx_ofertas_org on public.ofertas (organizacion_id);
create index idx_ofertas_producto on public.ofertas (producto_maestro_id);
-- Para f2-comparar: por producto, ofertas activas ordenadas por precio.
create index idx_ofertas_comparar on public.ofertas (producto_maestro_id, precio) where activo;

create trigger trg_ofertas_updated before update on public.ofertas
  for each row execute function public.set_updated_at();

-- Auditoría de cambios de precio (trazabilidad pedida para métricas del admin).
-- La escribe la API (FastAPI) al cambiar un precio; aquí solo el contenedor + RLS.
create table public.historial_precios (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas (id) on delete cascade,
  precio_anterior numeric(12, 2),
  precio_nuevo numeric(12, 2) not null,
  cambiado_por uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index idx_historial_oferta on public.historial_precios (oferta_id, created_at desc);

-- RLS
alter table public.ofertas enable row level security;
alter table public.historial_precios enable row level security;

-- ofertas: lectura amplia (autenticados) para poder comparar precios entre
-- proveedores; escritura solo del proveedor dueño (o admin).
create policy ofertas_select on public.ofertas for select
  using (auth.uid() is not null);
create policy ofertas_owner_write on public.ofertas for all
  using (public.is_org_member(organizacion_id) or public.is_platform_admin())
  with check (public.is_org_member(organizacion_id) or public.is_platform_admin());

-- historial: lo ve el proveedor dueño de la oferta o el admin.
create policy historial_select on public.historial_precios for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.ofertas o
      where o.id = historial_precios.oferta_id
        and public.is_org_member(o.organizacion_id)
    )
  );
