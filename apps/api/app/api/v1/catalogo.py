from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import ProviderOrgId, SupabaseDep
from app.schemas.catalogo import CatalogoFacetas, ProductoMaestro
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/catalogo", tags=["catalogo"])

_COLS = (
    "id, nombre, principio_activo, concentracion, forma_farmaceutica, presentacion, "
    "laboratorio, categoria, tipo, via_administracion, condicion_venta"
)


@router.get("/")
def buscar_catalogo(
    org_id: ProviderOrgId,
    db: SupabaseDep,
    q: Annotated[
        str | None, Query(description="Texto libre: marca, principio activo o laboratorio")
    ] = None,
    categoria: Annotated[str | None, Query(description="Grupo farmacológico")] = None,
    forma_farmaceutica: Annotated[str | None, Query()] = None,
    laboratorio: Annotated[str | None, Query()] = None,
    tipo: Annotated[str | None, Query(description="Marca o Genérico")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
    incluir_ofertados: Annotated[
        bool,
        Query(description="Incluir productos que el proveedor ya oferta (para matching de carga masiva)"),
    ] = False,
) -> ApiResponse[list[ProductoMaestro]]:
    """Catálogo maestro para agregar ofertas (p3): productos que el proveedor
    aún NO oferta, con el precio más bajo del mercado como referencia.
    Con `incluir_ofertados=true` devuelve todo el maestro (usado por la carga masiva)."""
    ya_ids: set[str] = set()
    if not incluir_ofertados:
        # Productos que este proveedor ya oferta (para no ofrecérselos de nuevo).
        ya = (
            db.table("ofertas")
            .select("producto_maestro_id")
            .eq("organizacion_id", org_id)
            .execute()
        ).data or []
        ya_ids = {r["producto_maestro_id"] for r in ya}

    # La búsqueda vive en Postgres (rpc): ordenar por relevancia no se puede
    # expresar en PostgREST, y los ya-ofertados viajan como array en el cuerpo
    # en vez de en la URL, que con miles de ofertas se desbordaba.
    productos = (
        db.rpc(
            "buscar_productos_maestro",
            {
                "p_q": (q or "").strip() or None,
                "p_categoria": categoria,
                "p_forma": forma_farmaceutica,
                "p_laboratorio": laboratorio,
                "p_tipo": tipo,
                "p_excluir": list(ya_ids),
                "p_limit": limit,
                "p_offset": offset,
            },
        ).execute()
    ).data or []

    # Precio mínimo de mercado por producto (ofertas activas de cualquier proveedor).
    ids = [p["id"] for p in productos]
    min_mercado: dict[str, float] = {}
    if ids:
        ofertas = (
            db.table("ofertas")
            .select("producto_maestro_id, precio")
            .in_("producto_maestro_id", ids)
            .eq("activo", True)
            .execute()
        ).data or []
        for o in ofertas:
            pid = o["producto_maestro_id"]
            precio = float(o["precio"])
            if pid not in min_mercado or precio < min_mercado[pid]:
                min_mercado[pid] = precio

    return ApiResponse(
        data=[
            ProductoMaestro(**p, precio_min_mercado=min_mercado.get(p["id"]))
            for p in productos
        ]
    )


@router.get("/facetas")
def listar_facetas(org_id: ProviderOrgId, db: SupabaseDep) -> ApiResponse[CatalogoFacetas]:
    """Valores disponibles para los filtros de la pantalla de agregar.

    Con un maestro de miles de productos la barra de búsqueda sola no alcanza: el
    proveedor piensa por forma farmacéutica ("tabletas"), por laboratorio ("Procaps")
    y por marca/genérico. `org_id` solo autentica que quien pregunta es un proveedor.
    """
    filas = (
        db.table("producto_maestro")
        .select("categoria, forma_farmaceutica, laboratorio, tipo")
        .eq("activo", True)
        .execute()
    ).data or []

    def valores(campo: str) -> list[str]:
        return sorted({f[campo] for f in filas if f.get(campo)})

    return ApiResponse(
        data=CatalogoFacetas(
            categorias=valores("categoria"),
            formas_farmaceuticas=valores("forma_farmaceutica"),
            laboratorios=valores("laboratorio"),
            tipos=valores("tipo"),
        )
    )
