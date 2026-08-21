from typing import Literal

from pydantic import BaseModel

# Tipos de documento requeridos para la verificación de una organización
# (proveedor o farmacia). Deben coincidir con el enum de la DB.
TIPOS_DOCUMENTO = ("camara_comercio", "nit_rut", "cedula_representante")

TipoDocumento = Literal["camara_comercio", "nit_rut", "cedula_representante"]


class DocumentoVerificacion(BaseModel):
    """Metadatos de un documento subido (el archivo vive en Storage privado)."""

    id: str
    tipo: TipoDocumento
    estado: Literal["subido", "aprobado", "rechazado"]
    motivo_rechazo: str | None = None
    nombre_archivo: str
    mime: str
    tamano_bytes: int
    created_at: str
    updated_at: str


class DocumentosResult(BaseModel):
    """Estado documental de la organización: qué se pide y qué hay subido."""

    tipos_requeridos: list[str]
    documentos: list[DocumentoVerificacion]
    completo: bool  # los 3 tipos subidos (sin importar si ya fueron revisados)


class AdminDocumento(DocumentoVerificacion):
    """Documento visto por el admin: incluye URL firmada de corta vida."""

    url: str | None = None


class AdminDocumentosResult(BaseModel):
    organizacion_id: str
    razon_social: str
    tipos_requeridos: list[str]
    documentos: list[AdminDocumento]


class DecisionDocumentoRequest(BaseModel):
    accion: Literal["aprobado", "rechazado"]
    motivo: str | None = None  # obligatorio al rechazar
