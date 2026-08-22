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
    direccion: str | None = None  # de la farmacia: a dónde despacha el proveedor


class OrdenEvento(BaseModel):
    """Un hito del timeline de la orden (sin actor: no filtra identidades)."""

    tipo: str
    created_at: str


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
    eventos: list[OrdenEvento] = []


class ItemDecision(BaseModel):
    item_id: str
    estado: Literal["aceptado", "rechazado", "sustituido"]
    cantidad_aceptada: Annotated[int, Field(ge=0)] = 0
    # 'sin_stock' en un rechazo = agotado real en bodega → la oferta queda en 0.
    motivo: Literal["sin_stock"] | None = None
    producto_sustituto_id: str | None = None
    oferta_sustituto_id: str | None = None


class AceptarOrdenRequest(BaseModel):
    decisiones: Annotated[list[ItemDecision], Field(min_length=1)]
