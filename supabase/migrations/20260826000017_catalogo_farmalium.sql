-- Cero Agotados — enriquecimiento del catálogo maestro (carga Farmalium)
-- =======================================================================
-- Añade los campos que la fuente Farmalium aporta y que producto_maestro aún
-- no modelaba (vía de administración, condición de venta, marca/genérico,
-- clasificación ATC), más la trazabilidad del origen de cada fila.
--
-- Todas las columnas se agregan nullable y sin DEFAULT: en Postgres eso es un
-- cambio solo de catálogo, no reescribe la tabla, así que la migración es
-- instantánea y no bloquea lecturas.

alter table public.producto_maestro
  add column if not exists tipo               text,
  add column if not exists via_administracion text,
  add column if not exists condicion_venta    text,
  add column if not exists atc                text,
  add column if not exists atc_descripcion    text,
  add column if not exists registro_norm      text,
  add column if not exists estado_registro    text,
  add column if not exists estado_fuente      text,
  add column if not exists fuente             text,
  add column if not exists fuente_ref         text;

comment on column public.producto_maestro.tipo is
  'Marca o Genérico, según la ficha de origen.';
comment on column public.producto_maestro.condicion_venta is
  'Venta libre / con fórmula médica / control especial. Relevante para el flujo de pedido.';
comment on column public.producto_maestro.atc is
  'Código ATC de la OMS (ej. R06AE07), tomado del CUM del INVIMA vía cruce.';
comment on column public.producto_maestro.registro_norm is
  'Registro sanitario normalizado (sin prefijo INVIMA, guiones ni espacios). Llave de cruce.';
comment on column public.producto_maestro.estado_registro is
  'VIGENTE | VENCIDO | EN_TRAMITE | OTRO_ESTADO | SIN_MATCH según el CUM del INVIMA.';
comment on column public.producto_maestro.estado_fuente is
  'De dónde salió estado_registro. OJO: derivado_anio_registro = inferido por año '
  'de expedición + 5 años de vigencia, NO verificado contra un listado del INVIMA.';
comment on column public.producto_maestro.fuente is
  'Origen del registro: farmalium, invima, manual.';
comment on column public.producto_maestro.fuente_ref is
  'Identificador del registro en su fuente (ej. el id de ficha de Farmalium).';

-- Idempotencia de la carga: re-ejecutar el importador actualiza en vez de duplicar.
-- El índice va sin cláusula WHERE a propósito: un índice parcial no sirve como
-- destino de ON CONFLICT desde PostgREST. Las filas sin fuente no estorban porque
-- Postgres considera distinto cada NULL en un índice único.
create unique index if not exists idx_producto_fuente_ref
  on public.producto_maestro (fuente, fuente_ref);

-- Salvaguarda contra duplicados lógicos: la misma presentación del mismo registro
-- sanitario, del mismo laboratorio, no puede entrar dos veces. Se usa coalesce
-- porque en un índice único Postgres trata cada NULL como distinto.
create unique index if not exists idx_producto_clave_natural
  on public.producto_maestro (
    registro_norm,
    coalesce(presentacion, ''),
    lower(coalesce(nombre, '')),
    coalesce(concentracion, ''),
    coalesce(forma_farmaceutica, ''),
    lower(coalesce(laboratorio, ''))
  )
  where registro_norm is not null;

-- El comparador filtra por estos campos al listar ofertas.
create index if not exists idx_producto_registro_norm
  on public.producto_maestro (registro_norm)
  where registro_norm is not null;

create index if not exists idx_producto_estado_registro
  on public.producto_maestro (estado_registro);

-- Búsqueda del proveedor y de la farmacia: se teclea por marca ("Funzal"), por
-- principio activo ("terbinafina") o por laboratorio ("Procaps"), y casi siempre
-- a medias ("terbi"). El search_vector no resuelve prefijos parciales, así que la
-- búsqueda va por ILIKE y necesita un índice trigram en cada columna consultada.
-- El de nombre ya existe desde la migración del catálogo maestro.
create index if not exists idx_producto_principio_trgm
  on public.producto_maestro using gin (principio_activo gin_trgm_ops);

create index if not exists idx_producto_laboratorio_trgm
  on public.producto_maestro using gin (laboratorio gin_trgm_ops);

-- Los filtros de la pantalla de agregar (forma, laboratorio, marca/genérico).
create index if not exists idx_producto_forma
  on public.producto_maestro (forma_farmaceutica);

create index if not exists idx_producto_tipo
  on public.producto_maestro (tipo);
