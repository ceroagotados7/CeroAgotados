-- Cero Agotados — notificaciones de novedades para la farmacia
-- =============================================================
-- La farmacia debe ver un punto rojo cuando el proveedor responde sus pedidos
-- (acepta total/parcial, rechaza o despacha). Guardamos "hasta cuándo vio su
-- bandeja": todo pedido actualizado por el proveedor DESPUÉS de esa marca
-- cuenta como novedad. Al abrir "Mis pedidos" la marca se actualiza.

alter table public.profiles
  add column pedidos_vistos_at timestamptz not null default now();
