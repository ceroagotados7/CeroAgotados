from typing import Annotated

from pydantic import BaseModel, Field


class RegistroOrganizacionRequest(BaseModel):
    """Alta autoservicio de una empresa (proveedor o farmacia) + usuario responsable."""

    razon_social: Annotated[str, Field(min_length=2, max_length=200)]
    nit: str | None = None
    ciudad: str | None = None
    # Obligatoria en el FORMULARIO de farmacia (el proveedor despacha ahí);
    # opcional a nivel de API para no romper el registro de proveedores.
    direccion: Annotated[str | None, Field(max_length=300)] = None
    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    email: Annotated[str, Field(min_length=5, max_length=200)]
    password: Annotated[str, Field(min_length=8, max_length=72)]


# Alias histórico (el registro nació solo-proveedor).
RegistroProveedorRequest = RegistroOrganizacionRequest


class RegistroProveedorResult(BaseModel):
    user_id: str
    organizacion_id: str
