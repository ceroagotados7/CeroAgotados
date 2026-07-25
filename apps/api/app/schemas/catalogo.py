from pydantic import BaseModel


class ProductoMaestro(BaseModel):
    id: str
    nombre: str
    principio_activo: str | None = None
    concentracion: str | None = None
    forma_farmaceutica: str | None = None
    presentacion: str | None = None
    laboratorio: str | None = None
    categoria: str | None = None
    # Precio más bajo del mercado para este producto (ofertas activas de cualquier
    # proveedor). Guía al proveedor al fijar su precio (p3). None si nadie lo oferta.
    precio_min_mercado: float | None = None
