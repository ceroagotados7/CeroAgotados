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
    # Transparencia post-pedido (decisión del equipo 2026-09-04): con el pedido
    # YA ENVIADO la farmacia ve la razón social del proveedor (para reclamos).
    # El anonimato aplica solo ANTES: buscar/comparar nunca la exponen.
    proveedor_nombre: str | None = None
    n_items: int
    subtotal: float


class PedidoCreadoResult(BaseModel):
    ordenes: list[OrdenCreada]
    total: float


class PedidoFarmacia(BaseModel):
    """Orden vista por la farmacia (f5/f6).

    Transparencia post-pedido (2026-09-04): una vez enviado el pedido, la
    farmacia ve la razón social del proveedor (para reclamar demoras). El
    UUID de la organización sigue sin exponerse jamás.
    """

    id: str
    codigo: str
    estado: str
    total: float  # total ACEPTADO (lo recalcula el proveedor)
    total_solicitado: float
    proveedor_alias: str
    proveedor_nombre: str | None = None
    created_at: str
    # Factura con la que el proveedor despachó: la farmacia la coteja contra
    # la física al recibir. No revela identidad (el alias sigue anónimo).
    factura_numero: str | None = None
    items: list[OrdenItem] = []
    eventos: list[OrdenEvento] = []
