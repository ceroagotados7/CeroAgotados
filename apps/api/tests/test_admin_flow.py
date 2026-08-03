"""Pruebas del flujo Admin (a1–a3) y del resumen de notificaciones."""

import pytest

from app.config import settings
from tests.conftest import USER_ADMIN, make_token

pytestmark = pytest.mark.usefixtures("live_db")

ORG_PROVEEDOR1 = "0000000a-0000-0000-0000-000000000001"


@pytest.fixture
def headers_admin() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_ADMIN)}"}


def test_me_del_admin(client, headers_admin):
    r = client.get("/v1/me/", headers=headers_admin)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["es_admin"] is True
    assert data["organizacion"] is None


def test_dashboard_admin(client, headers_admin):
    r = client.get("/v1/admin/dashboard", headers=headers_admin)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["proveedores_activos"] >= 2
    assert d["farmacias_activas"] >= 1
    assert d["gmv_mes"] >= 0
    if d["ordenes_mes"]:
        assert d["ticket_promedio"] == pytest.approx(d["gmv_mes"] / d["ordenes_mes"], rel=1e-3)
    # El admin SÍ ve identidades reales.
    for v in d["ventas_por_proveedor"]:
        assert v["nombre"]


def test_proveedor_detalle_admin(client, headers_admin):
    r = client.get(f"/v1/admin/proveedores/{ORG_PROVEEDOR1}", headers=headers_admin)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["razon_social"].startswith("Distribuidora")
    assert d["medicamentos"] > 0
    # El desglose por farmacia suma ~100% cuando hay ventas.
    if d["vendido_mes"] > 0:
        assert sum(f["pct_del_proveedor"] for f in d["ventas_por_farmacia"]) == pytest.approx(100, abs=1)


def test_proveedor_detalle_inexistente(client, headers_admin):
    r = client.get(
        "/v1/admin/proveedores/00000000-0000-0000-0000-00000000dead", headers=headers_admin
    )
    assert r.status_code == 404


def test_ganancias_admin(client, headers_admin):
    r = client.get("/v1/admin/ganancias", headers=headers_admin)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["comision_pct"] == settings.comision_pct
    assert d["ganancia_mes"] == pytest.approx(d["gmv_mes"] * d["comision_pct"], rel=1e-3)
    for t in d["ultimas_transacciones"]:
        assert t["comision"] == pytest.approx(t["total"] * d["comision_pct"], rel=1e-3)


def test_admin_endpoints_bloqueados_para_otros_roles(client, headers_proveedor1, headers_farmacia1):
    for h in (headers_proveedor1, headers_farmacia1):
        assert client.get("/v1/admin/dashboard", headers=h).status_code == 403
        assert client.get("/v1/admin/ganancias", headers=h).status_code == 403


def test_resumen_ordenes_para_badge(client, headers_proveedor1, headers_farmacia1):
    """El conteo de pendientes alimenta el punto rojo del proveedor."""
    r = client.get("/v1/ordenes/resumen", headers=headers_proveedor1)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["pendientes"] >= 0
    # Una farmacia no es proveedor: 403.
    assert client.get("/v1/ordenes/resumen", headers=headers_farmacia1).status_code == 403
