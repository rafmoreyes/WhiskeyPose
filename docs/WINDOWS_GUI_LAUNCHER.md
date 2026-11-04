# WhiskeyPose GUI Launcher (Windows 11)

Double-click WhiskeyPose.vbs to launch the compact graphic interface with no Worker or Vite command windows. Create a desktop shortcut to this file for easy access. If Windows Script Host is disabled, use WhiskeyPose-Launcher.cmd (a console may briefly flash on startup).

The GUI runs git pull --ff-only before starting services. It stops if Git fails. The Python Worker (port 8765) and Vite (port 5173) run as hidden background processes. If node_modules/vite is absent, npm install runs once automatically. The GUI then opens the same dedicated Microsoft Edge profile at LOCALAPPDATA\WhiskeyPose\EdgeProfile.

Controls: Iniciar / Atualizar, Abrir Edge, Encerrar and Abrir logs. Logs are saved under LOCALAPPDATA\WhiskeyPose\Logs. Closing the window hides it to the Windows notification area, keeping services running. Double-click its tray icon to reopen it. Right-click > Sair e encerrar serviços to stop the processes started by this launcher and exit.

If an existing Worker or Vite service is already responding, the launcher reuses it but warns that it may be an older build. It never terminates processes it did not start. When switching from the original BAT launcher, close the old console windows first. Iniciar-WhiskeyPose.bat is preserved as a fully functioning fallback.

No .exe packaging, installer, new dependencies or external services. Requires Windows PowerShell 5.1 and native WinForms; WhiskeyPose still requires Git, Python, Node.js, Edge and Blender for rig operations. Actual Windows UI/process behavior requires a test on Windows 11.
