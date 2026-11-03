@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [WhiskeyPose] Python nao encontrado. Instale Python 3.10+.
  pause
  exit /b 1
)
echo [WhiskeyPose] Iniciando worker local. Blender precisa estar instalado e acessivel.
python backend\server.py
pause
