from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.catalogo import ProductoMaestro


class OfertaCreate(BaseModel):
    producto_maestro_id: str
    precio: Annotated[float, Field(gt=0)]
    stock_disponible: Annotated[int, Field(ge=0)] = 0
    activo: bool = True


class OfertaUpdate(BaseModel):
    precio: Annotated[float | None, Field(gt=0)] = None
    stock_disponible: Annotated[int | None, Field(ge=0)] = None
    activo: bool | None = None


class Oferta(BaseModel):
    id: str
    organizacion_id: str
    producto_maestro_id: str
    precio: float
    stock_disponible: int
    activo: bool
    producto: ProductoMaestro | None = None


class OfertaBulkItem(BaseModel):
    producto_maestro_id: str
    precio: Annotated[float, Field(gt=0)]
    stock_disponible: Annotated[int, Field(ge=0)] = 0


class OfertaBulkRequest(BaseModel):
    items: Annotated[list[OfertaBulkItem], Field(min_length=1)]


class OfertaBulkResult(BaseModel):
    procesadas: int
    creadas_o_actualizadas: int
    errores: list[str]


class OfertaEliminada(BaseModel):
    id: str
