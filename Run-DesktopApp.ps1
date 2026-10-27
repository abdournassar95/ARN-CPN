# ARN Marine Navigator - Launcher Script
# شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location -Path $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ARN Marine Navigator - Tactical Maritime Navigation Engine" -ForegroundColor Green
Write-Host " Developed by: Abdou Ragab Nassar (ARN Technology)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Launching DesktopApp via Electron..." -ForegroundColor Gray

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"

if (Test-Path $electronExe) {
    & $electronExe .
} else {
    Write-Host "Local Electron binary not found, using npx electron..." -ForegroundColor Yellow
    npx electron .
}
