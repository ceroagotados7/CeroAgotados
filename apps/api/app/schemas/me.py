from pydantic import BaseModel


class Organizacion(BaseModel):
    id: str
    tipo: str
    razon_social: str
    nit: str | None = None
    ciudad: str | None = None
    verificado: bool


class Perfil(BaseModel):
    id: str
    nombre: str | None = None


class Me(BaseModel):
    # None para el admin de plataforma (no pertenece a una organización).
    organizacion: Organizacion | None = None
    perfil: Perfil
    es_admin: bool = False
