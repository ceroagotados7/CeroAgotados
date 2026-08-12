import os
import time
from pathlib import Path

# Ambiente DEV: si existe apps/api/.env.test (proyecto Supabase cero-agotados-dev),
# sus variables MANDAN sobre el .env — así la suite nunca toca la DB de demo/prod.
_ENV_TEST = Path(__file__).resolve().parent.parent / ".env.test"
if _ENV_TEST.exists():
    for _linea in _ENV_TEST.read_text(encoding="utf-8").splitlines():
        _linea = _linea.strip()
        if _linea and not _linea.startswith("#") and "=" in _linea:
            _k, _v = _linea.split("=", 1)
            os.environ[_k.strip()] = _v.strip()

# Los tests acuñan JWT HS256; en modo cloud la API solo acepta ES256/RS256 (JWKS),
# así que forzamos entorno local ANTES de importar la config (env var > .env).
os.environ["ENVIRONMENT"] = "local"

import pytest  # noqa: E402 — el entorno debe fijarse ANTES de importar la app
from fastapi.testclient import TestClient  # noqa: E402
from jose import jwt  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.supabase_client import get_service_client  # noqa: E402

# UUIDs de los usuarios semilla (ver supabase/seed.sql).
USER_PROVEEDOR1 = "0000000d-0000-0000-0000-000000000001"
USER_PROVEEDOR2 = "0000000d-0000-0000-0000-000000000002"
USER_FARMACIA1 = "0000000e-0000-0000-0000-000000000001"
USER_ADMIN = "0000000c-0000-0000-0000-000000000001"


def make_token(user_id: str) -> str:
    """Acuña un JWT válido para la API sin pasar por GoTrue (mismo secreto local)."""
    now = int(time.time())
    return jwt.encode(
        {"sub": user_id, "aud": "authenticated", "role": "authenticated", "iat": now, "exp": now + 3600},
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def live_db():
    """Salta las pruebas de integración si el Supabase local no está disponible."""
    try:
        get_service_client().table("producto_maestro").select("id").limit(1).execute()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Supabase local no disponible ({exc}). Corre `supabase start`.")


@pytest.fixture
def headers_proveedor1() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_PROVEEDOR1)}"}


@pytest.fixture
def headers_proveedor2() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_PROVEEDOR2)}"}


@pytest.fixture
def headers_farmacia1() -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(USER_FARMACIA1)}"}
