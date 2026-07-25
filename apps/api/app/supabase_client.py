from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache
def get_service_client() -> Client:
    """Cliente Supabase con service role (para mutaciones desde la API).

    OJO: el service role **bypassa RLS**, así que toda consulta DEBE filtrar
    explícitamente por la organización del usuario para no filtrar datos entre
    proveedores. La RLS sigue protegiendo las lecturas directas del cliente web.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
