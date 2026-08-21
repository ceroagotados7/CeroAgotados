-- Cero Agotados — Motor de stock + alias rotativo del proveedor (Entrega 1)
-- ==========================================================================
-- 1) El stock se DESCUENTA al crear el pedido (decisión del fundador: "que
--    merme cuando la farmacia envía el pedido") y se DEVUELVE en rechazos,
--    aceptaciones parciales y cancelaciones. Rechazar un ítem con motivo
--    'sin_stock' (agotado real en bodega) fuerza la oferta a stock 0.
-- 2) El alias anónimo del proveedor deja de ser fijo: rota una vez al día
--    (fecha de Bogotá) para que las farmacias no puedan correlacionar
--    alias ↔ proveedor real a lo largo del tiempo. Cada orden CONGELA el
--    alias vigente al crearse (columna nueva) para un seguimiento estable.
-- 3) La cancelación de la farmacia pasa a RPC transaccional (orden + stock
--    en una sola transacción).

-- --------------------------------------------------------------------------
-- Alias congelado por orden
-- --------------------------------------------------------------------------

alter table public.ordenes add column if not exists proveedor_alias text;

-- Backfill: las órdenes históricas conservan el alias fijo v1 que la
-- farmacia ya vio (mismo hash que calculaba la API hasta hoy).
update public.ordenes
  set proveedor_alias =
    'Proveedor ' || upper(substr(md5(proveedor_id::text || ':cero-agotados-alias-v1'), 1, 4))
  where proveedor_alias is null;

-- Alias del día: determinístico dentro del día (carrito y comparaciones
-- consistentes), distinto cada día. DEBE producir exactamente el mismo texto
-- que _alias_proveedor() en apps/api (mismo input del md5); hay un test de
-- paridad que compara ambos.
create or replace function public.alias_proveedor_del_dia(p_org uuid)
returns text
language sql
stable
set search_path = public
as $$
  select 'Proveedor ' || upper(substr(md5(
    p_org::text || ':' || to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD')
      || ':cero-agotados-alias-v2'
  ), 1, 4));
$$;

revoke execute on function public.alias_proveedor_del_dia(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- crear_pedido v2: descuenta stock y congela el alias del día
-- --------------------------------------------------------------------------

create or replace function public.crear_pedido(
  p_farmacia_id uuid,
  p_actor uuid,
  p_items jsonb,
  p_notas text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it jsonb;
  v_oferta record;
  v_proveedor uuid;
  v_orden_id uuid;
  v_codigo text;
  v_alias text;
  v_subtotal numeric(12, 2);
  v_n int;
  v_resultado jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'pedido_vacio';
  end if;

  -- Valida y DESCUENTA cada oferta con lock de fila. El orden determinístico
  -- por oferta_id evita deadlocks entre dos pedidos concurrentes.
  for it in
    select value from jsonb_array_elements(p_items)
    order by value ->> 'oferta_id'
  loop
    select id, organizacion_id, precio, stock_disponible, activo
      into v_oferta
      from public.ofertas
      where id = (it ->> 'oferta_id')::uuid
      for update;
    if not found or not v_oferta.activo then
      raise exception 'oferta_no_disponible:%', it ->> 'oferta_id';
    end if;
    if (it ->> 'cantidad')::int <= 0 then
      raise exception 'cantidad_invalida:%', it ->> 'oferta_id';
    end if;
    if (it ->> 'cantidad')::int > v_oferta.stock_disponible then
      raise exception 'stock_insuficiente:%', it ->> 'oferta_id';
    end if;
    -- Reserva: el pedido retiene este stock hasta que el proveedor decida
    -- (aceptar consume; rechazar/cancelar devuelve).
    update public.ofertas
      set stock_disponible = stock_disponible - (it ->> 'cantidad')::int
      where id = v_oferta.id;
  end loop;

  -- Una orden por proveedor (regla f4), congelando el alias del día.
  for v_proveedor in
    select distinct o.organizacion_id
      from jsonb_array_elements(p_items) i
      join public.ofertas o on o.id = (i ->> 'oferta_id')::uuid
  loop
    v_codigo := 'ORD-' || lpad(nextval('public.ordenes_codigo_seq')::text, 4, '0');
    v_alias := public.alias_proveedor_del_dia(v_proveedor);

    insert into public.ordenes
        (codigo, farmacia_id, proveedor_id, estado, notas, created_by, proveedor_alias)
      values (v_codigo, p_farmacia_id, v_proveedor, 'pendiente', p_notas, p_actor, v_alias)
      returning id into v_orden_id;

    insert into public.orden_items
        (orden_id, oferta_id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada)
      select v_orden_id, o.id, o.producto_maestro_id, o.precio, (i ->> 'cantidad')::int
        from jsonb_array_elements(p_items) i
        join public.ofertas o on o.id = (i ->> 'oferta_id')::uuid
        where o.organizacion_id = v_proveedor;

    select coalesce(sum(cantidad_solicitada * precio_unitario_snapshot), 0), count(*)
      into v_subtotal, v_n
      from public.orden_items where orden_id = v_orden_id;

    insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
      values (v_orden_id, p_actor, 'creada', jsonb_build_object('n_items', v_n));

    v_resultado := v_resultado || jsonb_build_object(
      'orden_id', v_orden_id,
      'codigo', v_codigo,
      'proveedor_id', v_proveedor,
      'proveedor_alias', v_alias,
      'subtotal', v_subtotal,
      'n_items', v_n
    );
  end loop;

  return v_resultado;
end;
$$;

revoke execute on function public.crear_pedido(uuid, uuid, jsonb, text) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- aceptar_orden v2: mueve stock según la decisión de cada ítem
-- --------------------------------------------------------------------------
-- Contabilidad de la reserva por ítem (derivada del estado, sin columna extra):
--   pendiente  → retiene cantidad_solicitada (descontada al crear el pedido)
--   aceptado   → retiene cantidad_aceptada (el resto se devolvió)
--   rechazado / sustituido → retiene 0 sobre la oferta original
-- En cada decisión se aplica el DELTA entre la retención previa y la nueva,
-- lo que hace la re-edición (desde aceptada_parcial) idempotente en stock.
-- p_decisiones: jsonb array de { item_id, cantidad_aceptada, estado,
--   motivo?, producto_sustituto_id?, oferta_sustituto_id? }
--   motivo = 'sin_stock' en un rechazo → la oferta queda en stock 0 (el
--   agotado era real: no se devuelve la reserva y se apaga la oferta).

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
  v_item public.orden_items;
  v_estado_nuevo public.item_estado;
  v_cant int;
  v_ret_prev int;
  v_ret_nuevo int;
  v_delta int;
  v_total numeric(12, 2) := 0;
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

  for d in select * from jsonb_array_elements(p_decisiones)
  loop
    select * into v_item from public.orden_items oi
      where oi.id = (d ->> 'item_id')::uuid and oi.orden_id = p_orden_id
      for update;
    if not found then
      raise exception 'item_no_encontrado:%', d ->> 'item_id';
    end if;

    v_estado_nuevo := (d ->> 'estado')::public.item_estado;
    v_cant := coalesce((d ->> 'cantidad_aceptada')::int, 0);
    if v_cant > v_item.cantidad_solicitada then
      raise exception 'cantidad_invalida:%', d ->> 'item_id';
    end if;

    -- Reserva previa y nueva sobre la oferta ORIGINAL del ítem.
    v_ret_prev := case v_item.estado_item
      when 'pendiente' then v_item.cantidad_solicitada
      when 'aceptado' then v_item.cantidad_aceptada
      else 0 end;
    v_ret_nuevo := case when v_estado_nuevo = 'aceptado' then v_cant else 0 end;

    if v_estado_nuevo = 'rechazado' and (d ->> 'motivo') = 'sin_stock' then
      -- Agotado real en bodega: la oferta se apaga a 0 (no se devuelve nada).
      update public.ofertas set stock_disponible = 0 where id = v_item.oferta_id;
    else
      v_delta := v_ret_prev - v_ret_nuevo;  -- >0 devuelve stock, <0 consume más
      if v_delta <> 0 then
        update public.ofertas
          set stock_disponible = stock_disponible + v_delta
          where id = v_item.oferta_id and stock_disponible + v_delta >= 0;
        if not found then
          raise exception 'stock_insuficiente:%', d ->> 'item_id';
        end if;
      end if;
    end if;

    -- Sustitución: devuelve la reserva del sustituto previo (si re-edita) y
    -- consume del sustituto nuevo. oferta_sustituto_id es OPCIONAL (una
    -- sustitución puede referirse solo al producto): sin oferta, no hay
    -- movimiento de stock del sustituto.
    if v_item.estado_item = 'sustituido' and v_item.oferta_sustituto_id is not null then
      update public.ofertas
        set stock_disponible = stock_disponible + v_item.cantidad_aceptada
        where id = v_item.oferta_sustituto_id;
    end if;
    if v_estado_nuevo = 'sustituido' and nullif(d ->> 'oferta_sustituto_id', '') is not null then
      update public.ofertas
        set stock_disponible = stock_disponible - v_cant
        where id = (d ->> 'oferta_sustituto_id')::uuid and stock_disponible >= v_cant;
      if not found then
        raise exception 'stock_insuficiente_sustituto:%', d ->> 'item_id';
      end if;
    end if;

    update public.orden_items oi set
      cantidad_aceptada = v_cant,
      estado_item = v_estado_nuevo,
      producto_sustituto_id = nullif(d ->> 'producto_sustituto_id', '')::uuid,
      oferta_sustituto_id = nullif(d ->> 'oferta_sustituto_id', '')::uuid
    where oi.id = v_item.id;
  end loop;

  -- Recalcula total aceptado y cuenta líneas.
  select
    coalesce(sum(
      case when estado_item in ('aceptado', 'sustituido')
        then cantidad_aceptada * precio_unitario_snapshot else 0 end
    ), 0),
    count(*) filter (
      where estado_item in ('aceptado', 'sustituido') and cantidad_aceptada > 0
    )
  into v_total, v_lineas_aceptadas
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

-- --------------------------------------------------------------------------
-- cancelar_pedido: cancelación transaccional con devolución de stock
-- --------------------------------------------------------------------------

create or replace function public.cancelar_pedido(
  p_orden_id uuid,
  p_farmacia_id uuid,
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
  -- No distinguir "no existe" de "no es tuyo": mismo error (no filtra ids).
  if not found or v_orden.farmacia_id <> p_farmacia_id then
    raise exception 'pedido_no_encontrado';
  end if;
  if v_orden.estado <> 'pendiente' then
    raise exception 'estado_no_cancelable:%', v_orden.estado;
  end if;

  -- Devuelve la reserva de cada ítem (en pendiente, todo lo solicitado).
  update public.ofertas o
    set stock_disponible = o.stock_disponible + r.retenido
    from (
      select oferta_id,
             sum(case estado_item
                   when 'pendiente' then cantidad_solicitada
                   when 'aceptado' then cantidad_aceptada
                   else 0 end) as retenido
        from public.orden_items
        where orden_id = p_orden_id
        group by oferta_id
    ) r
    where o.id = r.oferta_id and r.retenido > 0;

  update public.ordenes set estado = 'cancelada'
    where id = p_orden_id returning * into v_orden;

  insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
  values (p_orden_id, p_actor, 'cancelada', '{}'::jsonb);

  return v_orden;
end;
$$;

revoke execute on function public.cancelar_pedido(uuid, uuid, uuid) from public, anon, authenticated;
