-- Cero Agotados — RPC transaccional de creación de pedidos (lado farmacia)
-- ========================================================================
-- Cierra la deuda técnica del flujo farmacia: la creación de órdenes pasa a
-- ser ATÓMICA en Postgres (antes: inserción compensada en FastAPI, sin DDL).
-- Una orden por proveedor, precio congelado (snapshot), validación de stock
-- con lock de fila (evita carreras con ediciones de la oferta) y código
-- legible generado por secuencia (sin carrera por el UNIQUE de codigo).

create sequence if not exists public.ordenes_codigo_seq;

-- Alinea la secuencia con los códigos ya existentes (ORD-0001, …).
select setval(
  'public.ordenes_codigo_seq',
  coalesce((select max(substring(codigo from 5)::int) from public.ordenes), 0) + 1,
  false
);

-- p_items: jsonb array de { oferta_id, cantidad }
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
  v_subtotal numeric(12, 2);
  v_n int;
  v_resultado jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'pedido_vacio';
  end if;

  -- Valida cada oferta con lock (activa y con stock suficiente).
  for it in select * from jsonb_array_elements(p_items)
  loop
    select id, organizacion_id, producto_maestro_id, precio, stock_disponible, activo
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
  end loop;

  -- Una orden por proveedor (regla f4).
  for v_proveedor in
    select distinct o.organizacion_id
      from jsonb_array_elements(p_items) i
      join public.ofertas o on o.id = (i ->> 'oferta_id')::uuid
  loop
    v_codigo := 'ORD-' || lpad(nextval('public.ordenes_codigo_seq')::text, 4, '0');

    insert into public.ordenes (codigo, farmacia_id, proveedor_id, estado, notas, created_by)
      values (v_codigo, p_farmacia_id, v_proveedor, 'pendiente', p_notas, p_actor)
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
      'subtotal', v_subtotal,
      'n_items', v_n
    );
  end loop;

  return v_resultado;
end;
$$;

-- Solo el backend (service role) puede crearla; nunca el cliente directo.
revoke execute on function public.crear_pedido(uuid, uuid, jsonb, text) from public, anon, authenticated;
