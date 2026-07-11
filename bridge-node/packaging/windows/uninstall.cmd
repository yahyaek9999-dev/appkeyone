@echo off
rem KEYONE WhatsApp Bridge - double-clickable uninstaller (keeps your session).
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
echo.
pause
endlocal
