@echo off
title MCP MikroTik RouterOS
cd /d "%~dp0"

echo ====================================================
echo   MCP MIKROTIK ROUTEROS SERVER
echo   Direktori: %cd%
echo ====================================================

:start
echo [INFO] Menjalankan MCP MikroTik Server...
call yarn start

echo [WARNING] Server terhenti atau crash!
echo [INFO] Menunggu 5 detik sebelum auto-restart...
timeout /t 5 >nul
goto start
