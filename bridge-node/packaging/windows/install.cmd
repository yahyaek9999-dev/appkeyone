@echo off
rem KEYONE WhatsApp Bridge - double-clickable installer.
rem Why this wrapper exists: double-clicking a raw .ps1 opens Notepad (or dies
rem instantly on the default Restricted execution policy), which customers saw
rem as "a terminal opens and immediately closes". This wrapper runs the real
rem installer with -ExecutionPolicy Bypass and KEEPS THE WINDOW OPEN so any
rem failure is readable. No administrator rights are needed (per-user install).
setlocal
cd /d "%~dp0"
echo Installing KEYONE WA Bridge...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Installation FAILED - read the error message above.
  echo  Need help? https://wkeyone.app/dashboard/settings/bridge
  echo ============================================================
) else (
  echo.
  echo Installation finished successfully.
)
echo.
pause
endlocal
