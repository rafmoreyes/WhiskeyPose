@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo [WhiskeyPose] Python nao encontrado. Instale Python 3.10+.
  pause
  exit /b 1
)
echo [WhiskeyPose] Iniciando worker local em http://127.0.0.1:8765
 echo [WhiskeyPose] Procurando Blender no Steam, Blender Foundation e PATH...
echo [WhiskeyPose] Configure pela engrenagem External Engines na interface web.
python backend\server.py
pause
