# ==============================================================================
# ARN Marine Navigator - Production Build & Digital Signing Pipeline
# Developer: Abdou Ragab Nassar (ARN Technology)
# Copyright (c) 2026 ARN Technology. All Rights Reserved.
#
# ملاحظات أمنية (مراجعة 2026-10):
#   - لا يضخ هذا السكربت أي شهادة في متجر الجذر Root إطلاقاً.
#   - توثيق الناشر في CurrentUser\TrustedPublisher اختياري وصريح (-TrustPublisher).
#   - الشهادة الموقعة ذاتياً تكسب ثقة محلية فقط؛ أما SmartScreen فيتطلب شهادة
#     OV/EV من مرجع شهادات عام (CA) وسمعة متراكمة — لا تدّعي هذه السلسلة غير ذلك.
#   - مسار النشر يُمرَّر عبر متغير البيئة ARN_RELEASE_DIR (لا مسارات مطوّر ثابتة).
#
# الاستخدام:
#   .\build_and_sign.ps1                 # بناء + توقيع
#   .\build_and_sign.ps1 -TrustPublisher # + توثيق الناشر لمستخدم الجهاز الحالي
#   .\build_and_sign.ps1 -SkipTests      # تخطي اختبارات الوحدة
# ==============================================================================

#Requires -Version 5.1
param(
  [switch]$TrustPublisher,
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " ARN Marine Navigator - Production Build & Sign Pipeline" -ForegroundColor Yellow
Write-Host " Developer: Abdou Ragab Nassar - ARN Technology" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$PSScriptRoot = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
Set-Location -Path $PSScriptRoot

# 1. Clean previous build folders
Write-Host "[1/7] Cleaning previous build folders..." -ForegroundColor Cyan
if (Test-Path "dist\setup") {
  Remove-Item -Recurse -Force "dist\setup" -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path "dist\setup" | Out-Null
Write-Host "  Clean completed." -ForegroundColor Green

# 2. Dependency & test gate (تثبيت كامل يشمل Electron لأن المثبّت يعبّئ node_modules)
Write-Host "[2/7] Installing dependencies (Electron binary required)..." -ForegroundColor Cyan
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

$electronExe = Join-Path $PSScriptRoot "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronExe)) {
  throw "Electron binary missing at $electronExe — the Inno package needs it. Re-run npm install."
}

if (-not $SkipTests) {
  Write-Host "  Running unit tests..." -ForegroundColor Gray
  npm test
  if ($LASTEXITCODE -ne 0) { throw "Unit tests failed — aborting production build." }
}

# 3. Locate ARN Technology Code Signing Certificate
Write-Host "[3/7] Locating ARN Technology code-signing certificate..." -ForegroundColor Cyan
$arnThumbprint = "3F539C18611A83F0A2DEE87B44AB5222B4B0F971"
$cert = Get-Item "Cert:\CurrentUser\My\$arnThumbprint" -ErrorAction SilentlyContinue

if (-not $cert) {
  $allCerts = Get-ChildItem "Cert:\CurrentUser\My"
  foreach ($c in $allCerts) {
    if ($c.Subject -like "*ARN Technology*") { $cert = $c; break }
  }
}

if (-not $cert) {
  throw "ARN Technology certificate not found in Cert:\CurrentUser\My. Import the PFX first."
}

$eku = $cert.Extensions | Where-Object { $_.Oid.FriendlyName -match "Enhanced Key Usage" }
if (-not $eku -or $eku.Format($false) -notmatch "Code Signing") {
  throw "Certificate $($cert.Thumbprint) lacks Code Signing EKU."
}

Write-Host "  [OK] Certificate: $($cert.Subject)" -ForegroundColor Green
Write-Host "       Thumbprint: $($cert.Thumbprint)" -ForegroundColor DarkGray

# 4. Export public certificate (مرجع يُشحن مع المثبّت — لا يُثبَّت في الجذر)
Write-Host "[4/7] Exporting public certificate to cert\..." -ForegroundColor Cyan
if (-not (Test-Path "cert")) { New-Item -ItemType Directory -Force -Path "cert" | Out-Null }
$cerPath = Join-Path $PSScriptRoot "cert\ARN_Technology_Root.cer"
[System.IO.File]::WriteAllBytes(
  $cerPath,
  $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
)
Write-Host "  Exported: $cerPath" -ForegroundColor Green

if ($TrustPublisher) {
  Write-Host "  Trusting publisher in CurrentUser\TrustedPublisher (explicit opt-in)..." -ForegroundColor Yellow
  certutil.exe -user -addstore -f "TrustedPublisher" $cerPath
} else {
  Write-Host "  Skipping trust store changes (pass -TrustPublisher to opt in). Root store is never touched." -ForegroundColor DarkGray
}

# Helper: sign with RFC-3161 timestamping, three public TSAs, three attempts each
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
        Write-Host "  Signing ($attempt/3) via $ts ..." -ForegroundColor Yellow
        $sig = Set-AuthenticodeSignature -FilePath $filePath -Certificate $signingCert -HashAlgorithm SHA256 -TimestampServer $ts -ErrorAction Stop
        if ($sig.Status -eq "Valid" -and $sig.TimeStamperCertificate) {
          Write-Host "  [OK] Signed + timestamped: $ts" -ForegroundColor Green
          $signed = $true
          return $sig
        }
      } catch {
        Start-Sleep -Milliseconds 800
      }
    }
  }
  if (-not $signed) {
    Write-Host "  [WARNING] No online timestamp obtained; signing without timestamp." -ForegroundColor Yellow
    Set-AuthenticodeSignature -FilePath $filePath -Certificate $signingCert -HashAlgorithm SHA256 -ErrorAction Stop
  }
}

# 5. Check Inno Setup Compiler
Write-Host "[5/7] Checking Inno Setup compiler..." -ForegroundColor Cyan
$isccPath = "C:\Program Files\Inno Setup 7\ISCC.exe"
if (-not (Test-Path $isccPath)) {
  $isccCmd = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
  if ($isccCmd) { $isccPath = $isccCmd.Source }
}
if (-not (Test-Path $isccPath)) {
  throw "Inno Setup ISCC.exe not found. Install Inno Setup 7 or add it to PATH."
}
Write-Host "  Using: $isccPath" -ForegroundColor Green

# 6. Compile installer
Write-Host "[6/7] Compiling unified Windows installer..." -ForegroundColor Cyan
$issScript = Join-Path $PSScriptRoot "installer\ARN_MarineNav_Setup.iss"
& "$isccPath" "$issScript"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }
Write-Host "  Compiled successfully." -ForegroundColor Green

# 7. Sign the installer itself and optionally publish via environment-configured path
Write-Host "[7/7] Digitally signing installer..." -ForegroundColor Cyan
$setupExe = Get-ChildItem -Path "dist\setup" -Filter "ARN_Marine_Navigator_Setup_*.exe" | Select-Object -First 1
if (-not $setupExe) { throw "Setup executable not found after compilation." }

Sign-FileWithTimestamp $setupExe.FullName $cert
Write-Host "  Signed: $($setupExe.FullName)" -ForegroundColor Green

$releaseDir = $env:ARN_RELEASE_DIR
if ($releaseDir -and (Test-Path $releaseDir)) {
  Copy-Item -Path $setupExe.FullName -Destination $releaseDir -Force
  Write-Host "  [OK] Published to: $(Join-Path $releaseDir $setupExe.Name)" -ForegroundColor Cyan
} elseif ($releaseDir) {
  Write-Host "  [WARNING] ARN_RELEASE_DIR does not exist: $releaseDir" -ForegroundColor Yellow
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Build complete. Note: self-signed signature still triggers" -ForegroundColor Yellow
Write-Host " SmartScreen on clean machines until an OV/EV CA certificate is adopted." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
