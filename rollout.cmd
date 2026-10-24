@echo off
REM The Wall of Shame - Rollout per Doppelklick (ruft rollout.ps1 auf)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollout.ps1" %*
echo.
pause
