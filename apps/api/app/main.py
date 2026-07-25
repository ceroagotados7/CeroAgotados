from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings

app = FastAPI(
    title="Cero Agotados API",
    version="0.1.0",
    description="API del marketplace farmacéutico B2B Cero Agotados.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Permite los dominios de despliegue de Vercel (producción y previews).
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "cero-agotados-api", "status": "ok", "docs": "/docs"}
