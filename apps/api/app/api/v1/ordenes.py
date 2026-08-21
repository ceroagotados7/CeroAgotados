from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from postgrest.exceptions import APIError

from app.deps import CurrentUserId, ProviderOrgId, SupabaseDep
from app.schemas.common import ApiResponse
from app.schemas.ordenes import AceptarOrdenRequest, Orden

router = APIRouter(prefix="/ordenes", tags=["ordenes"])

_ITEM_PRODUCTO = "producto:producto_maestro!orden_items_producto_maestro_id_fkey(id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria)"
_FARMACIA = "farmacia:organizaciones!ordenes_farmacia_id_fkey(razon_social, nit, ciudad)"
_SELECT = f"*, {_FARMACIA}, items:orden_items({_ITEM_PRODUCTO}, id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada, cantidad_aceptada, estado_item, producto_sustituto_id, oferta_sustituto_id), eventos:orden_eventos(tipo, created_at)"


@router.get("/")
async def listar_ordenes(
    org_id: ProviderOrgId,
    db: SupabaseDep,
    estado: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiResponse[list[Orden]]:
    """Órdenes recibidas por el proveedor (p4-ordenes)."""
    query = db.table("ordenes").select(_SELECT).eq("proveedor_id", org_id)
    if estado:
        query = query.eq("estado", estado)
    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return ApiResponse(data=[Orden(**row) for row in (res.data or [])])


@router.get("/resumen")
async def resumen_ordenes(org_id: ProviderOrgId, db: SupabaseDep) -> ApiResponse[dict]:
    """Conteo ligero para el badge de notificación (punto rojo del bottom-nav).

    Declarado ANTES de /{orden_id} para que "resumen" no se capture como id.
    """
    res = (
        db.table("ordenes")
        .select("id", count="exact")
        .eq("proveedor_id", org_id)
        .eq("estado", "pendiente")
        .execute()
    )
    return ApiResponse(data={"pendientes": res.count or 0})


@router.get("/{orden_id}")
async def detalle_orden(
    orden_id: str, org_id: ProviderOrgId, db: SupabaseDep
) -> ApiResponse[Orden]:
    """Detalle de una orden recibida (p6-orden-detalle)."""
    orden = _cargar_orden(db, orden_id, org_id)
    return ApiResponse(data=orden)


@router.post("/{orden_id}/aceptar")
async def aceptar_orden(
    orden_id: str,
    payload: AceptarOrdenRequest,
    org_id: ProviderOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[Orden]:
    """Aplica la decisión del proveedor (aceptación total/parcial, sustitución).

    Delega en la RPC transaccional `aceptar_orden` (atómica + lock optimista).
    """
    try:
        db.rpc(
            "aceptar_orden",
            {
                "p_orden_id": orden_id,
                "p_proveedor_id": org_id,
                "p_actor": user_id,
                "p_decisiones": [d.model_dump() for d in payload.decisiones],
            },
        ).execute()
    except APIError as exc:
        raise _map_rpc_error(exc)
    return ApiResponse(data=_cargar_orden(db, orden_id, org_id))


@router.post("/{orden_id}/despachar")
async def despachar_orden(
    orden_id: str, org_id: ProviderOrgId, user_id: CurrentUserId, db: SupabaseDep
) -> ApiResponse[Orden]:
    """Marca una orden aceptada como despachada."""
    try:
        db.rpc(
            "despachar_orden",
            {"p_orden_id": orden_id, "p_proveedor_id": org_id, "p_actor": user_id},
        ).execute()
    except APIError as exc:
        raise _map_rpc_error(exc)
    return ApiResponse(data=_cargar_orden(db, orden_id, org_id))


def _cargar_orden(db, orden_id: str, org_id: str) -> Orden:
    res = (
        db.table("ordenes")
        .select(_SELECT)
        .eq("id", orden_id)
        .eq("proveedor_id", org_id)  # scope: solo órdenes dirigidas a este proveedor
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "orden_no_encontrada")
    row = res.data[0]
    row["eventos"] = sorted(row.get("eventos") or [], key=lambda e: e["created_at"])
    return Orden(**row)


def _map_rpc_error(exc: APIError) -> HTTPException:
    msg = (exc.message or "").strip()
    if "no_autorizado" in msg:
        return HTTPException(status.HTTP_403_FORBIDDEN, "no_autorizado")
    if "orden_no_encontrada" in msg:
        return HTTPException(status.HTTP_404_NOT_FOUND, "orden_no_encontrada")
    if "estado_no_editable" in msg or "estado_no_despachable" in msg:
        return HTTPException(status.HTTP_409_CONFLICT, msg)
    return HTTPException(status.HTTP_400_BAD_REQUEST, msg or "error_rpc")
