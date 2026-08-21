from fastapi import APIRouter

from app.api.v1 import admin, catalogo, dashboard, farmacia, health, me, ofertas, onboarding, ordenes, verificacion

api_router = APIRouter(prefix="/v1")
api_router.include_router(health.router)
api_router.include_router(catalogo.router)
api_router.include_router(ofertas.router)
api_router.include_router(ordenes.router)
api_router.include_router(dashboard.router)
api_router.include_router(me.router)
api_router.include_router(onboarding.router)
api_router.include_router(farmacia.router)
api_router.include_router(admin.router)
api_router.include_router(verificacion.router)
