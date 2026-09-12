import hashlib
from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

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
    RecepcionRequest,
)
from app.schemas.ordenes import OrdenEvento, OrdenItem

router = APIRouter(prefix="/farmacia", tags=["farmacia"])

_PRODUCTO_COLS = (
    "id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, "
    "laboratorio, categoria, tipo, via_administracion, condicion_venta"
)
_ITEM_PRODUCTO = "producto:producto_maestro!orden_items_producto_maestro_id_fkey(id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, laboratorio, categoria)"
_PEDIDO_SELECT = f"id, codigo, estado, total, proveedor_id, proveedor_alias, created_at, factura_numero, recepcion, recepcion_comentario, recepcion_at, proveedor:organizaciones!ordenes_proveedor_id_fkey(razon_social), items:orden_items({_ITEM_PRODUCTO}, id, producto_maestro_id, precio_unitario_snapshot, cantidad_solicitada, cantidad_aceptada, cantidad_no_aceptada, estado_item, producto_sustituto_id, oferta_sustituto_id), eventos:orden_eventos(tipo, created_at)"

# Sal del alias anónimo. No es un secreto criptográfico: solo garantiza que el
# alias no sea derivable del id por un tercero casual.
_ALIAS_SALT = "cero-agotados-alias-v2"
_ALIAS_TZ = ZoneInfo("America/Bogota")


def _alias_proveedor(org_id: str) -> str:
    """Etiqueta anónima ROTATIVA de un proveedor ("Proveedor 3F2A").

    Regla del fundador (2026-08-21): el alias NO es fijo — rota una vez al día
    (fecha de Bogotá) para que las farmacias no puedan correlacionar alias ↔
    proveedor real tras recibir entregas físicas. Dentro del día es estable
    (carrito y comparaciones consistentes); cada orden congela el alias vigente
    al crearse (columna ordenes.proveedor_alias, la escribe la RPC).

    DEBE producir exactamente el mismo texto que alias_proveedor_del_dia() en
    Postgres (test de paridad en test_stock_y_alias.py).
    """
    hoy = datetime.now(_ALIAS_TZ).strftime("%Y-%m-%d")
    tag = hashlib.md5(f"{org_id}:{hoy}:{_ALIAS_SALT}".encode()).hexdigest()[:4].upper()
    return f"Proveedor {tag}"


def _proveedores_al_aire(db) -> list[str]:
    """Ids de proveedores APROBADOS por el admin: solo sus ofertas se comparan.

    Gate 'on live': un proveedor en revisión/rechazado/suspendido puede tener
    catálogo, pero las farmacias no lo ven (regla de negocio del fundador).
    """
    res = (
        db.table("organizaciones")
        .select("id")
        .eq("tipo", "proveedor")
        .eq("estado_verificacion", "aprobado")
        .execute()
    )
    return [r["id"] for r in (res.data or [])]


# --------------------------------------------------------------------------- #
# Búsqueda y comparación (f1, f2) — SIN identidad del proveedor
# --------------------------------------------------------------------------- #

@router.get("/buscar")
def buscar_productos(
    org_id: PharmacyOrgId,
    db: SupabaseDep,
    q: Annotated[
        str | None, Query(description="Texto libre: marca, principio activo o laboratorio")
    ] = None,
    categoria: Annotated[str | None, Query(description="Grupo farmacológico")] = None,
    forma_farmaceutica: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ApiResponse[list[ProductoBusqueda]]:
    """Productos del maestro que tienen ofertas activas con stock, con el número
    de opciones y el precio "desde" (f1). Nunca expone qué proveedores ofertan."""
    al_aire = _proveedores_al_aire(db)
    if not al_aire:
        return ApiResponse(data=[])
    ofertas = (
        db.table("ofertas")
        .select("producto_maestro_id, precio")
        .eq("activo", True)
        .gt("stock_disponible", 0)
        .in_("organizacion_id", al_aire)
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

    # Misma búsqueda que usa el proveedor: por marca, principio activo o
    # laboratorio, tolerante a tildes y a errores de tecleo, ordenada por
    # relevancia. `p_incluir` la restringe a lo que hoy tiene oferta con stock.
    productos = (
        db.rpc(
            "buscar_productos_maestro",
            {
                "p_q": (q or "").strip() or None,
                "p_categoria": categoria,
                "p_forma": forma_farmaceutica,
                "p_incluir": list(conteo.keys()),
                "p_limit": limit,
                # Paginación para el scroll infinito de la búsqueda (f1).
                "p_offset": offset,
            },
        ).execute()
    ).data or []

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

    al_aire = _proveedores_al_aire(db)
    ofertas = (
        (
            db.table("ofertas")
            .select("id, organizacion_id, precio, stock_disponible")
            .eq("producto_maestro_id", producto_id)
            .eq("activo", True)
            .gt("stock_disponible", 0)
            .in_("organizacion_id", al_aire)
            .order("precio")
            .execute()
        ).data
        if al_aire
        else []
    ) or []

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
    # Regla dura del fundador (2026-08-21): una farmacia sin aprobar puede
    # navegar y comparar, pero NO comprar (simétrico al gate del proveedor).
    estado = (
        db.table("organizaciones")
        .select("estado_verificacion")
        .eq("id", org_id)
        .single()
        .execute()
    ).data["estado_verificacion"]
    if estado != "aprobado":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "farmacia_no_aprobada")

    ids = [i.oferta_id for i in payload.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "oferta_repetida_en_pedido")

    # Gate "on live": ninguna oferta puede ser de un proveedor fuera del aire
    # (cubre el caso de un proveedor suspendido con carritos abiertos).
    al_aire = set(_proveedores_al_aire(db))
    duenos = (
        db.table("ofertas").select("id, organizacion_id").in_("id", ids).execute()
    ).data or []
    fuera = [o["id"] for o in duenos if o["organizacion_id"] not in al_aire]
    if fuera or len(duenos) != len(ids):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "oferta_no_disponible")

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

    # Transparencia post-pedido: con las órdenes ya creadas, la pantalla de
    # confirmación muestra la razón social real de cada proveedor.
    prov_ids = list({o["proveedor_id"] for o in (res.data or [])})
    nombres = {
        org["id"]: org["razon_social"]
        for org in (
            db.table("organizaciones").select("id, razon_social").in_("id", prov_ids).execute()
        ).data
        or []
    }
    creadas = [
        OrdenCreada(
            orden_id=o["orden_id"],
            codigo=o["codigo"],
            # Alias congelado por la RPC (el id real nunca se expone).
            proveedor_alias=o.get("proveedor_alias") or _alias_proveedor(o["proveedor_id"]),
            proveedor_nombre=nombres.get(o["proveedor_id"]),
            n_items=o["n_items"],
            subtotal=round(float(o["subtotal"]), 2),
        )
        for o in (res.data or [])
    ]
    total = sum(c.subtotal for c in creadas)
    return ApiResponse(data=PedidoCreadoResult(ordenes=creadas, total=round(total, 2)))


# --------------------------------------------------------------------------- #
# Novedades (punto rojo): pedidos respondidos por el proveedor sin ver aún
# --------------------------------------------------------------------------- #

# Estados que fija el PROVEEDOR (los de la farmacia — cancelada/completada —
# no cuentan como novedad: los provocó ella misma).
_ESTADOS_NOVEDAD = ["aceptada_parcial", "aceptada_total", "rechazada", "despachada"]


@router.get("/resumen")
def resumen_farmacia(
    org_id: PharmacyOrgId, user_id: CurrentUserId, db: SupabaseDep
) -> ApiResponse[dict]:
    """Conteo ligero para el badge del tab "Mis pedidos" (novedades sin leer)."""
    visto = (
        db.table("profiles").select("pedidos_vistos_at").eq("id", user_id).single().execute()
    ).data["pedidos_vistos_at"]
    res = (
        db.table("ordenes")
        .select("id", count="exact")
        .eq("farmacia_id", org_id)
        .in_("estado", _ESTADOS_NOVEDAD)
        .gt("updated_at", visto)
        .execute()
    )
    return ApiResponse(data={"novedades": res.count or 0})


@router.post("/pedidos/visto")
def marcar_pedidos_vistos(
    org_id: PharmacyOrgId, user_id: CurrentUserId, db: SupabaseDep
) -> ApiResponse[dict]:
    """Marca la bandeja como vista (se llama al abrir "Mis pedidos")."""
    db.table("profiles").update({"pedidos_vistos_at": "now()"}).eq("id", user_id).execute()
    return ApiResponse(data={"ok": True})


# --------------------------------------------------------------------------- #
# Mis pedidos (f5, f6) — sin identidad del proveedor
# --------------------------------------------------------------------------- #

def _a_pedido(row: dict) -> PedidoFarmacia:
    items = [OrdenItem(**i) for i in (row.get("items") or [])]
    total_solicitado = sum(
        i.cantidad_solicitada * i.precio_unitario_snapshot for i in items
    )
    eventos = sorted(
        (OrdenEvento(**e) for e in (row.get("eventos") or [])),
        key=lambda e: e.created_at,
    )
    return PedidoFarmacia(
        id=row["id"],
        codigo=row["codigo"],
        estado=row["estado"],
        total=float(row["total"]),
        total_solicitado=round(total_solicitado, 2),
        # Alias congelado al crear la orden; fallback para filas históricas.
        proveedor_alias=row.get("proveedor_alias") or _alias_proveedor(row["proveedor_id"]),
        # Transparencia post-pedido (2026-09-04): pedido enviado → razón social
        # visible, para que la farmacia sepa a quién reclamar demoras.
        proveedor_nombre=(row.get("proveedor") or {}).get("razon_social"),
        created_at=row["created_at"],
        factura_numero=row.get("factura_numero"),
        # Veredicto de recepción (Tanda 5). Este mapeo es campo por campo a
        # propósito —filtra lo que no debe salir— así que un campo nuevo hay que
        # añadirlo aquí además de al SELECT y al schema.
        recepcion=row.get("recepcion"),
        recepcion_comentario=row.get("recepcion_comentario"),
        recepcion_at=row.get("recepcion_at"),
        items=items,
        eventos=eventos,
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

    Delega en la RPC transaccional `cancelar_pedido` (lock de la orden +
    devolución del stock reservado, atómicos): si el proveedor lo aceptó en
    paralelo, la RPC falla con estado_no_cancelable y devolvemos 409.
    """
    try:
        db.rpc(
            "cancelar_pedido",
            {"p_orden_id": orden_id, "p_farmacia_id": org_id, "p_actor": user_id},
        ).execute()
    except APIError as exc:
        msg = (exc.message or "").strip()
        if "pedido_no_encontrado" in msg:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "pedido_no_encontrado") from exc
        if "estado_no_cancelable" in msg:
            raise HTTPException(status.HTTP_409_CONFLICT, "estado_no_cancelable") from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg or "error_rpc") from exc
    return ApiResponse(data=_cargar_pedido(db, orden_id, org_id))


# Errores de la RPC de recepción → código HTTP. Todo lo que no esté aquí sale
# como 400 genérico: nunca se filtra el texto crudo de un error de Postgres.
_RECEPCION_HTTP: dict[str, int] = {
    "pedido_no_encontrado": status.HTTP_404_NOT_FOUND,
    "recepcion_ya_registrada": status.HTTP_409_CONFLICT,
    "estado_no_recibible": status.HTTP_409_CONFLICT,
    "alcance_invalido": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "sin_items": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "item_ajeno_o_inexistente": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "item_duplicado": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "cantidad_invalida": status.HTTP_422_UNPROCESSABLE_CONTENT,
    "comentario_muy_largo": status.HTTP_422_UNPROCESSABLE_CONTENT,
}


def _registrar_recepcion(
    db, orden_id: str, org_id: str, user_id: str, payload: RecepcionRequest
) -> PedidoFarmacia:
    """Única puerta para cerrar la recepción: aceptada o no aceptada.

    Antes, "confirmar recepción" era un UPDATE suelto —el único camino del ciclo
    de vida que no pasaba por una RPC con lock—, así que podía pisarse con una
    corrección de factura del proveedor. Ahora ambos desenlaces entran aquí.
    """
    try:
        db.rpc(
            "registrar_recepcion",
            {
                "p_orden_id": orden_id,
                "p_farmacia_id": org_id,
                "p_actor": user_id,
                "p_alcance": payload.alcance,
                "p_items": [
                    {"item_id": i.item_id, "cantidad": i.cantidad} for i in payload.items
                ],
                "p_comentario": payload.comentario,
            },
        ).execute()
    except APIError as exc:
        msg = (exc.message or "") + " " + (getattr(exc, "details", "") or "")
        for código, http in _RECEPCION_HTTP.items():
            if código in msg:
                raise HTTPException(http, código) from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "error_rpc") from exc
    return _cargar_pedido(db, orden_id, org_id)


@router.post("/pedidos/{orden_id}/recibir")
def recibir_pedido(
    orden_id: str, org_id: PharmacyOrgId, user_id: CurrentUserId, db: SupabaseDep
) -> ApiResponse[PedidoFarmacia]:
    """Confirma que el pedido llegó completo y conforme (completada, f6)."""
    return ApiResponse(
        data=_registrar_recepcion(
            db, orden_id, org_id, user_id, RecepcionRequest(alcance="aceptada")
        )
    )


@router.post("/pedidos/{orden_id}/no-aceptar")
def no_aceptar_pedido(
    orden_id: str,
    payload: RecepcionRequest,
    org_id: PharmacyOrgId,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[PedidoFarmacia]:
    """La farmacia registra que NO aceptó la entrega, entera o en parte (Tanda 5).

    Queda visible para el distribuidor. NO mueve stock y NO cambia si la venta
    cuenta: si la farmacia no recibió, el fallo es del distribuidor, no de la
    plataforma (decisión del fundador, 2026-09-11).
    """
    if payload.alcance == "aceptada":
        # Para eso está /recibir. Aceptar aquí haría que el nombre del endpoint
        # mintiera sobre lo que quedó registrado.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "alcance_invalido")
    return ApiResponse(
        data=_registrar_recepcion(db, orden_id, org_id, user_id, payload)
    )


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
