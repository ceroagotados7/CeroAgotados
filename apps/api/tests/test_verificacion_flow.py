"""Pruebas del gate "on live": aprobación de proveedores por el admin.

Regla: un proveedor en_revision/rechazado/suspendido puede tener catálogo,
pero sus ofertas NO aparecen para las farmacias hasta que el admin lo apruebe.
"""

import uuid

import pytest

from app.supabase_client import get_service_client
from tests.conftest import USER_ADMIN, make_token

pytestmark = pytest.mark.usefixtures("live_db")


@pytest.fixture
def headers_admin() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_ADMIN)}"}


@pytest.fixture
def proveedor_nuevo():
    """Organización proveedor EN REVISIÓN con una oferta activa, más barata que
    todas (si el gate fallara, sería 'mejor precio' y el test lo detectaría)."""
    db = get_service_client()
    org = (
        db.table("organizaciones")
        .insert(
            {
                "tipo": "proveedor",
                "razon_social": "Proveedor Gate Test",
                "nit": f"T-{uuid.uuid4().hex[:8]}",
                "estado_verificacion": "en_revision",
            }
        )
        .execute()
    ).data[0]
    prod = db.table("producto_maestro").select("id").eq("activo", True).limit(1).execute().data[0]
    oferta = (
        db.table("ofertas")
        .insert(
            {
                "organizacion_id": org["id"],
                "producto_maestro_id": prod["id"],
                "precio": 1,  # precio imbatible a propósito
                "stock_disponible": 999,
                "activo": True,
            }
        )
        .execute()
    ).data[0]
    yield {"org": org, "producto_id": prod["id"], "oferta_id": oferta["id"]}
    db.table("ofertas").delete().eq("id", oferta["id"]).execute()
    db.table("organizaciones").delete().eq("id", org["id"]).execute()


def _decidir(client, headers_admin, org_id: str, accion: str, motivo: str | None = None):
    return client.post(
        f"/v1/admin/proveedores/{org_id}/decision",
        json={"accion": accion, "motivo": motivo},
        headers=headers_admin,
    )


def test_en_revision_no_sale_en_comparacion(client, headers_admin, headers_farmacia1, proveedor_nuevo):
    pid = proveedor_nuevo["producto_id"]
    r = client.get(f"/v1/farmacia/comparar/{pid}", headers=headers_farmacia1)
    assert r.status_code == 200
    precios = [o["precio"] for o in r.json()["data"]["opciones"]]
    assert 1.0 not in precios  # la oferta del no-aprobado NO está

    # La farmacia tampoco puede pedirle aunque conozca el oferta_id (gate en pedido).
    r_pedido = client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": proveedor_nuevo["oferta_id"], "cantidad": 1}]},
        headers=headers_farmacia1,
    )
    assert r_pedido.status_code == 400
    assert "oferta_no_disponible" in r_pedido.json()["detail"]


def test_aprobar_lo_pone_al_aire(client, headers_admin, headers_farmacia1, proveedor_nuevo):
    org_id = proveedor_nuevo["org"]["id"]
    r = _decidir(client, headers_admin, org_id, "aprobado")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["estado_verificacion"] == "aprobado"

    # Ahora SÍ aparece (y como mejor precio, porque cuesta $1).
    pid = proveedor_nuevo["producto_id"]
    r2 = client.get(f"/v1/farmacia/comparar/{pid}", headers=headers_farmacia1)
    mejor = r2.json()["data"]["opciones"][0]
    assert mejor["precio"] == 1.0 and mejor["es_mejor_precio"] is True

    # Bitácora registrada.
    db = get_service_client()
    ev = db.table("organizacion_eventos").select("tipo").eq("organizacion_id", org_id).execute().data
    assert any(e["tipo"] == "aprobado" for e in ev)


def test_suspender_lo_saca_del_aire(client, headers_admin, headers_farmacia1, proveedor_nuevo):
    org_id = proveedor_nuevo["org"]["id"]
    _decidir(client, headers_admin, org_id, "aprobado")
    r = _decidir(client, headers_admin, org_id, "suspendido", "Incumplimiento de entregas")
    assert r.status_code == 200
    pid = proveedor_nuevo["producto_id"]
    precios = [
        o["precio"]
        for o in client.get(f"/v1/farmacia/comparar/{pid}", headers=headers_farmacia1).json()["data"]["opciones"]
    ]
    assert 1.0 not in precios


def test_rechazo_requiere_motivo(client, headers_admin, proveedor_nuevo):
    org_id = proveedor_nuevo["org"]["id"]
    assert _decidir(client, headers_admin, org_id, "rechazado").status_code == 400
    r = _decidir(client, headers_admin, org_id, "rechazado", "NIT no verificable")
    assert r.status_code == 200
    assert r.json()["data"]["motivo_decision"] == "NIT no verificable"


def test_accion_invalida_y_proveedor_inexistente(client, headers_admin):
    r = client.post(
        "/v1/admin/proveedores/00000000-0000-0000-0000-00000000dead/decision",
        json={"accion": "aprobado"},
        headers=headers_admin,
    )
    assert r.status_code == 404
    # Acción inventada → 400 (contra un id cualquiera; la validación va primero).
    r2 = client.post(
        "/v1/admin/proveedores/00000000-0000-0000-0000-00000000dead/decision",
        json={"accion": "banear"},
        headers=headers_admin,
    )
    assert r2.status_code == 400


def test_bandeja_y_resumen(client, headers_admin, proveedor_nuevo):
    r = client.get("/v1/admin/proveedores", headers=headers_admin)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["conteos"]["en_revision"] >= 1
    fila = next(p for p in data["proveedores"] if p["id"] == proveedor_nuevo["org"]["id"])
    assert fila["medicamentos"] == 1

    r2 = client.get("/v1/admin/resumen", headers=headers_admin)
    assert r2.json()["data"]["proveedores_en_revision"] >= 1


def test_decision_bloqueada_para_no_admins(client, headers_proveedor1, proveedor_nuevo):
    r = client.post(
        f"/v1/admin/proveedores/{proveedor_nuevo['org']['id']}/decision",
        json={"accion": "aprobado"},
        headers=headers_proveedor1,
    )
    assert r.status_code == 403


def test_registro_proveedor_queda_en_revision(client):
    """El alta pública de proveedor nace en_revision (gate) y con evento."""
    db = get_service_client()
    email = "proveedor-gate-test@cero.test"
    for u in (db.auth.admin.list_users() or []):
        if getattr(u, "email", None) == email:
            db.auth.admin.delete_user(u.id)
    db.table("organizaciones").delete().eq("nit", "888777666-5").execute()

    r = client.post(
        "/v1/onboarding/proveedor",
        json={
            "razon_social": "Gate Registro SAS",
            "nit": "888777666-5",
            "ciudad": "Cali",
            "nombre": "Tester Gate",
            "email": email,
            "password": "PruebaGate-2026",
        },
    )
    assert r.status_code == 201, r.text
    org_id = r.json()["data"]["organizacion_id"]
    org = db.table("organizaciones").select("estado_verificacion").eq("id", org_id).single().execute().data
    assert org["estado_verificacion"] == "en_revision"
    ev = db.table("organizacion_eventos").select("tipo").eq("organizacion_id", org_id).execute().data
    assert any(e["tipo"] == "registrada" for e in ev)

    db.table("miembros_organizacion").delete().eq("organizacion_id", org_id).execute()
    db.table("organizaciones").delete().eq("id", org_id).execute()
    db.auth.admin.delete_user(r.json()["data"]["user_id"])
