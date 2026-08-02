import json
import urllib.request
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt
from supabase import Client

from app.config import settings
from app.supabase_client import get_service_client


@lru_cache
def _jwks() -> dict:
    """JWKS del proyecto (llaves públicas para tokens asimétricos ES256/RS256)."""
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.load(resp)


def _jwk_for(kid: str | None) -> dict | None:
    key = next((k for k in _jwks().get("keys", []) if k.get("kid") == kid), None)
    if key is None:
        _jwks.cache_clear()  # por si las llaves rotaron
        key = next((k for k in _jwks().get("keys", []) if k.get("kid") == kid), None)
    return key


def get_current_user_id(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Verifica el JWT de Supabase Auth y devuelve el user_id.

    En la nube el proyecto firma con llaves asimétricas (ES256/RS256 vía JWKS)
    y HS256 queda rechazado: aceptarlo permitiría forjar tokens con un secreto
    filtrado. HS256 (secreto compartido) solo se admite en entorno local.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_ausente")
    token = authorization.split(" ", 1)[1]
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        if alg == "HS256":
            if settings.environment != "local":
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_alg_no_permitido")
            key: object = settings.supabase_jwt_secret
        else:
            key = _jwk_for(header.get("kid"))
            if key is None:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_kid_desconocido")
        payload = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_invalido")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token_invalido")
    return user_id


CurrentUserId = Annotated[str, Depends(get_current_user_id)]
SupabaseDep = Annotated[Client, Depends(get_service_client)]


def get_provider_org_id(user_id: CurrentUserId, db: SupabaseDep) -> str:
    """Devuelve la organización de tipo `proveedor` a la que pertenece el usuario.

    403 si el usuario no es miembro de ninguna organización proveedor.
    """
    miembros = (
        db.table("miembros_organizacion")
        .select("organizacion_id")
        .eq("user_id", user_id)
        .execute()
    )
    org_ids = [m["organizacion_id"] for m in (miembros.data or [])]
    if not org_ids:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "sin_organizacion")

    orgs = (
        db.table("organizaciones")
        .select("id, tipo")
        .in_("id", org_ids)
        .eq("tipo", "proveedor")
        .limit(1)
        .execute()
    )
    if not orgs.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "no_es_proveedor")
    return orgs.data[0]["id"]


ProviderOrgId = Annotated[str, Depends(get_provider_org_id)]
