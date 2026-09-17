"""Las cifras de dinero de una orden que NO viven en la base de datos.

`ordenes.total` lo materializa una sola vez la RPC `aceptar_orden` y nadie lo
vuelve a tocar: es lo que el distribuidor despachó y facturó, y es la base de la
comisión. Una devolución **no lo reduce** — regla del fundador: si la farmacia no
recibió, falló el distribuidor, no la plataforma.

Lo que la farmacia debe PAGAR sí baja con las devoluciones, y es lo que se
calcula aquí. Se DERIVA en vez de guardarse, por tres razones:

  · los precios ya están congelados en `precio_unitario_snapshot` y las
    cantidades son inmutables una vez registrada la recepción, así que el
    derivado no puede divergir de la realidad;
  · arregla por sí solo las órdenes anteriores a este cambio, sin backfill;
  · no hace falta migración.

Vive en su propio módulo para no tener DOS fórmulas del mismo dinero: el margen
por producto de `admin.py` ya duplica en Python el cálculo de `aceptar_orden`, y
una tercera copia sería una divergencia esperando a ocurrir.
"""

from collections.abc import Iterable
from typing import Protocol


class LineaDeOrden(Protocol):
    """Lo mínimo que necesita una línea para valorizarse.

    Se tipa estructuralmente (Protocol) y no con `OrdenItem` para no crear un
    ciclo de imports: los schemas importan de aquí, no al revés.
    """

    precio_unitario_snapshot: float
    cantidad_no_aceptada: int


def valor_no_aceptado(items: Iterable[LineaDeOrden]) -> float:
    """Dinero que la farmacia devolvió, a precio congelado."""
    return round(
        sum(i.cantidad_no_aceptada * i.precio_unitario_snapshot for i in items), 2
    )


def total_a_pagar(total: float, items: Iterable[LineaDeOrden]) -> float:
    """Lo que la farmacia paga de verdad: lo facturado menos lo devuelto.

    Se acota a 0 por si acaso. `chk_no_aceptada_no_excede` ya impide devolver
    más de lo despachado, pero un importe negativo en pantalla sería peor que
    un cero, y esta función también corre sobre órdenes históricas.
    """
    return round(max(0.0, total - valor_no_aceptado(items)), 2)
