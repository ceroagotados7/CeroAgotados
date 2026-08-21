"""Pruebas del motor de stock y del alias rotativo (Entrega 1, 2026-08-21).

Reglas del fundador:
- El stock se DESCUENTA cuando la farmacia envía el pedido y se DEVUELVE en
  rechazos, aceptaciones parciales y cancelaciones.
- Rechazar un ítem con motivo 'sin_stock' (agotado real en bodega) fuerza la
  oferta a stock 0 (y desaparece de la comparación).
- El alias anónimo del proveedor ROTA una vez al día (no correlacionable en el
  tiempo); cada orden CONGELA el alias vigente al crearse.
"""

from concurrent.futures import ThreadPoolExecutor

import pytest

from app.api.v1.farmacia import _alias_proveedor
from app.supabase_client import get_service_client

pytestmark = pytest.mark.usefixtures("live_db")

ORG_PROVEEDOR1 = "0000000a-0000-0000-0000-000000000001"


@pytest.fixture
def limpiar_pedidos_nuevos():
    """Borra las órdenes creadas por estas pruebas (deja las semilla ORD-0001/2)."""
    yield
    db = get_service_client()
    filas = db.table("ordenes").select("id, codigo").execute().data or []
    for f in filas:
        if f["codigo"] not in ("ORD-0001", "ORD-0002"):
            db.table("ordenes").delete().eq("id", f["id"]).execute()


def _oferta_con_stock(minimo: int) -> dict:
    """Una oferta activa del proveedor1 con stock suficiente para la prueba."""
    filas = (
        get_service_client()
        .table("ofertas")
        .select("id, producto_maestro_id, precio, stock_disponible")
        .eq("organizacion_id", ORG_PROVEEDOR1)
        .eq("activo", True)
        .gte("stock_disponible", minimo)
        .execute()
    ).data
    assert filas, f"el seed debe tener una oferta con stock >= {minimo}"
    return filas[0]


def _stock(oferta_id: str) -> int:
    res = (
        get_service_client()
        .table("ofertas")
        .select("stock_disponible")
        .eq("id", oferta_id)
        .single()
        .execute()
    )
    return res.data["stock_disponible"]


def _pedir(client, headers, oferta_id: str, cantidad: int):
    return client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": oferta_id, "cantidad": cantidad}]},
        headers=headers,
    )


def _decidir(client, headers, orden_id: str, decisiones: list[dict]):
    return client.post(
        f"/v1/ordenes/{orden_id}/aceptar", json={"decisiones": decisiones}, headers=headers
    )


def _item_unico(client, headers, orden_id: str) -> dict:
    detalle = client.get(f"/v1/ordenes/{orden_id}", headers=headers).json()["data"]
    assert len(detalle["items"]) == 1
    return detalle["items"][0]


# --------------------------------------------------------------------------- #
# Descuento y devolución de stock
# --------------------------------------------------------------------------- #

def test_stock_se_descuenta_al_crear_y_vuelve_al_cancelar(
    client, headers_farmacia1, limpiar_pedidos_nuevos
):
    of = _oferta_con_stock(3)
    inicial = of["stock_disponible"]

    r = _pedir(client, headers_farmacia1, of["id"], 3)
    assert r.status_code == 201, r.text
    assert _stock(of["id"]) == inicial - 3  # reservado al enviar el pedido

    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    r_can = client.post(f"/v1/farmacia/pedidos/{orden_id}/cancelar", headers=headers_farmacia1)
    assert r_can.status_code == 200, r_can.text
    assert _stock(of["id"]) == inicial  # cancelación → devolución completa

    # Cancelar de nuevo → 409 y el stock NO se devuelve dos veces.
    assert client.post(f"/v1/farmacia/pedidos/{orden_id}/cancelar", headers=headers_farmacia1).status_code == 409
    assert _stock(of["id"]) == inicial


def test_aceptacion_parcial_devuelve_la_diferencia(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos
):
    of = _oferta_con_stock(4)
    inicial = of["stock_disponible"]

    r = _pedir(client, headers_farmacia1, of["id"], 4)
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    assert _stock(of["id"]) == inicial - 4

    item = _item_unico(client, headers_proveedor1, orden_id)
    r_ac = _decidir(client, headers_proveedor1, orden_id,
                    [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 2}])
    assert r_ac.status_code == 200, r_ac.text
    assert r_ac.json()["data"]["estado"] == "aceptada_parcial"
    # Se consumen 2, se devuelven 2.
    assert _stock(of["id"]) == inicial - 2

    # Despachar no mueve más stock (ya quedó consumido al aceptar).
    assert client.post(f"/v1/ordenes/{orden_id}/despachar", headers=headers_proveedor1).status_code == 200
    assert _stock(of["id"]) == inicial - 2


def test_rechazo_generico_devuelve_todo(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos
):
    of = _oferta_con_stock(2)
    inicial = of["stock_disponible"]

    r = _pedir(client, headers_farmacia1, of["id"], 2)
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    item = _item_unico(client, headers_proveedor1, orden_id)

    r_re = _decidir(client, headers_proveedor1, orden_id,
                    [{"item_id": item["id"], "estado": "rechazado", "cantidad_aceptada": 0}])
    assert r_re.status_code == 200, r_re.text
    assert r_re.json()["data"]["estado"] == "rechazada"
    assert _stock(of["id"]) == inicial  # rechazo genérico → todo de vuelta

    # La orden ya no es editable (frontera de estados).
    assert _decidir(client, headers_proveedor1, orden_id,
                    [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 1}]).status_code == 409


def test_rechazo_sin_stock_apaga_la_oferta(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos
):
    of = _oferta_con_stock(2)

    r = _pedir(client, headers_farmacia1, of["id"], 2)
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    item = _item_unico(client, headers_proveedor1, orden_id)

    r_re = _decidir(client, headers_proveedor1, orden_id,
                    [{"item_id": item["id"], "estado": "rechazado", "cantidad_aceptada": 0,
                      "motivo": "sin_stock"}])
    assert r_re.status_code == 200, r_re.text
    # Agotado real: la oferta queda en 0 (no se devuelve la reserva).
    assert _stock(of["id"]) == 0

    # Y desaparece de la comparación de la farmacia.
    r_cmp = client.get(f"/v1/farmacia/comparar/{of['producto_maestro_id']}", headers=headers_farmacia1)
    ids = [o["oferta_id"] for o in r_cmp.json()["data"]["opciones"]]
    assert of["id"] not in ids


def test_reedicion_desde_parcial_no_duplica_devolucion(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos
):
    """La contabilidad es por DELTA sobre el estado previo del ítem: re-gestionar
    una orden aceptada_parcial no devuelve (ni consume) stock dos veces."""
    of = _oferta_con_stock(4)
    inicial = of["stock_disponible"]

    r = _pedir(client, headers_farmacia1, of["id"], 4)
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]
    item = _item_unico(client, headers_proveedor1, orden_id)

    # Acepta 2 de 4 → devuelve 2.
    _decidir(client, headers_proveedor1, orden_id,
             [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 2}])
    assert _stock(of["id"]) == inicial - 2
    # Re-edita a 1 de 4 → devuelve 1 más (no 3).
    _decidir(client, headers_proveedor1, orden_id,
             [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 1}])
    assert _stock(of["id"]) == inicial - 1
    # Re-edita subiendo a 3 → consume 2 del stock disponible.
    _decidir(client, headers_proveedor1, orden_id,
             [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 3}])
    assert _stock(of["id"]) == inicial - 3


def test_concurrencia_dos_pedidos_mismo_stock(
    client, headers_farmacia1, limpiar_pedidos_nuevos
):
    """Dos pedidos simultáneos sobre la misma oferta con stock para uno solo:
    el lock de fila serializa y exactamente uno gana."""
    db = get_service_client()
    of = _oferta_con_stock(1)
    db.table("ofertas").update({"stock_disponible": 5}).eq("id", of["id"]).execute()

    with ThreadPoolExecutor(max_workers=2) as pool:
        r1, r2 = pool.map(
            lambda _: _pedir(client, headers_farmacia1, of["id"], 4), range(2)
        )
    codigos = sorted([r1.status_code, r2.status_code])
    assert codigos == [201, 400], (r1.text, r2.text)
    perdedor = r1 if r1.status_code == 400 else r2
    assert "stock_insuficiente" in perdedor.json()["detail"]
    assert _stock(of["id"]) == 1  # solo el ganador descontó


# --------------------------------------------------------------------------- #
# Alias rotativo del proveedor
# --------------------------------------------------------------------------- #

def test_alias_diario_paridad_python_sql():
    """La API (Python) y la RPC (SQL) deben producir el MISMO alias del día."""
    sql = get_service_client().rpc("alias_proveedor_del_dia", {"p_org": ORG_PROVEEDOR1}).execute().data
    py = _alias_proveedor(ORG_PROVEEDOR1)
    assert sql == py
    assert py.startswith("Proveedor ") and len(py) == len("Proveedor ") + 4


def test_alias_congelado_en_orden_y_consistente_con_comparar(
    client, headers_farmacia1, limpiar_pedidos_nuevos
):
    of = _oferta_con_stock(1)

    # En la comparación, la opción lleva el alias del día.
    r_cmp = client.get(f"/v1/farmacia/comparar/{of['producto_maestro_id']}", headers=headers_farmacia1)
    opcion = next(o for o in r_cmp.json()["data"]["opciones"] if o["oferta_id"] == of["id"])
    alias_hoy = _alias_proveedor(ORG_PROVEEDOR1)
    assert opcion["proveedor_alias"] == alias_hoy

    # Al crear el pedido, la orden CONGELA ese alias (columna en DB) y la
    # respuesta y el detalle lo muestran igual.
    r = _pedir(client, headers_farmacia1, of["id"], 1)
    creada = r.json()["data"]["ordenes"][0]
    assert creada["proveedor_alias"] == alias_hoy

    db_row = (
        get_service_client()
        .table("ordenes")
        .select("proveedor_alias")
        .eq("id", creada["orden_id"])
        .single()
        .execute()
    ).data
    assert db_row["proveedor_alias"] == alias_hoy

    detalle = client.get(f"/v1/farmacia/pedidos/{creada['orden_id']}", headers=headers_farmacia1)
    assert detalle.json()["data"]["proveedor_alias"] == alias_hoy


# --------------------------------------------------------------------------- #
# Timeline de estados con timestamp
# --------------------------------------------------------------------------- #

def test_timeline_eventos_ciclo_completo(
    client, headers_farmacia1, headers_proveedor1, limpiar_pedidos_nuevos
):
    of = _oferta_con_stock(1)
    r = _pedir(client, headers_farmacia1, of["id"], 1)
    orden_id = r.json()["data"]["ordenes"][0]["orden_id"]

    item = _item_unico(client, headers_proveedor1, orden_id)
    _decidir(client, headers_proveedor1, orden_id,
             [{"item_id": item["id"], "estado": "aceptado", "cantidad_aceptada": 1}])
    client.post(f"/v1/ordenes/{orden_id}/despachar", headers=headers_proveedor1)
    client.post(f"/v1/farmacia/pedidos/{orden_id}/recibir", headers=headers_farmacia1)

    # Farmacia (f6): eventos ordenados, con timestamp y SIN identidades.
    detalle = client.get(f"/v1/farmacia/pedidos/{orden_id}", headers=headers_farmacia1).json()["data"]
    eventos = detalle["eventos"]
    assert [e["tipo"] for e in eventos] == ["creada", "aceptada_total", "despachada", "completada"]
    fechas = [e["created_at"] for e in eventos]
    assert all(fechas) and fechas == sorted(fechas)
    assert all(set(e.keys()) == {"tipo", "created_at"} for e in eventos)

    # Proveedor: el detalle también trae el timeline.
    detalle_p = client.get(f"/v1/ordenes/{orden_id}", headers=headers_proveedor1).json()["data"]
    assert [e["tipo"] for e in detalle_p["eventos"]] == ["creada", "aceptada_total", "despachada", "completada"]
