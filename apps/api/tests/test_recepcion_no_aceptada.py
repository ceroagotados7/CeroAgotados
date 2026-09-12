"""Recepción no aceptada (Tanda 5) — pruebas hostiles.

No es solo el camino feliz ni los bordes: aquí se intenta ROMPER la plataforma.
Inyección en el comentario, cantidades absurdas, ítems de otra orden, doble
envío, autorización cruzada y las tres invariantes que no se pueden mover:

  · El stock NO se toca (la decisión del proveedor sigue siendo la fuente de
    verdad; solo la cancelación devuelve la reserva).
  · La venta SIGUE contando (si la farmacia no recibió, falló el distribuidor).
  · El veredicto es INMUTABLE, como el número de factura.

Cada test deja la DB como la encontró: crea su propia orden y la borra.
"""

import uuid

import pytest

from app.supabase_client import get_service_client
from tests.conftest import USER_FARMACIA1, USER_PROVEEDOR1, make_token

pytestmark = pytest.mark.usefixtures("live_db")

ORG_PROVEEDOR1 = "0000000a-0000-0000-0000-000000000001"
ORG_FARMACIA1 = "0000000b-0000-0000-0000-000000000001"


@pytest.fixture
def headers_farmacia1() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_FARMACIA1)}"}


@pytest.fixture
def headers_proveedor1() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_PROVEEDOR1)}"}


@pytest.fixture
def orden_despachada():
    """Una orden propia en 'despachada' con dos ítems aceptados y uno rechazado.

    Se construye por debajo (no por el flujo completo) a propósito: así cada
    test parte del estado exacto que quiere probar, sin depender del orden de
    ejecución ni mover el stock de las ofertas del seed.
    """
    db = get_service_client()
    oferta = (
        db.table("ofertas")
        .select("id, producto_maestro_id")
        .eq("organizacion_id", ORG_PROVEEDOR1)
        .limit(1)
        .execute()
    ).data[0]
    creadas: list[str] = []

    sufijo = uuid.uuid4().hex[:6].upper()

    def crear(codigo: str, estado: str = "despachada") -> dict:
        # Código único por corrida: si un teardown se cae (DEV devuelve 504 de
        # vez en cuando), la siguiente corrida no choca contra el unique.
        codigo = f"{codigo}-{sufijo}"
        orden = (
            db.table("ordenes")
            .insert(
                {
                    "codigo": codigo,
                    "farmacia_id": ORG_FARMACIA1,
                    "proveedor_id": ORG_PROVEEDOR1,
                    "estado": estado,
                    "created_by": USER_FARMACIA1,
                    "factura_numero": "FT-TEST-1" if estado == "despachada" else None,
                }
            )
            .execute()
        ).data[0]
        creadas.append(orden["id"])
        items = (
            db.table("orden_items")
            .insert(
                [
                    # aceptado completo
                    {
                        "orden_id": orden["id"],
                        "oferta_id": oferta["id"],
                        "producto_maestro_id": oferta["producto_maestro_id"],
                        "precio_unitario_snapshot": 1000,
                        "cantidad_solicitada": 10,
                        "cantidad_aceptada": 10,
                        "estado_item": "aceptado",
                    },
                    # aceptado parcial por el proveedor
                    {
                        "orden_id": orden["id"],
                        "oferta_id": oferta["id"],
                        "producto_maestro_id": oferta["producto_maestro_id"],
                        "precio_unitario_snapshot": 1000,
                        "cantidad_solicitada": 8,
                        "cantidad_aceptada": 5,
                        "estado_item": "aceptado",
                    },
                    # rechazado por el proveedor: nunca llegó
                    {
                        "orden_id": orden["id"],
                        "oferta_id": oferta["id"],
                        "producto_maestro_id": oferta["producto_maestro_id"],
                        "precio_unitario_snapshot": 1000,
                        "cantidad_solicitada": 4,
                        "cantidad_aceptada": 0,
                        "estado_item": "rechazado",
                    },
                ]
            )
            .execute()
        ).data
        orden["items"] = sorted(items, key=lambda i: -i["cantidad_aceptada"])
        return orden

    yield crear

    for oid in creadas:
        db.table("ordenes").delete().eq("id", oid).execute()


def _stock_total() -> int:
    filas = get_service_client().table("ofertas").select("stock_disponible").execute().data
    return sum(f["stock_disponible"] for f in filas or [])


# --------------------------------------------------------------------------- #
# Camino feliz — los tres desenlaces
# --------------------------------------------------------------------------- #

def test_recibir_conforme_deja_veredicto_aceptada(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-OK-1")
    r = client.post(f"/v1/farmacia/pedidos/{o['id']}/recibir", headers=headers_farmacia1)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["estado"] == "completada"
    assert data["recepcion"] == "aceptada"
    assert all(i["cantidad_no_aceptada"] == 0 for i in data["items"])


def test_no_aceptar_total(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-TOT-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total", "comentario": "Llegó todo roto"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["recepcion"] == "no_aceptada_total"
    assert data["recepcion_comentario"] == "Llegó todo roto"
    # Se rechaza lo DESPACHADO (10 + 5), nunca lo que el proveedor no mandó.
    assert sum(i["cantidad_no_aceptada"] for i in data["items"]) == 15


def test_no_aceptar_parcial_sin_comentario(client, headers_farmacia1, orden_despachada):
    """El comentario es opcional (petición explícita del fundador)."""
    o = orden_despachada("T-PAR-1")
    item = o["items"][0]
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_parcial", "items": [{"item_id": item["id"], "cantidad": 3}]},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["recepcion"] == "no_aceptada_parcial"
    assert data["recepcion_comentario"] is None


def test_parcial_que_cubre_todo_se_guarda_como_total(client, headers_farmacia1, orden_despachada):
    """El veredicto describe el resultado, no cómo se tecleó."""
    o = orden_despachada("T-PAR-2")
    items = [
        {"item_id": i["id"], "cantidad": i["cantidad_aceptada"]}
        for i in o["items"]
        if i["cantidad_aceptada"] > 0
    ]
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_parcial", "items": items},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["recepcion"] == "no_aceptada_total"


# --------------------------------------------------------------------------- #
# Las tres invariantes que no se pueden mover
# --------------------------------------------------------------------------- #

def test_no_aceptar_no_mueve_el_stock(client, headers_farmacia1, orden_despachada):
    """Regla del motor de stock: la decisión del PROVEEDOR es la fuente de verdad."""
    o = orden_despachada("T-STK-1")
    antes = _stock_total()
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    assert _stock_total() == antes


def test_la_venta_sigue_contando(client, headers_farmacia1, headers_proveedor1, orden_despachada):
    """Si la farmacia no recibió, falló el distribuidor, no la plataforma.

    El pedido queda en 'completada' y por tanto sigue dentro de los estados que
    cuentan como venta en ganancias y en el dashboard.
    """
    o = orden_despachada("T-VTA-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["estado"] == "completada"
    # Y el dashboard del proveedor sigue respondiendo con normalidad.
    assert client.get("/v1/dashboard/", headers=headers_proveedor1).status_code == 200


def test_el_veredicto_es_inmutable(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-INM-1")
    primero = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total", "comentario": "primero"},
        headers=headers_farmacia1,
    )
    assert primero.status_code == 200
    segundo = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_parcial", "items": [{"item_id": o["items"][0]["id"], "cantidad": 1}]},
        headers=headers_farmacia1,
    )
    assert segundo.status_code == 409
    assert "recepcion_ya_registrada" in segundo.text
    # Y el comentario original no se tocó.
    estado = client.get(f"/v1/farmacia/pedidos/{o['id']}", headers=headers_farmacia1).json()["data"]
    assert estado["recepcion_comentario"] == "primero"


def test_doble_envio_no_duplica(client, headers_farmacia1, orden_despachada):
    """Doble clic: el segundo POST choca, no crea un segundo registro."""
    o = orden_despachada("T-DOB-1")
    body = {"alcance": "no_aceptada_total"}
    a = client.post(f"/v1/farmacia/pedidos/{o['id']}/no-aceptar", json=body, headers=headers_farmacia1)
    b = client.post(f"/v1/farmacia/pedidos/{o['id']}/no-aceptar", json=body, headers=headers_farmacia1)
    assert a.status_code == 200
    assert b.status_code == 409
    eventos = a.json()["data"]["eventos"]
    assert sum(1 for e in eventos if e["tipo"] == "no_aceptada") == 1


# --------------------------------------------------------------------------- #
# Autorización cruzada
# --------------------------------------------------------------------------- #

def test_el_proveedor_no_puede_usar_el_endpoint_de_la_farmacia(
    client, headers_proveedor1, orden_despachada
):
    o = orden_despachada("T-ROL-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total"},
        headers=headers_proveedor1,
    )
    assert r.status_code == 403


def test_sin_token_no_pasa(client, orden_despachada):
    o = orden_despachada("T-AUTH-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar", json={"alcance": "no_aceptada_total"}
    )
    assert r.status_code == 401


def test_orden_inexistente_da_404_sin_filtrar_nada(client, headers_farmacia1):
    r = client.post(
        f"/v1/farmacia/pedidos/{uuid.uuid4()}/no-aceptar",
        json={"alcance": "no_aceptada_total"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Payloads hostiles
# --------------------------------------------------------------------------- #

def test_item_de_otra_orden_no_escribe_nada(client, headers_farmacia1, orden_despachada):
    """El ítem ajeno debe tumbar la petición ENTERA, no aplicarse a medias."""
    propia = orden_despachada("T-AJE-1")
    ajena = orden_despachada("T-AJE-2")
    r = client.post(
        f"/v1/farmacia/pedidos/{propia['id']}/no-aceptar",
        json={
            "alcance": "no_aceptada_parcial",
            "items": [
                {"item_id": propia["items"][0]["id"], "cantidad": 2},
                {"item_id": ajena["items"][0]["id"], "cantidad": 2},
            ],
        },
        headers=headers_farmacia1,
    )
    assert r.status_code == 422
    assert "item_ajeno_o_inexistente" in r.text
    # Ni la propia ni la ajena quedaron tocadas.
    for o in (propia, ajena):
        d = client.get(f"/v1/farmacia/pedidos/{o['id']}", headers=headers_farmacia1).json()["data"]
        assert d["recepcion"] is None
        assert all(i["cantidad_no_aceptada"] == 0 for i in d["items"])


def test_mismo_item_repetido(client, headers_farmacia1, orden_despachada):
    """Con el ítem duplicado, Postgres elegiría una fila al azar. Se rechaza."""
    o = orden_despachada("T-DUP-1")
    item = o["items"][0]
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={
            "alcance": "no_aceptada_parcial",
            "items": [
                {"item_id": item["id"], "cantidad": 2},
                {"item_id": item["id"], "cantidad": 9},
            ],
        },
        headers=headers_farmacia1,
    )
    assert r.status_code == 422
    assert "item_duplicado" in r.text


def test_no_se_puede_rechazar_lo_que_nunca_llego(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-NUN-1")
    rechazado = next(i for i in o["items"] if i["cantidad_aceptada"] == 0)
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_parcial", "items": [{"item_id": rechazado["id"], "cantidad": 1}]},
        headers=headers_farmacia1,
    )
    assert r.status_code == 422
    assert "cantidad_invalida" in r.text


@pytest.mark.parametrize("cantidad", [0, -5, 999999999])
def test_cantidades_absurdas(client, headers_farmacia1, orden_despachada, cantidad):
    o = orden_despachada(f"T-CANT-{cantidad}")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={
            "alcance": "no_aceptada_parcial",
            "items": [{"item_id": o["items"][0]["id"], "cantidad": cantidad}],
        },
        headers=headers_farmacia1,
    )
    # 0 y negativos los para Pydantic (gt=0); el exceso lo para la RPC.
    assert r.status_code == 422


def test_parcial_sin_items(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-VAC-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_parcial", "items": []},
        headers=headers_farmacia1,
    )
    assert r.status_code == 422
    assert "sin_items" in r.text


def test_alcance_aceptada_no_entra_por_este_endpoint(client, headers_farmacia1, orden_despachada):
    """Para confirmar conforme está /recibir: si no, el nombre mentiría."""
    o = orden_despachada("T-ALC-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "aceptada"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 422


def test_alcance_basura(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-ALC-2")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "'; DROP TABLE ordenes; --"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 422
    # Y la tabla sigue ahí.
    assert client.get(f"/v1/farmacia/pedidos/{o['id']}", headers=headers_farmacia1).status_code == 200


def test_comentario_hostil_se_guarda_literal_sin_ejecutarse(
    client, headers_farmacia1, orden_despachada
):
    """Inyección: el texto se guarda TAL CUAL (no se mutila al usuario).

    Que no se ejecute es responsabilidad de dos capas distintas: aquí, de la
    parametrización (nada se interpola en SQL); y al pintarlo, del escapado por
    defecto de React. Este test fija la primera.
    """
    o = orden_despachada("T-INY-1")
    veneno = "<script>alert('xss')</script> '; drop table ordenes; -- O'Brien 💊"
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total", "comentario": veneno},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["recepcion_comentario"] == veneno
    assert client.get("/v1/farmacia/pedidos", headers=headers_farmacia1).status_code == 200


def test_comentario_demasiado_largo(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-LAR-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total", "comentario": "x" * 501},
        headers=headers_farmacia1,
    )
    assert r.status_code == 422


def test_comentario_en_blanco_queda_nulo(client, headers_farmacia1, orden_despachada):
    o = orden_despachada("T-BLA-1")
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total", "comentario": "   \n\t  "},
        headers=headers_farmacia1,
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["recepcion_comentario"] is None


# --------------------------------------------------------------------------- #
# Estados equivocados
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize("estado", ["pendiente", "aceptada_total", "cancelada", "rechazada"])
def test_estados_desde_los_que_no_se_puede_recibir(
    client, headers_farmacia1, orden_despachada, estado
):
    o = orden_despachada(f"T-EST-{estado}", estado=estado)
    r = client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={"alcance": "no_aceptada_total"},
        headers=headers_farmacia1,
    )
    assert r.status_code == 409
    assert "estado_no_recibible" in r.text


# --------------------------------------------------------------------------- #
# Lo que ve el proveedor
# --------------------------------------------------------------------------- #

def test_el_proveedor_ve_el_veredicto_y_el_motivo(
    client, headers_farmacia1, headers_proveedor1, orden_despachada
):
    """El punto de toda la tanda: que el distribuidor se entere."""
    o = orden_despachada("T-VER-1")
    item = o["items"][0]
    client.post(
        f"/v1/farmacia/pedidos/{o['id']}/no-aceptar",
        json={
            "alcance": "no_aceptada_parcial",
            "items": [{"item_id": item["id"], "cantidad": 4}],
            "comentario": "Cuatro cajas con el empaque reventado",
        },
        headers=headers_farmacia1,
    )
    vista = client.get(f"/v1/ordenes/{o['id']}", headers=headers_proveedor1)
    assert vista.status_code == 200, vista.text
    d = vista.json()["data"]
    assert d["recepcion"] == "no_aceptada_parcial"
    assert d["recepcion_comentario"] == "Cuatro cajas con el empaque reventado"
    assert next(i for i in d["items"] if i["id"] == item["id"])["cantidad_no_aceptada"] == 4
