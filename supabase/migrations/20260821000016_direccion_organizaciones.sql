-- Cero Agotados — Dirección de la organización
-- =============================================
-- Pedida en el registro de la farmacia (obligatoria en el formulario) para que
-- el proveedor sepa a dónde despachar: se muestra en el detalle de la orden y
-- en la hoja imprimible de bodega. Nullable: las organizaciones existentes la
-- agregan desde su pantalla de Cuenta.

alter table public.organizaciones add column if not exists direccion text;
