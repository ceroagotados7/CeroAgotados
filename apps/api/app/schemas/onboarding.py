from typing import Annotated

from pydantic import BaseModel, Field


class RegistroProveedorRequest(BaseModel):
    """Alta autoservicio de un proveedor (empresa + usuario responsable)."""

    razon_social: Annotated[str, Field(min_length=2, max_length=200)]
    nit: str | None = None
    ciudad: str | None = None
    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    email: Annotated[str, Field(min_length=5, max_length=200)]
    password: Annotated[str, Field(min_length=8, max_length=72)]


class RegistroProveedorResult(BaseModel):
    user_id: str
    organizacion_id: str
