
from fastapi import APIRouter, HTTPException, UploadFile, status
from storage3.exceptions import StorageApiError

from app.deps import CurrentUserId, SupabaseDep, UserOrg
from app.schemas.common import ApiResponse
from app.schemas.verificacion import (
    TIPOS_DOCUMENTO,
    DocumentosResult,
    DocumentoVerificacion,
)

router = APIRouter(prefix="/verificacion", tags=["verificacion"])

BUCKET = "documentos-verificacion"
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB (alineado con el límite del bucket)
_EXT_POR_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}

_DOC_COLS = (
    "id, tipo, estado, motivo_rechazo, nombre_archivo, mime, tamano_bytes,"
    " created_at, updated_at"
)


def _a_resultado(filas: list[dict]) -> DocumentosResult:
    docs = [DocumentoVerificacion(**f) for f in filas]
    return DocumentosResult(
        tipos_requeridos=list(TIPOS_DOCUMENTO),
        documentos=docs,
        completo={d.tipo for d in docs} >= set(TIPOS_DOCUMENTO),
    )


@router.get("/documentos")
def listar_documentos(org: UserOrg, db: SupabaseDep) -> ApiResponse[DocumentosResult]:
    """Documentos de verificación de la organización del usuario (cualquier rol).

    El scoping es por SU organización: nadie puede listar documentos ajenos.
    """
    filas = (
        db.table("documentos_verificacion")
        .select(_DOC_COLS)
        .eq("organizacion_id", org["id"])
        .execute()
    ).data or []
    return ApiResponse(data=_a_resultado(filas))


@router.post("/documentos/{tipo}", status_code=status.HTTP_201_CREATED)
def subir_documento(
    tipo: str,
    archivo: UploadFile,
    org: UserOrg,
    user_id: CurrentUserId,
    db: SupabaseDep,
) -> ApiResponse[DocumentoVerificacion]:
    """Sube (o REEMPLAZA) un documento de verificación de la organización.

    Reglas: solo PDF/JPG/PNG hasta 10 MB; la Cámara de comercio debe ser PDF
    (requisito del fundador). Re-subir devuelve el documento a estado 'subido'
    (limpia un rechazo previo) para que el admin lo revise de nuevo.
    """
    if tipo not in TIPOS_DOCUMENTO:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "tipo_documento_invalido")
    mime = (archivo.content_type or "").lower()
    if mime not in _EXT_POR_MIME:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "formato_no_permitido")
    if tipo == "camara_comercio" and mime != "application/pdf":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "camara_comercio_debe_ser_pdf")

    contenido = archivo.file.read(_MAX_BYTES + 1)
    if not contenido:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "archivo_vacio")
    if len(contenido) > _MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "archivo_demasiado_grande")

    # Un archivo vigente por tipo: ruta determinística dentro de la carpeta de
    # la organización. Si cambia la extensión, se borra el archivo anterior.
    path = f"{org['id']}/{tipo}{_EXT_POR_MIME[mime]}"
    previo = (
        db.table("documentos_verificacion")
        .select("id, storage_path")
        .eq("organizacion_id", org["id"])
        .eq("tipo", tipo)
        .execute()
    ).data
    if previo and previo[0]["storage_path"] != path:
        try:
            db.storage.from_(BUCKET).remove([previo[0]["storage_path"]])
        except StorageApiError:
            pass  # el archivo viejo puede no existir; no bloquea el reemplazo

    try:
        db.storage.from_(BUCKET).upload(
            path, contenido, {"content-type": mime, "upsert": "true"}
        )
    except StorageApiError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no_se_pudo_subir_archivo") from exc

    fila = (
        db.table("documentos_verificacion")
        .upsert(
            {
                "organizacion_id": org["id"],
                "tipo": tipo,
                "estado": "subido",  # re-subir limpia un rechazo previo
                "motivo_rechazo": None,
                "storage_path": path,
                "nombre_archivo": archivo.filename or f"{tipo}{_EXT_POR_MIME[mime]}",
                "mime": mime,
                "tamano_bytes": len(contenido),
                "subido_por": user_id,
                "revisado_por": None,
            },
            on_conflict="organizacion_id,tipo",
        )
        .execute()
    ).data[0]
    return ApiResponse(data=DocumentoVerificacion(**{k: fila[k] for k in DocumentoVerificacion.model_fields if k in fila}))
