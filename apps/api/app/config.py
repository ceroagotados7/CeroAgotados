from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de la API, leída de variables de entorno / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Supabase
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    # Secreto para verificar los JWT emitidos por Supabase Auth (GoTrue).
    supabase_jwt_secret: str = "super-secret-jwt-token-with-at-least-32-characters-long"

    # Secreto para endpoints de administración (patrón heredado de prontto).
    admin_secret: str = "dev-admin-secret"

    # CORS: orígenes permitidos. Dev local (3000/3001) + dominio de producción.
    # Los previews de Vercel (*.vercel.app) se permiten por regex en main.py.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://ceroagotados.com",
        "https://www.ceroagotados.com",
    ]

    environment: str = "local"

    # Comisión de plataforma (a3-ganancias). Simulada mientras el CEO decide
    # el modelo de monetización definitivo; el mockup usa 6%.
    comision_pct: float = 0.06


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
