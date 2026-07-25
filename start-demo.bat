@echo off
REM ===== Cero Agotados - Levantar demo (API + Web) =====
REM Doble-clic para arrancar. La base de datos vive en Supabase Cloud (no requiere nada local).
cd /d "%~dp0"

echo Iniciando API (FastAPI) en http://localhost:8000 ...
start "Cero Agotados - API" cmd /k "cd apps\api && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo Iniciando Web (Next.js) en http://localhost:3000 ...
start "Cero Agotados - Web" cmd /k "cd apps\web && npm run dev"

echo Esperando a que arranquen los servidores...
timeout /t 10 >nul

echo Abriendo el navegador...
start "" "http://localhost:3000"

echo.
echo Listo. Deja abiertas las dos ventanas (API y Web) durante la demo.
echo Para detener: cierra esas dos ventanas.
