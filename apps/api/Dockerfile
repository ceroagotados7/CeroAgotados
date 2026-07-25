# Cero Agotados API — imagen para Google Cloud Run
# Build reproducible con uv. Cloud Run inyecta $PORT (por defecto 8080).
FROM python:3.12-slim

# uv (gestor de paquetes/entorno)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Dependencias primero (capa cacheable). Necesitamos pyproject + lock + README
# (referenciado en pyproject) y el paquete `app` para instalar el proyecto.
COPY pyproject.toml uv.lock README.md ./
COPY app ./app

# Instala solo dependencias de runtime (sin dev), congeladas al lock.
RUN uv sync --frozen --no-dev

ENV PYTHONUNBUFFERED=1

# Cloud Run define PORT; hacemos fallback a 8080 para pruebas locales.
CMD ["sh", "-c", "uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
