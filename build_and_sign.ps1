# ==============================================================================
# ARN Marine Navigator - Production Build & Digital Signing Pipeline
# Developer: Abdou Ragab Nassar (ARN Technology)
# Copyright (c) 2026 ARN Technology. All Rights Reserved.
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ARN Marine Navigator - Production Build & Signing Pipeline" -ForegroundColor Yellow
Write-Host " Developer: Abdou Ragab Nassar - ARN Technology" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location -Path $PSScriptRoot

# 1. Clean previous build folders
Write-Host "[1/6] Cleaning previous build folders..." -ForegroundColor Cyan
if (Test-Path "dist\setup") {
    Remove-Item -Recurse -Force "dist\setup" -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path "dist\setup" | Out-Null
Write-Host "  Clean completed successfully." -ForegroundColor Green

# 2. Locate ARN Technology Code Signing Certificate
Write-Host "[2/6] Locating ARN Technology Certificate..." -ForegroundColor Cyan
$arnThumbprint = "3F539C18611A83F0A2DEE87B44AB5222B4B0F971"
$cert = Get-Item "Cert:\CurrentUser\My\$arnThumbprint" -ErrorAction SilentlyContinue

if (-not $cert) {
    # Fallback search by Subject
    $allCerts = Get-ChildItem "Cert:\CurrentUser\My"
    foreach ($c in $allCerts) {
        if ($c.Subject -like "*ARN Technology*") {
            $cert = $c
            break
        }
    }
}

if (-not $cert) {
    Write-Host "[ERROR] ARN Technology Certificate not found in Cert:\CurrentUser\My!" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Found Certificate: $($cert.Subject)" -ForegroundColor Green
Write-Host "       Thumbprint: $($cert.Thumbprint)" -ForegroundColor DarkGray

# 3. Export Certificate and Ensure Root & TrustedPublisher
Write-Host "[3/6] Synchronizing Certificate to cert/ directory..." -ForegroundColor Cyan
if (-not (Test-Path "cert")) {
    New-Item -ItemType Directory -Force -Path "cert" | Out-Null
}
$cerPath = Join-Path $PSScriptRoot "cert\ARN_Technology_Root.cer"
[System.IO.File]::WriteAllBytes($cerPath, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
Write-Host "  Exported to $cerPath" -ForegroundColor Green

# Trust locally
certutil.exe -addstore -f "Root" $cerPath | Out-Null
certutil.exe -addstore -f "TrustedPublisher" $cerPath | Out-Null
Write-Host "  Locally trusted in Root and TrustedPublisher." -ForegroundColor Green

# Helper function to sign with RFC-3161 Timestamping
function Sign-FileWithTimestamp($filePath, $signingCert) {
    if (-not (Test-Path $filePath)) { return }
    $tsServers = @(
        "http://timestamp.digicert.com",
        "http://timestamp.sectigo.com",
        "http://tsa.starfieldtech.com"
    )
    $signed = $false
    foreach ($ts in $tsServers) {
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                Write-Host "  Signing with timestamp server ($attempt/3): $ts ..." -ForegroundColor Yellow
                $sig = Set-AuthenticodeSignature -FilePath $filePath -Certificate $signingCert -HashAlgorithm SHA256 -TimestampServer $ts -ErrorAction Stop
                if ($sig.Status -eq "Valid" -and $sig.TimeStamperCertificate) {
                    Write-Host "  [OK] Successfully signed and timestamped with $ts" -ForegroundColor Green
                    Write-Host "       Signer: $($sig.SignerCertificate.Subject)" -ForegroundColor DarkGray
                    Write-Host "       Timestamp: $($sig.TimeStamperCertificate.Subject)" -ForegroundColor DarkGray
                    $signed = $true
                    return $sig
                }
            } catch {
                Start-Sleep -Milliseconds 800
            }
        }
    }

    if (-not $signed) {
        Write-Host "  [WARNING] Could not obtain online timestamp, signing without timestamp..." -ForegroundColor Yellow
        Set-AuthenticodeSignature -FilePath $filePath -Certificate $signingCert -HashAlgorithm SHA256 -ErrorAction Stop
    }
}

# 4. Check Inno Setup Compiler
Write-Host "[4/6] Checking Inno Setup Compiler..." -ForegroundColor Cyan
$isccPath = "C:\Program Files\Inno Setup 7\ISCC.exe"
if (-not (Test-Path $isccPath)) {
    $isccCmd = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
    if ($isccCmd) {
        $isccPath = $isccCmd.Source
    }
}

if (-not (Test-Path $isccPath)) {
    Write-Host "[ERROR] Inno Setup compiler ISCC.exe not found at $isccPath" -ForegroundColor Red
    exit 1
}
Write-Host "  Using Inno Setup: $isccPath" -ForegroundColor Green

# 5. Compile Installer
Write-Host "[5/6] Compiling Unified Windows Installer..." -ForegroundColor Cyan
$issScript = Join-Path $PSScriptRoot "installer\ARN_MarineNav_Setup.iss"
& "$isccPath" "$issScript"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Inno Setup compilation failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  Installer compiled successfully." -ForegroundColor Green

# 6. Sign Installer & Remove Mark-of-the-Web
Write-Host "[6/6] Digitally Signing Installer and Unblocking..." -ForegroundColor Cyan
$setupExe = Get-ChildItem -Path "dist\setup" -Filter "ARN_Marine_Navigator_Setup_*.exe" | Select-Object -First 1

if ($setupExe) {
    Sign-FileWithTimestamp $setupExe.FullName $cert
    Unblock-File -Path $setupExe.FullName
    Write-Host "  Installer digitally signed: $($setupExe.FullName)" -ForegroundColor Green

    # Copy to E:\اصداراتي if directory exists
    $releaseDir = "E:\اصداراتي"
    if (Test-Path $releaseDir) {
        Copy-Item -Path $setupExe.FullName -Destination $releaseDir -Force
        Unblock-File -Path (Join-Path $releaseDir $setupExe.Name)
        Write-Host "  [OK] Copied release installer to: $releaseDir\$($setupExe.Name)" -ForegroundColor Cyan
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [SUCCESS] ARN Marine Navigator Production Build Complete!" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
