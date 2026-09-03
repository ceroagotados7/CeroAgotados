"""Factura enlazada al despacho (Grupo 4, 2026-09-03).

Reglas del fundador:
- NINGÚN despacho sale sin número de factura: es obligatorio en el mismo paso.
- El número queda congelado en la orden y visible para los tres perfiles
  (trazabilidad punto a punto); el proveedor puede corregirlo SOLO mientras
  la orden siga en 'despachada' y la corrección queda auditada como evento.
"""

import pytest

from app.supabase_client import get_service_client

from tests.test_stock_y_alias import (  # helpers compartidos del flujo
    _decidir,
    _item_unico,
    _oferta_con_stock,
    _pedir,
    limpiar_pedidos_nuevos,  # noqa: F401 — fixture reexportada
)

pytestmark = pytest.mark.usefixtures("live_db")


def _orden_aceptada(client, headers_farmacia1, headers_proveedor1) -> str:
    """Crea un pedido de 1 ítem y lo deja aceptado por completo (despachable)."""
    of = _oferta_con_stock(2)
    r = _pedir(client, headers_farmacia1, of["id"], 1)
    assert r.status_code == 201, r.text
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    item = _item_unico(client, headers_proveedor1, orden_id)
    r_ac = _decidir(
        client, headers_proveedor1, orden_id,
        [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 1}],
    )
    assert r_ac.status_code == 200, r_ac.text
    return orden_id


def _despachar(client, headers, orden_id: str, factura: str):
    return client.post(
        f"/v1/ordenes/{orden_id}/despachar",
        json={"factura_numero": factura},
        headers=headers,
    )


def test_despachar_sin_factura_es_rechazado(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos  # noqa: F811
):
    """La regla dura: sin factura no hay despacho (body obligatorio y validado)."""
    orden_id = _orden_aceptada(client, headers_farmacia1, headers_proveedor1)

    # Sin body → validación de FastAPI.
    assert client.post(f"/v1/ordenes/{orden_id}/despachar", headers=headers_proveedor1).status_code == 422
    # Vacía, solo espacios, o basura fuera del alfabeto → 422.
    for mala in ["", "   ", "A1", "-FV123", "FV123-", "FV#123", "F" * 31]:
        r = _despachar(client, headers_proveedor1, orden_id, mala)
        assert r.status_code == 422, f"{mala!r} debió ser rechazada: {r.text}"

    # Nada de lo anterior despachó la orden.
    detalle = client.get(f"/v1/ordenes/{orden_id}", headers=headers_proveedor1).json()["data"]
    assert detalle["estado"] == "aceptada_total"
    assert detalle["factura_numero"] is None


def test_despacho_con_factura_queda_trazado(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos  # noqa: F811
):
    """El caso completo: factura congelada en la orden, visible para la
    farmacia y anexada al evento 'despachada' del timeline."""
    orden_id = _orden_aceptada(client, headers_farmacia1, headers_proveedor1)

    # Con espacios extremos: la API los recorta antes de validar.
    r = _despachar(client, headers_proveedor1, orden_id, "  FV-10425  ")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["estado"] == "despachada"
    assert data["factura_numero"] == "FV-10425"
    assert data["factura_registrada_at"]

    # La farmacia la ve (sin identidad del proveedor).
    pedido = client.get(f"/v1/farmacia/pedidos/{orden_id}", headers=headers_farmacia1).json()["data"]
    assert pedido["factura_numero"] == "FV-10425"
    assert "proveedor_id" not in pedido

    # El evento del timeline lleva la factura en su payload (DB).
    eventos = (
        get_service_client()
        .table("orden_eventos")
        .select("tipo, payload")
        .eq("orden_id", orden_id)
        .execute()
    ).data
    despacho = [e for e in eventos if e["tipo"] == "despachada"]
    assert len(despacho) == 1
    assert despacho[0]["payload"]["factura_numero"] == "FV-10425"


def test_corregir_factura_auditado(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos  # noqa: F811
):
    orden_id = _orden_aceptada(client, headers_farmacia1, headers_proveedor1)

    # Corregir ANTES de despachar → 409 (no hay factura que corregir).
    r_antes = client.patch(
        f"/v1/ordenes/{orden_id}/factura",
        json={"factura_numero": "FV-1"},
        headers=headers_proveedor1,
    )
    assert r_antes.status_code == 409

    assert _despachar(client, headers_proveedor1, orden_id, "FV-0001").status_code == 200

    # Corrección válida → nuevo número + evento de auditoría.
    r_fix = client.patch(
        f"/v1/ordenes/{orden_id}/factura",
        json={"factura_numero": "FV-0002"},
        headers=headers_proveedor1,
    )
    assert r_fix.status_code == 200, r_fix.text
    assert r_fix.json()["data"]["factura_numero"] == "FV-0002"

    eventos = (
        get_service_client()
        .table("orden_eventos")
        .select("tipo, payload")
        .eq("orden_id", orden_id)
        .eq("tipo", "factura_corregida")
        .execute()
    ).data
    assert len(eventos) == 1
    assert eventos[0]["payload"] == {"factura_numero": "FV-0002", "anterior": "FV-0001"}

    # Tras la recepción de la farmacia el número queda INMUTABLE.
    assert client.post(f"/v1/farmacia/pedidos/{orden_id}/recibir", headers=headers_farmacia1).status_code == 200
    r_tarde = client.patch(
        f"/v1/ordenes/{orden_id}/factura",
        json={"factura_numero": "FV-0003"},
        headers=headers_proveedor1,
    )
    assert r_tarde.status_code == 409
    detalle = client.get(f"/v1/ordenes/{orden_id}", headers=headers_proveedor1).json()["data"]
    assert detalle["factura_numero"] == "FV-0002"


def test_factura_de_orden_ajena_prohibida(
    client, headers_farmacia1, headers_proveedor1, headers_proveedor2, limpiar_pedidos_nuevos  # noqa: F811
):
    """Otro proveedor no puede despachar ni corregir la factura de una orden ajena."""
    orden_id = _orden_aceptada(client, headers_farmacia1, headers_proveedor1)

    assert _despachar(client, headers_proveedor2, orden_id, "FV-INTRUSO").status_code == 403

    assert _despachar(client, headers_proveedor1, orden_id, "FV-LEGITIMA").status_code == 200
    r_fix = client.patch(
        f"/v1/ordenes/{orden_id}/factura",
        json={"factura_numero": "FV-HACK"},
        headers=headers_proveedor2,
    )
    assert r_fix.status_code == 403
    detalle = client.get(f"/v1/ordenes/{orden_id}", headers=headers_proveedor1).json()["data"]
    assert detalle["factura_numero"] == "FV-LEGITIMA"


def test_ordenes_viejas_sin_factura_no_rompen(client, headers_farmacia1):
    """Las órdenes anteriores a la migración (o no despachadas) exponen
    factura_numero = null sin romper los listados."""
    pedidos = client.get("/v1/farmacia/pedidos", headers=headers_farmacia1).json()["data"]
    assert isinstance(pedidos, list) and pedidos
    for p in pedidos:
        assert "factura_numero" in p  # presente siempre, aunque sea null
