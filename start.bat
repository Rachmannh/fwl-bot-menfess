@echo off
title FWL Bot Backend - Auto Reload
cd /d "%~dp0"

echo ========================================================
echo         FWL BOT BACKEND (AUTO-RELOAD MODE)
echo ========================================================
echo.
echo Menjalankan bot dengan fitur auto-reload...
echo Jika ada perubahan file/kode, bot otomatis restart!
echo.
echo Tekan Ctrl+C untuk menghentikan bot.
echo ========================================================
echo.

node --watch server.js

if %errorlevel% neq 0 (
    echo.
    echo ========================================================
    echo Bot terhenti atau terjadi error!
    echo ========================================================
    pause
)
