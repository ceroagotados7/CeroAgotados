from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator

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
    # Factura de venta del despacho (trazabilidad punto a punto). Null en
    # órdenes aún no despachadas o anteriores a la migración 21.
    factura_numero: str | None = None
    factura_registrada_at: str | None = None
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


# Regla espejo de la DB (_normalizar_factura): 3-30 chars, empieza y termina
# en alfanumérico; - / . y espacio permitidos en el medio.
_FACTURA_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9 ./-]{1,28}[A-Za-z0-9]$"


class FacturaRequest(BaseModel):
    """Número de factura del despacho. Obligatorio: sin factura no hay despacho."""

    factura_numero: Annotated[str, Field(pattern=_FACTURA_PATTERN)]

    @field_validator("factura_numero", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v
