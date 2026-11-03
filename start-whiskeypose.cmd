@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [WhiskeyPose] Node.js nao encontrado. Instale Node.js 20.19+.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo [WhiskeyPose] Instalando dependencias...
  call npm install
  if errorlevel 1 (pause & exit /b 1)
)
echo [WhiskeyPose] Abrindo interface em http://127.0.0.1:5173
start "" "http://127.0.0.1:5173"
call npm run dev
pause
