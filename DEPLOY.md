# Despliegue a producción — Cero Agotados

Arquitectura: **Frontend → Vercel**, **API → Google Cloud Run**, **DB/Auth → Supabase**, **DNS → Namecheap** (`ceroagotados.com`).

## 1. Frontend (Vercel)

Proyecto `cero-agotados` (team CeroAgotados) importado de `ceroagotados7/CeroAgotados` (branch `main`). Cada push a `main` despliega producción.

- **Framework Preset:** Next.js
- **Root Directory:** `apps/web`  ← imprescindible (monorepo)
- **Variables de entorno** (Production):
  | Nombre | Valor |
  |---|---|
  | `NEXT_PUBLIC_SUPABASE_URL` | `https://skoflaryhvuesnqeczdg.supabase.co` |
  | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` (llave publishable/anon; es pública) |
  | `NEXT_PUBLIC_API_URL` | `https://cero-agotados-api-882110538144.us-central1.run.app/v1` |

> Las `NEXT_PUBLIC_*` se incrustan en el build → si cambian, hay que re-desplegar.

## 2. API (Google Cloud Run) — ✅ EN PRODUCCIÓN

- **Cuenta GCP:** `ceroagotados7@gmail.com` · proyecto **`cero-agotados`** (billing vinculado, free tier).
- **Servicio:** `cero-agotados-api` en `us-central1` · URL estable: `https://cero-agotados-api-882110538144.us-central1.run.app`.
- **Auth endurecida:** con `ENVIRONMENT=cloud` la API **solo acepta ES256/RS256 vía JWKS** (HS256 rechazado → un secreto filtrado no permite forjar tokens).

Re-deploy (desde la raíz del repo, con gcloud logueado en la cuenta del proyecto):

```bash
gcloud run deploy cero-agotados-api \
  --source apps/api \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=cloud,SUPABASE_URL=…,SUPABASE_ANON_KEY=…,SUPABASE_SERVICE_ROLE_KEY=…,ADMIN_SECRET=…
```

- Los secretos van como env de Cloud Run (NUNCA en la imagen ni en git). `SUPABASE_JWT_SECRET` no se pasa en cloud (HS256 deshabilitado).
- **Dominio `api.ceroagotados.com` (opcional, cosmético):** requiere verificar `ceroagotados.com` en Google Search Console **con `ceroagotados7@gmail.com` logueado en el navegador**, luego `gcloud beta run domain-mappings create --service cero-agotados-api --domain api.ceroagotados.com --region us-central1` + CNAME `api → ghs.googlehosted.com` en Namecheap, y actualizar `NEXT_PUBLIC_API_URL`.

## 3. Supabase (Auth)

- **Authentication → URL Configuration:** Site URL = `https://ceroagotados.com`; Redirect URLs += `https://ceroagotados.com/**`.
- **Backups:** GitHub Action `backup-diario` (07:00 UTC) exporta todas las tablas + usuarios de Auth como artifact privado (30 días). El schema vive en `supabase/migrations/`. Al pasar a datos reales con volumen: subir a **Pro** (backups gestionados).

## 4. DNS (Namecheap → Advanced DNS)

| Type | Host | Value | Notas |
|---|---|---|---|
| A | `@` | `216.198.79.1` | raíz → Vercel |
| CNAME | `www` | `cname.vercel-dns.com.` | → Vercel |

(El CNAME `api` solo aplica si se hace el domain mapping opcional del punto 2.)

## Pre-flight (antes de datos reales de terceros)

- [ ] **Rotar llaves Supabase** (anon + service_role + DB password): las actuales pasaron por el chat → actualizar env en Vercel, Cloud Run y GitHub Secrets.
- [ ] Supabase Pro + backups gestionados (regla del CEO: primer onboarding real).
- [x] Auth ES256-solo en cloud ✓
- [x] Backup diario automatizado (Action) ✓
