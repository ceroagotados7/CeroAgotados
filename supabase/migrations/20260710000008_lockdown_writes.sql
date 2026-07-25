-- Cero Agotados — endurecimiento: solo el backend (service_role) escribe las tablas de negocio
-- ============================================================================================
-- Hallazgo del CTO (review flujo proveedor): la migración de grants dio CRUD a `authenticated`,
-- lo que permitiría a un usuario real (p. ej. una farmacia con su JWT) mutar `ordenes`/`orden_items`
-- por REST directo, saltándose la RPC transaccional (lock optimista, recálculo de total, bitácora)
-- y el congelamiento de precio. Todas las mutaciones deben pasar por FastAPI (service_role).
-- Aquí revocamos la escritura directa de `authenticated`/`anon` sobre las tablas transaccionales
-- y de catálogo; conservan SELECT (gobernado por RLS). `service_role` mantiene acceso total.

revoke insert, update, delete on public.ordenes            from authenticated, anon;
revoke insert, update, delete on public.orden_items        from authenticated, anon;
revoke insert, update, delete on public.orden_eventos      from authenticated, anon;
revoke insert, update, delete on public.historial_precios  from authenticated, anon;
revoke insert, update, delete on public.ofertas            from authenticated, anon;
revoke insert, update, delete on public.producto_maestro   from authenticated, anon;

-- Las políticas RLS de escritura sobre estas tablas quedan inertes sin el GRANT base (defensa en
-- profundidad); se conservan como documentación de intención para cuando algún flujo autenticado
-- deba escribir vía RLS en el futuro. `service_role` bypassa RLS y no depende de estos grants.
