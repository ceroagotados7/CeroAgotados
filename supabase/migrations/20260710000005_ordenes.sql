-- Cero Agotados — órdenes, ítems (con aceptación parcial / sustitución) y eventos
-- ===============================================================================
-- Una orden = una farmacia compra a UN proveedor (regla de UX "una orden por
-- proveedor", f4-pedido). El proveedor la revisa y puede aceptar total o
-- parcialmente, o sustituir un ítem sin stock (p6, f6). El precio de cada ítem
-- se CONGELA al crear la orden (precio_unitario_snapshot) — nunca se relee el
-- precio en vivo de una oferta que pudo cambiar.

create type public.orden_estado as enum (
  'pendiente',        -- creada por la farmacia, el proveedor aún no responde
  'aceptada_parcial', -- el proveedor aceptó algunos ítems / cantidades
  'aceptada_total',   -- el proveedor aceptó todo lo solicitado
  'rechazada',        -- el proveedor rechazó la orden completa
  'despachada',       -- el proveedor despachó lo aceptado
  'completada',       -- recibida/cerrada
  'cancelada'         -- cancelada (por la farmacia mientras estaba pendiente)
);

create type public.item_estado as enum (
  'pendiente', 'aceptado', 'rechazado', 'sustituido'
);

create table public.ordenes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,   -- legible: "ORD-0001"
  farmacia_id uuid not null references public.organizaciones (id) on delete restrict,
  proveedor_id uuid not null references public.organizaciones (id) on delete restrict,
  estado public.orden_estado not null default 'pendiente',
  total numeric(12, 2) not null default 0,  -- total ACEPTADO (se recalcula)
  notas text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_ordenes_proveedor on public.ordenes (proveedor_id, created_at desc);
create index idx_ordenes_farmacia on public.ordenes (farmacia_id, created_at desc);
create index idx_ordenes_estado on public.ordenes (estado);

create table public.orden_items (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete cascade,
  oferta_id uuid not null references public.ofertas (id) on delete restrict,
  producto_maestro_id uuid not null references public.producto_maestro (id) on delete restrict,
  precio_unitario_snapshot numeric(12, 2) not null,  -- CONGELADO al crear la orden
  cantidad_solicitada integer not null check (cantidad_solicitada > 0),
  cantidad_aceptada integer not null default 0 check (cantidad_aceptada >= 0),
  estado_item public.item_estado not null default 'pendiente',
  -- Sustitución por falta de stock (f6): apunta a otro producto/oferta.
  producto_sustituto_id uuid references public.producto_maestro (id),
  oferta_sustituto_id uuid references public.ofertas (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_aceptada_no_excede check (cantidad_aceptada <= cantidad_solicitada)
);
create index idx_orden_items_orden on public.orden_items (orden_id);

-- Bitácora de eventos de la orden (alimenta métricas del admin sin tocar las
-- tablas transaccionales). La escribe la API en cada cambio de estado.
create table public.orden_eventos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes (id) on delete cascade,
  actor_id uuid references auth.users (id),
  tipo text not null,          -- 'creada', 'aceptada_parcial', 'despachada', ...
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_orden_eventos_orden on public.orden_eventos (orden_id, created_at);

create trigger trg_ordenes_updated before update on public.ordenes
  for each row execute function public.set_updated_at();
create trigger trg_orden_items_updated before update on public.orden_items
  for each row execute function public.set_updated_at();

-- Helper: ¿el usuario actual puede acceder a esta orden? (farmacia dueña,
-- proveedor destinatario o admin). SECURITY DEFINER para evitar recursión RLS.
create or replace function public.can_access_orden(o uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.ordenes ord
    where ord.id = o
      and (
        public.is_platform_admin()
        or public.is_org_member(ord.farmacia_id)
        or public.is_org_member(ord.proveedor_id)
      )
  );
$$;

-- RLS
alter table public.ordenes enable row level security;
alter table public.orden_items enable row level security;
alter table public.orden_eventos enable row level security;

-- ordenes: las ve la farmacia dueña, el proveedor destinatario o el admin.
create policy ordenes_select on public.ordenes for select
  using (
    public.is_org_member(farmacia_id)
    or public.is_org_member(proveedor_id)
    or public.is_platform_admin()
  );
-- La farmacia crea sus órdenes; el proveedor las gestiona (aceptar/despachar).
create policy ordenes_insert on public.ordenes for insert
  with check (public.is_org_member(farmacia_id));
create policy ordenes_update on public.ordenes for update
  using (public.is_org_member(proveedor_id) or public.is_platform_admin());

-- ítems y eventos: visibles/gestionables según acceso a la orden padre.
create policy orden_items_select on public.orden_items for select
  using (public.can_access_orden(orden_id));
create policy orden_items_update on public.orden_items for update
  using (public.can_access_orden(orden_id));

create policy orden_eventos_select on public.orden_eventos for select
  using (public.can_access_orden(orden_id));
