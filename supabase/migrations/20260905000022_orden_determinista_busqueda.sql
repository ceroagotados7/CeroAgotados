-- Cero Agotados - orden determinista para el scroll infinito (Grupo 3, 2026-09-05)
-- =============================================================================
-- La busqueda paginada (limit/offset) alimentaba "ver mas" y ahora un scroll
-- infinito en proveedor Y farmacia. El ORDER BY terminaba en (nombre,
-- presentacion): entre marcas homonimas el orden de los empates dependia del
-- plan de ejecucion, y dos paginas consecutivas podian solapar o saltarse
-- filas. Se recrea la funcion IDENTICA con un unico cambio: pm.id como
-- desempate final. (Definicion original: migracion 19.)

-- Cero Agotados — búsqueda del catálogo maestro (proveedor y farmacia)
-- =====================================================================
-- Con 27 productos de prueba bastaba `ilike` sobre nombre y orden alfabético.
-- Con el maestro real (>24k) eso se rompe de tres maneras:
--
--   1. Solo miraba `nombre`: quien buscaba "terbinafina" no encontraba "Funzal",
--      aunque la interfaz prometía buscar por principio activo.
--   2. Orden alfabético: "ibupro" devolvía 699 filas encabezadas por siete
--      presentaciones de "Advil Contra los Síntomas de la Gripa" (ibuprofeno
--      como tercer ingrediente), con el ibuprofeno puro enterrado.
--   3. Sin tolerancia: "acetaminofen" sin tilde daba 0 de 150 resultados.
--
-- PostgREST no sabe expresar un ORDER BY por relevancia, así que la búsqueda
-- vive aquí. También recibe los ya-ofertados como array en vez de en la URL,
-- que con miles de ofertas se desbordaba.
--
-- Dos decisiones de rendimiento, medidas sobre las 24k filas reales:
--
--   * El parecido se evalúa con el operador `<%`, no con word_similarity() como
--     función: la función obliga a recorrer toda la tabla (602 ms), el operador
--     usa el índice GIN de trigramas (50 ms).
--   * La función NO declara `SET search_path`. Postgres no puede hacer inline de
--     una función SQL que trae una cláusula SET, y sin inline el plan se
--     generaliza, ignora los índices y vuelve a 584 ms. En su lugar, cada objeto
--     va calificado con `public.`, que es lo que el search_path protegería. Es
--     seguro aquí: la función es SECURITY INVOKER (corre con los permisos de
--     quien llama, no escala privilegios) y es de solo lectura.
create or replace function public.buscar_productos_maestro(
  p_q           text    default null,
  p_categoria   text    default null,
  p_forma       text    default null,
  p_laboratorio text    default null,
  p_tipo        text    default null,
  -- Proveedor: lo que ya oferta, para no ofrecérselo de nuevo.
  p_excluir     uuid[]  default '{}',
  -- Farmacia: los únicos productos con oferta activa y stock. Vacío = sin filtro.
  p_incluir     uuid[]  default null,
  p_limit       int     default 30,
  p_offset      int     default 0
)
returns table (
  id                 uuid,
  nombre             text,
  principio_activo   text,
  concentracion      text,
  forma_farmaceutica text,
  presentacion       text,
  laboratorio        text,
  categoria          text,
  tipo               text,
  via_administracion text,
  condicion_venta    text
)
language sql
stable
security invoker
as $$
  select pm.id, pm.nombre, pm.principio_activo, pm.concentracion,
         pm.forma_farmaceutica, pm.presentacion, pm.laboratorio, pm.categoria,
         pm.tipo, pm.via_administracion, pm.condicion_venta
  from public.producto_maestro pm
  where pm.activo
    and (
      public.f_unaccent(lower(trim(coalesce(p_q, '')))) = ''
      -- Coincidencia literal sobre el texto normalizado: resuelve el caso común
      -- ("acetaminofen" encuentra "Acetaminofén").
      or pm.busqueda_norm like '%' || public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%'
      -- Y si no aparece literalmente, por parecido de palabra: así "acetaminofn"
      -- u "omeprasol" siguen funcionando.
      or public.f_unaccent(lower(trim(coalesce(p_q, '')))) operator(public.<%) pm.busqueda_norm
    )
    and (p_categoria   is null or pm.categoria          = p_categoria)
    and (p_forma       is null or pm.forma_farmaceutica = p_forma)
    and (p_laboratorio is null or pm.laboratorio        = p_laboratorio)
    and (p_tipo        is null or pm.tipo               = p_tipo)
    and (p_excluir = '{}' or pm.id <> all (p_excluir))
    and (p_incluir is null or pm.id = any (p_incluir))
  order by
    -- 1. La marca buscada primero, luego la molécula pura, después los
    --    combinados donde el término es un ingrediente más, y de últimas
    --    lo que solo se parece.
    case
      when public.f_unaccent(lower(trim(coalesce(p_q, '')))) = '' then 0
      when pm.nombre_norm    like public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%'        then 0
      when pm.nombre_norm    like '%' || public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%' then 1
      when pm.principio_norm like public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%'        then 2
      when pm.principio_norm like '%' || public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%' then 3
      when pm.busqueda_norm  like '%' || public.f_unaccent(lower(trim(coalesce(p_q, '')))) || '%' then 4
      else 5
    end,
    -- 2. Entre los aproximados, primero aquel cuyo nombre o molécula más se
    --    parece a lo tecleado: con "acetaminofeno" debe ganar "Acetaminofén",
    --    no "Acelifen". El nombre pesa doble porque es lo que el usuario cree
    --    estar escribiendo. Solo se calcula sobre las filas ya filtradas.
    case when public.f_unaccent(lower(trim(coalesce(p_q, '')))) = '' then 0
         else -(
                public.word_similarity(public.f_unaccent(lower(trim(coalesce(p_q, '')))), pm.nombre_norm) * 2
              + public.word_similarity(public.f_unaccent(lower(trim(coalesce(p_q, '')))), pm.principio_norm)
              )
    end,
    -- 3. "Ibuprofeno" antes que "Cafeína + Ibuprofeno".
    case when public.f_unaccent(lower(trim(coalesce(p_q, '')))) = '' then 0
         else length(coalesce(pm.principio_activo, '')) end,
    pm.nombre,
    pm.presentacion,
    -- 4. Tiebreaker DETERMINISTA: con marcas homonimas (mismo nombre y
    --    presentacion, distinto laboratorio) el orden entre empates quedaba
    --    al azar del plan, y la paginacion del scroll infinito podia repetir
    --    o saltarse productos entre paginas. El id lo fija.
    pm.id
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

comment on function public.buscar_productos_maestro is
  'Busqueda del catalogo maestro por marca, principio activo o laboratorio. '
  'Tolera tildes ausentes y errores de tecleo; ordena por relevancia.';

grant execute on function public.buscar_productos_maestro(
  text, text, text, text, text, uuid[], uuid[], int, int
) to service_role, authenticated;
