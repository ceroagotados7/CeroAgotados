-- Cero Agotados — RPC transaccional de gestión de órdenes (lado proveedor)
-- ========================================================================
-- La lógica crítica (aceptación total/parcial, sustitución, recálculo de total
-- y transición de estado) vive en una función atómica de Postgres con lock
-- optimista (SELECT ... FOR UPDATE). La API FastAPI la invoca; así la integridad
-- no depende de la app y no hay carreras entre peticiones concurrentes.

-- Aplica las decisiones del proveedor sobre los ítems de una orden.
-- p_decisiones: jsonb array de
--   { item_id, cantidad_aceptada, estado, producto_sustituto_id?, oferta_sustituto_id? }
create or replace function public.aceptar_orden(
  p_orden_id uuid,
  p_proveedor_id uuid,
  p_actor uuid,
  p_decisiones jsonb
) returns public.ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes;
  d jsonb;
  v_total numeric(12, 2) := 0;
  v_total_lineas int := 0;
  v_lineas_aceptadas int := 0;
  v_nuevo_estado public.orden_estado;
begin
  -- Lock de la fila (evita carreras entre peticiones concurrentes).
  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'orden_no_encontrada';
  end if;
  if v_orden.proveedor_id <> p_proveedor_id then
    raise exception 'no_autorizado';
  end if;
  -- Guarda optimista: solo se puede gestionar mientras está pendiente o parcial.
  if v_orden.estado not in ('pendiente', 'aceptada_parcial') then
    raise exception 'estado_no_editable:%', v_orden.estado;
  end if;

  -- Aplica cada decisión sobre su ítem (validando que pertenezca a la orden).
  for d in select * from jsonb_array_elements(p_decisiones)
  loop
    update public.orden_items oi set
      cantidad_aceptada = coalesce((d ->> 'cantidad_aceptada')::int, 0),
      estado_item = (d ->> 'estado')::public.item_estado,
      producto_sustituto_id = nullif(d ->> 'producto_sustituto_id', '')::uuid,
      oferta_sustituto_id = nullif(d ->> 'oferta_sustituto_id', '')::uuid
    where oi.id = (d ->> 'item_id')::uuid
      and oi.orden_id = p_orden_id;
  end loop;

  -- Recalcula total aceptado y cuenta líneas.
  select
    coalesce(sum(
      case when estado_item in ('aceptado', 'sustituido')
        then cantidad_aceptada * precio_unitario_snapshot else 0 end
    ), 0),
    count(*),
    count(*) filter (
      where estado_item in ('aceptado', 'sustituido') and cantidad_aceptada > 0
    )
  into v_total, v_total_lineas, v_lineas_aceptadas
  from public.orden_items
  where orden_id = p_orden_id;

  -- Determina el estado global de la orden.
  if v_lineas_aceptadas = 0 then
    v_nuevo_estado := 'rechazada';
  elsif exists (
    select 1 from public.orden_items
    where orden_id = p_orden_id
      and (
        estado_item in ('rechazado', 'pendiente')
        or (estado_item = 'aceptado' and cantidad_aceptada < cantidad_solicitada)
      )
  ) then
    v_nuevo_estado := 'aceptada_parcial';
  else
    v_nuevo_estado := 'aceptada_total';
  end if;

  update public.ordenes
    set estado = v_nuevo_estado, total = v_total
    where id = p_orden_id
    returning * into v_orden;

  insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
  values (p_orden_id, p_actor, v_nuevo_estado::text,
          jsonb_build_object('total', v_total, 'lineas_aceptadas', v_lineas_aceptadas));

  return v_orden;
end;
$$;

-- Marca una orden aceptada como despachada.
create or replace function public.despachar_orden(
  p_orden_id uuid,
  p_proveedor_id uuid,
  p_actor uuid
) returns public.ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes;
begin
  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'orden_no_encontrada';
  end if;
  if v_orden.proveedor_id <> p_proveedor_id then
    raise exception 'no_autorizado';
  end if;
  if v_orden.estado not in ('aceptada_total', 'aceptada_parcial') then
    raise exception 'estado_no_despachable:%', v_orden.estado;
  end if;

  update public.ordenes set estado = 'despachada'
    where id = p_orden_id returning * into v_orden;

  insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
  values (p_orden_id, p_actor, 'despachada', '{}'::jsonb);

  return v_orden;
end;
$$;
