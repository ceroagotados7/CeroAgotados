-- Cero Agotados — datos semilla para desarrollo LOCAL
-- ===================================================
-- Se corre con cada `supabase db reset`. Crea usuarios de prueba, organizaciones,
-- catálogo maestro, ofertas y algunas órdenes dirigidas al "Proveedor 1" para
-- poder probar el flujo completo del proveedor (p4-ordenes, p6-orden-detalle).
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

-- ---------- Catálogo maestro (24 medicamentos) ----------
insert into public.producto_maestro (nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria) values
  ('Acetaminofén 500mg',        'Acetaminofén',   '500mg',       'Tableta',  'Caja x 100 tabletas', 'Genfar',       'Analgésico'),
  ('Ibuprofeno 400mg',          'Ibuprofeno',     '400mg',       'Tableta',  'Caja x 50 tabletas',  'MK',           'Analgésico'),
  ('Naproxeno 250mg',           'Naproxeno',      '250mg',       'Tableta',  'Caja x 30 tabletas',  'Genfar',       'Analgésico'),
  ('Aspirina 100mg',            'Ácido acetilsalicílico', '100mg', 'Tableta', 'Caja x 30 tabletas', 'Bayer',       'Analgésico'),
  ('Amoxicilina 500mg',         'Amoxicilina',    '500mg',       'Cápsula',  'Caja x 20 cápsulas',  'La Santé',     'Antibiótico'),
  ('Azitromicina 500mg',        'Azitromicina',   '500mg',       'Tableta',  'Caja x 3 tabletas',   'MK',           'Antibiótico'),
  ('Cefalexina 500mg',          'Cefalexina',     '500mg',       'Cápsula',  'Caja x 12 cápsulas',  'Genfar',       'Antibiótico'),
  ('Ciprofloxacino 500mg',      'Ciprofloxacino', '500mg',       'Tableta',  'Caja x 10 tabletas',  'La Santé',     'Antibiótico'),
  ('Loratadina 10mg',           'Loratadina',     '10mg',        'Tableta',  'Caja x 10 tabletas',  'MK',           'Antihistamínico'),
  ('Cetirizina 10mg',           'Cetirizina',     '10mg',        'Tableta',  'Caja x 10 tabletas',  'Genfar',       'Antihistamínico'),
  ('Omeprazol 20mg',            'Omeprazol',      '20mg',        'Cápsula',  'Caja x 14 cápsulas',  'MK',           'Gastrointestinal'),
  ('Ranitidina 150mg',          'Ranitidina',     '150mg',       'Tableta',  'Caja x 20 tabletas',  'Genfar',       'Gastrointestinal'),
  ('Metformina 850mg',          'Metformina',     '850mg',       'Tableta',  'Caja x 30 tabletas',  'La Santé',     'Antidiabético'),
  ('Losartán 50mg',             'Losartán',       '50mg',        'Tableta',  'Caja x 30 tabletas',  'MK',           'Antihipertensivo'),
  ('Enalapril 20mg',            'Enalapril',      '20mg',        'Tableta',  'Caja x 30 tabletas',  'Genfar',       'Antihipertensivo'),
  ('Atorvastatina 20mg',        'Atorvastatina',  '20mg',        'Tableta',  'Caja x 30 tabletas',  'La Santé',     'Hipolipemiante'),
  ('Salbutamol inhalador',      'Salbutamol',     '100mcg/dosis','Inhalador','Frasco x 200 dosis',  'MK',           'Respiratorio'),
  ('Prednisolona 5mg',          'Prednisolona',   '5mg',         'Tableta',  'Caja x 30 tabletas',  'Genfar',       'Corticoide'),
  ('Diclofenaco 50mg',          'Diclofenaco',    '50mg',        'Tableta',  'Caja x 30 tabletas',  'MK',           'Antiinflamatorio'),
  ('Acetaminofén jarabe',       'Acetaminofén',   '150mg/5ml',   'Jarabe',   'Frasco x 120ml',      'Genfar',       'Analgésico'),
  ('Amoxicilina suspensión',    'Amoxicilina',    '250mg/5ml',   'Suspensión','Frasco x 60ml',      'La Santé',     'Antibiótico'),
  ('Hidróxido de aluminio',     'Hidróxido de aluminio', '320mg/5ml','Suspensión','Frasco x 150ml', 'MK',          'Gastrointestinal'),
  ('Vitamina C 500mg',          'Ácido ascórbico','500mg',       'Tableta',  'Caja x 30 tabletas',  'Genfar',       'Vitamina'),
  ('Complejo B',                'Vitaminas del complejo B', 'N/A','Tableta',  'Caja x 30 tabletas',  'MK',           'Vitamina');

-- ---------- Ofertas de cada proveedor (precio + stock) ----------
-- Proveedor 1: amplio catálogo, precios competitivos.
insert into public.ofertas (organizacion_id, producto_maestro_id, precio, stock_disponible)
select '0000000a-0000-0000-0000-000000000001', pm.id, v.precio, v.stock
from public.producto_maestro pm
join (values
  ('Acetaminofén 500mg', 8500, 800), ('Ibuprofeno 400mg', 6200, 500),
  ('Naproxeno 250mg', 7100, 300), ('Aspirina 100mg', 4300, 400),
  ('Amoxicilina 500mg', 9800, 250), ('Azitromicina 500mg', 12500, 120),
  ('Cefalexina 500mg', 8900, 90), ('Ciprofloxacino 500mg', 7600, 0),
  ('Loratadina 10mg', 3900, 600), ('Cetirizina 10mg', 4100, 550),
  ('Omeprazol 20mg', 5400, 700), ('Metformina 850mg', 6800, 320),
  ('Losartán 50mg', 7300, 280), ('Atorvastatina 20mg', 11200, 150),
  ('Salbutamol inhalador', 18500, 60), ('Diclofenaco 50mg', 5200, 400),
  ('Acetaminofén jarabe', 6900, 200), ('Vitamina C 500mg', 4800, 500)
) as v(nombre, precio, stock) on pm.nombre = v.nombre;

-- Proveedor 2: catálogo parcial, algunos precios mejores y otros peores.
insert into public.ofertas (organizacion_id, producto_maestro_id, precio, stock_disponible)
select '0000000a-0000-0000-0000-000000000002', pm.id, v.precio, v.stock
from public.producto_maestro pm
join (values
  ('Acetaminofén 500mg', 8100, 600), ('Ibuprofeno 400mg', 6500, 450),
  ('Amoxicilina 500mg', 9500, 300), ('Azitromicina 500mg', 13100, 80),
  ('Ciprofloxacino 500mg', 7200, 200), ('Loratadina 10mg', 4200, 400),
  ('Omeprazol 20mg', 5100, 500), ('Ranitidina 150mg', 4600, 350),
  ('Metformina 850mg', 7000, 260), ('Enalapril 20mg', 5900, 300),
  ('Atorvastatina 20mg', 10800, 180), ('Prednisolona 5mg', 6300, 120),
  ('Diclofenaco 50mg', 5000, 500), ('Complejo B', 3700, 400)
) as v(nombre, precio, stock) on pm.nombre = v.nombre;

-- ---------- Órdenes de prueba dirigidas al Proveedor 1 ----------
-- Órdenes que la Farmacia 1 envió al Proveedor 1, en distintos estados para
-- ejercitar p4-ordenes y p6-orden-detalle (incluye aceptación parcial).

-- ORD-0001: pendiente (el proveedor debe revisarla).
insert into public.ordenes (id, codigo, farmacia_id, proveedor_id, estado, created_by)
values ('0000000f-0000-0000-0000-000000000001', 'ORD-0001',
        '0000000b-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001',
        'pendiente', '0000000e-0000-0000-0000-000000000001');

insert into public.orden_items (orden_id, oferta_id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada)
select '0000000f-0000-0000-0000-000000000001', o.id, o.producto_maestro_id, o.precio, v.cant
from public.ofertas o
join public.producto_maestro pm on pm.id = o.producto_maestro_id
join (values ('Acetaminofén 500mg', 20), ('Ibuprofeno 400mg', 15), ('Amoxicilina 500mg', 10)) as v(nombre, cant)
  on pm.nombre = v.nombre
where o.organizacion_id = '0000000a-0000-0000-0000-000000000001';

-- ORD-0002: pendiente, incluye un ítem SIN stock (Ciprofloxacino) para probar sustitución (f6/p6).
insert into public.ordenes (id, codigo, farmacia_id, proveedor_id, estado, created_by)
values ('0000000f-0000-0000-0000-000000000002', 'ORD-0002',
        '0000000b-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001',
        'pendiente', '0000000e-0000-0000-0000-000000000001');

insert into public.orden_items (orden_id, oferta_id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada)
select '0000000f-0000-0000-0000-000000000002', o.id, o.producto_maestro_id, o.precio, v.cant
from public.ofertas o
join public.producto_maestro pm on pm.id = o.producto_maestro_id
join (values ('Ciprofloxacino 500mg', 12), ('Loratadina 10mg', 25)) as v(nombre, cant)
  on pm.nombre = v.nombre
where o.organizacion_id = '0000000a-0000-0000-0000-000000000001';

commit;
