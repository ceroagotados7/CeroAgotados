-- Cero Agotados — datos semilla para desarrollo LOCAL
-- ===================================================
-- Se corre con cada `supabase db reset`. Crea usuarios de prueba, organizaciones,
-- ofertas y algunas órdenes dirigidas al "Proveedor 1" para poder probar el
-- flujo completo del proveedor (p4-ordenes, p6-orden-detalle).
--
-- NO crea medicamentos: los toma del catálogo maestro REAL por `fuente_ref`
-- (ver la sección de catálogo más abajo). Requiere el maestro ya cargado.
--
-- Usuarios de prueba (password para todos: "password123"):
--   admin@cero.test        · admin de plataforma
--   proveedor1@cero.test   · Proveedor 1 (Distribuidora Nacional)  ← foco de pruebas
--   proveedor2@cero.test   · Proveedor 2 (FarmaDistribución)
--   farmacia1@cero.test    · Farmacia 1 (Droguería La Salud)

begin;

-- pgcrypto para hashear contraseñas de los usuarios semilla.
create extension if not exists pgcrypto;

-- ---------- Usuarios de Auth ----------
-- El trigger handle_new_user crea el profile automáticamente.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '0000000c-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@cero.test',      crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Admin Plataforma"}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0000000d-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'proveedor1@cero.test', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Ana Proveedora"}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0000000d-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'proveedor2@cero.test', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Beto Proveedor"}', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '0000000e-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'farmacia1@cero.test',  crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"nombre":"Carla Farmacéutica"}', '', '', '', '');

-- Identidad de email (requerida por GoTrue para login por email).
insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
values
  (gen_random_uuid(), '0000000c-0000-0000-0000-000000000001', '0000000c-0000-0000-0000-000000000001', '{"sub":"0000000c-0000-0000-0000-000000000001","email":"admin@cero.test"}',      'email', now(), now()),
  (gen_random_uuid(), '0000000d-0000-0000-0000-000000000001', '0000000d-0000-0000-0000-000000000001', '{"sub":"0000000d-0000-0000-0000-000000000001","email":"proveedor1@cero.test"}', 'email', now(), now()),
  (gen_random_uuid(), '0000000d-0000-0000-0000-000000000002', '0000000d-0000-0000-0000-000000000002', '{"sub":"0000000d-0000-0000-0000-000000000002","email":"proveedor2@cero.test"}', 'email', now(), now()),
  (gen_random_uuid(), '0000000e-0000-0000-0000-000000000001', '0000000e-0000-0000-0000-000000000001', '{"sub":"0000000e-0000-0000-0000-000000000001","email":"farmacia1@cero.test"}',  'email', now(), now());

-- ---------- Roles y organizaciones ----------
insert into public.roles_plataforma (user_id, rol)
values ('0000000c-0000-0000-0000-000000000001', 'admin');

insert into public.organizaciones (id, tipo, razon_social, nit, ciudad, verificado)
values
  ('0000000a-0000-0000-0000-000000000001', 'proveedor', 'Distribuidora Nacional Farmacéutica', '900111222-1', 'Bogotá', true),
  ('0000000a-0000-0000-0000-000000000002', 'proveedor', 'FarmaDistribución S.A.S.',            '900333444-2', 'Medellín', true),
  ('0000000b-0000-0000-0000-000000000001', 'farmacia',  'Droguería La Salud',                  '901555666-3', 'Bogotá', true);

insert into public.miembros_organizacion (user_id, organizacion_id, rol)
values
  ('0000000d-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001', 'owner'),
  ('0000000d-0000-0000-0000-000000000002', '0000000a-0000-0000-0000-000000000002', 'owner'),
  ('0000000e-0000-0000-0000-000000000001', '0000000b-0000-0000-0000-000000000001', 'owner');


-- ---------- Catálogo: PRODUCTOS REALES del maestro ----------
-- Antes este seed INVENTABA 24 medicamentos ("Omeprazol 20mg" de MK, etc.).
-- Decisión del fundador (2026-09-11): en una plataforma farmacéutica no puede
-- existir un medicamento inventado, ni siquiera como dato de prueba. El seed
-- ahora SELECCIONA productos reales del catálogo maestro (Farmalium + CUM
-- INVIMA) por `fuente_ref`, que es la llave única y estable de la carga.
--
-- No se eligieron al azar: cada uno ejercita algo que el equipo reportó roto.
--
--   53228/53231/53229  Torrox 90/60/120 mg — la concentración NO está en el
--                      nombre; es el caso exacto del reporte del 11-sep.
--   23771              Cindimizol 150 mg — el caso del inventario del proveedor.
--   34894 / 43393      Aircys y Airmax — categoría de 67 caracteres y forma
--                      farmacéutica larguísima: el caso "información tapada".
--   55073              Acetaminofén 500 mg — nombre IGUAL a la molécula, para
--                      que el bloque de identidad no la repita.
--   100164             Omeprazol — se deja en stock 0 para probar sustitución.
--   13000              Cetirizina — deliberadamente NO ofertada por Proveedor 1.
--
-- REQUISITO: el catálogo maestro debe estar cargado antes de correr este seed.
do $$
begin
  if (select count(*) from public.producto_maestro where fuente = 'farmalium') = 0 then
    raise exception 'Catálogo maestro vacío: carga el maestro real antes del seed.';
  end if;
end $$;

create temporary table _seed_prod (ref text primary key, id uuid);
insert into _seed_prod (ref, id)
select v.ref, pm.id
from (values
  ('53228'), ('53231'), ('53229'), ('23771'), ('55073'), ('345'),
  ('34894'), ('43393'), ('49325'), ('107701'), ('101720'), ('102545'),
  ('13000'), ('100317'), ('109609'), ('102317'), ('100329'), ('100164')
) as v(ref)
join public.producto_maestro pm on pm.fuente = 'farmalium' and pm.fuente_ref = v.ref;

-- ---------- Ofertas de cada proveedor (precio + stock) ----------
-- Proveedor 1: catálogo amplio. Omeprazol en 0 (agotado real) y sin Cetirizina.
insert into public.ofertas (organizacion_id, producto_maestro_id, precio, stock_disponible)
select '0000000a-0000-0000-0000-000000000001', p.id, v.precio, v.stock
from (values
  ('53228', 48900, 300), ('53231', 39500, 250), ('53229', 56200, 180),
  ('23771', 18700, 140), ('55073', 8500, 800), ('345', 6900, 200),
  ('34894', 23400, 90),  ('43393', 41800, 60),  ('49325', 26500, 220),
  ('107701', 14300, 150), ('101720', 31200, 110), ('102545', 19800, 130),
  ('100317', 9600, 400), ('109609', 7400, 500), ('102317', 21500, 260),
  ('100329', 8800, 350), ('100164', 12900, 0)
) as v(ref, precio, stock)
join _seed_prod p on p.ref = v.ref;

-- Proveedor 2: catálogo parcial; algunos precios mejores y otros peores, para
-- que la comparación de la farmacia tenga de dónde elegir.
insert into public.ofertas (organizacion_id, producto_maestro_id, precio, stock_disponible)
select '0000000a-0000-0000-0000-000000000002', p.id, v.precio, v.stock
from (values
  ('53228', 47200, 200), ('53231', 41000, 160), ('23771', 19500, 100),
  ('55073', 8100, 600),  ('34894', 22800, 120), ('49325', 27300, 180),
  ('101720', 30100, 95), ('13000', 5600, 320),  ('100317', 10200, 300),
  ('109609', 7800, 380), ('102317', 22400, 140), ('100329', 9100, 280)
) as v(ref, precio, stock)
join _seed_prod p on p.ref = v.ref;

-- ---------- Órdenes de prueba dirigidas al Proveedor 1 ----------
-- Órdenes que la Farmacia 1 envió al Proveedor 1, para ejercitar p4-ordenes y
-- p6-orden-detalle (incluye aceptación parcial y un ítem sin stock).

-- ORD-0001: pendiente (el proveedor debe revisarla).
insert into public.ordenes (id, codigo, farmacia_id, proveedor_id, estado, created_by)
values ('0000000f-0000-0000-0000-000000000001', 'ORD-0001',
        '0000000b-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001',
        'pendiente', '0000000e-0000-0000-0000-000000000001');

insert into public.orden_items (orden_id, oferta_id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada)
select '0000000f-0000-0000-0000-000000000001', o.id, o.producto_maestro_id, o.precio, v.cant
from (values ('55073', 20), ('100317', 15), ('49325', 10)) as v(ref, cant)
join _seed_prod p on p.ref = v.ref
join public.ofertas o on o.producto_maestro_id = p.id
 and o.organizacion_id = '0000000a-0000-0000-0000-000000000001';

-- ORD-0002: pendiente, con un ítem SIN stock (Omeprazol) para probar la
-- sustitución y el faltante (f6/p6).
insert into public.ordenes (id, codigo, farmacia_id, proveedor_id, estado, created_by)
values ('0000000f-0000-0000-0000-000000000002', 'ORD-0002',
        '0000000b-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001',
        'pendiente', '0000000e-0000-0000-0000-000000000001');

insert into public.orden_items (orden_id, oferta_id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada)
select '0000000f-0000-0000-0000-000000000002', o.id, o.producto_maestro_id, o.precio, v.cant
from (values ('100164', 12), ('109609', 25)) as v(ref, cant)
join _seed_prod p on p.ref = v.ref
join public.ofertas o on o.producto_maestro_id = p.id
 and o.organizacion_id = '0000000a-0000-0000-0000-000000000001';

commit;
