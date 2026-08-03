from fastapi import APIRouter, HTTPException, status
from postgrest.exceptions import APIError

from app.deps import SupabaseDep
from app.schemas.common import ApiResponse
from app.schemas.onboarding import RegistroProveedorRequest, RegistroProveedorResult

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


def _es_email_duplicado(exc: Exception) -> bool:
    msg = str(getattr(exc, "message", "") or exc).lower()
    return any(s in msg for s in ("already", "registered", "exists", "duplicate"))


@router.post("/proveedor", status_code=status.HTTP_201_CREATED)
def registrar_proveedor(
    payload: RegistroProveedorRequest, db: SupabaseDep
) -> ApiResponse[RegistroProveedorResult]:
    """Alta autoservicio de un proveedor (registro público)."""
    return _registrar_organizacion(payload, db, tipo="proveedor")


@router.post("/farmacia", status_code=status.HTTP_201_CREATED)
def registrar_farmacia(
    payload: RegistroProveedorRequest, db: SupabaseDep
) -> ApiResponse[RegistroProveedorResult]:
    """Alta autoservicio de una farmacia (registro público)."""
    return _registrar_organizacion(payload, db, tipo="farmacia")


def _registrar_organizacion(
    payload: RegistroProveedorRequest, db, tipo: str
) -> ApiResponse[RegistroProveedorResult]:
    """Crea el usuario (auto-confirmado, sin verificación de email por ahora),
    su organización del `tipo` dado y la membresía. Usa service role.
    """
    # 1) Usuario de Auth, auto-confirmado (sin verificación de email por ahora).
    try:
        res = db.auth.admin.create_user(
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {"nombre": payload.nombre},
            }
        )
    except Exception as exc:  # noqa: BLE001 — mapeamos a un error de negocio claro
        if _es_email_duplicado(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, "email_ya_registrado") from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_crear_usuario") from exc

    user = getattr(res, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_crear_usuario")
    user_id = user.id

    # 2) Organización. Si falla, revertimos el usuario (sin huérfanos).
    try:
        org_res = (
            db.table("organizaciones")
            .insert(
                {
                    "tipo": tipo,
                    "razon_social": payload.razon_social,
                    "nit": payload.nit,
                    "ciudad": payload.ciudad,
                }
            )
            .execute()
        )
    except APIError as exc:
        db.auth.admin.delete_user(user_id)
        if "nit" in (exc.message or "").lower() or "duplicate" in (exc.message or "").lower():
            raise HTTPException(status.HTTP_409_CONFLICT, "nit_ya_registrado") from exc
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_crear_organizacion") from exc

    org_id = org_res.data[0]["id"]

    # 3) Membresía usuario ↔ organización. Si falla, revertimos org + usuario.
    try:
        db.table("miembros_organizacion").insert(
            {"user_id": user_id, "organizacion_id": org_id, "rol": "owner"}
        ).execute()
    except APIError as exc:
        db.table("organizaciones").delete().eq("id", org_id).execute()
        db.auth.admin.delete_user(user_id)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_crear_membresia") from exc

    return ApiResponse(data=RegistroProveedorResult(user_id=user_id, organizacion_id=org_id))
