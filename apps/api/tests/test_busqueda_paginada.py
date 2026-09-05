"""Paginación determinista de la búsqueda (scroll infinito, 2026-09-05).

El scroll infinito de proveedor y farmacia depende de que limit/offset sea
ESTABLE: dos páginas consecutivas no pueden solapar ni saltarse productos.
La migración 22 fija el desempate final por id en la RPC.
"""

import pytest

pytestmark = pytest.mark.usefixtures("live_db")


def _paginar(client, headers, url: str, params: dict, tam: int) -> list[str]:
    """Recorre todas las páginas de `tam` y devuelve los ids en orden."""
    ids: list[str] = []
    offset = 0
    while True:
        r = client.get(url, params={**params, "limit": tam, "offset": offset}, headers=headers)
        assert r.status_code == 200, r.text
        pagina = r.json()["data"]
        ids += [p["id"] for p in pagina]
        if len(pagina) < tam:
            return ids
        offset += tam
        assert offset <= 600, "paginación sin fin: el conjunto debería agotarse"


def test_catalogo_proveedor_paginado_sin_solapes_ni_saltos(client, headers_proveedor1):
    """El caso Ecar: filtrar por laboratorio y recorrer TODAS las páginas debe
    reconstruir exactamente el mismo conjunto que una consulta grande."""
    facetas = client.get("/v1/catalogo/facetas", headers=headers_proveedor1).json()["data"]
    assert facetas["laboratorios"], "el maestro debe tener laboratorios"
    # Un laboratorio con suficientes productos para varias páginas.
    laboratorio = None
    for lab in facetas["laboratorios"]:
        r = client.get(
            "/v1/catalogo/",
            params={"laboratorio": lab, "limit": 100, "incluir_ofertados": True},
            headers=headers_proveedor1,
        )
        if len(r.json()["data"]) >= 12:
            laboratorio = lab
            referencia = [p["id"] for p in r.json()["data"]]
            break
    assert laboratorio, "se necesita un laboratorio con >=12 productos"

    paginado = _paginar(
        client, headers_proveedor1, "/v1/catalogo/",
        {"laboratorio": laboratorio, "incluir_ofertados": True}, tam=5,
    )
    # Sin duplicados (solapes) y sin faltantes (saltos): unión == referencia.
    assert len(paginado) == len(set(paginado)), "páginas con productos repetidos"
    assert paginado == referencia[: len(paginado)], "el orden cambió entre páginas"


def test_catalogo_orden_estable_entre_llamadas(client, headers_proveedor1):
    """La misma consulta dos veces devuelve exactamente el mismo orden (sin
    esto, el scroll infinito es una lotería aunque no haya solapes)."""
    params = {"q": "acetaminofen", "limit": 30, "incluir_ofertados": True}
    a = [p["id"] for p in client.get("/v1/catalogo/", params=params, headers=headers_proveedor1).json()["data"]]
    b = [p["id"] for p in client.get("/v1/catalogo/", params=params, headers=headers_proveedor1).json()["data"]]
    assert a and a == b


def test_buscar_farmacia_acepta_offset(client, headers_farmacia1):
    """El endpoint de la farmacia ahora pagina igual que el del proveedor."""
    todo = client.get(
        "/v1/farmacia/buscar", params={"limit": 100}, headers=headers_farmacia1
    ).json()["data"]
    assert len(todo) >= 2, "el seed debe tener al menos 2 productos con oferta"

    paginado_ids = _paginar(client, headers_farmacia1, "/v1/farmacia/buscar", {}, tam=1)
    assert paginado_ids == [p["id"] for p in todo]

    # Offset más allá del final → lista vacía, sin error.
    r_lejos = client.get(
        "/v1/farmacia/buscar", params={"limit": 30, "offset": 5000}, headers=headers_farmacia1
    )
    assert r_lejos.status_code == 200 and r_lejos.json()["data"] == []

    # Offset negativo → rechazado por validación.
    assert (
        client.get(
            "/v1/farmacia/buscar", params={"offset": -1}, headers=headers_farmacia1
        ).status_code
        == 422
    )
