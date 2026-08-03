from fastapi import APIRouter

from app.deps import CurrentUserId, SupabaseDep, UserOrg
from app.schemas.common import ApiResponse
from app.schemas.me import Me, Organizacion, Perfil

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/")
def get_me(user_id: CurrentUserId, org: UserOrg, db: SupabaseDep) -> ApiResponse[Me]:
    """Organización (proveedor O farmacia) y perfil del usuario (app bars + Cuenta).

    El frontend usa `organizacion.tipo` para enrutar al área correcta tras el login.
    """
    perfil = (
        db.table("profiles")
        .select("id, nombre")
        .eq("id", user_id)
        .single()
        .execute()
    ).data or {"id": user_id, "nombre": None}

    return ApiResponse(data=Me(organizacion=Organizacion(**org), perfil=Perfil(**perfil)))
