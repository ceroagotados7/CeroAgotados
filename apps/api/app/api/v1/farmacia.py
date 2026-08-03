import hashlib
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from postgrest.exceptions import APIError

from app.deps import CurrentUserId, PharmacyOrgId, SupabaseDep
from app.schemas.catalogo import ProductoMaestro
from app.schemas.common import ApiResponse
from app.schemas.farmacia import (
    CompararResult,
    OpcionCompara,
    OrdenCreada,
    PedidoCreadoResult,
    PedidoCreate,
    PedidoFarmacia,
    ProductoBusqueda,
)
from app.schemas.ordenes import OrdenItem

router = APIRouter(prefix="/farmacia", tags=["farmacia"])

_PRODUCTO_COLS = "id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria"
_ITEM_PRODUCTO = "producto:producto_maestro!orden_items_producto_maestro_id_fkey(id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria)"
_PEDIDO_SELECT = f"id, codigo, estado, total, proveedor_id, created_at, items:orden_items({_ITEM_PRODUCTO}, id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada, cantidad_aceptada, estado_item, producto_sustituto_id, oferta_sustituto_id)"

# Sal fija del alias anónimo. No es un secreto criptográfico: solo garantiza que
# el alias no sea derivable del id por un tercero casual y que sea ESTABLE
# (mismo proveedor → mismo alias en comparación, pedido y seguimiento).
_ALIAS_SALT = "cero-agotados-alias-v1"


def _alias_proveedor(org_id: str) -> str:
    """Etiqueta anónima y estable de un proveedor ("Proveedor 3F2A")."""
    tag = hashlib.md5(f"{org_id}:{_ALIAS_SALT}".encode()).hexdigest()[:4].upper()
    return f"Proveedor {tag}"


# --------------------------------------------------------------------------- #
# Búsqueda y comparación (f1, f2) — SIN identidad del proveedor
# --------------------------------------------------------------------------- #

@router.get("/buscar")
def buscar_productos(
    org_id: PharmacyOrgId,
    db: SupabaseDep,
    q: Annotated[str | None, Query(description="Texto a buscar en nombre")] = None,
    categoria: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> ApiResponse[list[ProductoBusqueda]]:
    """Productos del maestro que tienen ofertas activas con stock, con el número
    de opciones y el precio "desde" (f1). Nunca expone qué proveedores ofertan."""
    ofertas = (
        db.table("ofertas")
        .select("producto_maestro_id, precio")
        .eq("activo", True)
        .gt("stock_disponible", 0)
        .execute()
    ).data or []

    conteo: dict[str, int] = {}
    minimo: dict[str, float] = {}
    for o in ofertas:
        pid = o["producto_maestro_id"]
        precio = float(o["precio"])
        conteo[pid] = conteo.get(pid, 0) + 1
        if pid not in minimo or precio < minimo[pid]:
            minimo[pid] = precio

    if not conteo:
        return ApiResponse(data=[])

    query = db.table("producto_maestro").select(_PRODUCTO_COLS).eq("activo", True)
    query = query.in_("id", list(conteo.keys()))
    if q:
        query = query.ilike("nombre", f"%{q}%")
    if categoria:
        query = query.eq("categoria", categoria)
    productos = (query.order("nombre").limit(limit).execute()).data or []

    return ApiResponse(
        data=[
            ProductoBusqueda(**p, opciones=conteo[p["id"]], precio_desde=minimo[p["id"]])
            for p in productos
        ]
    )


@router.get("/comparar/{producto_id}")
def comparar_producto(
    producto_id: str, org_id: PharmacyOrgId, db: SupabaseDep
) -> ApiResponse[CompararResult]:
    """Opciones anónimas para un producto, ordenadas por precio (f2).

    Cada opción lleva un alias opaco ("Proveedor 3F2A") — jamás la razón social.
    """
    prod = (
        db.table("producto_maestro")
        .select(_PRODUCTO_COLS)
        .eq("id", producto_id)
        .eq("activo", True)
        .execute()
    )
    if not prod.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "producto_no_encontrado")

    ofertas = (
        db.table("ofertas")
        .select("id, organizacion_id, precio, stock_disponible")
        .eq("producto_maestro_id", producto_id)
        .eq("activo", True)
        .gt("stock_disponible", 0)
        .order("precio")
        .execute()
    ).data or []

    precios = [float(o["precio"]) for o in ofertas]
    mejor = precios[0] if precios else None
    opciones = [
        OpcionCompara(
            oferta_id=o["id"],
            proveedor_alias=_alias_proveedor(o["organizacion_id"]),
            precio=float(o["precio"]),
            stock_disponible=o["stock_disponible"],
            es_mejor_precio=(i == 0),
            diferencia_vs_mejor=round(float(o["precio"]) - (mejor or 0), 2),
        )
        for i, o in enumerate(ofertas)
    ]
    return ApiResponse(
        data=CompararResult(
            producto=ProductoMaestro(**prod.data[0]),
            opciones_total=len(opciones),
            precio_min=mejor,
            precio_promedio=round(sum(precios) / len(precios), 2) if precios else None,
            opciones=opciones,
        )
    )


# --------------------------------------------------------------------------- #
# Crear pedido (f4) — una orden por proveedor, precio congelado
# --------------------------------------------------------------------------- #

@router.post("/pedido", status_code=status.HTTP_201_CREATED)
def crear_pedido(
    payload: PedidoCreate,
    org_id: PharmacyOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[PedidoCreadoResult]:
    """Convierte el carrito en órdenes: UNA por proveedor (f4), congelando el
    precio de cada ítem al valor vigente (snapshot).

    Delega en la RPC transaccional `crear_pedido` (atómica, con lock de las
    ofertas y código por secuencia). La respuesta anonimiza al proveedor.
    """
    ids = [i.oferta_id for i in payload.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "oferta_repetida_en_pedido")

    try:
        res = db.rpc(
            "crear_pedido",
            {
                "p_farmacia_id": org_id,
                "p_actor": user_id,
                "p_items": [i.model_dump() for i in payload.items],
                "p_notas": payload.notas,
            },
        ).execute()
    except APIError as exc:
        msg = (exc.message or "").strip()
        if any(
            e in msg
            for e in ("oferta_no_disponible", "stock_insuficiente", "cantidad_invalida", "pedido_vacio")
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, msg) from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_crear_pedido") from exc

    creadas = [
        OrdenCreada(
            orden_id=o["orden_id"],
            codigo=o["codigo"],
            proveedor_alias=_alias_proveedor(o["proveedor_id"]),  # id → alias, nunca expuesto
            n_items=o["n_items"],
            subtotal=round(float(o["subtotal"]), 2),
        )
        for o in (res.data or [])
    ]
    total = sum(c.subtotal for c in creadas)
    return ApiResponse(data=PedidoCreadoResult(ordenes=creadas, total=round(total, 2)))


# --------------------------------------------------------------------------- #
# Mis pedidos (f5, f6) — sin identidad del proveedor
# --------------------------------------------------------------------------- #

def _a_pedido(row: dict) -> PedidoFarmacia:
    items = [OrdenItem(**i) for i in (row.get("items") or [])]
    total_solicitado = sum(
        i.cantidad_solicitada * i.precio_unitario_snapshot for i in items
    )
    return PedidoFarmacia(
        id=row["id"],
        codigo=row["codigo"],
        estado=row["estado"],
        total=float(row["total"]),
        total_solicitado=round(total_solicitado, 2),
        proveedor_alias=_alias_proveedor(row["proveedor_id"]),
        created_at=row["created_at"],
        items=items,
    )


@router.get("/pedidos")
def listar_pedidos(
    org_id: PharmacyOrgId,
    db: SupabaseDep,
    estado: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiResponse[list[PedidoFarmacia]]:
    """Pedidos de la farmacia (f5). El proveedor aparece solo como alias anónimo."""
    query = db.table("ordenes").select(_PEDIDO_SELECT).eq("farmacia_id", org_id)
    if estado:
        query = query.eq("estado", estado)
    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return ApiResponse(data=[_a_pedido(r) for r in (res.data or [])])


@router.get("/pedidos/{orden_id}")
def detalle_pedido(
    orden_id: str, org_id: PharmacyOrgId, db: SupabaseDep
) -> ApiResponse[PedidoFarmacia]:
    """Detalle de un pedido de la farmacia (f6)."""
    return ApiResponse(data=_cargar_pedido(db, orden_id, org_id))


@router.post("/pedidos/{orden_id}/cancelar")
def cancelar_pedido(
    orden_id: str, org_id: PharmacyOrgId, user_id: CurrentUserId, db: SupabaseDep
) -> ApiResponse[PedidoFarmacia]:
    """Cancela un pedido mientras el proveedor no lo haya gestionado.

    UPDATE condicional (id + farmacia + estado='pendiente') → atómico: si el
    proveedor lo aceptó en paralelo, 0 filas afectadas y devolvemos 409.
    """
    _cargar_pedido(db, orden_id, org_id)  # 404 si no existe / no es suyo
    res = (
        db.table("ordenes")
        .update({"estado": "cancelada"})
        .eq("id", orden_id)
        .eq("farmacia_id", org_id)
        .eq("estado", "pendiente")
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "estado_no_cancelable")
    db.table("orden_eventos").insert(
        {"orden_id": orden_id, "actor_id": user_id, "tipo": "cancelada", "payload": {}}
    ).execute()
    return ApiResponse(data=_cargar_pedido(db, orden_id, org_id))


@router.post("/pedidos/{orden_id}/recibir")
def recibir_pedido(
    orden_id: str, org_id: PharmacyOrgId, user_id: CurrentUserId, db: SupabaseDep
) -> ApiResponse[PedidoFarmacia]:
    """Marca un pedido despachado como recibido (completada, f6)."""
    _cargar_pedido(db, orden_id, org_id)
    res = (
        db.table("ordenes")
        .update({"estado": "completada"})
        .eq("id", orden_id)
        .eq("farmacia_id", org_id)
        .eq("estado", "despachada")
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_409_CONFLICT, "estado_no_recibible")
    db.table("orden_eventos").insert(
        {"orden_id": orden_id, "actor_id": user_id, "tipo": "completada", "payload": {}}
    ).execute()
    return ApiResponse(data=_cargar_pedido(db, orden_id, org_id))


def _cargar_pedido(db, orden_id: str, org_id: str) -> PedidoFarmacia:
    res = (
        db.table("ordenes")
        .select(_PEDIDO_SELECT)
        .eq("id", orden_id)
        .eq("farmacia_id", org_id)  # scope: solo pedidos de esta farmacia
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "pedido_no_encontrado")
    return _a_pedido(res.data[0])
