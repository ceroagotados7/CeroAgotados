"""Dirección de la organización (2026-08-21): se pide en el registro de la
farmacia y el proveedor la ve en la orden (y en la hoja de bodega)."""

import pytest

from app.supabase_client import get_service_client
from tests.conftest import make_token

pytestmark = pytest.mark.usefixtures("live_db")

EMAIL = "direccion-e2e@cero.test"
NIT = "999666444-2"


def _limpiar(db) -> None:
    org = db.table("organizaciones").select("id").eq("nit", NIT).execute().data
    for o in org:
        db.table("miembros_organizacion").delete().eq("organizacion_id", o["id"]).execute()
        db.table("organizaciones").delete().eq("id", o["id"]).execute()
    for u in db.auth.admin.list_users() or []:
        if getattr(u, "email", None) == EMAIL:
            db.auth.admin.delete_user(u.id)


def test_registro_farmacia_persiste_direccion(client):
    db = get_service_client()
    _limpiar(db)
    r = client.post(
        "/v1/onboarding/farmacia",
        json={
            "razon_social": "Farmacia Con Dirección",
            "nit": NIT,
            "ciudad": "Cali",
            "direccion": "Cra 10 # 20-30, local 2",
            "nombre": "Tester Dirección",
            "email": EMAIL,
            "password": "PruebaDir-2026",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]

    org = (
        db.table("organizaciones").select("direccion").eq("id", data["organizacion_id"]).single().execute()
    ).data
    assert org["direccion"] == "Cra 10 # 20-30, local 2"

    # /me la devuelve (la Cuenta de la farmacia la muestra).
    headers = {"Authorization": f"Bearer {make_token(data['user_id'])}"}
    me = client.get("/v1/me/", headers=headers).json()["data"]
    assert me["organizacion"]["direccion"] == "Cra 10 # 20-30, local 2"
    _limpiar(db)


def test_direccion_editable_y_visible_para_el_proveedor(
    client, headers_farmacia1, headers_proveedor1
):
    """La farmacia seed (sin dirección) la agrega desde Cuenta y el proveedor
    la ve en el detalle de la orden. Al final se restaura el estado."""
    db = get_service_client()
    ord_id = (
        db.table("ordenes").select("id").eq("codigo", "ORD-0001").single().execute()
    ).data["id"]

    try:
        # Sin dirección: la orden no se rompe (null limpio).
        detalle = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
        assert detalle["farmacia"]["direccion"] is None

        # Dirección demasiado corta → 400.
        r_corta = client.patch("/v1/me/organizacion", json={"direccion": "x"}, headers=headers_farmacia1)
        assert r_corta.status_code == 400
        assert r_corta.json()["detail"] == "direccion_invalida"

        # La farmacia la agrega desde Cuenta…
        r_ok = client.patch(
            "/v1/me/organizacion",
            json={"direccion": "Calle 45 # 12-08, Bogotá"},
            headers=headers_farmacia1,
        )
        assert r_ok.status_code == 200, r_ok.text
        assert r_ok.json()["data"]["direccion"] == "Calle 45 # 12-08, Bogotá"

        # …y el proveedor la ve en su orden (para el despacho / hoja de bodega).
        detalle2 = client.get(f"/v1/ordenes/{ord_id}", headers=headers_proveedor1).json()["data"]
        assert detalle2["farmacia"]["direccion"] == "Calle 45 # 12-08, Bogotá"
    finally:
        # Restaurar: la farmacia seed queda sin dirección (estado original).
        db.table("organizaciones").update({"direccion": None}).eq(
            "id", "0000000b-0000-0000-0000-000000000001"
        ).execute()
