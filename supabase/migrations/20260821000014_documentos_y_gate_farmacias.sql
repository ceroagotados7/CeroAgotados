-- Cero Agotados — Verificación documental + gate de aprobación para farmacias
-- ===========================================================================
-- Regla dura del fundador (2026-08-21): NINGUNA organización sin aprobar puede
-- vender ni comprar. El gate ya existía para proveedores (migración 10); ahora
-- las farmacias también nacen en revisión (lo fija el onboarding en la API) y
-- ambas suben su documentación legal: Cámara de comercio actualizada (PDF),
-- NIT/RUT y cédula del representante legal. El flujo es NO bloqueante para
-- entrar: la organización inicia sesión y navega, pero no transacciona hasta
-- que el admin la aprueba (revisando los documentos desde su bandeja).

-- --------------------------------------------------------------------------
-- Documentos de verificación (metadatos; el archivo vive en Storage)
-- --------------------------------------------------------------------------

create type public.doc_verificacion_tipo as enum (
  'camara_comercio',        -- Cámara de comercio actualizada (≤ 3 meses), PDF
  'nit_rut',                -- NIT / RUT (persona natural o jurídica)
  'cedula_representante'    -- Cédula de ciudadanía del representante legal
);

-- Estado POR DOCUMENTO: el admin puede marcar cada uno al revisarlo.
create type public.doc_verificacion_estado as enum (
  'subido',     -- cargado por la organización, pendiente de revisión
  'aprobado',   -- el admin lo validó
  'rechazado'   -- el admin lo devolvió (motivo obligatorio); debe re-subirse
);

create table public.documentos_verificacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  tipo public.doc_verificacion_tipo not null,
  estado public.doc_verificacion_estado not null default 'subido',
  motivo_rechazo text,
  storage_path text not null,      -- ruta en el bucket documentos-verificacion
  nombre_archivo text not null,    -- nombre original del archivo subido
  mime text not null,
  tamano_bytes integer not null check (tamano_bytes > 0),
  subido_por uuid references auth.users (id),
  revisado_por uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un documento vigente por tipo y organización (re-subir REEMPLAZA).
  unique (organizacion_id, tipo)
);

create index idx_docs_verificacion_org on public.documentos_verificacion (organizacion_id);

create trigger trg_docs_verificacion_updated
  before update on public.documentos_verificacion
  for each row execute function public.set_updated_at();

-- RLS: la organización lee lo suyo; el admin lee todo. Las ESCRITURAS quedan
-- revocadas para authenticated/anon: solo la API (service role) muta, igual
-- que el resto de tablas transaccionales (patrón lockdown, migración 8).
alter table public.documentos_verificacion enable row level security;
create policy docs_verificacion_select on public.documentos_verificacion for select
  using (public.is_org_member(organizacion_id) or public.is_platform_admin());

grant select on public.documentos_verificacion to authenticated;
revoke insert, update, delete on public.documentos_verificacion from authenticated, anon;

-- --------------------------------------------------------------------------
-- Bucket privado de Storage
-- --------------------------------------------------------------------------
-- Sin policies sobre storage.objects: RLS niega por defecto a authenticated y
-- anon, y solo el service role (la API) sube, firma URLs y borra. El acceso de
-- lectura llega por URLs firmadas de corta vida que emite la API con scoping.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-verificacion',
  'documentos-verificacion',
  false,
  10485760,  -- 10 MB por archivo
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
