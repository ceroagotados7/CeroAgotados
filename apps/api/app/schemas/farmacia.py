from typing import Annotated

from pydantic import BaseModel, Field

from app.schemas.catalogo import ProductoMaestro
from app.schemas.ordenes import OrdenEvento, OrdenItem

# ---------------------------------------------------------------------------
# ANONIMATO DEL PROVEEDOR (regla de negocio del fundador, 2026-08-02):
# ningún schema de este módulo expone identidad del proveedor (id, razón
# social, NIT…). Las farmacias comparan opciones anónimas por precio; el
# proveedor se referencia solo por un alias opaco ("Proveedor 3F2A").
# ---------------------------------------------------------------------------


class ProductoBusqueda(ProductoMaestro):
    """Resultado de búsqueda (f1): producto + cuántas opciones hay y desde qué precio."""

    opciones: int
    precio_desde: float


class OpcionCompara(BaseModel):
    """Una oferta anónima en la comparación (f2). Sin identidad del proveedor."""

    oferta_id: str
    proveedor_alias: str
    precio: float
    stock_disponible: int
    es_mejor_precio: bool
    diferencia_vs_mejor: float


class CompararResult(BaseModel):
    producto: ProductoMaestro
    opciones_total: int
    precio_min: float | None = None
    precio_promedio: float | None = None
    opciones: list[OpcionCompara]


class PedidoItemIn(BaseModel):
    oferta_id: str
    cantidad: Annotated[int, Field(gt=0)]


class PedidoCreate(BaseModel):
    items: Annotated[list[PedidoItemIn], Field(min_length=1)]
    notas: str | None = None


class OrdenCreada(BaseModel):
    """Una de las órdenes generadas por el pedido (una por proveedor, f4)."""

    orden_id: str
    codigo: str
    proveedor_alias: str
    n_items: int
    subtotal: float


class PedidoCreadoResult(BaseModel):
    ordenes: list[OrdenCreada]
    total: float


class PedidoFarmacia(BaseModel):
    """Orden vista por la farmacia (f5/f6): sin identidad del proveedor."""

    id: str
    codigo: str
    estado: str
    total: float  # total ACEPTADO (lo recalcula el proveedor)
    total_solicitado: float
    proveedor_alias: str
    created_at: str
    items: list[OrdenItem] = []
    eventos: list[OrdenEvento] = []
