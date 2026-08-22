from pydantic import BaseModel


class Organizacion(BaseModel):
    id: str
    tipo: str
    razon_social: str
    nit: str | None = None
    ciudad: str | None = None
    direccion: str | None = None
    verificado: bool
    # Gate "on live": en_revision | aprobado | rechazado | suspendido.
    estado_verificacion: str = "aprobado"
    motivo_decision: str | None = None


class Perfil(BaseModel):
    id: str
    nombre: str | None = None


class Me(BaseModel):
    # None para el admin de plataforma (no pertenece a una organización).
    organizacion: Organizacion | None = None
    perfil: Perfil
    es_admin: bool = False


class ActualizarOrganizacionRequest(BaseModel):
    """Campos que la propia organización puede editar desde Cuenta."""

    direccion: str  # se valida no-vacía en el endpoint (tras strip)
