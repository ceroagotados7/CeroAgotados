-- Factura enlazada al despacho (Grupo 4 de la bitácora de reuniones).
-- Regla dura: ningún despacho sale sin número de factura. El número queda
-- congelado en la orden (trazabilidad punto a punto: proveedor → admin →
-- farmacia) y como parte del evento 'despachada' del timeline.

alter table public.ordenes
  add column factura_numero text,
  add column factura_registrada_at timestamptz;

comment on column public.ordenes.factura_numero is
  'Número de la factura de venta con la que el proveedor despachó. Obligatorio al despachar (RPC); null en órdenes previas a la migración o aún no despachadas.';

-- Formato defensivo también en la DB (la API valida primero): 3-30 chars,
-- empieza y termina en alfanumérico, permite - / . y espacio en el medio.
alter table public.ordenes
  add constraint ordenes_factura_formato check (
    factura_numero is null
    or factura_numero ~ '^[A-Za-z0-9][A-Za-z0-9 ./-]{1,28}[A-Za-z0-9]$'
  );

-- Normaliza y valida el número de factura; única fuente de la regla.
create or replace function public._normalizar_factura(p_factura text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := trim(coalesce(p_factura, ''));
begin
  if v !~ '^[A-Za-z0-9][A-Za-z0-9 ./-]{1,28}[A-Za-z0-9]$' then
    raise exception 'factura_invalida';
  end if;
  return v;
end;
$$;

-- El despacho ahora EXIGE la factura: se reemplaza la firma vieja para que
-- ningún camino de código pueda despachar sin ella.
drop function if exists public.despachar_orden(uuid, uuid, uuid);

create or replace function public.despachar_orden(
  p_orden_id uuid,
  p_proveedor_id uuid,
  p_actor uuid,
  p_factura_numero text
) returns public.ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_factura text;
begin
  v_factura := public._normalizar_factura(p_factura_numero);

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

  update public.ordenes
    set estado = 'despachada',
        factura_numero = v_factura,
        factura_registrada_at = now()
    where id = p_orden_id returning * into v_orden;

  insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
  values (p_orden_id, p_actor, 'despachada',
          jsonb_build_object('factura_numero', v_factura));

  return v_orden;
end;
$$;

-- Corrección auditada: solo el proveedor dueño, solo mientras la orden sigue
-- en 'despachada' (tras la recepción de la farmacia el número queda inmutable).
create or replace function public.corregir_factura(
  p_orden_id uuid,
  p_proveedor_id uuid,
  p_actor uuid,
  p_factura_numero text
) returns public.ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden public.ordenes;
  v_factura text;
  v_anterior text;
begin
  v_factura := public._normalizar_factura(p_factura_numero);

  select * into v_orden from public.ordenes where id = p_orden_id for update;
  if not found then
    raise exception 'orden_no_encontrada';
  end if;
  if v_orden.proveedor_id <> p_proveedor_id then
    raise exception 'no_autorizado';
  end if;
  if v_orden.estado <> 'despachada' then
    raise exception 'estado_no_editable:%', v_orden.estado;
  end if;

  v_anterior := v_orden.factura_numero;

  update public.ordenes
    set factura_numero = v_factura,
        factura_registrada_at = now()
    where id = p_orden_id returning * into v_orden;

  insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
  values (p_orden_id, p_actor, 'factura_corregida',
          jsonb_build_object('factura_numero', v_factura, 'anterior', v_anterior));

  return v_orden;
end;
$$;

-- Solo el backend (service role) puede invocarlas; nunca el cliente directo.
revoke execute on function public.despachar_orden(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.corregir_factura(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._normalizar_factura(text) from public, anon, authenticated;
