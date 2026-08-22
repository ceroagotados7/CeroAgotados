// Tipos del dominio, espejo de los schemas de la API (apps/api/app/schemas).

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
};

export type ProductoMaestro = {
  id: string;
  nombre: string;
  principio_activo?: string | null;
  concentracion?: string | null;
  forma_farmaceutica?: string | null;
  presentacion?: string | null;
  laboratorio?: string | null;
  categoria?: string | null;
  precio_min_mercado?: number | null;
};

export type Oferta = {
  id: string;
  organizacion_id: string;
  producto_maestro_id: string;
  precio: number;
  stock_disponible: number;
  activo: boolean;
  producto?: ProductoMaestro | null;
};

export type EstadoOrden =
  | "pendiente"
  | "aceptada_parcial"
  | "aceptada_total"
  | "rechazada"
  | "despachada"
  | "completada"
  | "cancelada";

export type EstadoItem = "pendiente" | "aceptado" | "rechazado" | "sustituido";

export type OrdenItem = {
  id: string;
  producto_maestro_id: string;
  precio_unitario_snapshot: number;
  cantidad_solicitada: number;
  cantidad_aceptada: number;
  estado_item: EstadoItem;
  producto_sustituto_id?: string | null;
  oferta_sustituto_id?: string | null;
  producto?: ProductoMaestro | null;
};

export type OrgRef = {
  razon_social?: string | null;
  nit?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
};

/** Hito del timeline de una orden (sin actor: no expone identidades). */
export type OrdenEvento = {
  tipo: string;
  created_at: string;
};

export type Orden = {
  id: string;
  codigo: string;
  farmacia_id: string;
  proveedor_id: string;
  estado: EstadoOrden;
  total: number;
  created_at: string;
  farmacia?: OrgRef | null;
  items: OrdenItem[];
  eventos?: OrdenEvento[];
};

export type VentaDia = {
  dia: string;
  total: number;
};

export type OrdenReciente = {
  id: string;
  codigo: string;
  farmacia: string;
  items: number;
  total: number;
  estado: EstadoOrden;
};

export type ProveedorDashboard = {
  organizacion: string;
  ventas_mes: number;
  variacion_pct: number | null;
  variacion_semana_pct: number | null;
  ordenes_pendientes: number;
  medicamentos_activos: number;
  productos_sin_stock: number;
  serie_7_dias: VentaDia[];
  ordenes_recientes: OrdenReciente[];
};

export type EstadoVerificacion = "en_revision" | "aprobado" | "rechazado" | "suspendido";

export type Organizacion = {
  id: string;
  tipo: string;
  razon_social: string;
  nit?: string | null;
  ciudad?: string | null;
  direccion?: string | null;
  verificado: boolean;
  estado_verificacion: EstadoVerificacion;
  motivo_decision?: string | null;
};

export type Perfil = {
  id: string;
  nombre?: string | null;
};

export type Me = {
  // null para el admin de plataforma (no pertenece a una organización).
  organizacion: Organizacion | null;
  perfil: Perfil;
  es_admin?: boolean;
};

export type ItemDecision = {
  item_id: string;
  estado: "aceptado" | "rechazado" | "sustituido";
  cantidad_aceptada: number;
  /** 'sin_stock' en un rechazo = agotado real → la oferta queda en stock 0. */
  motivo?: "sin_stock" | null;
  producto_sustituto_id?: string | null;
  oferta_sustituto_id?: string | null;
};

/* ------------------------------------------------------------------ */
/* Flujo Farmacia (f1–f6). El proveedor SIEMPRE viene anonimizado      */
/* (`proveedor_alias`): la API nunca expone su identidad a farmacias.  */
/* ------------------------------------------------------------------ */

export type ProductoBusqueda = ProductoMaestro & {
  opciones: number;
  precio_desde: number;
};

export type OpcionCompara = {
  oferta_id: string;
  proveedor_alias: string;
  precio: number;
  stock_disponible: number;
  es_mejor_precio: boolean;
  diferencia_vs_mejor: number;
};

export type CompararResult = {
  producto: ProductoMaestro;
  opciones_total: number;
  precio_min?: number | null;
  precio_promedio?: number | null;
  opciones: OpcionCompara[];
};

export type OrdenCreada = {
  orden_id: string;
  codigo: string;
  proveedor_alias: string;
  n_items: number;
  subtotal: number;
};

export type PedidoCreadoResult = {
  ordenes: OrdenCreada[];
  total: number;
};

export type PedidoFarmacia = {
  id: string;
  codigo: string;
  estado: EstadoOrden;
  total: number;
  total_solicitado: number;
  proveedor_alias: string;
  created_at: string;
  items: OrdenItem[];
  eventos?: OrdenEvento[];
};

/* ------------------------------------------------------------------ */
/* Flujo Admin (a1–a3). El admin SÍ ve identidades reales.             */
/* ------------------------------------------------------------------ */

export type VentaOrg = {
  id: string;
  nombre: string;
  total: number;
  ordenes: number;
};

export type AdminDashboard = {
  mes: string;
  gmv_mes: number;
  variacion_pct?: number | null;
  ordenes_mes: number;
  ticket_promedio: number;
  proveedores_activos: number;
  farmacias_activas: number;
  ventas_por_proveedor: VentaOrg[];
  top_farmacias: VentaOrg[];
};

export type AdminProveedorDetalle = {
  id: string;
  razon_social: string;
  verificado: boolean;
  medicamentos: number;
  vendido_mes: number;
  ordenes_mes: number;
  farmacias: number;
  ventas_por_farmacia: { nombre: string; total: number; ordenes: number; pct_del_proveedor: number }[];
};

export type ProveedorAdminItem = {
  id: string;
  razon_social: string;
  nit?: string | null;
  ciudad?: string | null;
  estado_verificacion: EstadoVerificacion;
  motivo_decision?: string | null;
  created_at: string;
  medicamentos: number;
};

export type ProveedoresAdminResult = {
  proveedores: ProveedorAdminItem[];
  conteos: Record<string, number>;
};

export type AdminResumen = {
  proveedores_en_revision: number;
  farmacias_en_revision?: number;
  solicitudes_pendientes: number;
};

/* ------------------------------------------------------------------ */
/* Verificación documental (Cámara de comercio, NIT/RUT, cédula).      */
/* ------------------------------------------------------------------ */

export type TipoDocumento = "camara_comercio" | "nit_rut" | "cedula_representante";
export type EstadoDocumento = "subido" | "aprobado" | "rechazado";

export type DocumentoVerificacion = {
  id: string;
  tipo: TipoDocumento;
  estado: EstadoDocumento;
  motivo_rechazo?: string | null;
  nombre_archivo: string;
  mime: string;
  tamano_bytes: number;
  created_at: string;
  updated_at: string;
};

export type DocumentosResult = {
  tipos_requeridos: TipoDocumento[];
  documentos: DocumentoVerificacion[];
  completo: boolean;
};

export type AdminDocumento = DocumentoVerificacion & { url?: string | null };

export type AdminDocumentosResult = {
  organizacion_id: string;
  razon_social: string;
  tipos_requeridos: TipoDocumento[];
  documentos: AdminDocumento[];
};

export type FarmaciaAdminItem = {
  id: string;
  razon_social: string;
  nit?: string | null;
  ciudad?: string | null;
  estado_verificacion: EstadoVerificacion;
  motivo_decision?: string | null;
  created_at: string;
  pedidos: number;
};

export type FarmaciasAdminResult = {
  farmacias: FarmaciaAdminItem[];
  conteos: Record<string, number>;
};

export type SolicitudMaestroAdmin = {
  id: string;
  nombre: string;
  presentacion?: string | null;
  unidades?: string | null;
  estado: "pendiente" | "agregada" | "descartada";
  motivo_decision?: string | null;
  proveedor: string;
  created_at: string;
};

export type SolicitudesAdminResult = {
  solicitudes: SolicitudMaestroAdmin[];
  conteos: Record<string, number>;
};

export type AdminGanancias = {
  mes: string;
  comision_pct: number;
  ganancia_mes: number;
  gmv_mes: number;
  margen_por_orden: number;
  margen_por_producto: { nombre: string; gmv: number; comision: number; cajas: number }[];
  ultimas_transacciones: { codigo: string; farmacia: string; proveedor: string; total: number; comision: number }[];
};
