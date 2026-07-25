from fastapi import APIRouter
from pydantic import BaseModel

from app.schemas.common import ApiResponse

router = APIRouter(prefix="/health", tags=["health"])


class Health(BaseModel):
    status: str
    service: str


@router.get("/")
async def health() -> ApiResponse[Health]:
    return ApiResponse(data=Health(status="ok", service="cero-agotados-api"))
