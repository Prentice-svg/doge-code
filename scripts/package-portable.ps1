[CmdletBinding()]
param(
  [string]$OutputRoot = "dist\portable",
  [string]$Version = "",
  [switch]$SkipNodeModules
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[portable] $Message"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageJsonPath = Join-Path $repoRoot "package.json"
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = [string]$packageJson.version
}

$releaseName = "doge-code-windows-portable-$Version"
$outputRootPath = if ([System.IO.Path]::IsPathRooted($OutputRoot)) {
  $OutputRoot
} else {
  Join-Path $repoRoot $OutputRoot
}
$releaseRoot = Join-Path $outputRootPath $releaseName
$appRoot = Join-Path $releaseRoot "app"
$dataRoot = Join-Path $releaseRoot "data"

Write-Step "Preparing release directory: $releaseRoot"
if (Test-Path $releaseRoot) {
  Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $releaseRoot | Out-Null
New-Item -ItemType Directory -Path $appRoot | Out-Null
New-Item -ItemType Directory -Path $dataRoot | Out-Null

$copyDirs = @("src", "vendor", "shims")
if (-not $SkipNodeModules -and (Test-Path (Join-Path $repoRoot "node_modules"))) {
  $copyDirs += "node_modules"
}

foreach ($dir in $copyDirs) {
  $source = Join-Path $repoRoot $dir
  if (-not (Test-Path $source)) {
    continue
  }

  $destination = Join-Path $appRoot $dir
  Write-Step "Copying $dir"
  Copy-Item -LiteralPath $source -Destination $destination -Recurse
}

$copyFiles = @(
  "package.json",
  "bun.lock",
  "README.md",
  "preview.png",
  "image-processor.node"
)

foreach ($file in $copyFiles) {
  $source = Join-Path $repoRoot $file
  if (Test-Path $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $appRoot $file)
  }
}

$launcherTemplate = @'
@echo off
setlocal
set "DOGE_PORTABLE_ROOT=%~dp0"
set "DOGE_APP_ROOT=%DOGE_PORTABLE_ROOT%app"
set "CLAUDE_CONFIG_DIR=%DOGE_PORTABLE_ROOT%data"
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%" >nul 2>nul
cd /d "%DOGE_APP_ROOT%"
bun run .\src\bootstrap-entry.ts %*
'@

$versionLauncherTemplate = @'
@echo off
setlocal
set "DOGE_PORTABLE_ROOT=%~dp0"
set "DOGE_APP_ROOT=%DOGE_PORTABLE_ROOT%app"
set "CLAUDE_CONFIG_DIR=%DOGE_PORTABLE_ROOT%data"
if not exist "%CLAUDE_CONFIG_DIR%" mkdir "%CLAUDE_CONFIG_DIR%" >nul 2>nul
cd /d "%DOGE_APP_ROOT%"
bun run .\src\bootstrap-entry.ts --version
'@

Set-Content -LiteralPath (Join-Path $releaseRoot "doge.cmd") -Value $launcherTemplate -Encoding ASCII
Set-Content -LiteralPath (Join-Path $releaseRoot "doge-version.cmd") -Value $versionLauncherTemplate -Encoding ASCII

$portableReadme = @(
  '# Doge Code Windows Portable',
  '',
  'Copy this directory to another Windows machine.',
  '',
  'Requirements:',
  '- Bun is installed on the target machine',
  '- `bun --version` works in a terminal',
  '',
  'Usage:',
  '1. Run `doge.cmd`',
  '2. The launcher creates `data\` on first start',
  '3. All config and login state stay inside `data\`',
  '',
  'Contents:',
  '- `app\` source and dependencies',
  '- `data\` portable config and state',
  '- `doge.cmd` launcher',
  '- `doge-version.cmd` version check',
  '',
  'This is a portable Bun-based release, not a single-file exe installer.'
) -join [Environment]::NewLine

Set-Content -LiteralPath (Join-Path $releaseRoot "README-Portable.md") -Value $portableReadme -Encoding ASCII

Write-Step "Portable package created successfully"
Write-Host $releaseRoot
