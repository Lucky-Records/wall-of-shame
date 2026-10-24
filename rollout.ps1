<#
  The Wall of Shame – Rollout Member-Login (D1 + Pages) für Windows PowerShell 5.1 / PowerShell 7.

    powershell -NoProfile -ExecutionPolicy Bypass -File .\rollout.ps1          # echter Rollout
    powershell -NoProfile -ExecutionPolicy Bypass -File .\rollout.ps1 -Local   # Probelauf nur lokal

  Bricht bei jedem Fehler mit einer deutschen Meldung ab. Log: rollout-<Zeit>.log
#>
[CmdletBinding()]
param(
  [switch]$Local
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

$AccountId    = '6e42bc3ad4404a8177b2569629e98362'
$DbName       = 'wall-of-shame-db'
$Project      = 'wall-of-shame'
$ProdUrl      = 'https://wall-of-shame-889.pages.dev'
$LocalFakeId  = '11111111-2222-4333-8444-555555555555'
$LocalPersist = '.wrangler/rollout-local'
$Mode         = if ($Local) { 'local' } else { 'remote' }
$Log          = Join-Path $Root ("rollout-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$env:ROLLOUT_LOG = $Log
$env:WRANGLER_SEND_METRICS = 'false'

$OnWindows = ($env:OS -eq 'Windows_NT')
$Npm = if ($OnWindows) { 'npm.cmd' } else { 'npm' }
$Npx = if ($OnWindows) { 'npx.cmd' } else { 'npx' }

function Write-Log {
  param([string]$Text = '')
  Write-Host $Text
  Add-Content -LiteralPath $Log -Value $Text -Encoding UTF8
}

function Stop-Rollout {
  param([string]$Message)
  Write-Log ''
  Write-Log "FEHLER: $Message"
  Write-Log "Abgebrochen. Details stehen im Log: $Log"
  throw [System.Exception]::new("ROLLOUT_ABORT")
}

function Write-Step {
  param([string]$Text)
  Write-Log ''
  Write-Log "==> $Text"
}

# Externes Programm starten, Ausgabe anzeigen + loggen, Exit-Code zurückgeben.
function Invoke-Tool {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string[]]$ArgList = @()
  )
  Add-Content -LiteralPath $Log -Value ("`n$ {0} {1}" -f $Exe, ($ArgList -join ' ')) -Encoding UTF8
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Exe @ArgList 2>&1 | ForEach-Object {
      $line = "$_"
      Write-Host $line
      Add-Content -LiteralPath $Log -Value $line -Encoding UTF8
    }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  if ($null -eq $code) { $code = 0 }
  return [int]$code
}

# Wie Invoke-Tool, bricht aber bei Exit-Code <> 0 mit Meldung ab.
function Invoke-Required {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [string[]]$ArgList = @(),
    [Parameter(Mandatory = $true)][string]$ErrorMessage
  )
  $code = Invoke-Tool -Exe $Exe -ArgList $ArgList
  if ($code -ne 0) { Stop-Rollout "$ErrorMessage (Exit-Code $code)" }
}

$TomlBackup = Join-Path $Root 'wrangler.toml.rollout-backup'
$exitCode = 0
try {
  Write-Log ("The Wall of Shame – Rollout Member-Login ({0}) – {1}" -f $Mode, (Get-Date))
  Write-Log "Ordner: $Root"

  # 1) Node.js >= 20
  Write-Step 'Node.js prüfen'
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Stop-Rollout 'Node.js ist nicht installiert. Bitte Node.js 20 LTS oder neuer installieren: https://nodejs.org/de/download – danach PowerShell neu öffnen und das Skript erneut starten.'
  }
  $nodeVersion = (& node -p "process.versions.node").Trim()
  $nodeMajor = [int]($nodeVersion.Split('.')[0])
  if ($nodeMajor -lt 20) {
    Stop-Rollout "Node.js $nodeVersion ist zu alt. Benötigt wird Version 20 oder neuer: https://nodejs.org/de/download"
  }
  if (-not (Get-Command $Npm -ErrorAction SilentlyContinue)) {
    Stop-Rollout 'npm wurde nicht gefunden (gehört zu Node.js): https://nodejs.org/de/download'
  }
  Write-Log "Node.js $nodeVersion"

  if (-not (Test-Path -LiteralPath (Join-Path $Root 'rollout/seed-admin.sql'))) {
    Stop-Rollout 'rollout/seed-admin.sql fehlt – das Bundle ist unvollständig.'
  }
  Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'check-toml') -ErrorMessage 'wrangler.toml ist ungültig.'

  # 2) Abhängigkeiten
  Write-Step 'Abhängigkeiten installieren (npm ci)'
  Invoke-Required -Exe $Npm -ArgList @('ci', '--no-audit', '--no-fund') -ErrorMessage 'npm ci ist fehlgeschlagen (Internetverbindung? Siehe Log).'

  if ($Local) {
    # ---------- Probelauf: alles lokal, nichts bei Cloudflare ----------
    Copy-Item -LiteralPath (Join-Path $Root 'wrangler.toml') -Destination $TomlBackup -Force
    if (Test-Path -LiteralPath $LocalPersist) { Remove-Item -LiteralPath $LocalPersist -Recurse -Force }

    Write-Step 'wrangler.toml testweise mit Dummy-ID patchen'
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'patch-toml', $LocalFakeId) -ErrorMessage 'wrangler.toml konnte nicht gepatcht werden.'

    Write-Step 'Migrationen lokal anwenden'
    Invoke-Required -Exe $Npx -ArgList @('wrangler', 'd1', 'migrations', 'apply', $DbName, '--local', '--persist-to', $LocalPersist) -ErrorMessage 'Lokale Migration fehlgeschlagen.'

    Write-Step 'Admin lokal anlegen (nur Passwort-Hash)'
    Invoke-Required -Exe $Npx -ArgList @('wrangler', 'd1', 'execute', $DbName, '--local', '--persist-to', $LocalPersist, '--yes', '--file', 'rollout/seed-admin.sql') -ErrorMessage 'Lokales Anlegen des Admins fehlgeschlagen.'
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'check-admin', $LocalPersist) -ErrorMessage 'Lokale Kontrolle fehlgeschlagen.'

    Write-Step 'Build'
    Invoke-Required -Exe $Npm -ArgList @('run', 'build') -ErrorMessage 'Build fehlgeschlagen.'

    Write-Step 'Lokaler Smoke-Test (wrangler pages dev)'
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'local-smoke', '8789', $LocalPersist) -ErrorMessage 'Lokaler Smoke-Test fehlgeschlagen.'

    Write-Log ''
    Write-Log 'Probelauf erfolgreich. Es wurde nichts bei Cloudflare verändert.'
    Write-Log "Log: $Log"
  }
  else {
    # ---------- Echter Rollout ----------
    if ($env:CLOUDFLARE_API_TOKEN -or $env:CLOUDFLARE_API_KEY) {
      Write-Log 'Hinweis: CLOUDFLARE_API_TOKEN/KEY ist gesetzt – wird für diesen Lauf ignoriert (Browser-Login wird verwendet).'
    }
    Remove-Item Env:CLOUDFLARE_API_TOKEN, Env:CLOUDFLARE_API_KEY, Env:CLOUDFLARE_EMAIL -ErrorAction SilentlyContinue
    $env:CLOUDFLARE_ACCOUNT_ID = $AccountId

    # 3) Login
    Write-Step 'Cloudflare-Login prüfen'
    $rc = Invoke-Tool -Exe 'node' -ArgList @('rollout/tools.mjs', 'whoami')
    if ($rc -eq 2) {
      Write-Log "Browser öffnet sich gleich – bitte bei Cloudflare anmelden und auf 'Allow' klicken."
      Invoke-Required -Exe $Npx -ArgList @('wrangler', 'login') -ErrorMessage 'wrangler login ist fehlgeschlagen oder wurde abgebrochen.'
      $rc = Invoke-Tool -Exe 'node' -ArgList @('rollout/tools.mjs', 'whoami')
    }
    switch ($rc) {
      0 { }
      2 { Stop-Rollout 'Nach dem Login ist Wrangler immer noch nicht angemeldet.' }
      3 { Stop-Rollout "Mit diesem Cloudflare-Login ist das Konto $AccountId nicht erreichbar. Mit 'npx wrangler logout' abmelden und mit dem richtigen Konto neu anmelden." }
      default { Stop-Rollout 'Login-Prüfung fehlgeschlagen.' }
    }

    # 4) D1 anlegen / wiederverwenden
    Write-Step "D1-Datenbank '$DbName' anlegen oder wiederverwenden"
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'ensure-d1') -ErrorMessage 'D1-Datenbank konnte nicht eingerichtet werden.'
    $d1Id = (Get-Content -LiteralPath (Join-Path $Root 'rollout/d1-id.txt') -Raw).Trim()
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'check-toml', '--real') -ErrorMessage 'wrangler.toml ist nach dem Patchen ungültig.'

    # 5) Migrationen
    Write-Step 'Migrationen auf Cloudflare anwenden'
    Invoke-Required -Exe $Npx -ArgList @('wrangler', 'd1', 'migrations', 'apply', $DbName, '--remote') -ErrorMessage 'Migrationen fehlgeschlagen.'

    # 6) Admin
    Write-Step "Admin 'Lucky' anlegen (nur Passwort-Hash, bestehendes Passwort bleibt)"
    Invoke-Required -Exe $Npx -ArgList @('wrangler', 'd1', 'execute', $DbName, '--remote', '--yes', '--file', 'rollout/seed-admin.sql') -ErrorMessage 'Admin konnte nicht angelegt werden.'
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'check-admin') -ErrorMessage 'Kontrolle der Admin-Konten fehlgeschlagen.'

    # 7) Build + Deploy
    Write-Step 'Build'
    Invoke-Required -Exe $Npm -ArgList @('run', 'build') -ErrorMessage 'Build fehlgeschlagen.'

    Write-Step 'Deploy auf Cloudflare Pages (Produktion, Branch main)'
    Invoke-Required -Exe $Npx -ArgList @('wrangler', 'pages', 'deploy', 'dist', "--project-name=$Project", '--branch=main', '--commit-message=member-login-rollout', '--commit-dirty=true') -ErrorMessage 'Deploy fehlgeschlagen.'

    # 8) Smoke-Test
    Write-Step 'Smoke-Test Live-Seite'
    Invoke-Required -Exe 'node' -ArgList @('rollout/tools.mjs', 'smoke', $ProdUrl, '12') -ErrorMessage 'Smoke-Test der Live-Seite fehlgeschlagen.'

    Write-Log ''
    Write-Log '============================================================'
    Write-Log ' Rollout erfolgreich.'
    Write-Log " Seite:  $ProdUrl  (Login: $ProdUrl/login, Admin: $ProdUrl/admin)"
    Write-Log " D1-Datenbank: $DbName"
    Write-Log " D1_DATABASE_ID=$d1Id"
    Write-Log " Log: $Log"
    Write-Log '============================================================'
  }
}
catch {
  $exitCode = 1
  if ($_.Exception.Message -ne 'ROLLOUT_ABORT') {
    Write-Log ''
    Write-Log ("FEHLER: Unerwarteter Abbruch: {0}" -f $_.Exception.Message)
    Write-Log "Details stehen im Log: $Log"
  }
}
finally {
  if (Test-Path -LiteralPath $TomlBackup) {
    Move-Item -LiteralPath $TomlBackup -Destination (Join-Path $Root 'wrangler.toml') -Force
  }
}
exit $exitCode
