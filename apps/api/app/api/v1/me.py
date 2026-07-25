from fastapi import APIRouter

from app.deps import CurrentUserId, ProviderOrgId, SupabaseDep
from app.schemas.common import ApiResponse
from app.schemas.me import Me, Organizacion, Perfil

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/")
def get_me(user_id: CurrentUserId, org_id: ProviderOrgId, db: SupabaseDep) -> ApiResponse[Me]:
    """Organización del proveedor y perfil del usuario actual (app bars + Cuenta)."""
    org = (
        db.table("organizaciones")
        .select("id, tipo, razon_social, nit, ciudad, verificado")
        .eq("id", org_id)
        .single()
        .execute()
    ).data
    perfil = (
        db.table("profiles")
        .select("id, nombre")
        .eq("id", user_id)
        .single()
        .execute()
    ).data or {"id": user_id, "nombre": None}

    return ApiResponse(data=Me(organizacion=Organizacion(**org), perfil=Perfil(**perfil)))
