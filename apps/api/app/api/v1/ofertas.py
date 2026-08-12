from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentUserId, ProviderOrgId, SupabaseDep
from app.schemas.common import ApiResponse
from app.schemas.ofertas import (
    Oferta,
    OfertaBulkRequest,
    OfertaBulkResult,
    OfertaCreate,
    OfertaEliminada,
    OfertaUpdate,
    SolicitudesMaestroRequest,
    SolicitudesMaestroResult,
)

router = APIRouter(prefix="/ofertas", tags=["ofertas"])

_SELECT = "*, producto:producto_maestro(id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria)"


@router.get("/")
async def listar_ofertas(
    org_id: ProviderOrgId,
    db: SupabaseDep,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiResponse[list[Oferta]]:
    """Catálogo del proveedor: sus ofertas con el producto embebido (p2-catalogo)."""
    res = (
        db.table("ofertas")
        .select(_SELECT)
        .eq("organizacion_id", org_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return ApiResponse(data=[Oferta(**row) for row in (res.data or [])])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def crear_oferta(
    payload: OfertaCreate, org_id: ProviderOrgId, db: SupabaseDep
) -> ApiResponse[Oferta]:
    """Activa un producto del maestro con precio y stock (p3-agregar)."""
    existe = (
        db.table("ofertas")
        .select("id")
        .eq("organizacion_id", org_id)
        .eq("producto_maestro_id", payload.producto_maestro_id)
        .execute()
    )
    if existe.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "oferta_ya_existe")

    res = (
        db.table("ofertas")
        .insert(
            {
                "organizacion_id": org_id,
                "producto_maestro_id": payload.producto_maestro_id,
                "precio": payload.precio,
                "stock_disponible": payload.stock_disponible,
                "activo": payload.activo,
            }
        )
        .execute()
    )
    creada = _reload(db, res.data[0]["id"], org_id)
    return ApiResponse(data=creada)


@router.patch("/{oferta_id}")
async def actualizar_oferta(
    oferta_id: str,
    payload: OfertaUpdate,
    org_id: ProviderOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[Oferta]:
    """Actualiza precio / stock / activo. Registra el cambio de precio en historial."""
    actual = (
        db.table("ofertas")
        .select("id, precio")
        .eq("id", oferta_id)
        .eq("organizacion_id", org_id)  # scope: solo ofertas propias
        .execute()
    )
    if not actual.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "oferta_no_encontrada")

    cambios = payload.model_dump(exclude_none=True)
    if not cambios:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "sin_cambios")

    precio_anterior = float(actual.data[0]["precio"])
    (
        db.table("ofertas")
        .update(cambios)
        .eq("id", oferta_id)
        .eq("organizacion_id", org_id)
        .execute()
    )

    if "precio" in cambios and float(cambios["precio"]) != precio_anterior:
        db.table("historial_precios").insert(
            {
                "oferta_id": oferta_id,
                "precio_anterior": precio_anterior,
                "precio_nuevo": cambios["precio"],
                "cambiado_por": user_id,
            }
        ).execute()

    return ApiResponse(data=_reload(db, oferta_id, org_id))


@router.delete("/{oferta_id}")
def eliminar_oferta(
    oferta_id: str, org_id: ProviderOrgId, db: SupabaseDep
) -> ApiResponse[OfertaEliminada]:
    """Saca una oferta del catálogo del proveedor ("Sacar del catálogo").

    Solo se permite si la oferta nunca fue parte de una orden: `orden_items.oferta_id`
    es `on delete restrict`, así que una oferta con historial de órdenes debe pausarse
    (activo=false), no borrarse. `historial_precios` cae en cascada.
    """
    actual = (
        db.table("ofertas")
        .select("id")
        .eq("id", oferta_id)
        .eq("organizacion_id", org_id)  # scope: solo ofertas propias
        .execute()
    )
    if not actual.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "oferta_no_encontrada")

    # ¿Referenciada por alguna orden? (FK on delete restrict → el DELETE fallaría).
    en_orden = (
        db.table("orden_items").select("id").eq("oferta_id", oferta_id).limit(1).execute()
    )
    if en_orden.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "oferta_en_orden")

    db.table("ofertas").delete().eq("id", oferta_id).eq("organizacion_id", org_id).execute()
    return ApiResponse(data=OfertaEliminada(id=oferta_id))


@router.post("/solicitudes-maestro", status_code=status.HTTP_201_CREATED)
def solicitar_al_maestro(
    payload: SolicitudesMaestroRequest,
    org_id: ProviderOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[SolicitudesMaestroResult]:
    """Registra medicamentos del archivo del proveedor que NO están en el
    catálogo maestro, para que el equipo de la plataforma los cure y agregue
    (bandeja del admin). Evita duplicar solicitudes pendientes idénticas."""
    pendientes = (
        db.table("solicitudes_maestro")
        .select("nombre")
        .eq("organizacion_id", org_id)
        .eq("estado", "pendiente")
        .execute()
    ).data or []
    ya = {p["nombre"].strip().lower() for p in pendientes}

    filas = [
        {
            "organizacion_id": org_id,
            "solicitado_por": user_id,
            "nombre": item.nombre.strip(),
            "presentacion": (item.presentacion or "").strip() or None,
            "unidades": (item.unidades or "").strip() or None,
        }
        for item in payload.items
        if item.nombre.strip().lower() not in ya
    ]
    if filas:
        db.table("solicitudes_maestro").insert(filas).execute()
    return ApiResponse(data=SolicitudesMaestroResult(registradas=len(filas)))


@router.post("/bulk")
def carga_masiva(
    payload: OfertaBulkRequest,
    org_id: ProviderOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[OfertaBulkResult]:
    """Carga masiva por archivo (p5): upsert de ofertas del proveedor.

    Registra en `historial_precios` cada creación/cambio de precio, igual que la
    edición individual (auditoría pedida para las métricas del admin)."""
    # Precios actuales del proveedor (para detectar cambios y registrar historial).
    actuales = (
        db.table("ofertas")
        .select("id, producto_maestro_id, precio")
        .eq("organizacion_id", org_id)
        .execute()
    ).data or []
    por_producto = {o["producto_maestro_id"]: o for o in actuales}

    errores: list[str] = []
    ok = 0
    for item in payload.items:
        try:
            previa = por_producto.get(item.producto_maestro_id)
            precio_anterior = float(previa["precio"]) if previa else None

            res = (
                db.table("ofertas")
                .upsert(
                    {
                        "organizacion_id": org_id,
                        "producto_maestro_id": item.producto_maestro_id,
                        "precio": item.precio,
                        "stock_disponible": item.stock_disponible,
                        "activo": True,
                    },
                    on_conflict="organizacion_id,producto_maestro_id",
                )
                .execute()
            )
            # Registra historial si es nueva o si cambió el precio.
            if precio_anterior is None or float(item.precio) != precio_anterior:
                oferta_id = (previa or (res.data[0] if res.data else {})).get("id")
                if oferta_id:
                    db.table("historial_precios").insert(
                        {
                            "oferta_id": oferta_id,
                            "precio_anterior": precio_anterior,
                            "precio_nuevo": item.precio,
                            "cambiado_por": user_id,
                        }
                    ).execute()
            ok += 1
        except Exception as exc:  # noqa: BLE001 — reportamos por ítem, no abortamos el lote
            errores.append(f"{item.producto_maestro_id}: {exc}")
    return ApiResponse(
        data=OfertaBulkResult(
            procesadas=len(payload.items), creadas_o_actualizadas=ok, errores=errores
        )
    )


def _reload(db, oferta_id: str, org_id: str) -> Oferta:
    res = (
        db.table("ofertas")
        .select(_SELECT)
        .eq("id", oferta_id)
        .eq("organizacion_id", org_id)
        .single()
        .execute()
    )
    return Oferta(**res.data)
