# Directrices del Proyecto — Cero Agotados

**Proyecto:** Cero Agotados — marketplace farmacéutico B2B (Proveedor ↔ Farmacia + Admin), modelo de comparación por mejor precio sobre un catálogo maestro.
(El nombre "FarmaYa" que aparece en `design-system/` es solo la marca interna del design system; el producto es **Cero Agotados**.)

## 1. Tu Cerebro

Tu memoria a largo plazo vive en Obsidian, en la **partición dedicada a este proyecto**:

```
C:\Users\manue\Desktop\braind\projects\cero-agotados
```

> [!important] Aislamiento
> Trabaja **solo** dentro de `projects\cero-agotados\`. **No** modifiques `projects\prontto\` ni ningún otro proyecto del vault. Los archivos compartidos del vault (`index.md`, `projects.base`) listan este proyecto automáticamente por tags/carpeta — no hace falta editarlos.

## 2. Skills de Obsidian (OBLIGATORIO)

Al leer o escribir cualquier archivo del vault (`.md`, `.base`, `.canvas`), DEBES usar estas skills:

- `/obsidian-markdown` — al leer o escribir cualquier nota `.md`
- `/obsidian-bases` — al leer o escribir archivos `.base`
- `/json-canvas` — al leer o escribir archivos `.canvas`

Están instaladas en `.claude/skills/`. Úsalas antes de crear o modificar cualquier archivo bajo `braind\projects\cero-agotados`.

## 3. Skill FastAPI (OBLIGATORIA al tocar el backend)

El stack decidido usa **FastAPI** (backend en GCP Cloud Run) + Next.js (Vercel) + Supabase. Al escribir o modificar código en `apps/api/` (routers, modelos Pydantic, dependencias) DEBES invocar la skill `/fastapi` antes de empezar. Instalada en `.claude/skills/fastapi/`.

## 5. Skill Caveman (OPCIONAL, on-demand)

- `/caveman` — modo ultra-comprimido (~75% menos tokens). Actívala cuando el usuario lo pida ("caveman mode", "be brief", "less tokens").

## 6. Auto-Setup (verificación al iniciar)

Verifica que el entorno esté completo. Si falta algo, ve a Obsidian, encuentra la fuente y complétalo antes de continuar.

- **Skills:** que existan `.claude/skills/{obsidian-markdown,obsidian-bases,json-canvas}/SKILL.md`. Si falta alguna → lee `braind\AI_CONVENTIONS.md`, obtén la URL de GitHub y recréala en `.claude/skills/<nombre>/SKILL.md`.
- **Agentes:** que existan `.claude/agents/{CEO,CTO,CMO,COO}.md`. Si falta alguno → recréalo desde `braind\projects\cero-agotados\agents_memory\agents\<NOMBRE>.md`, apuntando su memoria a `braind\projects\cero-agotados\agents_memory\<NOMBRE>\`.

## 7. Protocolo de Inicio

Antes de trabajar, DEBES leer (en este orden):

1. **Estado:** `braind\projects\cero-agotados\state.md`
2. **Contexto técnico:** `braind\projects\cero-agotados\technical_context.md`
3. **Mapa visual:** `braind\projects\cero-agotados\project_map.canvas`
4. Revisa las memorias de los agentes en `agents_memory/` y el índice `agents_database.base`.

## 8. Protocolo de Cierre — Comando `/save`

Cuando el usuario diga `/save`, DEBES (usando las skills de Obsidian):

1. **Sobreescribir** `state.md` con el estado actual del proyecto.
2. Actualizar `technical_context.md` si hubo cambios de arquitectura/decisiones.
3. Actualizar las **memorias de los agentes** y sus `MEMORY.md` si hubo cambios (no dupliques; actualiza lo existente).
4. Crear el **log de la sesión** en `braind\projects\cero-agotados\log\YYYY-MM-DD.md` (append-only, nunca sobreescribir uno existente).
5. Documentar decisiones, avances y lo más importante de la sesión.

Todo lo anterior vive en `C:\Users\manue\Desktop\braind\projects\cero-agotados`.

## 9. Convenciones del vault

Sigue `braind\system\conventions.md`: nombres en `kebab-case` sin tildes, fechas ISO 8601, frontmatter mínimo (`title`, `date`, `tags`), y `[[wikilinks]]` para todo enlace interno al vault (nunca rutas relativas para notas internas).
