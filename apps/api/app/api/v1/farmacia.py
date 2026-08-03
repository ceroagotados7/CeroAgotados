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

def _siguiente_codigo(db) -> str:
    """Siguiente código legible tipo ORD-0007. El UNIQUE de `codigo` protege la
    carrera: si dos pedidos chocan, el perdedor reintenta con el siguiente."""
    res = (
        db.table("ordenes").select("codigo").order("codigo", desc=True).limit(1).execute()
    ).data
    ultimo = int(res[0]["codigo"].split("-")[1]) if res else 0
    return f"ORD-{ultimo + 1:04d}"


@router.post("/pedido", status_code=status.HTTP_201_CREATED)
def crear_pedido(
    payload: PedidoCreate,
    org_id: PharmacyOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[PedidoCreadoResult]:
    """Convierte el carrito en órdenes: UNA por proveedor (f4), congelando el
    precio de cada ítem al valor vigente (snapshot).

    Nota de integridad: sin acceso DDL a la DB aún no hay RPC transaccional para
    la creación; se usa inserción compensada (si fallan los ítems se borra la
    orden, cascade limpia). El gate de integridad fuerte sigue siendo la RPC
    `aceptar_orden` del proveedor. TODO: mover a RPC cuando haya acceso de DDL.
    """
    ids = [i.oferta_id for i in payload.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "oferta_repetida_en_pedido")

    ofertas = (
        db.table("ofertas")
        .select("id, organizacion_id, producto_maestro_id, precio, stock_disponible, activo")
        .in_("id", ids)
        .execute()
    ).data or []
    por_id = {o["id"]: o for o in ofertas}

    errores: list[str] = []
    for item in payload.items:
        oferta = por_id.get(item.oferta_id)
        if oferta is None or not oferta["activo"]:
            errores.append(f"{item.oferta_id}: oferta_no_disponible")
        elif item.cantidad > oferta["stock_disponible"]:
            errores.append(f"{item.oferta_id}: stock_insuficiente")
    if errores:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "; ".join(errores))

    # Agrupa por proveedor: una orden por cada uno (regla f4).
    grupos: dict[str, list] = {}
    for item in payload.items:
        grupos.setdefault(por_id[item.oferta_id]["organizacion_id"], []).append(item)

    creadas: list[OrdenCreada] = []
    total = 0.0
    for proveedor_id, items in grupos.items():
        orden_id: str | None = None
        try:
            # Código con reintento: el UNIQUE de `codigo` resuelve la carrera.
            for _ in range(3):
                try:
                    orden = (
                        db.table("ordenes")
                        .insert(
                            {
                                "codigo": _siguiente_codigo(db),
                                "farmacia_id": org_id,
                                "proveedor_id": proveedor_id,
                                "estado": "pendiente",
                                "notas": payload.notas,
                                "created_by": user_id,
                            }
                        )
                        .execute()
                    )
                    break
                except APIError as exc:
                    if "duplicate" not in (exc.message or "").lower():
                        raise
            else:
                raise HTTPException(status.HTTP_409_CONFLICT, "no_se_pudo_generar_codigo")

            orden_id = orden.data[0]["id"]
            filas = [
                {
                    "orden_id": orden_id,
                    "oferta_id": item.oferta_id,
                    "producto_maestro_id": por_id[item.oferta_id]["producto_maestro_id"],
                    # Snapshot: el precio queda CONGELADO al valor vigente ahora.
                    "precio_unitario_snapshot": por_id[item.oferta_id]["precio"],
                    "cantidad_solicitada": item.cantidad,
                }
                for item in items
            ]
            db.table("orden_items").insert(filas).execute()
            db.table("orden_eventos").insert(
                {
                    "orden_id": orden_id,
                    "actor_id": user_id,
                    "tipo": "creada",
                    "payload": {"n_items": len(filas)},
                }
            ).execute()
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 — compensación: sin órdenes a medias
            if orden_id:
                db.table("ordenes").delete().eq("id", orden_id).execute()
            for c in creadas:  # revierte las órdenes hermanas ya creadas del pedido
                db.table("ordenes").delete().eq("id", c.orden_id).execute()
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "no_se_pudo_crear_pedido"
            ) from exc

        subtotal = sum(
            float(por_id[i.oferta_id]["precio"]) * i.cantidad for i in items
        )
        total += subtotal
        creadas.append(
            OrdenCreada(
                orden_id=orden_id,
                codigo=orden.data[0]["codigo"],
                proveedor_alias=_alias_proveedor(proveedor_id),
                n_items=len(items),
                subtotal=round(subtotal, 2),
            )
        )

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
