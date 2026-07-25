from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter

from app.deps import ProviderOrgId, SupabaseDep
from app.schemas.common import ApiResponse
from app.schemas.dashboard import OrdenReciente, ProveedorDashboard, VentaDia

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Estados que cuentan como venta (para métricas de ingresos).
_VENTA_ESTADOS = {"aceptada_total", "aceptada_parcial", "despachada", "completada"}
_DIA_LETRA = ["L", "M", "M", "J", "V", "S", "D"]  # lunes=0 … domingo=6

_RECIENTE_SELECT = (
    "id, codigo, total, estado, created_at,"
    " farmacia:organizaciones!ordenes_farmacia_id_fkey(razon_social),"
    " items:orden_items(count)"
)


def _parse_dt(value: str) -> datetime:
    """Parsea un timestamp ISO de Postgres a datetime con zona horaria."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _variacion(actual: float, previo: float) -> float | None:
    """Variación porcentual de `actual` respecto a `previo` (None si no hay base)."""
    if previo <= 0:
        return None
    return round((actual - previo) / previo * 100, 1)


@router.get("/")
def dashboard_proveedor(
    org_id: ProviderOrgId, db: SupabaseDep
) -> ApiResponse[ProveedorDashboard]:
    """Datos del dashboard del proveedor (p1): ventas del mes con variación,
    serie de 7 días, KPIs y órdenes recientes con el nombre de la farmacia."""
    org = (
        db.table("organizaciones")
        .select("razon_social")
        .eq("id", org_id)
        .single()
        .execute()
    ).data or {}

    ordenes = (
        db.table("ordenes")
        .select("estado, total, created_at")
        .eq("proveedor_id", org_id)
        .execute()
    ).data or []

    ofertas = (
        db.table("ofertas")
        .select("activo, stock_disponible")
        .eq("organizacion_id", org_id)
        .execute()
    ).data or []

    recientes = (
        db.table("ordenes")
        .select(_RECIENTE_SELECT)
        .eq("proveedor_id", org_id)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    ).data or []

    now = datetime.now(UTC)
    hoy = now.date()
    inicio_semana = hoy - timedelta(days=6)  # ventana de 7 días (incluye hoy)
    inicio_semana_previa = hoy - timedelta(days=13)

    ventas_mes = 0.0
    ventas_mes_anterior = 0.0
    ventas_semana = 0.0
    ventas_semana_previa = 0.0
    por_dia: dict[date, float] = {}
    mes_anterior = (now.replace(day=1) - timedelta(days=1))

    for o in ordenes:
        if o["estado"] not in _VENTA_ESTADOS:
            continue
        total = float(o["total"])
        cuando = _parse_dt(o["created_at"])
        d = cuando.date()

        if cuando.year == now.year and cuando.month == now.month:
            ventas_mes += total
        elif cuando.year == mes_anterior.year and cuando.month == mes_anterior.month:
            ventas_mes_anterior += total

        if inicio_semana <= d <= hoy:
            ventas_semana += total
            por_dia[d] = por_dia.get(d, 0.0) + total
        elif inicio_semana_previa <= d < inicio_semana:
            ventas_semana_previa += total

    serie = [
        VentaDia(
            dia=_DIA_LETRA[(inicio_semana + timedelta(days=i)).weekday()],
            total=por_dia.get(inicio_semana + timedelta(days=i), 0.0),
        )
        for i in range(7)
    ]

    ordenes_recientes = [
        OrdenReciente(
            id=r["id"],
            codigo=r["codigo"],
            farmacia=(r.get("farmacia") or {}).get("razon_social", "Farmacia"),
            items=(r["items"][0]["count"] if r.get("items") else 0),
            total=float(r["total"]),
            estado=r["estado"],
        )
        for r in recientes
    ]

    return ApiResponse(
        data=ProveedorDashboard(
            organizacion=org.get("razon_social", "Proveedor"),
            ventas_mes=ventas_mes,
            variacion_pct=_variacion(ventas_mes, ventas_mes_anterior),
            variacion_semana_pct=_variacion(ventas_semana, ventas_semana_previa),
            ordenes_pendientes=sum(1 for o in ordenes if o["estado"] == "pendiente"),
            medicamentos_activos=sum(1 for o in ofertas if o["activo"]),
            productos_sin_stock=sum(
                1 for o in ofertas if o["activo"] and o["stock_disponible"] == 0
            ),
            serie_7_dias=serie,
            ordenes_recientes=ordenes_recientes,
        )
    )
