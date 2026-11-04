@echo off
rem Fallback when Windows Script Host is disabled. May briefly flash a console.
start "" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tools\WhiskeyPose-Launcher.ps1"
exit /b
