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
    # Marca o Genérico. El proveedor filtra por esto al armar su catálogo.
    tipo: str | None = None
    via_administracion: str | None = None
    # Venta libre / con fórmula médica / margen terapéutico estrecho.
    condicion_venta: str | None = None
    # NOTA: este schema se sirve a proveedores. Nunca agregar aquí datos de
    # ofertas de otras organizaciones (p. ej. precio mínimo de mercado):
    # sería una fuga competitiva y un ancla de precios entre proveedores.


class CatalogoFacetas(BaseModel):
    """Valores disponibles para los filtros de la pantalla de agregar ofertas."""

    categorias: list[str]
    formas_farmaceuticas: list[str]
    laboratorios: list[str]
    tipos: list[str]
