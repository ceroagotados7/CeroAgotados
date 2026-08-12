"""Pruebas del pipeline de solicitudes al catálogo maestro (curaduría admin)."""

import pytest

from app.supabase_client import get_service_client
from tests.conftest import USER_ADMIN, make_token

pytestmark = pytest.mark.usefixtures("live_db")


@pytest.fixture
def headers_admin() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_ADMIN)}"}


@pytest.fixture(autouse=True)
def _limpiar_solicitudes():
    """Deja la tabla limpia antes y después (y borra productos creados aquí)."""
    db = get_service_client()
    db.table("solicitudes_maestro").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    yield
    creados = (
        db.table("solicitudes_maestro").select("producto_creado_id").not_.is_("producto_creado_id", "null").execute()
    ).data or []
    db.table("solicitudes_maestro").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    for c in creados:
        db.table("producto_maestro").delete().eq("id", c["producto_creado_id"]).execute()


def _solicitar(client, headers, items):
    return client.post("/v1/ofertas/solicitudes-maestro", json={"items": items}, headers=headers)


def test_proveedor_registra_solicitudes(client, headers_proveedor1):
    r = _solicitar(
        client,
        headers_proveedor1,
        [
            {"nombre": "Dipirona 500mg", "presentacion": "Caja x 10", "unidades": "10"},
            {"nombre": "Ketoprofeno gel", "presentacion": "Tubo 30g"},
        ],
    )
    assert r.status_code == 201, r.text
    assert r.json()["data"]["registradas"] == 2

    # Reenviar lo mismo no duplica pendientes.
    r2 = _solicitar(client, headers_proveedor1, [{"nombre": "dipirona 500MG"}])
    assert r2.json()["data"]["registradas"] == 0


def test_admin_agrega_al_maestro(client, headers_proveedor1, headers_admin):
    _solicitar(client, headers_proveedor1, [{"nombre": "Dipirona 500mg", "presentacion": "Caja x 10"}])
    bandeja = client.get("/v1/admin/solicitudes", headers=headers_admin).json()["data"]
    assert bandeja["conteos"]["pendiente"] == 1
    sol = bandeja["solicitudes"][0]
    assert sol["proveedor"]  # el admin ve la razón social

    r = client.post(
        f"/v1/admin/solicitudes/{sol['id']}/decision",
        json={
            "accion": "agregada",
            "nombre": "Dipirona 500mg",
            "principio_activo": "Metamizol",
            "forma_farmaceutica": "Tableta",
            "presentacion": "Caja x 10 tabletas",
            "categoria": "Analgésico",
        },
        headers=headers_admin,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["estado"] == "agregada"

    # El producto quedó en el maestro, activo (los proveedores ya pueden ofertarlo).
    db = get_service_client()
    prod = db.table("producto_maestro").select("id, activo").eq("nombre", "Dipirona 500mg").execute().data
    assert prod and prod[0]["activo"] is True

    # Decidirla de nuevo → 409.
    r2 = client.post(
        f"/v1/admin/solicitudes/{sol['id']}/decision",
        json={"accion": "descartada", "motivo": "x"},
        headers=headers_admin,
    )
    assert r2.status_code == 409


def test_admin_descarta_con_motivo(client, headers_proveedor1, headers_admin):
    _solicitar(client, headers_proveedor1, [{"nombre": "Producto Duplicado XYZ"}])
    sol = client.get("/v1/admin/solicitudes", headers=headers_admin).json()["data"]["solicitudes"][0]

    # Sin motivo → 400. Agregar sin nombre → 400.
    assert (
        client.post(f"/v1/admin/solicitudes/{sol['id']}/decision", json={"accion": "descartada"}, headers=headers_admin).status_code
        == 400
    )
    assert (
        client.post(f"/v1/admin/solicitudes/{sol['id']}/decision", json={"accion": "agregada"}, headers=headers_admin).status_code
        == 400
    )

    r = client.post(
        f"/v1/admin/solicitudes/{sol['id']}/decision",
        json={"accion": "descartada", "motivo": "Ya existe como Dipirona 500mg"},
        headers=headers_admin,
    )
    assert r.status_code == 200
    assert r.json()["data"]["motivo_decision"].startswith("Ya existe")


def test_resumen_incluye_solicitudes(client, headers_proveedor1, headers_admin):
    _solicitar(client, headers_proveedor1, [{"nombre": "Algo Nuevo 1mg"}])
    r = client.get("/v1/admin/resumen", headers=headers_admin)
    assert r.json()["data"]["solicitudes_pendientes"] >= 1


def test_bloqueos_de_rol(client, headers_farmacia1, headers_proveedor1):
    # Una farmacia no puede solicitar al maestro (endpoint de proveedor).
    assert _solicitar(client, headers_farmacia1, [{"nombre": "X"}]).status_code == 403
    # Un proveedor no puede ver la bandeja del admin.
    assert client.get("/v1/admin/solicitudes", headers=headers_proveedor1).status_code == 403