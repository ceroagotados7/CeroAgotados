from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.deps import AdminUserId, SupabaseDep
from app.schemas.admin import (
    AdminDashboard,
    AdminGanancias,
    AdminProveedorDetalle,
    AdminResumen,
    DecisionProveedorRequest,
    DecisionSolicitudRequest,
    FarmaciaAdminItem,
    FarmaciasAdminResult,
    MargenProducto,
    ProveedorAdminItem,
    ProveedoresAdminResult,
    SolicitudesAdminResult,
    SolicitudMaestroAdmin,
    TransaccionReciente,
    VentaFarmaciaDeProveedor,
    VentaOrg,
)
from app.schemas.common import ApiResponse
from app.schemas.verificacion import (
    TIPOS_DOCUMENTO,
    AdminDocumento,
    AdminDocumentosResult,
    DecisionDocumentoRequest,
)

router = APIRouter(prefix="/admin", tags=["admin"])

# Estados que cuentan como venta (mismos del dashboard del proveedor).
_VENTA_ESTADOS = {"aceptada_total", "aceptada_parcial", "despachada", "completada"}

_MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

_ORDEN_SELECT = (
    "id, codigo, total, estado, created_at, farmacia_id, proveedor_id,"
    " farmacia:organizaciones!ordenes_farmacia_id_fkey(razon_social),"
    " proveedor:organizaciones!ordenes_proveedor_id_fkey(razon_social)"
)


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _es_mes(dt: datetime, ref: datetime) -> bool:
    return dt.year == ref.year and dt.month == ref.month


def _ventas(db) -> list[dict]:
    """Órdenes con venta + nombres de ambas puntas (el admin ve identidades)."""
    filas = db.table("ordenes").select(_ORDEN_SELECT).execute().data or []
    return [f for f in filas if f["estado"] in _VENTA_ESTADOS]


@router.get("/dashboard")
def admin_dashboard(admin: AdminUserId, db: SupabaseDep) -> ApiResponse[AdminDashboard]:
    """a1 — métricas del mes: GMV, órdenes, ticket, actividad y tops."""
    now = datetime.now(UTC)
    mes_anterior = now.replace(day=1) - timedelta(days=1)
    ventas = _ventas(db)

    gmv_mes = 0.0
    gmv_prev = 0.0
    ordenes_mes = 0
    por_proveedor: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "ordenes": 0, "nombre": ""})
    por_farmacia: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "ordenes": 0, "nombre": ""})

    for v in ventas:
        cuando = _parse_dt(v["created_at"])
        total = float(v["total"])
        if _es_mes(cuando, now):
            gmv_mes += total
            ordenes_mes += 1
            p = por_proveedor[v["proveedor_id"]]
            p["total"] += total
            p["ordenes"] += 1
            p["nombre"] = (v.get("proveedor") or {}).get("razon_social", "Proveedor")
            f = por_farmacia[v["farmacia_id"]]
            f["total"] += total
            f["ordenes"] += 1
            f["nombre"] = (v.get("farmacia") or {}).get("razon_social", "Farmacia")
        elif _es_mes(cuando, mes_anterior):
            gmv_prev += total

    orgs = db.table("organizaciones").select("tipo", count=None).execute().data or []

    def _top(d: dict[str, dict], n: int = 5) -> list[VentaOrg]:
        filas = sorted(d.items(), key=lambda kv: kv[1]["total"], reverse=True)[:n]
        return [
            VentaOrg(id=k, nombre=v["nombre"], total=round(v["total"], 2), ordenes=v["ordenes"])
            for k, v in filas
        ]

    return ApiResponse(
        data=AdminDashboard(
            mes=f"{_MESES[now.month - 1].capitalize()} {now.year}",
            gmv_mes=round(gmv_mes, 2),
            variacion_pct=round((gmv_mes - gmv_prev) / gmv_prev * 100, 1) if gmv_prev > 0 else None,
            ordenes_mes=ordenes_mes,
            ticket_promedio=round(gmv_mes / ordenes_mes, 2) if ordenes_mes else 0.0,
            proveedores_activos=sum(1 for o in orgs if o["tipo"] == "proveedor"),
            farmacias_activas=sum(1 for o in orgs if o["tipo"] == "farmacia"),
            ventas_por_proveedor=_top(por_proveedor),
            top_farmacias=_top(por_farmacia, 3),
        )
    )


# --------------------------------------------------------------------------- #
# Verificación de proveedores (gate "on live")
# --------------------------------------------------------------------------- #

_DECISIONES_VALIDAS = {"aprobado", "rechazado", "suspendido"}


@router.get("/resumen")
def admin_resumen(admin: AdminUserId, db: SupabaseDep) -> ApiResponse[AdminResumen]:
    """Conteo ligero para el badge de notificación del panel admin."""
    res = (
        db.table("organizaciones")
        .select("id", count="exact")
        .eq("tipo", "proveedor")
        .eq("estado_verificacion", "en_revision")
        .execute()
    )
    farm = (
        db.table("organizaciones")
        .select("id", count="exact")
        .eq("tipo", "farmacia")
        .eq("estado_verificacion", "en_revision")
        .execute()
    )
    sol = (
        db.table("solicitudes_maestro")
        .select("id", count="exact")
        .eq("estado", "pendiente")
        .execute()
    )
    return ApiResponse(
        data=AdminResumen(
            proveedores_en_revision=res.count or 0,
            farmacias_en_revision=farm.count or 0,
            solicitudes_pendientes=sol.count or 0,
        )
    )


# --------------------------------------------------------------------------- #
# Solicitudes al catálogo maestro (curaduría de la plataforma)
# --------------------------------------------------------------------------- #

_SOL_SELECT = "id, nombre, presentacion, unidades, estado, motivo_decision, created_at, organizacion:organizaciones(razon_social)"


def _a_solicitud(row: dict) -> SolicitudMaestroAdmin:
    return SolicitudMaestroAdmin(
        **{k: row[k] for k in ("id", "nombre", "presentacion", "unidades", "estado", "motivo_decision", "created_at")},
        proveedor=(row.get("organizacion") or {}).get("razon_social", "Proveedor"),
    )


@router.get("/solicitudes")
def admin_solicitudes(admin: AdminUserId, db: SupabaseDep) -> ApiResponse[SolicitudesAdminResult]:
    """Bandeja de medicamentos solicitados por proveedores para el maestro."""
    filas = (
        db.table("solicitudes_maestro")
        .select(_SOL_SELECT)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    ).data or []
    conteos: dict[str, int] = {"pendiente": 0, "agregada": 0, "descartada": 0}
    for f in filas:
        conteos[f["estado"]] = conteos.get(f["estado"], 0) + 1
    return ApiResponse(
        data=SolicitudesAdminResult(solicitudes=[_a_solicitud(f) for f in filas], conteos=conteos)
    )


@router.post("/solicitudes/{solicitud_id}/decision")
def admin_decidir_solicitud(
    solicitud_id: str,
    payload: DecisionSolicitudRequest,
    admin: AdminUserId,
    db: SupabaseDep,
) -> ApiResponse[SolicitudMaestroAdmin]:
    """Cura una solicitud: la AGREGA al maestro (creando el producto canónico
    con los datos que defina el admin) o la DESCARTA con motivo."""
    if payload.accion not in ("agregada", "descartada"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "accion_invalida")

    sol = (
        db.table("solicitudes_maestro").select("id, estado").eq("id", solicitud_id).execute()
    ).data
    if not sol:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "solicitud_no_encontrada")
    if sol[0]["estado"] != "pendiente":
        raise HTTPException(status.HTTP_409_CONFLICT, "solicitud_ya_decidida")

    producto_id: str | None = None
    if payload.accion == "agregada":
        if not (payload.nombre or "").strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "nombre_obligatorio")
        producto = (
            db.table("producto_maestro")
            .insert(
                {
                    "nombre": payload.nombre.strip(),
                    "principio_activo": (payload.principio_activo or "").strip() or None,
                    "concentracion": (payload.concentracion or "").strip() or None,
                    "forma_farmaceutica": (payload.forma_farmaceutica or "").strip() or None,
                    "presentacion": (payload.presentacion or "").strip() or None,
                    "laboratorio": (payload.laboratorio or "").strip() or None,
                    "categoria": (payload.categoria or "").strip() or None,
                    "activo": True,
                }
            )
            .execute()
        )
        producto_id = producto.data[0]["id"]
    elif not (payload.motivo or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "motivo_obligatorio")

    db.table("solicitudes_maestro").update(
        {
            "estado": payload.accion,
            "decidido_por": admin,
            "motivo_decision": (payload.motivo or "").strip() or None,
            "producto_creado_id": producto_id,
        }
    ).eq("id", solicitud_id).execute()

    fila = (
        db.table("solicitudes_maestro").select(_SOL_SELECT).eq("id", solicitud_id).single().execute()
    ).data
    return ApiResponse(data=_a_solicitud(fila))


@router.get("/proveedores")
def admin_proveedores(admin: AdminUserId, db: SupabaseDep) -> ApiResponse[ProveedoresAdminResult]:
    """Bandeja de verificación: todos los proveedores con su estado y conteos."""
    orgs = (
        db.table("organizaciones")
        .select("id, razon_social, nit, ciudad, estado_verificacion, motivo_decision, created_at")
        .eq("tipo", "proveedor")
        .order("created_at", desc=True)
        .execute()
    ).data or []

    ofertas = (
        db.table("ofertas").select("organizacion_id").execute()
    ).data or []
    n_ofertas: dict[str, int] = {}
    for o in ofertas:
        n_ofertas[o["organizacion_id"]] = n_ofertas.get(o["organizacion_id"], 0) + 1

    conteos: dict[str, int] = {"en_revision": 0, "aprobado": 0, "rechazado": 0, "suspendido": 0}
    filas = []
    for o in orgs:
        conteos[o["estado_verificacion"]] = conteos.get(o["estado_verificacion"], 0) + 1
        filas.append(
            ProveedorAdminItem(**o, medicamentos=n_ofertas.get(o["id"], 0))
        )
    return ApiResponse(data=ProveedoresAdminResult(proveedores=filas, conteos=conteos))


def _decidir_organizacion(
    org_id: str, tipo: str, payload: DecisionProveedorRequest, admin: str, db
) -> dict:
    """Aplica la decisión del admin sobre una organización del `tipo` dado.

    Regla dura del fundador: ninguna organización sin aprobar vende ni compra.
    Motivo obligatorio salvo aprobar; toda decisión queda en la bitácora.
    Devuelve la fila actualizada de la organización.
    """
    if payload.accion not in _DECISIONES_VALIDAS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "accion_invalida")
    if payload.accion != "aprobado" and not (payload.motivo or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "motivo_obligatorio")

    org = (
        db.table("organizaciones").select("id, tipo").eq("id", org_id).execute()
    ).data
    if not org or org[0]["tipo"] != tipo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{tipo}_no_encontrado")

    motivo = (payload.motivo or "").strip() or None
    db.table("organizaciones").update(
        {
            "estado_verificacion": payload.accion,
            "verificado": payload.accion == "aprobado",
            "motivo_decision": motivo,
        }
    ).eq("id", org_id).execute()

    db.table("organizacion_eventos").insert(
        {
            "organizacion_id": org_id,
            "actor_id": admin,
            "tipo": payload.accion,
            "payload": {"motivo": motivo} if motivo else {},
        }
    ).execute()

    return (
        db.table("organizaciones")
        .select("id, razon_social, nit, ciudad, estado_verificacion, motivo_decision, created_at")
        .eq("id", org_id)
        .single()
        .execute()
    ).data


@router.post("/proveedores/{proveedor_id}/decision")
def admin_decidir_proveedor(
    proveedor_id: str,
    payload: DecisionProveedorRequest,
    admin: AdminUserId,
    db: SupabaseDep,
) -> ApiResponse[ProveedorAdminItem]:
    """Aprueba, rechaza o suspende a un proveedor. Motivo obligatorio salvo aprobar.

    Al aprobar, sus ofertas entran a la comparación de las farmacias; al
    rechazar/suspender salen del aire (el catálogo del proveedor se conserva).
    """
    fila = _decidir_organizacion(proveedor_id, "proveedor", payload, admin, db)
    n = (
        db.table("ofertas").select("id", count="exact").eq("organizacion_id", proveedor_id).execute()
    ).count or 0
    return ApiResponse(data=ProveedorAdminItem(**fila, medicamentos=n))


# --------------------------------------------------------------------------- #
# Verificación de farmacias (mismo gate: sin aprobación no se compra)
# --------------------------------------------------------------------------- #

@router.get("/farmacias")
def admin_farmacias(admin: AdminUserId, db: SupabaseDep) -> ApiResponse[FarmaciasAdminResult]:
    """Bandeja de verificación: todas las farmacias con su estado y conteos."""
    orgs = (
        db.table("organizaciones")
        .select("id, razon_social, nit, ciudad, estado_verificacion, motivo_decision, created_at")
        .eq("tipo", "farmacia")
        .order("created_at", desc=True)
        .execute()
    ).data or []

    ordenes = (db.table("ordenes").select("farmacia_id").execute()).data or []
    n_pedidos: dict[str, int] = {}
    for o in ordenes:
        n_pedidos[o["farmacia_id"]] = n_pedidos.get(o["farmacia_id"], 0) + 1

    conteos: dict[str, int] = {"en_revision": 0, "aprobado": 0, "rechazado": 0, "suspendido": 0}
    filas = []
    for o in orgs:
        conteos[o["estado_verificacion"]] = conteos.get(o["estado_verificacion"], 0) + 1
        filas.append(FarmaciaAdminItem(**o, pedidos=n_pedidos.get(o["id"], 0)))
    return ApiResponse(data=FarmaciasAdminResult(farmacias=filas, conteos=conteos))


@router.post("/farmacias/{farmacia_id}/decision")
def admin_decidir_farmacia(
    farmacia_id: str,
    payload: DecisionProveedorRequest,
    admin: AdminUserId,
    db: SupabaseDep,
) -> ApiResponse[FarmaciaAdminItem]:
    """Aprueba, rechaza o suspende a una farmacia. Motivo obligatorio salvo aprobar.

    Sin aprobación la farmacia puede navegar y comparar, pero no crear pedidos.
    """
    fila = _decidir_organizacion(farmacia_id, "farmacia", payload, admin, db)
    n = (
        db.table("ordenes").select("id", count="exact").eq("farmacia_id", farmacia_id).execute()
    ).count or 0
    return ApiResponse(data=FarmaciaAdminItem(**fila, pedidos=n))


# --------------------------------------------------------------------------- #
# Documentos de verificación (el admin los revisa junto a la decisión)
# --------------------------------------------------------------------------- #

_BUCKET_DOCS = "documentos-verificacion"
_DOC_COLS_ADMIN = (
    "id, tipo, estado, motivo_rechazo, nombre_archivo, mime, tamano_bytes,"
    " storage_path, created_at, updated_at"
)


@router.get("/organizaciones/{org_id}/documentos")
def admin_documentos_de_org(
    org_id: str, admin: AdminUserId, db: SupabaseDep
) -> ApiResponse[AdminDocumentosResult]:
    """Documentos de una organización con URL firmada de corta vida (10 min)."""
    org = (
        db.table("organizaciones").select("id, razon_social").eq("id", org_id).execute()
    ).data
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organizacion_no_encontrada")

    filas = (
        db.table("documentos_verificacion")
        .select(_DOC_COLS_ADMIN)
        .eq("organizacion_id", org_id)
        .execute()
    ).data or []

    docs: list[AdminDocumento] = []
    for f in filas:
        url = None
        try:
            firmada = db.storage.from_(_BUCKET_DOCS).create_signed_url(f["storage_path"], 600)
            url = firmada.get("signedURL") or firmada.get("signedUrl")
        except Exception:  # noqa: BLE001 — sin URL el metadato sigue siendo útil
            url = None
        campos = {k: f[k] for k in f if k != "storage_path"}
        docs.append(AdminDocumento(**campos, url=url))

    return ApiResponse(
        data=AdminDocumentosResult(
            organizacion_id=org_id,
            razon_social=org[0]["razon_social"],
            tipos_requeridos=list(TIPOS_DOCUMENTO),
            documentos=docs,
        )
    )


@router.post("/documentos/{doc_id}/decision")
def admin_decidir_documento(
    doc_id: str,
    payload: DecisionDocumentoRequest,
    admin: AdminUserId,
    db: SupabaseDep,
) -> ApiResponse[AdminDocumento]:
    """Marca un documento como aprobado o rechazado (estado POR documento).

    El rechazo exige motivo; la organización lo ve y puede re-subir (lo que
    devuelve el documento a estado 'subido').
    """
    if payload.accion == "rechazado" and not (payload.motivo or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "motivo_obligatorio")
    doc = (
        db.table("documentos_verificacion").select("id").eq("id", doc_id).execute()
    ).data
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "documento_no_encontrado")

    fila = (
        db.table("documentos_verificacion")
        .update(
            {
                "estado": payload.accion,
                "motivo_rechazo": (payload.motivo or "").strip() or None,
                "revisado_por": admin,
            }
        )
        .eq("id", doc_id)
        .execute()
    ).data[0]
    campos = {k: fila[k] for k in fila if k in AdminDocumento.model_fields}
    return ApiResponse(data=AdminDocumento(**campos))


@router.get("/proveedores/{proveedor_id}")
def admin_proveedor_detalle(
    proveedor_id: str, admin: AdminUserId, db: SupabaseDep
) -> ApiResponse[AdminProveedorDetalle]:
    """a2 — detalle de un proveedor: ventas del mes y desglose por farmacia."""
    org = (
        db.table("organizaciones")
        .select("id, razon_social, verificado, tipo")
        .eq("id", proveedor_id)
        .execute()
    ).data
    if not org or org[0]["tipo"] != "proveedor":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "proveedor_no_encontrado")

    ofertas = (
        db.table("ofertas").select("id", count="exact").eq("organizacion_id", proveedor_id).execute()
    )
    now = datetime.now(UTC)
    ventas_mes = [
        v
        for v in _ventas(db)
        if v["proveedor_id"] == proveedor_id and _es_mes(_parse_dt(v["created_at"]), now)
    ]
    vendido = sum(float(v["total"]) for v in ventas_mes)

    por_farmacia: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "ordenes": 0, "nombre": ""})
    for v in ventas_mes:
        f = por_farmacia[v["farmacia_id"]]
        f["total"] += float(v["total"])
        f["ordenes"] += 1
        f["nombre"] = (v.get("farmacia") or {}).get("razon_social", "Farmacia")

    desglose = [
        VentaFarmaciaDeProveedor(
            nombre=f["nombre"],
            total=round(f["total"], 2),
            ordenes=f["ordenes"],
            pct_del_proveedor=round(f["total"] / vendido * 100, 1) if vendido else 0.0,
        )
        for f in sorted(por_farmacia.values(), key=lambda x: x["total"], reverse=True)
    ]

    return ApiResponse(
        data=AdminProveedorDetalle(
            id=proveedor_id,
            razon_social=org[0]["razon_social"],
            verificado=org[0]["verificado"],
            medicamentos=ofertas.count or 0,
            vendido_mes=round(vendido, 2),
            ordenes_mes=len(ventas_mes),
            farmacias=len(por_farmacia),
            ventas_por_farmacia=desglose,
        )
    )


@router.get("/ganancias")
def admin_ganancias(admin: AdminUserId, db: SupabaseDep) -> ApiResponse[AdminGanancias]:
    """a3 — ganancias por comisión (simulada sobre el GMV mientras el CEO
    decide el modelo definitivo de monetización)."""
    now = datetime.now(UTC)
    pct = settings.comision_pct
    ventas = _ventas(db)
    ventas_mes = [v for v in ventas if _es_mes(_parse_dt(v["created_at"]), now)]
    gmv = sum(float(v["total"]) for v in ventas_mes)

    # Margen por producto (sobre ítems aceptados de las ventas del mes).
    ids = [v["id"] for v in ventas_mes]
    margen: dict[str, dict] = defaultdict(lambda: {"gmv": 0.0, "cajas": 0})
    if ids:
        items = (
            db.table("orden_items")
            .select("orden_id, cantidad_aceptada, precio_unitario_snapshot, estado_item, producto:producto_maestro!orden_items_producto_maestro_id_fkey(nombre)")
            .in_("orden_id", ids)
            .execute()
        ).data or []
        for i in items:
            if i["estado_item"] not in ("aceptado", "sustituido") or not i["cantidad_aceptada"]:
                continue
            nombre = (i.get("producto") or {}).get("nombre", "Producto")
            m = margen[nombre]
            m["gmv"] += i["cantidad_aceptada"] * float(i["precio_unitario_snapshot"])
            m["cajas"] += i["cantidad_aceptada"]

    margen_prod = [
        MargenProducto(nombre=n, gmv=round(m["gmv"], 2), comision=round(m["gmv"] * pct, 2), cajas=m["cajas"])
        for n, m in sorted(margen.items(), key=lambda kv: kv[1]["gmv"], reverse=True)[:5]
    ]

    recientes = sorted(ventas, key=lambda v: v["created_at"], reverse=True)[:5]
    transacciones = [
        TransaccionReciente(
            codigo=v["codigo"],
            farmacia=(v.get("farmacia") or {}).get("razon_social", "Farmacia"),
            proveedor=(v.get("proveedor") or {}).get("razon_social", "Proveedor"),
            total=float(v["total"]),
            comision=round(float(v["total"]) * pct, 2),
        )
        for v in recientes
    ]

    return ApiResponse(
        data=AdminGanancias(
            mes=f"{_MESES[now.month - 1].capitalize()} {now.year}",
            comision_pct=pct,
            ganancia_mes=round(gmv * pct, 2),
            gmv_mes=round(gmv, 2),
            margen_por_orden=round(gmv * pct / len(ventas_mes), 2) if ventas_mes else 0.0,
            margen_por_producto=margen_prod,
            ultimas_transacciones=transacciones,
        )
    )
