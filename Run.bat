@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ARN Marine Navigator - ARN Technology
echo Starting ARN Marine Navigator...
PowerShell -NoProfile -ExecutionPolicy Bypass -File ".\Run-DesktopApp.ps1"
if %errorlevel% neq 0 (
    echo Error occurred during application launch.
    pause
)
