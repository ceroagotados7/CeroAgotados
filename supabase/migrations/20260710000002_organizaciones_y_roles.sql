-- Cero Agotados — identidad: perfiles, organizaciones, membresías y roles
-- =======================================================================
-- Modelo: proveedor y farmacia son ORGANIZACIONES (empresas), no usuarios
-- sueltos. Un usuario pertenece a una organización vía miembros_organizacion
-- (permite equipos a futuro sin rediseño). El admin es rol de plataforma.

create type public.org_tipo as enum ('proveedor', 'farmacia');

-- Perfil que extiende auth.users (Supabase Auth es la fuente de identidad).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text,
  telefono text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizaciones (
  id uuid primary key default gen_random_uuid(),
  tipo public.org_tipo not null,
  razon_social text not null,
  nit text unique,
  ciudad text,
  verificado boolean not null default false,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.miembros_organizacion (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  rol text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (user_id, organizacion_id)
);
create index idx_miembros_user on public.miembros_organizacion (user_id);
create index idx_miembros_org on public.miembros_organizacion (organizacion_id);

create table public.roles_plataforma (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rol text not null default 'admin',
  created_at timestamptz not null default now()
);

-- updated_at triggers
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_organizaciones_updated before update on public.organizaciones
  for each row execute function public.set_updated_at();

-- Al crear un usuario en Auth, se crea su perfil automáticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de autorización (SECURITY DEFINER: evitan recursión de RLS al
-- consultar estas tablas desde las policies de otras tablas).
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.roles_plataforma r where r.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.miembros_organizacion m
    where m.user_id = auth.uid() and m.organizacion_id = org
  );
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.organizaciones enable row level security;
alter table public.miembros_organizacion enable row level security;
alter table public.roles_plataforma enable row level security;

-- profiles: cada quien ve/edita el suyo; admin ve todos.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_platform_admin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid());

-- organizaciones: sus miembros la ven; admin ve todas. Un usuario autenticado
-- puede crear una (onboarding). Editar: miembros o admin.
create policy organizaciones_select on public.organizaciones for select
  using (public.is_org_member(id) or public.is_platform_admin());
create policy organizaciones_insert on public.organizaciones for insert
  with check (auth.uid() is not null);
create policy organizaciones_update on public.organizaciones for update
  using (public.is_org_member(id) or public.is_platform_admin());

-- miembros: cada quien ve sus membresías y las de sus organizaciones; se
-- agrega a sí mismo (onboarding); admin ve todo.
create policy miembros_select on public.miembros_organizacion for select
  using (
    user_id = auth.uid()
    or public.is_org_member(organizacion_id)
    or public.is_platform_admin()
  );
create policy miembros_insert on public.miembros_organizacion for insert
  with check (user_id = auth.uid());

-- roles_plataforma: cada quien ve el suyo; admin ve todos. Se siembra por servidor.
create policy roles_select on public.roles_plataforma for select
  using (user_id = auth.uid() or public.is_platform_admin());
