"""Endurecimiento de auth: en cloud, los tokens HS256 (forjables con un secreto
filtrado) deben rechazarse; solo valen los asimétricos del proyecto (JWKS)."""

from fastapi.testclient import TestClient

from app.config import settings
from tests.conftest import USER_PROVEEDOR1, make_token


def test_cloud_rechaza_hs256(client: TestClient):
    original = settings.environment
    settings.environment = "cloud"
    try:
        res = client.get(
            "/v1/me",
            headers={"Authorization": f"Bearer {make_token(USER_PROVEEDOR1)}"},
        )
        assert res.status_code == 401
        assert res.json()["detail"] == "token_alg_no_permitido"
    finally:
        settings.environment = original


def test_token_ausente(client: TestClient):
    assert client.get("/v1/me").status_code == 401


def test_token_basura(client: TestClient):
    res = client.get("/v1/me", headers={"Authorization": "Bearer no-es-un-jwt"})
    assert res.status_code == 401
