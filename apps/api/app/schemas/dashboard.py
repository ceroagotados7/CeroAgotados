from pydantic import BaseModel


class VentaDia(BaseModel):
    """Un punto de la serie de ventas de los últimos 7 días (para el mini-chart)."""

    dia: str  # etiqueta corta del día: L, M, M, J, V, S, D
    total: float


class OrdenReciente(BaseModel):
    """Fila de la lista 'Órdenes recientes' del dashboard (p1)."""

    id: str
    codigo: str
    farmacia: str
    items: int
    total: float
    estado: str


class ProveedorDashboard(BaseModel):
    """KPIs y datos del dashboard del proveedor (p1-dashboard)."""

    organizacion: str
    ventas_mes: float
    variacion_pct: float | None  # ventas del mes vs. mes anterior (%)
    variacion_semana_pct: float | None  # últimos 7 días vs. 7 días previos (%)
    ordenes_pendientes: int
    medicamentos_activos: int
    productos_sin_stock: int
    serie_7_dias: list[VentaDia]
    ordenes_recientes: list[OrdenReciente]
