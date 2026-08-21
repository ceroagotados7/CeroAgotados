-- Cero Agotados — La aceptación parcial y el rechazo son señales de AGOTADO
-- ==========================================================================
-- Regla del fundador (2026-08-21, tras el piloto): como la plataforma no ve el
-- stock real de bodega, la decisión del proveedor ES la fuente de verdad. Si
-- sabiendo que le pedían N cajas despachó menos (parcial) o ninguna (rechazo o
-- sustitución), asumimos que ese medicamento se le AGOTÓ: su oferta queda en
-- stock 0 (medida provisional; el proveedor la repone desde su catálogo cuando
-- vuelva a tener). Solo la aceptación COMPLETA conserva el stock restante, y
-- solo la cancelación de la farmacia (que no es señal del proveedor) devuelve
-- la reserva. Reemplaza la contabilidad de la migración 13, donde el rechazo
-- genérico y la parte no aceptada de una parcial se devolvían al stock.

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

    if v_estado_nuevo = 'aceptado' and v_cant = v_item.cantidad_solicitada then
      -- Aceptación COMPLETA: consume exactamente la reserva del ítem.
      -- Contabilidad por delta sobre la retención previa (re-edición segura):
      -- pendiente→solicitada, aceptado→cantidad_aceptada previa, resto→0.
      v_ret_prev := case v_item.estado_item
        when 'pendiente' then v_item.cantidad_solicitada
        when 'aceptado' then v_item.cantidad_aceptada
        else 0 end;
      v_delta := v_ret_prev - v_cant;  -- >0 devuelve, <0 consume más
      if v_delta <> 0 then
        update public.ofertas
          set stock_disponible = stock_disponible + v_delta
          where id = v_item.oferta_id and stock_disponible + v_delta >= 0;
        if not found then
          raise exception 'stock_insuficiente:%', d ->> 'item_id';
        end if;
      end if;
    else
      -- Parcial, rechazo o sustitución: el proveedor NO pudo despachar lo
      -- pedido → su stock real se agotó. La oferta queda en 0 y sale del
      -- buscador; el proveedor la repone manualmente cuando tenga stock.
      update public.ofertas set stock_disponible = 0 where id = v_item.oferta_id;
    end if;

    -- Sustitución: devuelve la reserva del sustituto previo (si re-edita) y
    -- consume del sustituto nuevo. oferta_sustituto_id es OPCIONAL.
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
