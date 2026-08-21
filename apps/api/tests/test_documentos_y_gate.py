"""Verificación documental + gate de aprobación de farmacias (2026-08-21).

Regla dura del fundador: NINGUNA organización sin aprobar puede vender ni
comprar. La farmacia sin aprobar puede iniciar sesión, navegar y comparar,
pero POST /farmacia/pedido responde 403. Los documentos (Cámara de comercio
PDF, NIT/RUT, cédula del representante) se suben a un bucket privado y solo
la propia organización (y el admin) los ve.
"""

import pytest

from app.supabase_client import get_service_client
from tests.conftest import USER_ADMIN, make_token

pytestmark = pytest.mark.usefixtures("live_db")

ORG_PROVEEDOR1 = "0000000a-0000-0000-0000-000000000001"
EMAIL = "gate-docs-e2e@cero.test"
NIT = "999777555-1"
BUCKET = "documentos-verificacion"

PDF = (b"%PDF-1.4 contenido de prueba", "application/pdf")
PNG = (b"\x89PNG\r\n\x1a\n fake", "image/png")


def _limpiar(db) -> None:
    """Borra al usuario/organización de prueba y sus archivos del bucket."""
    org = db.table("organizaciones").select("id").eq("nit", NIT).execute().data
    for o in org:
        db.table("ordenes").delete().eq("farmacia_id", o["id"]).execute()
        try:
            archivos = db.storage.from_(BUCKET).list(o["id"]) or []
            rutas = [f"{o['id']}/{a['name']}" for a in archivos]
            if rutas:
                db.storage.from_(BUCKET).remove(rutas)
        except Exception:  # noqa: BLE001 — el bucket puede estar vacío
            pass
        db.table("miembros_organizacion").delete().eq("organizacion_id", o["id"]).execute()
        db.table("organizaciones").delete().eq("id", o["id"]).execute()
    for u in db.auth.admin.list_users() or []:
        if getattr(u, "email", None) == EMAIL:
            db.auth.admin.delete_user(u.id)


@pytest.fixture
def farmacia_nueva(client):
    """Farmacia registrada por autoservicio (nace en_revision). -> (org_id, headers)."""
    db = get_service_client()
    _limpiar(db)
    r = client.post(
        "/v1/onboarding/farmacia",
        json={
            "razon_social": "Farmacia Gate Docs",
            "nit": NIT,
            "ciudad": "Cali",
            "nombre": "Tester Gate",
            "email": EMAIL,
            "password": "PruebaGate-2026",
        },
    )
    assert r.status_code == 201, r.text
    data = r.json()["data"]
    headers = {"Authorization": f"Bearer {make_token(data['user_id'])}"}
    yield data["organizacion_id"], headers
    _limpiar(db)


@pytest.fixture
def headers_admin() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_ADMIN)}"}


def _oferta_activa() -> dict:
    filas = (
        get_service_client()
        .table("ofertas")
        .select("id, stock_disponible")
        .eq("organizacion_id", ORG_PROVEEDOR1)
        .eq("activo", True)
        .gte("stock_disponible", 1)
        .execute()
    ).data
    return filas[0]


def _pedir(client, headers):
    of = _oferta_activa()
    return client.post(
        "/v1/farmacia/pedido",
        json={"items": [{"oferta_id": of["id"], "cantidad": 1}]},
        headers=headers,
    )


# --------------------------------------------------------------------------- #
# Gate de compra: sin aprobación no se compra
# --------------------------------------------------------------------------- #

def test_farmacia_nueva_nace_en_revision_y_no_puede_pedir(client, farmacia_nueva):
    org_id, headers = farmacia_nueva
    db = get_service_client()
    org = db.table("organizaciones").select("estado_verificacion").eq("id", org_id).single().execute().data
    assert org["estado_verificacion"] == "en_revision"

    # Puede NAVEGAR: buscar y comparar responden 200.
    r_busq = client.get("/v1/farmacia/buscar", params={"q": "aceta"}, headers=headers)
    assert r_busq.status_code == 200
    # Pero NO comprar.
    r_ped = _pedir(client, headers)
    assert r_ped.status_code == 403
    assert r_ped.json()["detail"] == "farmacia_no_aprobada"


def test_admin_decide_farmacia_y_el_gate_responde(
    client, farmacia_nueva, headers_admin, limpiar_pedidos_nuevos
):
    org_id, headers = farmacia_nueva

    # Rechazar/suspender sin motivo → 400.
    r_sin = client.post(
        f"/v1/admin/farmacias/{org_id}/decision", json={"accion": "suspendido"}, headers=headers_admin
    )
    assert r_sin.status_code == 400

    # Aprobada → ya puede comprar.
    r_ok = client.post(
        f"/v1/admin/farmacias/{org_id}/decision", json={"accion": "aprobado"}, headers=headers_admin
    )
    assert r_ok.status_code == 200, r_ok.text
    assert r_ok.json()["data"]["estado_verificacion"] == "aprobado"
    assert _pedir(client, headers).status_code == 201

    # Suspendida con "carrito abierto" → el siguiente pedido vuelve a 403.
    client.post(
        f"/v1/admin/farmacias/{org_id}/decision",
        json={"accion": "suspendido", "motivo": "verificación vencida"},
        headers=headers_admin,
    )
    r_susp = _pedir(client, headers)
    assert r_susp.status_code == 403
    assert r_susp.json()["detail"] == "farmacia_no_aprobada"

    # El endpoint de farmacias no acepta ids de proveedores.
    r_prov = client.post(
        f"/v1/admin/farmacias/{ORG_PROVEEDOR1}/decision",
        json={"accion": "aprobado"},
        headers=headers_admin,
    )
    assert r_prov.status_code == 404


def test_resumen_admin_incluye_farmacias_en_revision(client, farmacia_nueva, headers_admin):
    resumen = client.get("/v1/admin/resumen", headers=headers_admin).json()["data"]
    assert resumen["farmacias_en_revision"] >= 1


# --------------------------------------------------------------------------- #
# Documentos: subida, reglas de formato, reemplazo y scoping
# --------------------------------------------------------------------------- #

def _subir(client, headers, tipo: str, contenido: bytes, mime: str, nombre: str = "doc"):
    return client.post(
        f"/v1/verificacion/documentos/{tipo}",
        files={"archivo": (nombre, contenido, mime)},
        headers=headers,
    )


def test_subida_reglas_y_reemplazo(client, farmacia_nueva):
    _org_id, headers = farmacia_nueva

    # Al inicio: nada subido, 3 requeridos.
    r0 = client.get("/v1/verificacion/documentos", headers=headers).json()["data"]
    assert r0["completo"] is False and len(r0["documentos"]) == 0
    assert set(r0["tipos_requeridos"]) == {"camara_comercio", "nit_rut", "cedula_representante"}

    # Cámara de comercio debe ser PDF (regla del fundador).
    assert _subir(client, headers, "camara_comercio", *PNG).status_code == 400
    assert _subir(client, headers, "camara_comercio", *PNG).json()["detail"] == "camara_comercio_debe_ser_pdf"
    # Tipo desconocido y formato no permitido.
    assert _subir(client, headers, "otro_documento", *PDF).status_code == 400
    r_zip = client.post(
        "/v1/verificacion/documentos/nit_rut",
        files={"archivo": ("x.zip", b"zipzip", "application/zip")},
        headers=headers,
    )
    assert r_zip.status_code == 400

    # Los 3 documentos válidos → completo.
    assert _subir(client, headers, "camara_comercio", *PDF, "camara.pdf").status_code == 201
    assert _subir(client, headers, "nit_rut", *PNG, "rut.png").status_code == 201
    assert _subir(client, headers, "cedula_representante", *PDF, "cc.pdf").status_code == 201
    r1 = client.get("/v1/verificacion/documentos", headers=headers).json()["data"]
    assert r1["completo"] is True and len(r1["documentos"]) == 3

    # Re-subir REEMPLAZA (sigue habiendo uno por tipo) aunque cambie el formato.
    assert _subir(client, headers, "nit_rut", *PDF, "rut-v2.pdf").status_code == 201
    r2 = client.get("/v1/verificacion/documentos", headers=headers).json()["data"]
    nit = [d for d in r2["documentos"] if d["tipo"] == "nit_rut"]
    assert len(nit) == 1 and nit[0]["nombre_archivo"] == "rut-v2.pdf" and nit[0]["estado"] == "subido"


def test_scoping_documentos_por_organizacion(client, farmacia_nueva, headers_farmacia1, headers_proveedor1):
    _org_id, headers = farmacia_nueva
    assert _subir(client, headers, "nit_rut", *PDF).status_code == 201

    # La farmacia seed NO ve los documentos de la farmacia nueva.
    ajenos = client.get("/v1/verificacion/documentos", headers=headers_farmacia1).json()["data"]
    assert all(d["nombre_archivo"] != "doc" for d in ajenos["documentos"])

    # Un no-admin no puede usar la vista de documentos del admin.
    r = client.get(f"/v1/admin/organizaciones/{_org_id}/documentos", headers=headers_proveedor1)
    assert r.status_code == 403


def test_admin_ve_documentos_y_decide_por_documento(client, farmacia_nueva, headers_admin):
    org_id, headers = farmacia_nueva
    assert _subir(client, headers, "camara_comercio", *PDF, "camara.pdf").status_code == 201

    vista = client.get(f"/v1/admin/organizaciones/{org_id}/documentos", headers=headers_admin)
    assert vista.status_code == 200, vista.text
    data = vista.json()["data"]
    assert data["razon_social"] == "Farmacia Gate Docs"
    doc = next(d for d in data["documentos"] if d["tipo"] == "camara_comercio")
    assert doc["url"], "el admin recibe URL firmada para ver/descargar"

    # Rechazo por documento exige motivo; con motivo queda 'rechazado'.
    sin_motivo = client.post(
        f"/v1/admin/documentos/{doc['id']}/decision", json={"accion": "rechazado"}, headers=headers_admin
    )
    assert sin_motivo.status_code == 400
    r_re = client.post(
        f"/v1/admin/documentos/{doc['id']}/decision",
        json={"accion": "rechazado", "motivo": "ilegible"},
        headers=headers_admin,
    )
    assert r_re.status_code == 200 and r_re.json()["data"]["estado"] == "rechazado"

    # La organización lo ve rechazado con motivo y al re-subir vuelve a 'subido'.
    mios = client.get("/v1/verificacion/documentos", headers=headers).json()["data"]
    cam = next(d for d in mios["documentos"] if d["tipo"] == "camara_comercio")
    assert cam["estado"] == "rechazado" and cam["motivo_rechazo"] == "ilegible"
    assert _subir(client, headers, "camara_comercio", *PDF, "camara-v2.pdf").status_code == 201
    mios2 = client.get("/v1/verificacion/documentos", headers=headers).json()["data"]
    cam2 = next(d for d in mios2["documentos"] if d["tipo"] == "camara_comercio")
    assert cam2["estado"] == "subido" and cam2["motivo_rechazo"] is None
