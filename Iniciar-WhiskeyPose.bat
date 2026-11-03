@echo off
setlocal EnableExtensions
title WhiskeyPose - One Click Launcher
cd /d "%~dp0"

echo ============================================================
echo   WhiskeyPose - Git Pull + Worker + Web + Microsoft Edge
echo ============================================================
echo.

where git.exe >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Git nao encontrado no PATH.
  echo Instale o Git for Windows e tente novamente.
  pause
  exit /b 1
)
if not exist ".git" (
  echo [ERRO] Execute este arquivo na raiz de um clone Git do WhiskeyPose.
  pause
  exit /b 1
)

echo [1/4] Atualizando o repositorio (git pull --ff-only)...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo [ERRO] Git pull falhou. Nada sera iniciado.
  echo Verifique alteracoes locais, conflitos ou sua conexao.
  pause
  exit /b 1
)

where curl.exe >nul 2>&1
if errorlevel 1 (
  echo [ERRO] curl.exe nao encontrado. Ele acompanha o Windows 11.
  pause
  exit /b 1
)

set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE (
  for /f "delims=" %%G in ('where msedge.exe 2^>nul') do if not defined EDGE_EXE set "EDGE_EXE=%%G"
)
if not defined EDGE_EXE (
  echo [ERRO] Microsoft Edge nao encontrado.
  echo Verifique a instalacao do Edge antes de iniciar o WhiskeyPose.
  pause
  exit /b 1
)

echo [2/4] Verificando Blender Worker (127.0.0.1:8765)...
curl.exe --silent --fail --output NUL --max-time 2 "http://127.0.0.1:8765/api/health" >nul 2>&1
if errorlevel 1 (
  echo [Worker] Abrindo nova janela CMD.
  start "WhiskeyPose Worker" /D "%~dp0" cmd.exe /k start-worker.cmd
) else (
  echo [Worker] Ja esta respondendo. Nenhuma janela duplicada sera aberta.
)

echo [3/4] Verificando WhiskeyPose Vite (127.0.0.1:5173)...
curl.exe --silent --fail --output NUL --max-time 2 "http://127.0.0.1:5173/" >nul 2>&1
if errorlevel 1 (
  echo [Web] Abrindo nova janela CMD.
  start "WhiskeyPose Vite" /D "%~dp0" cmd.exe /k start-whiskeypose.cmd --no-browser
) else (
  echo [Web] Servidor ja esta respondendo. Nenhuma janela duplicada sera aberta.
)

echo [Web] Aguardando a interface ficar disponivel...
set /a WP_TRIES=0
:WAIT_FOR_WEB
curl.exe --silent --fail --output NUL --max-time 2 "http://127.0.0.1:5173/" >nul 2>&1
if not errorlevel 1 goto WEB_READY
set /a WP_TRIES+=1
if %WP_TRIES% GEQ 120 goto WEB_TIMEOUT
timeout /t 1 /nobreak >nul
goto WAIT_FOR_WEB

:WEB_TIMEOUT
echo [ERRO] A interface nao respondeu em 127.0.0.1:5173.
echo Confira a janela "WhiskeyPose Vite" para ver o erro.
pause
exit /b 1

:WEB_READY
echo [4/4] Abrindo Microsoft Edge em instancia separada...
set "EDGE_PROFILE=%LOCALAPPDATA%\WhiskeyPose\EdgeProfile"
start "WhiskeyPose Edge" "%EDGE_EXE%" --user-data-dir="%EDGE_PROFILE%" --no-first-run --new-window "http://127.0.0.1:5173/"
if errorlevel 1 (
  echo [ERRO] Nao foi possivel iniciar o Edge.
  pause
  exit /b 1
)
echo.
echo [OK] WhiskeyPose iniciado.
echo Edge usa um perfil separado em:
echo %EDGE_PROFILE%
echo Mantenha abertas as janelas Worker e Vite enquanto usar o app.
timeout /t 3 /nobreak >nul
endlocal
