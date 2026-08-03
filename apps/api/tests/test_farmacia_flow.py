"""Pruebas del flujo Farmacia (f1–f6).

Invariante central: el ANONIMATO del proveedor — ninguna respuesta del rol
farmacia puede contener la identidad del proveedor (razón social, NIT, ni el
UUID de su organización). Ver memoria `cero-agotados-anonimato-proveedor`.
"""

import json

import pytest

from app.supabase_client import get_service_client

pytestmark = pytest.mark.usefixtures("live_db")

ORG_PROVEEDOR1 = "0000000a-0000-0000-0000-000000000001"
ORG_PROVEEDOR2 = "0000000a-0000-0000-0000-000000000002"
RAZONES_SOCIALES = ("Distribuidora Nacional", "FarmaDistribución")


def _sin_identidad_de_proveedor(payload: dict) -> bool:
    """True si el payload no filtra identidad del proveedor por ningún campo."""
    texto = json.dumps(payload, ensure_ascii=False)
    if ORG_PROVEEDOR1 in texto or ORG_PROVEEDOR2 in texto:
        return False
    return not any(rs in texto for rs in RAZONES_SOCIALES)


@pytest.fixture
def limpiar_pedidos_nuevos():
    """Borra las órdenes creadas por estas pruebas (deja las semilla ORD-0001/2)."""
    yield
    db = get_service_client()
    filas = db.table("ordenes").select("id, codigo").execute().data or []
    for f in filas:
        if f["codigo"] not in ("ORD-0001", "ORD-0002"):
            db.table("ordenes").delete().eq("id", f["id"]).execute()


# --------------------------------------------------------------------------- #
# Búsqueda y comparación (f1, f2)
# --------------------------------------------------------------------------- #

def test_buscar_solo_con_opciones_y_sin_identidad(client, headers_farmacia1):
    r = client.get("/v1/farmacia/buscar", params={"q": "acetaminof"}, headers=headers_farmacia1)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data, "Acetaminofén tiene ofertas en el seed"
    p = next(d for d in data if d["nombre"] == "Acetaminofén 500mg")
    assert p["opciones"] >= 2  # ambos proveedores lo ofertan
    assert p["precio_desde"] > 0
    assert _sin_identidad_de_proveedor(r.json())


def test_comparar_ordenado_y_anonimo(client, headers_farmacia1):
    r_busq = client.get("/v1/farmacia/buscar", params={"q": "acetaminof"}, headers=headers_farmacia1)
    prod_id = r_busq.json()["data"][0]["id"]

    r = client.get(f"/v1/farmacia/comparar/{prod_id}", headers=headers_farmacia1)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    precios = [o["precio"] for o in data["opciones"]]
    assert precios == sorted(precios)  # ordenado por precio
    assert data["opciones"][0]["es_mejor_precio"] is True
    assert data["opciones"][0]["diferencia_vs_mejor"] == 0
    assert data["precio_min"] == precios[0]
    # Anonimato: alias con formato "Proveedor XXXX", sin identidad real.
    assert all(o["proveedor_alias"].startswith("Proveedor ") for o in data["opciones"])
    assert _sin_identidad_de_proveedor(r.json())


def test_comparar_producto_inexistente(client, headers_farmacia1):
    r = client.get(
        "/v1/farmacia/comparar/00000000-0000-0000-0000-00000000dead",
        headers=headers_farmacia1,
    )
    assert r.status_code == 404


def test_proveedor_no_puede_usar_endpoints_farmacia(client, headers_proveedor1):
    assert client.get("/v1/farmacia/buscar", headers=headers_proveedor1).status_code == 403
    assert client.get("/v1/farmacia/pedidos", headers=headers_proveedor1).status_code == 403


# --------------------------------------------------------------------------- #
# Crear pedido (f4): una orden por proveedor, snapshot, validaciones
# --------------------------------------------------------------------------- #

def _ofertas_de(org: str) -> list[dict]:
    db = get_service_client()
    return (
        db.table("ofertas")
        .select("id, precio, stock_disponible")
        .eq("organizacion_id", org)
        .eq("activo", True)
        .gt("stock_disponible", 0)
        .execute()
    ).data


def test_crear_pedido_multiproveedor(client, headers_farmacia1, limpiar_pedidos_nuevos):
    of1 = _ofertas_de(ORG_PROVEEDOR1)[0]
    of2 = _ofertas_de(ORG_PROVEEDOR2)[0]

    r = client.post(
        "/v1/farmacia/pedido",
        json={"items": [
            {"oferta_id": of1["id"], "cantidad": 2},
            {"oferta_id": of2["id"], "cantidad": 3},
        ]},
        headers=headers_farmacia1,
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    assert len(data["ordenes"]) == 2  # una orden POR proveedor
    esperado = float(of1["precio"]) * 2 + float(of2["precio"]) * 3
    assert data["total"] == pytest.approx(esperado)
    assert _sin_identidad_de_proveedor(r.json())

    # El precio quedó congelado (snapshot) en los ítems.
    db = get_service_client()
    orden_id = data["ordenes"][0]["orden_id"]
    items = db.table("orden_items").select("*").eq("orden_id", orden_id).execute().data
    assert all(float(i["precio_unitario_snapshot"]) > 0 for i in items)
    # Evento 'creada' registrado.
    ev = db.table("orden_eventos").select("tipo").eq("orden_id", orden_id).execute().data
    assert any(e["tipo"] == "creada" for e in ev)


def test_crear_pedido_stock_insuficiente(client, headers_farmacia1):
    of = _ofertas_de(ORG_PROVEEDOR1)[0]
    r = client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": of["id"], "cantidad": of["stock_disponible"] + 999}]},
        headers=headers_farmacia1,
    )
    assert r.status_code == 400
    assert "stock_insuficiente" in r.json()["detail"]


def test_crear_pedido_oferta_inexistente(client, headers_farmacia1):
    r = client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": "00000000-0000-0000-0000-00000000dead", "cantidad": 1}]},
        headers=headers_farmacia1,
    )
    assert r.status_code == 400
    assert "oferta_no_disponible" in r.json()["detail"]


def test_crear_pedido_cantidad_invalida(client, headers_farmacia1):
    of = _ofertas_de(ORG_PROVEEDOR1)[0]
    r = client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": of["id"], "cantidad": 0}]},
        headers=headers_farmacia1,
    )
    assert r.status_code == 422  # validación Pydantic (gt=0)


# --------------------------------------------------------------------------- #
# Mis pedidos (f5, f6): scoping, anonimato y ciclo de vida
# --------------------------------------------------------------------------- #

def test_listar_pedidos_anonimo(client, headers_farmacia1):
    r = client.get("/v1/farmacia/pedidos", headers=headers_farmacia1)
    assert r.status_code == 200
    codigos = [p["codigo"] for p in r.json()["data"]]
    assert "ORD-0001" in codigos  # las semilla son de farmacia1
    assert _sin_identidad_de_proveedor(r.json())
    # total_solicitado se calcula sobre los ítems.
    p1 = next(p for p in r.json()["data"] if p["codigo"] == "ORD-0001")
    assert p1["total_solicitado"] > 0


def test_detalle_pedido_ajeno_404(client, headers_farmacia1):
    """El detalle solo funciona para pedidos propios (scoping por farmacia)."""
    r = client.get(
        "/v1/farmacia/pedidos/00000000-0000-0000-0000-00000000dead",
        headers=headers_farmacia1,
    )
    assert r.status_code == 404


def test_cancelar_y_recibir_ciclo(client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos):
    of = _ofertas_de(ORG_PROVEEDOR1)[0]

    # 1) Cancelar un pedido pendiente → cancelada.
    r = client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": of["id"], "cantidad": 1}]},
        headers=headers_farmacia1,
    )
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    r_can = client.post(f"/v1/farmacia/pedidos/{orden_id}/cancelar", headers=headers_farmacia1)
    assert r_can.status_code == 200, r_can.text
    assert r_can.json()["data"]["estado"] == "cancelada"
    # Cancelarlo de nuevo → 409 (ya no está pendiente).
    assert client.post(f"/v1/farmacia/pedidos/{orden_id}/cancelar", headers=headers_farmacia1).status_code == 409

    # 2) Ciclo completo: crear → proveedor acepta y despacha → farmacia recibe.
    r2 = client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": of["id"], "cantidad": 1}]},
        headers=headers_farmacia1,
    )
    orden2 = r2.json()["data"]["ordenes"][0]["orden_id"]
    # Recibir antes de tiempo → 409 (aún pendiente).
    assert client.post(f"/v1/farmacia/pedidos/{orden2}/recibir", headers=headers_farmacia1).status_code == 409

    detalle = client.get(f"/v1/ordenes/{orden2}", headers=headers_proveedor1).json()["data"]
    decisiones = [
        {"item_id": i["id"], "estado": "aceptado", "cantidad_aceptada": i["cantidad_solicitada"]}
        for i in detalle["items"]
    ]
    assert client.post(f"/v1/ordenes/{orden2}/aceptar", json={"decisiones": decisiones}, headers=headers_proveedor1).status_code == 200
    assert client.post(f"/v1/ordenes/{orden2}/despachar", headers=headers_proveedor1).status_code == 200

    r_rec = client.post(f"/v1/farmacia/pedidos/{orden2}/recibir", headers=headers_farmacia1)
    assert r_rec.status_code == 200, r_rec.text
    assert r_rec.json()["data"]["estado"] == "completada"


def test_registro_farmacia_y_login_flow(client):
    """Registro público de farmacia: crea usuario + org tipo farmacia + membresía."""
    db = get_service_client()
    email = "farmacia-e2e-test@cero.test"
    # Limpieza previa por si quedó de una corrida anterior.
    for u in (db.auth.admin.list_users() or []):
        if getattr(u, "email", None) == email:
            db.auth.admin.delete_user(u.id)
    db.table("organizaciones").delete().eq("nit", "999888777-0").execute()

    r = client.post(
        "/v1/onboarding/farmacia",
        json={
            "razon_social": "Farmacia Prueba Flujo",
            "nit": "999888777-0",
            "ciudad": "Cali",
            "nombre": "Tester Farmacia",
            "email": email,
            "password": "PruebaFarm-2026",
        },
    )
    assert r.status_code == 201, r.text
    org_id = r.json()["data"]["organizacion_id"]
    org = db.table("organizaciones").select("tipo").eq("id", org_id).single().execute().data
    assert org["tipo"] == "farmacia"

    # Limpieza.
    db.table("miembros_organizacion").delete().eq("organizacion_id", org_id).execute()
    db.table("organizaciones").delete().eq("id", org_id).execute()
    db.auth.admin.delete_user(r.json()["data"]["user_id"])
