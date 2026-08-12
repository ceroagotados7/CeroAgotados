from pydantic import BaseModel

# El admin es la PLATAFORMA: a diferencia del rol farmacia, sí ve las
# identidades reales de proveedores y farmacias (a1–a3).


class VentaOrg(BaseModel):
    """Una organización con su total vendido/comprado en el período."""

    id: str
    nombre: str
    total: float
    ordenes: int


class AdminDashboard(BaseModel):
    """a1 — métricas del mes actual."""

    mes: str
    gmv_mes: float
    variacion_pct: float | None = None
    ordenes_mes: int
    ticket_promedio: float
    proveedores_activos: int
    farmacias_activas: int
    ventas_por_proveedor: list[VentaOrg]
    top_farmacias: list[VentaOrg]


class VentaFarmaciaDeProveedor(BaseModel):
    nombre: str
    total: float
    ordenes: int
    pct_del_proveedor: float


class AdminProveedorDetalle(BaseModel):
    """a2 — detalle de un proveedor."""

    id: str
    razon_social: str
    verificado: bool
    medicamentos: int
    vendido_mes: float
    ordenes_mes: int
    farmacias: int
    ventas_por_farmacia: list[VentaFarmaciaDeProveedor]


class TransaccionReciente(BaseModel):
    codigo: str
    farmacia: str
    proveedor: str
    total: float
    comision: float


class MargenProducto(BaseModel):
    nombre: str
    gmv: float
    comision: float
    cajas: int


class AdminGanancias(BaseModel):
    """a3 — ganancias de la plataforma (comisión simulada)."""

    mes: str
    comision_pct: float
    ganancia_mes: float
    gmv_mes: float
    margen_por_orden: float
    margen_por_producto: list[MargenProducto]
    ultimas_transacciones: list[TransaccionReciente]


class ProveedorAdminItem(BaseModel):
    """Fila de la bandeja de verificación de proveedores."""

    id: str
    razon_social: str
    nit: str | None = None
    ciudad: str | None = None
    estado_verificacion: str
    motivo_decision: str | None = None
    created_at: str
    medicamentos: int


class ProveedoresAdminResult(BaseModel):
    proveedores: list[ProveedorAdminItem]
    conteos: dict[str, int]  # por estado_verificacion


class DecisionProveedorRequest(BaseModel):
    accion: str  # 'aprobado' | 'rechazado' | 'suspendido'
    motivo: str | None = None  # obligatorio al rechazar/suspender


class AdminResumen(BaseModel):
    """Conteo ligero para el badge del panel admin."""

    proveedores_en_revision: int
