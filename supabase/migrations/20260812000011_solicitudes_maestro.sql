-- Cero Agotados — solicitudes de medicamentos para el catálogo maestro
-- ====================================================================
-- La base centralizada la cura la plataforma. Cuando la carga masiva de un
-- proveedor trae medicamentos SIN match contra el maestro, quedan registrados
-- aquí como solicitudes: el admin las revisa y decide agregarlas al maestro
-- (creando el producto canónico) o descartarlas. Así el maestro crece curado.

create type public.solicitud_estado as enum ('pendiente', 'agregada', 'descartada');

create table public.solicitudes_maestro (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  solicitado_por uuid references auth.users (id),
  -- Texto tal cual lo escribió el proveedor en su archivo.
  nombre text not null,
  presentacion text,
  unidades text,
  estado public.solicitud_estado not null default 'pendiente',
  -- Decisión del admin.
  decidido_por uuid references auth.users (id),
  motivo_decision text,
  producto_creado_id uuid references public.producto_maestro (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_solicitudes_estado on public.solicitudes_maestro (estado, created_at desc);
create index idx_solicitudes_org on public.solicitudes_maestro (organizacion_id);

create trigger trg_solicitudes_updated before update on public.solicitudes_maestro
  for each row execute function public.set_updated_at();

alter table public.solicitudes_maestro enable row level security;
-- El proveedor ve las suyas; el admin todas. Escribe solo el backend.
create policy solicitudes_select on public.solicitudes_maestro for select
  using (public.is_org_member(organizacion_id) or public.is_platform_admin());

grant select on public.solicitudes_maestro to authenticated;
revoke insert, update, delete on public.solicitudes_maestro from authenticated, anon;
