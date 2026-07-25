# Cero Agotados — API

Backend FastAPI del marketplace farmacéutico B2B **Cero Agotados**.

## Desarrollo local

Requiere [uv](https://docs.astral.sh/uv/) y (para la base de datos) el stack de Supabase local corriendo desde la raíz del repo (`supabase start`, necesita Docker).

```bash
uv sync --extra dev            # instala dependencias
cp .env.example .env           # y ajusta con `supabase status`
uv run fastapi dev             # servidor en http://localhost:8000 (/docs)
uv run pytest                  # tests
```

## Estructura

```
app/
  main.py            # instancia FastAPI + CORS + routers
  config.py          # settings (pydantic-settings)
  api/v1/            # routers versionados (/v1/...)
  schemas/           # modelos Pydantic (incl. envelope ApiResponse)
tests/               # pytest
```

Convenciones FastAPI: skill `/fastapi` (ver `.claude/skills/fastapi/`).
