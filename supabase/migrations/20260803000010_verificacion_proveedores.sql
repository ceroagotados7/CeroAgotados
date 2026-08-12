-- Cero Agotados — verificación/aprobación de organizaciones (gate "on live")
-- ==========================================================================
-- Un proveedor recién registrado queda EN REVISIÓN: puede armar su catálogo,
-- pero sus ofertas NO aparecen para las farmacias hasta que el equipo admin
-- lo apruebe. El admin puede aprobar, rechazar (con motivo) o suspender a un
-- proveedor ya activo. Toda decisión queda en una bitácora auditable.

create type public.org_estado_verificacion as enum (
  'en_revision',  -- registrado, pendiente de decisión del admin
  'aprobado',     -- "on live": sus ofertas entran a la comparación
  'rechazado',    -- no cumplió requisitos (motivo obligatorio)
  'suspendido'    -- estaba activo y el admin lo bajó del aire (motivo obligatorio)
);

alter table public.organizaciones
  add column estado_verificacion public.org_estado_verificacion not null default 'en_revision',
  add column motivo_decision text;

-- Backfill: lo ya verificado (seed) queda aprobado; las farmacias no pasan por
-- revisión por ahora (la puerta aplica a proveedores).
update public.organizaciones set estado_verificacion = 'aprobado'
  where verificado = true or tipo = 'farmacia';

-- Bitácora de decisiones sobre organizaciones (auditoría del admin).
create table public.organizacion_eventos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  actor_id uuid references auth.users (id),
  tipo text not null,          -- 'registrada', 'aprobado', 'rechazado', 'suspendido'
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_org_eventos on public.organizacion_eventos (organizacion_id, created_at);

alter table public.organizacion_eventos enable row level security;
create policy org_eventos_select on public.organizacion_eventos for select
  using (public.is_org_member(organizacion_id) or public.is_platform_admin());

grant select on public.organizacion_eventos to authenticated;
revoke insert, update, delete on public.organizacion_eventos from authenticated, anon;
