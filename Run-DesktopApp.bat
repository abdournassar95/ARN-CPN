@echo off
chcp 65001 >nul
title ARN Marine Navigator - Launcher
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-DesktopApp.ps1"
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Application failed to launch.
    pause
)
