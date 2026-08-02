"""Pruebas de integración del flujo del proveedor.

Requieren el Supabase local corriendo (`supabase start` + `supabase db reset`).
Si no está disponible, se saltan (fixture `live_db`). Codifican los criterios de
aceptación del flujo proveedor de Cero Agotados.
"""

import pytest

from app.supabase_client import get_service_client

pytestmark = pytest.mark.usefixtures("live_db")

ORG_PROVEEDOR1 = "0000000a-0000-0000-0000-000000000001"
ORDENES_SEED = ["ORD-0001", "ORD-0002"]


def _producto_id(nombre: str) -> str:
    res = get_service_client().table("producto_maestro").select("id").eq("nombre", nombre).single().execute()
    return res.data["id"]


def _orden_id(codigo: str) -> str:
    res = get_service_client().table("ordenes").select("id").eq("codigo", codigo).single().execute()
    return res.data["id"]


@pytest.fixture(autouse=True)
def _fresh_ordenes():
    """Idempotencia sin `db reset`: restaura las órdenes semilla a 'pendiente'
    antes de cada prueba, para que la suite sea repetible y ordenada de cualquier
    forma (cierra el hallazgo de proceso del CTO). No toca cantidades ni snapshots."""
    db = get_service_client()
    for codigo in ORDENES_SEED:
        oid = _orden_id(codigo)
        db.table("ordenes").update({"estado": "pendiente", "total": 0}).eq("id", oid).execute()
        db.table("orden_items").update(
            {
                "estado_item": "pendiente",
                "cantidad_aceptada": 0,
                "producto_sustituto_id": None,
                "oferta_sustituto_id": None,
            }
        ).eq("orden_id", oid).execute()
    yield


# --------------------------------------------------------------------------- #
# Catálogo y dashboard
# --------------------------------------------------------------------------- #

def test_buscar_catalogo(client, headers_proveedor1):
    # Con incluir_ofertados=true se ve todo el maestro (usado por la carga masiva).
    r = client.get(
        "/v1/catalogo/",
        params={"q": "ibupro", "incluir_ofertados": "true"},
        headers=headers_proveedor1,
    )
    assert r.status_code == 200
    nombres = [p["nombre"] for p in r.json()["data"]]
    assert any("Ibuprofeno" in n for n in nombres)


def test_catalogo_excluye_ofertados(client, headers_proveedor1):
    """Por defecto (p3), el catálogo maestro NO muestra lo que el proveedor ya oferta."""
    r = client.get("/v1/catalogo/", params={"q": "ibupro"}, headers=headers_proveedor1)
    assert r.status_code == 200
    # proveedor1 ya oferta Ibuprofeno 400mg → no debe aparecer para agregar.
    nombres = [p["nombre"] for p in r.json()["data"]]
    assert "Ibuprofeno 400mg" not in nombres


def test_dashboard_proveedor(client, headers_proveedor1):
    r = client.get("/v1/dashboard/", headers=headers_proveedor1)
    assert r.status_code == 200
    data = r.json()["data"]
    # El seed deja 2 órdenes pendientes y 1 oferta sin stock (Ciprofloxacino).
    assert data["ordenes_pendientes"] >= 2
    assert data["productos_sin_stock"] >= 1
    assert data["medicamentos_activos"] >= 1
    # Nuevos campos del dashboard enriquecido (p1).
    assert isinstance(data["organizacion"], str) and data["organizacion"]
    assert len(data["serie_7_dias"]) == 7
    assert isinstance(data["ordenes_recientes"], list)


def test_me(client, headers_proveedor1):
    r = client.get("/v1/me/", headers=headers_proveedor1)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["organizacion"]["tipo"] == "proveedor"
    assert data["organizacion"]["razon_social"]


# --------------------------------------------------------------------------- #
# Ofertas: crear, actualizar precio (con historial)
# --------------------------------------------------------------------------- #

def test_crear_y_actualizar_oferta_con_historial(client, headers_proveedor1):
    db = get_service_client()
    prod = _producto_id("Cetirizina 10mg")  # el proveedor1 no la ofrece en el seed
    # Limpieza previa por si una corrida anterior la dejó.
    db.table("ofertas").delete().eq("organizacion_id", ORG_PROVEEDOR1).eq("producto_maestro_id", prod).execute()

    r = client.post(
        "/v1/ofertas/",
        json={"producto_maestro_id": prod, "precio": 5000, "stock_disponible": 100},
        headers=headers_proveedor1,
    )
    assert r.status_code == 201, r.text
    oferta_id = r.json()["data"]["id"]

    # Crear la misma otra vez => conflicto.
    r_dup = client.post(
        "/v1/ofertas/",
        json={"producto_maestro_id": prod, "precio": 5000, "stock_disponible": 100},
        headers=headers_proveedor1,
    )
    assert r_dup.status_code == 409

    # Actualizar precio => se registra en historial_precios.
    r_upd = client.patch(f"/v1/ofertas/{oferta_id}", json={"precio": 5500}, headers=headers_proveedor1)
    assert r_upd.status_code == 200
    assert float(r_upd.json()["data"]["precio"]) == 5500.0

    hist = db.table("historial_precios").select("*").eq("oferta_id", oferta_id).execute()
    assert len(hist.data) == 1
    assert float(hist.data[0]["precio_anterior"]) == 5000.0
    assert float(hist.data[0]["precio_nuevo"]) == 5500.0

    # Limpieza.
    db.table("ofertas").delete().eq("id", oferta_id).execute()


def _producto_no_ofertado() -> str:
    """Un producto del maestro que el proveedor1 aún no oferta (sin depender de nombres)."""
    db = get_service_client()
    ofertados = {
        o["producto_maestro_id"]
        for o in (db.table("ofertas").select("producto_maestro_id").eq("organizacion_id", ORG_PROVEEDOR1).execute().data or [])
    }
    for p in db.table("producto_maestro").select("id").eq("activo", True).execute().data or []:
        if p["id"] not in ofertados:
            return p["id"]
    raise RuntimeError("no hay producto sin ofertar para la prueba")


def test_carga_masiva_registra_historial(client, headers_proveedor1):
    """La carga masiva (bulk) también deja rastro en historial_precios (hallazgo CTO)."""
    db = get_service_client()
    prod = _producto_no_ofertado()
    db.table("ofertas").delete().eq("organizacion_id", ORG_PROVEEDOR1).eq("producto_maestro_id", prod).execute()

    # Alta por bulk -> historial con precio_anterior NULL.
    r = client.post(
        "/v1/ofertas/bulk",
        json={"items": [{"producto_maestro_id": prod, "precio": 7000, "stock_disponible": 50}]},
        headers=headers_proveedor1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["creadas_o_actualizadas"] == 1

    of = (
        db.table("ofertas").select("id").eq("organizacion_id", ORG_PROVEEDOR1).eq("producto_maestro_id", prod).single().execute()
    ).data
    hist = db.table("historial_precios").select("*").eq("oferta_id", of["id"]).execute()
    assert len(hist.data) >= 1

    # Segunda carga con precio distinto -> nuevo historial con precio_anterior 7000.
    r2 = client.post(
        "/v1/ofertas/bulk",
        json={"items": [{"producto_maestro_id": prod, "precio": 7500, "stock_disponible": 40}]},
        headers=headers_proveedor1,
    )
    assert r2.status_code == 200
    hist2 = db.table("historial_precios").select("*").eq("oferta_id", of["id"]).order("created_at").execute()
    assert float(hist2.data[-1]["precio_anterior"]) == 7000.0
    assert float(hist2.data[-1]["precio_nuevo"]) == 7500.0

    db.table("ofertas").delete().eq("id", of["id"]).execute()


# --------------------------------------------------------------------------- #
# Órdenes: listar, congelamiento de precio, aceptación parcial, sustitución, RLS
# --------------------------------------------------------------------------- #

def test_listar_ordenes_recibidas(client, headers_proveedor1):
    r = client.get("/v1/ordenes/", headers=headers_proveedor1)
    assert r.status_code == 200
    codigos = [o["codigo"] for o in r.json()["data"]]
    assert "ORD-0001" in codigos and "ORD-0002" in codigos


def test_precio_congelado_en_orden(client, headers_proveedor1):
    """El precio del ítem se congela al crear la orden: cambiar la oferta no lo mueve."""
    db = get_service_client()
    ord_id = _orden_id("ORD-0001")

    detalle = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
    item_acet = next(i for i in detalle["items"] if i["producto"]["nombre"] == "Acetaminofén 500mg")
    snapshot = float(item_acet["precio_unitario_snapshot"])

    # Subir el precio de la oferta de Acetaminofén del proveedor1.
    prod = _producto_id("Acetaminofén 500mg")
    db.table("ofertas").update({"precio": 99999}).eq("organizacion_id", ORG_PROVEEDOR1).eq(
        "producto_maestro_id", prod
    ).execute()

    detalle2 = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
    item2 = next(i for i in detalle2["items"] if i["producto"]["nombre"] == "Acetaminofén 500mg")
    assert float(item2["precio_unitario_snapshot"]) == snapshot  # NO cambió

    # Restaurar.
    db.table("ofertas").update({"precio": 8500}).eq("organizacion_id", ORG_PROVEEDOR1).eq(
        "producto_maestro_id", prod
    ).execute()


def test_aceptacion_parcial(client, headers_proveedor1):
    ord_id = _orden_id("ORD-0001")
    detalle = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
    items = {i["producto"]["nombre"]: i for i in detalle["items"]}

    acet = items["Acetaminofén 500mg"]      # aceptar completo
    ibup = items["Ibuprofeno 400mg"]        # aceptar parcial (mitad)
    amox = items["Amoxicilina 500mg"]       # rechazar

    decisiones = [
        {"item_id": acet["id"], "estado": "aceptado", "cantidad_aceptada": acet["cantidad_solicitada"]},
        {"item_id": ibup["id"], "estado": "aceptado", "cantidad_aceptada": ibup["cantidad_solicitada"] // 2},
        {"item_id": amox["id"], "estado": "rechazado", "cantidad_aceptada": 0},
    ]
    r = client.post(f"/v1/ordenes/{ord_id}/aceptar", json={"decisiones": decisiones}, headers=headers_proveedor1)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["estado"] == "aceptada_parcial"

    esperado = (
        acet["cantidad_solicitada"] * float(acet["precio_unitario_snapshot"])
        + (ibup["cantidad_solicitada"] // 2) * float(ibup["precio_unitario_snapshot"])
    )
    assert float(data["total"]) == pytest.approx(esperado)


def test_sustitucion_por_falta_de_stock(client, headers_proveedor1):
    ord_id = _orden_id("ORD-0002")
    detalle = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
    items = {i["producto"]["nombre"]: i for i in detalle["items"]}
    cipro = items["Ciprofloxacino 500mg"]   # sin stock -> sustituir
    lora = items["Loratadina 10mg"]         # aceptar

    # Sustituir Ciprofloxacino por Cefalexina (otro producto del maestro).
    sustituto = _producto_id("Cefalexina 500mg")
    decisiones = [
        {
            "item_id": cipro["id"],
            "estado": "sustituido",
            "cantidad_aceptada": cipro["cantidad_solicitada"],
            "producto_sustituto_id": sustituto,
        },
        {"item_id": lora["id"], "estado": "aceptado", "cantidad_aceptada": lora["cantidad_solicitada"]},
    ]
    r = client.post(f"/v1/ordenes/{ord_id}/aceptar", json={"decisiones": decisiones}, headers=headers_proveedor1)
    assert r.status_code == 200, r.text

    detalle2 = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
    item_cipro = next(i for i in detalle2["items"] if i["id"] == cipro["id"])
    assert item_cipro["estado_item"] == "sustituido"
    assert item_cipro["producto_sustituto_id"] == sustituto


def test_rls_proveedor2_no_ve_orden_de_proveedor1(client, headers_proveedor2):
    """Aislamiento multi-tenant: el proveedor2 no accede a órdenes del proveedor1."""
    ord_id = _orden_id("ORD-0001")
    r = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor2)
    assert r.status_code == 404  # no existe *para él*


def test_farmacia_no_es_proveedor(client, headers_farmacia1):
    """Un usuario de farmacia no puede usar endpoints de proveedor."""
    r = client.get("/v1/ofertas/", headers=headers_farmacia1)
    assert r.status_code == 403


# --------------------------------------------------------------------------- #
# Sacar del catálogo (DELETE /v1/ofertas/{id})
# --------------------------------------------------------------------------- #

def test_sacar_oferta_del_catalogo(client, headers_proveedor1):
    """Una oferta sin órdenes se puede sacar; su historial cae en cascada."""
    db = get_service_client()
    prod = _producto_no_ofertado()
    r = client.post(
        "/v1/ofertas/",
        json={"producto_maestro_id": prod, "precio": 4000, "stock_disponible": 10},
        headers=headers_proveedor1,
    )
    assert r.status_code == 201, r.text
    oferta_id = r.json()["data"]["id"]

    r_del = client.delete(f"/v1/ofertas/{oferta_id}", headers=headers_proveedor1)
    assert r_del.status_code == 200, r_del.text
    assert r_del.json()["data"]["id"] == oferta_id

    quedan = db.table("ofertas").select("id").eq("id", oferta_id).execute()
    assert not quedan.data
    # Repetir el DELETE => 404 (ya no existe).
    assert client.delete(f"/v1/ofertas/{oferta_id}", headers=headers_proveedor1).status_code == 404


def test_no_sacar_oferta_con_ordenes(client, headers_proveedor1):
    """Una oferta referenciada por una orden NO se borra (FK restrict): 409."""
    db = get_service_client()
    prod = _producto_id("Acetaminofén 500mg")  # está en ORD-0001 del seed
    of = (
        db.table("ofertas").select("id").eq("organizacion_id", ORG_PROVEEDOR1).eq("producto_maestro_id", prod).single().execute()
    ).data
    r = client.delete(f"/v1/ofertas/{of['id']}", headers=headers_proveedor1)
    assert r.status_code == 409
    assert r.json()["detail"] == "oferta_en_orden"
    # Sigue existiendo.
    assert db.table("ofertas").select("id").eq("id", of["id"]).execute().data


def test_no_sacar_oferta_ajena(client, headers_proveedor2):
    """Multi-tenant: un proveedor no puede borrar ofertas de otro (404 para él)."""
    db = get_service_client()
    of = (
        db.table("ofertas").select("id").eq("organizacion_id", ORG_PROVEEDOR1).limit(1).execute()
    ).data[0]
    r = client.delete(f"/v1/ofertas/{of['id']}", headers=headers_proveedor2)
    assert r.status_code == 404
    assert db.table("ofertas").select("id").eq("id", of["id"]).execute().data
