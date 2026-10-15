<#
.SYNOPSIS
    Installs (or removes) the SealTech board service as a Windows service with NSSM.

.DESCRIPTION
    Run from an elevated PowerShell on the office PC (owner decision 19). The service runs
    `node node_modules\tsx\dist\cli.mjs src\index.ts` from apps/service (tsx loads the TypeScript
    sources directly; there is no separate compile step) with the working directory set so `.env`
    and `data/` are found, restarts itself 5 s after a crash, rotates its logs into logs/, and starts
    with Windows.

    Prerequisites:
      * Node 22.13+ on PATH (`node --version`)
      * NSSM (https://nssm.cc) on PATH, or pass -Nssm 'C:\tools\nssm.exe'
      * The build: `npm ci && npm run build` in the repo root (produces apps/board/dist, which the service serves)
      * C:\SealTech\board\.env copied from .env.example and filled in by the owner

.PARAMETER Name
    Windows service name. Default SealTechBoard.
.PARAMETER Root
    The apps/service directory. Default: the parent of this script's folder.
.PARAMETER Entry
    What node runs, relative to -Root. Default `node_modules\tsx\dist\cli.mjs src\index.ts` (tsx is a
    dependency of the workspace; `npm ci` installs it). Pass `dist\index.js` only once every workspace
    package ships compiled JavaScript.
.PARAMETER Nssm
    Path to nssm.exe. Default `nssm` (on PATH).
.PARAMETER Uninstall
    Stop and remove the service instead of installing it.

.EXAMPLE
    .\windows\install-service.ps1
.EXAMPLE
    .\windows\install-service.ps1 -Entry 'dist\index.js'
.EXAMPLE
    .\windows\install-service.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [string]$Name = 'SealTechBoard',
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$Entry = 'node_modules\tsx\dist\cli.mjs src\index.ts',
    [string]$Nssm = 'nssm',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

# NSSM must be reachable before anything else.
if (-not (Get-Command $Nssm -ErrorAction SilentlyContinue)) {
    throw "nssm not found ($Nssm). Install NSSM from https://nssm.cc and put it on PATH, or pass -Nssm."
}

if ($Uninstall) {
    # Stop first (ignore 'not running'), then remove without the confirmation prompt.
    & $Nssm stop $Name 2>$null | Out-Null
    & $Nssm remove $Name confirm
    Write-Host "Removed service $Name."
    return
}

# Resolve node once so the service does not depend on the service account's PATH.
$node = (Get-Command node -ErrorAction Stop).Source
$entryPath = Join-Path $Root $Entry
if (-not (Test-Path (($entryPath -split ' ')[0]))) {
    throw "Entry not found: $entryPath. Run 'npm ci' (and 'npm run build') in the repo root first."
}

# Logs go next to the service; NSSM creates the files, we create the folder.
$logs = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

# 1. Register the service: node runs the entry file from the service directory.
& $Nssm install $Name $node $Entry

# 2. Working directory: `.env`, data\board.db, data\snapshot.json and the roster are relative to it.
& $Nssm set $Name AppDirectory $Root

# 3. Friendly name and description in services.msc.
& $Nssm set $Name DisplayName 'SealTech production board'
& $Nssm set $Name Description 'Polls Jobber and the review sheets, serves the wall board on http://localhost:8787.'

# 4. Start with Windows, after the network is up.
& $Nssm set $Name Start SERVICE_AUTO_START
& $Nssm set $Name DependOnService LanmanWorkstation

# 5. stdout/stderr to logs\, rotated when a file passes 10 MB (bytes) or at restart; keep writes unbuffered.
& $Nssm set $Name AppStdout (Join-Path $logs 'service.out.log')
& $Nssm set $Name AppStderr (Join-Path $logs 'service.err.log')
& $Nssm set $Name AppRotateFiles 1
& $Nssm set $Name AppRotateOnline 1
& $Nssm set $Name AppRotateBytes 10485760
& $Nssm set $Name AppStdoutCreationDisposition 4
& $Nssm set $Name AppStderrCreationDisposition 4

# 6. Crash policy: restart 5 s after any exit, and reset the throttle so repeated crashes still restart.
& $Nssm set $Name AppExit Default Restart
& $Nssm set $Name AppRestartDelay 5000
& $Nssm set $Name AppThrottle 5000

# 7. Give the process a clean stop (SIGINT-equivalent Ctrl-C first) before NSSM kills it.
& $Nssm set $Name AppStopMethodSkip 0
& $Nssm set $Name AppStopMethodConsole 5000

# 8. Environment: the service reads .env from AppDirectory; NODE_ENV only labels the process.
& $Nssm set $Name AppEnvironmentExtra 'NODE_ENV=production'

# 9. Start it now and show the result.
& $Nssm start $Name
& $Nssm status $Name
Write-Host "Installed $Name: $node $Entry (cwd $Root). Logs in $logs. Check http://localhost:8787/health"
