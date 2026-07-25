from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import ProviderOrgId, SupabaseDep
from app.schemas.catalogo import ProductoMaestro
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/catalogo", tags=["catalogo"])

_COLS = "id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria"


@router.get("/")
def buscar_catalogo(
    org_id: ProviderOrgId,
    db: SupabaseDep,
    q: Annotated[str | None, Query(description="Texto a buscar en nombre")] = None,
    categoria: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 30,
    incluir_ofertados: Annotated[
        bool, Query(description="Incluir productos que el proveedor ya oferta (para matching de carga masiva)")
    ] = False,
) -> ApiResponse[list[ProductoMaestro]]:
    """Catálogo maestro para agregar ofertas (p3): productos que el proveedor
    aún NO oferta, con el precio más bajo del mercado como referencia.
    Con `incluir_ofertados=true` devuelve todo el maestro (usado por la carga masiva)."""
    ya_ids: set[str] = set()
    if not incluir_ofertados:
        # Productos que este proveedor ya oferta (para no ofrecérselos de nuevo).
        ya = (
            db.table("ofertas")
            .select("producto_maestro_id")
            .eq("organizacion_id", org_id)
            .execute()
        ).data or []
        ya_ids = {r["producto_maestro_id"] for r in ya}

    query = db.table("producto_maestro").select(_COLS).eq("activo", True)
    if q:
        query = query.ilike("nombre", f"%{q}%")
    if categoria:
        query = query.eq("categoria", categoria)
    # Pedimos de más para compensar los que filtramos por ya-ofertados.
    res = query.order("nombre").limit(limit + len(ya_ids)).execute()
    productos = [row for row in (res.data or []) if row["id"] not in ya_ids][:limit]

    # Precio mínimo de mercado por producto (ofertas activas de cualquier proveedor).
    ids = [p["id"] for p in productos]
    min_mercado: dict[str, float] = {}
    if ids:
        ofertas = (
            db.table("ofertas")
            .select("producto_maestro_id, precio")
            .in_("producto_maestro_id", ids)
            .eq("activo", True)
            .execute()
        ).data or []
        for o in ofertas:
            pid = o["producto_maestro_id"]
            precio = float(o["precio"])
            if pid not in min_mercado or precio < min_mercado[pid]:
                min_mercado[pid] = precio

    return ApiResponse(
        data=[
            ProductoMaestro(**p, precio_min_mercado=min_mercado.get(p["id"]))
            for p in productos
        ]
    )
