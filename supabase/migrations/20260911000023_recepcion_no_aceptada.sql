-- Cero Agotados — veredicto de recepción de la farmacia (Tanda 5, 2026-09-11)
-- ===========================================================================
-- Hasta hoy, cuando a una droguería le llegaba mal un pedido, la plataforma no
-- se enteraba: el único botón era "Confirmar recepción". Ahora la farmacia puede
-- registrar que NO aceptó la entrega —entera o en parte— con un comentario
-- opcional, y el distribuidor lo ve.
--
-- TRES DECISIONES DEL FUNDADOR QUE ESTE DISEÑO OBEDECE (2026-09-11):
--
--   1. NO TOCA EL STOCK. Sigue vigente la regla del motor de stock: la decisión
--      del PROVEEDOR es la fuente de verdad, y solo la cancelación de la
--      farmacia devuelve la reserva. Esto es un registro de transparencia, no
--      un movimiento de inventario; el proveedor ajusta cuando le regresa la
--      mercancía físicamente.
--
--   2. LA VENTA SIGUE CONTANDO. Si la farmacia no recibió algo es porque el
--      distribuidor falló, no la plataforma. Por eso `estado` NO cambia de
--      semántica y `_VENTA_ESTADOS` no se toca: ganancias y dashboard siguen
--      exactamente igual.
--
--   3. ES INMUTABLE. Una vez registrado queda en firme, igual que el número de
--      factura: es un reclamo formal contra el distribuidor y si se pudiera
--      editar después perdería valor como prueba.
--
-- POR QUÉ COLUMNAS NUEVAS Y NO `estado_item`:
-- `estado_item` es la decisión del PROVEEDOR y es la que gobierna el motor de
-- stock (aceptación parcial = agotado real → la oferta queda en 0). Meter aquí
-- el veredicto de la FARMACIA mezclaría dos capas distintas y rompería esa
-- regla. Son dos columnas separadas a propósito.
--
-- Y POR QUÉ NO UN ESTADO NUEVO EN EL ENUM:
-- `orden_estado` dice DÓNDE va el pedido en el flujo; `recepcion` dice CÓMO
-- salió. Mezclarlos obligaría a tocar dashboards, ganancias, badges y la suite
-- entera sin ganar nada.

-- ---------------------------------------------------------------------------
-- 1. El veredicto, en la orden
-- ---------------------------------------------------------------------------
alter table public.ordenes
  add column if not exists recepcion text
    check (recepcion in ('aceptada', 'no_aceptada_total', 'no_aceptada_parcial')),
  -- "Un pequeño comentario" (petición del fundador): opcional y acotado. El
  -- tope vive aquí además de en la API porque la DB es la última defensa.
  add column if not exists recepcion_comentario text
    check (recepcion_comentario is null or char_length(recepcion_comentario) <= 500),
  add column if not exists recepcion_at timestamptz;

comment on column public.ordenes.recepcion is
  'Veredicto de la FARMACIA al recibir. Independiente de `estado` (flujo) y del '
  'motor de stock (que obedece a `estado_item`, decisión del proveedor).';

-- ---------------------------------------------------------------------------
-- 2. Qué cantidad no aceptó, ítem por ítem
-- ---------------------------------------------------------------------------
alter table public.orden_items
  add column if not exists cantidad_no_aceptada integer not null default 0
    check (cantidad_no_aceptada >= 0);

-- No se puede rechazar más de lo que el proveedor despachó. Con un ítem que el
-- proveedor rechazó (aceptada = 0) esto fuerza no_aceptada = 0: no se puede "no
-- aceptar" algo que nunca llegó.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_no_aceptada_no_excede'
  ) then
    alter table public.orden_items
      add constraint chk_no_aceptada_no_excede
      check (cantidad_no_aceptada <= cantidad_aceptada);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Una sola puerta para cerrar la recepción
-- ---------------------------------------------------------------------------
-- Antes, "confirmar recepción" era un UPDATE suelto desde la API, sin bloqueo:
-- el único camino del ciclo de vida que no pasaba por una RPC. Si la farmacia
-- confirmaba mientras el proveedor corregía la factura, las dos escrituras se
-- pisaban. Ahora ambos caminos —aceptar y no aceptar— entran por aquí, con
-- `for update`, como crear_pedido / aceptar_orden / despachar_orden / cancelar.
create or replace function public.registrar_recepcion(
  p_orden_id    uuid,
  p_farmacia_id uuid,
  p_actor       uuid,
  -- 'aceptada' | 'no_aceptada_total' | 'no_aceptada_parcial'
  p_alcance     text,
  -- Solo para el parcial: [{"item_id": uuid, "cantidad": int}]
  p_items       jsonb default '[]'::jsonb,
  p_comentario  text  default null
) returns public.ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orden       public.ordenes;
  v_comentario  text;
  v_recepcion   text;
  v_items       int;
  v_validos     int;
  v_total_acept bigint;
  v_total_no    bigint;
begin
  select * into v_orden from public.ordenes where id = p_orden_id for update;
  -- No distinguir "no existe" de "no es tuyo": mismo error, no filtra ids ajenos.
  if not found or v_orden.farmacia_id <> p_farmacia_id then
    raise exception 'pedido_no_encontrado';
  end if;

  -- La inmutabilidad se comprueba ANTES que el estado, y el orden importa:
  -- registrar la recepción deja el pedido en 'completada', así que si esta
  -- guarda fuera después, un segundo intento chocaría contra
  -- `estado_no_recibible` —un mensaje que no explica nada— y esta guarda sería
  -- inalcanzable. Así el doble clic recibe la razón real, y si alguna vez una
  -- corrección administrativa devolviera el pedido a 'despachada', el veredicto
  -- ya registrado seguiría protegido. (Encontrado probando la RPC, caso 14.)
  if v_orden.recepcion is not null then
    raise exception 'recepcion_ya_registrada:%', v_orden.recepcion;
  end if;

  if v_orden.estado <> 'despachada' then
    raise exception 'estado_no_recibible:%', v_orden.estado;
  end if;

  if p_alcance not in ('aceptada', 'no_aceptada_total', 'no_aceptada_parcial') then
    raise exception 'alcance_invalido:%', p_alcance;
  end if;

  -- Comentario: en blanco cuenta como "sin comentario" (es opcional).
  -- btrim() a secas SOLO recorta espacios: con un comentario de tabuladores o
  -- saltos de línea se guardaba basura invisible. Hay que nombrar los
  -- caracteres. (Lo destapó el test de comentario en blanco.)
  v_comentario := nullif(btrim(coalesce(p_comentario, ''), E' 	
'), '');
  if v_comentario is not null and char_length(v_comentario) > 500 then
    raise exception 'comentario_muy_largo';
  end if;
  -- Nunca se guarda un comentario en una recepción aceptada: no hay nada que
  -- reclamar, y evita que quede texto huérfano sin contexto.
  if p_alcance = 'aceptada' then
    v_comentario := null;
  end if;

  if p_alcance = 'no_aceptada_total' then
    -- Rechaza TODO lo que el proveedor efectivamente despachó.
    update public.orden_items
      set cantidad_no_aceptada = cantidad_aceptada
      where orden_id = p_orden_id;

  elsif p_alcance = 'no_aceptada_parcial' then
    select count(*) into v_items
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb));
    if v_items = 0 then
      raise exception 'sin_items';
    end if;

    -- Cada item_id debe pertenecer a ESTA orden. Si alguno es de otra (o no
    -- existe), la cuenta no cuadra y no se escribe nada: la transacción entera
    -- se va al traste en vez de aplicar un rechazo a medias.
    select count(*) into v_validos
      from jsonb_to_recordset(p_items) as x(item_id uuid, cantidad int)
      join public.orden_items oi
        on oi.id = x.item_id and oi.orden_id = p_orden_id;
    if v_validos <> v_items then
      raise exception 'item_ajeno_o_inexistente';
    end if;

    -- Sin item_id repetido. Con el mismo ítem dos veces, el UPDATE ... FROM de
    -- más abajo recibiría dos filas candidatas para la misma fila destino y
    -- Postgres elegiría UNA de forma arbitraria: la cantidad guardada dependería
    -- del orden del plan. Mejor rechazarlo que guardar algo impredecible.
    if (select count(distinct x.item_id)
          from jsonb_to_recordset(p_items) as x(item_id uuid, cantidad int)) <> v_items then
      raise exception 'item_duplicado';
    end if;

    -- La cantidad debe ser un entero de 1 hasta lo aceptado. El constraint de
    -- la tabla también lo cubre, pero aquí el mensaje es accionable.
    if exists (
      select 1
        from jsonb_to_recordset(p_items) as x(item_id uuid, cantidad int)
        join public.orden_items oi on oi.id = x.item_id
       where x.cantidad is null
          or x.cantidad < 1
          or x.cantidad > oi.cantidad_aceptada
    ) then
      raise exception 'cantidad_invalida';
    end if;

    update public.orden_items oi
      set cantidad_no_aceptada = x.cantidad
      from jsonb_to_recordset(p_items) as x(item_id uuid, cantidad int)
      where oi.id = x.item_id and oi.orden_id = p_orden_id;
  end if;

  -- Si el "parcial" terminó cubriendo todo lo despachado, se guarda como total:
  -- el veredicto describe el resultado, no cómo se tecleó.
  select coalesce(sum(cantidad_aceptada), 0), coalesce(sum(cantidad_no_aceptada), 0)
    into v_total_acept, v_total_no
    from public.orden_items where orden_id = p_orden_id;

  v_recepcion := case
    when p_alcance = 'aceptada' then 'aceptada'
    when v_total_no >= v_total_acept and v_total_acept > 0 then 'no_aceptada_total'
    else 'no_aceptada_parcial'
  end;

  update public.ordenes
    set estado              = 'completada',
        recepcion           = v_recepcion,
        recepcion_comentario= v_comentario,
        recepcion_at        = now()
    where id = p_orden_id
    returning * into v_orden;

  insert into public.orden_eventos (orden_id, actor_id, tipo, payload)
  values (
    p_orden_id,
    p_actor,
    case when v_recepcion = 'aceptada' then 'completada' else 'no_aceptada' end,
    jsonb_build_object(
      'recepcion', v_recepcion,
      'cajas_no_aceptadas', v_total_no,
      'con_comentario', v_comentario is not null
    )
  );

  return v_orden;
end;
$$;

comment on function public.registrar_recepcion is
  'Cierra la recepción de un pedido despachado: aceptada, no aceptada total o '
  'parcial, con comentario opcional. Inmutable y con lock. NO mueve stock.';

revoke all on function public.registrar_recepcion(uuid, uuid, uuid, text, jsonb, text) from public;
grant execute on function public.registrar_recepcion(uuid, uuid, uuid, text, jsonb, text)
  to service_role;
