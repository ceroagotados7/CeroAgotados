-- Cero Agotados — endurecimiento: los clientes no leen tablas de negocio por REST directo
-- =======================================================================================
-- Hallazgo (auditoría CTO 2026-08-27, verificado con exploit en DEV): la policy
-- `ofertas_select` permitía a CUALQUIER usuario autenticado (proveedor o farmacia) leer
-- `ofertas` completa vía PostgREST con su propio JWT: `organizacion_id` + `precio` de
-- toda la competencia, sin pasar por FastAPI. Eso rompe la base del marketplace (los
-- proveedores fijan precio sin ver a los demás) y, en `ordenes.proveedor_id`, filtra el
-- UUID estable del proveedor a la farmacia — anulando el alias rotativo de anonimato.
--
-- El frontend usa Supabase SOLO para Auth (verificado: cero `.from()`/`.rpc()` en
-- apps/web); toda lectura de negocio pasa por FastAPI con `service_role` (bypassa RLS).
-- Por eso aquí revocamos el SELECT directo de `authenticated`/`anon` sobre TODO el
-- schema public, espejo del lockdown de escrituras (20260710000008). Las policies de
-- lectura quedan como defensa en profundidad y documentación de intención.

-- 1) Revocar lectura directa de los clientes sobre todas las tablas de negocio.
revoke select on all tables in schema public from authenticated, anon;

-- 2) Que las tablas futuras nazcan sin privilegios de cliente (la migración de grants
--    dejaba CRUD por defecto a `authenticated` y SELECT a `anon` en objetos nuevos).
alter default privileges in schema public
  revoke select, insert, update, delete on tables from authenticated;
alter default privileges in schema public
  revoke select on tables from anon;

-- 3) ofertas: la lectura amplia "para comparar precios entre proveedores" era el error
--    de diseño. Scope real: solo el proveedor dueño o el admin. (La comparación de
--    precios para FARMACIAS vive en FastAPI, que anonimiza al proveedor.)
drop policy if exists ofertas_select on public.ofertas;
create policy ofertas_select on public.ofertas for select
  using (public.is_org_member(organizacion_id) or (select public.is_platform_admin()));

-- Nota: `ordenes_select` se conserva (farmacia dueña / proveedor destinatario / admin):
-- su problema no eran las filas sino la COLUMNA `proveedor_id`, que RLS no puede
-- filtrar; el revoke del punto 1 cierra ese canal. Si algún día se re-otorga SELECT
-- directo sobre `ordenes`, debe hacerse vía una vista sin `proveedor_id`.
