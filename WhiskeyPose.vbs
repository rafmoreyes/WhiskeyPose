' Double-click: launch PowerShell GUI with no console window.
Option Explicit
Dim shell, fs, root, path, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
path = root & "\tools\WhiskeyPose-Launcher.ps1"
command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & path & """"
shell.Run command, 0, False
