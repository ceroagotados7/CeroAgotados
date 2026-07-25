from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.schemas.catalogo import ProductoMaestro


class OrdenItem(BaseModel):
    id: str
    producto_maestro_id: str
    precio_unitario_snapshot: float
    cantidad_solicitada: int
    cantidad_aceptada: int
    estado_item: str
    producto_sustituto_id: str | None = None
    oferta_sustituto_id: str | None = None
    producto: ProductoMaestro | None = None


class OrgRef(BaseModel):
    razon_social: str | None = None
    nit: str | None = None
    ciudad: str | None = None


class Orden(BaseModel):
    id: str
    codigo: str
    farmacia_id: str
    proveedor_id: str
    estado: str
    total: float
    created_at: str
    farmacia: OrgRef | None = None
    items: list[OrdenItem] = []


class ItemDecision(BaseModel):
    item_id: str
    estado: Literal["aceptado", "rechazado", "sustituido"]
    cantidad_aceptada: Annotated[int, Field(ge=0)] = 0
    producto_sustituto_id: str | None = None
    oferta_sustituto_id: str | None = None


class AceptarOrdenRequest(BaseModel):
    decisiones: Annotated[list[ItemDecision], Field(min_length=1)]
