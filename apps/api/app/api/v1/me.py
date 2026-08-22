from fastapi import APIRouter, HTTPException, status

from app.deps import CurrentUserId, SupabaseDep, UserOrg, get_user_org, is_admin
from app.schemas.common import ApiResponse
from app.schemas.me import ActualizarOrganizacionRequest, Me, Organizacion, Perfil

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


@router.patch("/organizacion")
def actualizar_organizacion(
    payload: ActualizarOrganizacionRequest, org: UserOrg, db: SupabaseDep
) -> ApiResponse[Organizacion]:
    """Actualiza la dirección de la PROPIA organización del usuario.

    Necesario para las farmacias registradas antes de que el campo existiera
    (el proveedor despacha a esta dirección). El scoping es implícito: solo
    opera sobre la organización a la que pertenece el usuario.
    """
    direccion = payload.direccion.strip()
    if len(direccion) < 5:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "direccion_invalida")
    fila = (
        db.table("organizaciones")
        .update({"direccion": direccion[:300]})
        .eq("id", org["id"])
        .execute()
    ).data
    if not fila:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_actualizar")
    return ApiResponse(data=Organizacion(**{**org, "direccion": direccion[:300]}))
