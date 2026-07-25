# Despliegue a producción — Cero Agotados

Arquitectura: **Frontend → Vercel**, **API → Google Cloud Run**, **DB/Auth → Supabase**, **DNS → Namecheap** (`ceroagotados.com`).

## 1. Frontend (Vercel)

Proyecto importado de `ceroagotados7/CeroAgotados` (branch `main`).

- **Framework Preset:** Next.js
- **Root Directory:** `apps/web`  ← imprescindible (monorepo)
- **Variables de entorno** (Production):
  | Nombre | Valor |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://skoflaryhvuesnqeczdg.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` (llave publishable/anon; es pública) |
  | `NEXT_PUBLIC_API_URL` | `https://api.ceroagotados.com/v1` |

> Las `NEXT_PUBLIC_*` se incrustan en el build → si cambian, hay que re-desplegar.

## 2. API (Google Cloud Run)

Desde `apps/api/` (hay `Dockerfile`). Deploy por fuente (Cloud Build, sin Docker local):

```bash
gcloud run deploy cero-agotados-api \
  --source apps/api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=cloud,SUPABASE_URL=https://skoflaryhvuesnqeczdg.supabase.co \
  --set-env-vars SUPABASE_ANON_KEY=…,SUPABASE_SERVICE_ROLE_KEY=…,SUPABASE_JWT_SECRET=…,ADMIN_SECRET=…
```

- Mapear dominio: `gcloud run domain-mappings create --service cero-agotados-api --domain api.ceroagotados.com`.
- Los secretos van como env de Cloud Run (NUNCA en la imagen ni en git).

## 3. Supabase (Auth)

- **Authentication → URL Configuration:** Site URL = `https://ceroagotados.com`; Redirect URLs += `https://ceroagotados.com/**`.
- **Producción con datos reales:** subir a Pro (backups diarios) y **rotar llaves** (las actuales pasaron por el chat).

## 4. DNS (Namecheap → Advanced DNS)

Borrar el `CNAME www → parkingpage.namecheap.com` y agregar:

| Type | Host | Value | Notas |
|---|---|---|---|
| A / CNAME | `@` | (el que indique Vercel) | raíz → Vercel |
| CNAME | `www` | `cname.vercel-dns.com.` | → Vercel |
| CNAME | `api` | (el ghs de Cloud Run) | → Cloud Run |

Los valores exactos los da cada panel (Vercel al añadir el dominio; Cloud Run al mapear).

## Pre-flight (antes de datos reales)

- [ ] Rotar llaves Supabase (anon + service_role + DB password) → actualizar env en Vercel/Cloud Run.
- [ ] Supabase Pro + backups diarios.
- [ ] Auth ES256-solo (deshabilitar HS256).
