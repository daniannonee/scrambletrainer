# Android build preflight.
#
# Run this in PowerShell from the project folder:
#     powershell -ExecutionPolicy Bypass -File tools\preflight.ps1
#
# It only reads — nothing is installed or changed. It reports what is present,
# what is missing, and what to do about each gap, so the first Gradle run is not
# a guessing game.

$ErrorActionPreference = "Continue"
$problems = @()
$warnings = @()

function Show($label, $ok, $detail) {
  $mark = if ($ok) { "  OK  " } else { " MISS " }
  Write-Host ("[{0}] {1,-22} {2}" -f $mark, $label, $detail)
}

Write-Host ""
Write-Host "Word trainer - Android build preflight"
Write-Host "======================================"
Write-Host ""

# --- Node -----------------------------------------------------------------
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  $nv = (& node -v).TrimStart("v")
  $major = [int]($nv.Split(".")[0])
  Show "Node.js" $true "v$nv"
  if ($major -lt 20) {
    $problems += "Node $nv is too old. Capacitor 8 needs Node 20 or newer: https://nodejs.org"
  }
} else {
  Show "Node.js" $false "not found on PATH"
  $problems += "Install Node.js 20+ from https://nodejs.org"
}

# --- JDK ------------------------------------------------------------------
# Android Gradle Plugin 8.13 needs JDK 17+. Android Studio ships one, which is
# usually the easiest source.
$javaFound = $false
$javaVersion = $null
$java = Get-Command java -ErrorAction SilentlyContinue
if ($java) {
  $out = (& java -version 2>&1) -join " "
  if ($out -match '"(\d+)[\."]') { $javaVersion = [int]$Matches[1] }
  $javaFound = $true
  Show "Java (on PATH)" $true "version $javaVersion"
} else {
  Show "Java (on PATH)" $false "not found"
}

$studioJdks = @(
  "$env:ProgramFiles\Android\Android Studio\jbr",
  "$env:LOCALAPPDATA\Programs\Android Studio\jbr"
) | Where-Object { Test-Path $_ }

if ($studioJdks) {
  Show "Android Studio JDK" $true $studioJdks[0]
} else {
  Show "Android Studio JDK" $false "not found in the usual places"
}

if (-not $javaFound -and -not $studioJdks) {
  $problems += "No JDK found. Installing Android Studio gives you one (its bundled 'jbr'), or install Temurin 21 from https://adoptium.net"
} elseif ($javaVersion -and $javaVersion -lt 17) {
  $problems += "Java $javaVersion is too old. Gradle 8.14 / AGP 8.13 need JDK 17 or newer (21 is a good choice)."
}

if ($env:JAVA_HOME) {
  Show "JAVA_HOME" $true $env:JAVA_HOME
} else {
  Show "JAVA_HOME" $false "not set"
  if ($studioJdks) {
    $warnings += "JAVA_HOME is not set. Gradle usually finds Android Studio's JDK anyway; if it complains, set JAVA_HOME to: $($studioJdks[0])"
  }
}

# --- Android SDK ----------------------------------------------------------
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) {
  $guess = "$env:LOCALAPPDATA\Android\Sdk"
  if (Test-Path $guess) { $sdk = $guess }
}

if ($sdk -and (Test-Path $sdk)) {
  Show "Android SDK" $true $sdk
  if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    $warnings += "ANDROID_HOME is not set, but the SDK is at $sdk. Either set ANDROID_HOME to it, or create android\local.properties containing: sdk.dir=$($sdk -replace '\\','\\')"
  }

  $platform = Join-Path $sdk "platforms\android-36"
  if (Test-Path $platform) {
    Show "Platform API 36" $true "android-36 installed"
  } else {
    $have = Get-ChildItem (Join-Path $sdk "platforms") -ErrorAction SilentlyContinue |
            ForEach-Object { $_.Name } | Sort-Object
    Show "Platform API 36" $false ("have: " + ($(if ($have) { $have -join ", " } else { "none" })))
    $problems += "Android 16 (API 36) platform is missing. In Android Studio: Settings > Languages and Frameworks > Android SDK > SDK Platforms > tick 'Android 16.0' > Apply. This is required - Google Play will not accept an app targeting less than API 36."
  }

  $bt = Get-ChildItem (Join-Path $sdk "build-tools") -ErrorAction SilentlyContinue |
        ForEach-Object { $_.Name } | Sort-Object
  if ($bt) {
    Show "Build tools" $true ($bt -join ", ")
  } else {
    Show "Build tools" $false "none installed"
    $problems += "No Android build-tools. Android Studio > SDK Manager > SDK Tools > tick 'Android SDK Build-Tools' > Apply."
  }
} else {
  Show "Android SDK" $false "not found"
  $problems += "No Android SDK. Install Android Studio from https://developer.android.com/studio - it installs the SDK and a JDK together, which is the shortest path."
}

# --- project state --------------------------------------------------------
$root = Split-Path -Parent $PSScriptRoot
Show "node_modules" (Test-Path (Join-Path $root "node_modules")) `
  $(if (Test-Path (Join-Path $root "node_modules")) { "installed" } else { "run: npm install" })
Show "android project" (Test-Path (Join-Path $root "android")) `
  $(if (Test-Path (Join-Path $root "android")) { "present" } else { "run: npx cap add android" })

if (-not (Test-Path (Join-Path $root "node_modules"))) {
  $problems += "Dependencies not installed. Run: npm install"
}

# --- verdict --------------------------------------------------------------
Write-Host ""
if ($problems.Count -eq 0) {
  Write-Host "Ready to build." -ForegroundColor Green
  Write-Host ""
  Write-Host "  npm run apk        builds android\app\build\outputs\apk\debug\app-debug.apk"
  Write-Host "  npm run android    opens the project in Android Studio instead"
  Write-Host ""
  Write-Host "The first Gradle run downloads a few hundred MB and takes several minutes."
} else {
  Write-Host "Not ready. $($problems.Count) thing(s) to fix:" -ForegroundColor Yellow
  Write-Host ""
  $i = 1
  foreach ($p in $problems) { Write-Host "  $i. $p"; Write-Host ""; $i++ }
}

if ($warnings.Count -gt 0) {
  Write-Host "Worth knowing:" -ForegroundColor Cyan
  foreach ($w in $warnings) { Write-Host "  - $w"; Write-Host "" }
}
