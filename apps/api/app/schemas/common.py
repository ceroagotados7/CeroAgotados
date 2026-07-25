from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiError(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    """Envelope estándar de respuesta: `{ data, error }` (patrón heredado de prontto).

    Éxito → `data` con contenido, `error` en null.
    Fallo controlado → `error` con código y mensaje, `data` en null.
    """

    data: T | None = None
    error: ApiError | None = None
