from fastapi import APIRouter

from app.deps import CurrentUserId, SupabaseDep, get_user_org, is_admin
from app.schemas.common import ApiResponse
from app.schemas.me import Me, Organizacion, Perfil

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/")
def get_me(user_id: CurrentUserId, db: SupabaseDep) -> ApiResponse[Me]:
    """Organización (proveedor O farmacia) y perfil del usuario (app bars + Cuenta).

    El frontend enruta tras el login con `es_admin` y `organizacion.tipo`.
    El admin de plataforma no pertenece a una organización (organizacion=None).
    """
    perfil = (
        db.table("profiles")
        .select("id, nombre")
        .eq("id", user_id)
        .single()
        .execute()
    ).data or {"id": user_id, "nombre": None}

    if is_admin(user_id, db):
        return ApiResponse(data=Me(organizacion=None, perfil=Perfil(**perfil), es_admin=True))

    org = get_user_org(user_id, db)  # 403 sin_organizacion si no tiene ninguna
    return ApiResponse(data=Me(organizacion=Organizacion(**org), perfil=Perfil(**perfil)))
