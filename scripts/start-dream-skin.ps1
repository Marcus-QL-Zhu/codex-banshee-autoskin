[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$RestartExisting,
  [string]$ProfilePath,
  [switch]$ForegroundInjector
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$Injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
. (Join-Path $PSScriptRoot 'standalone-runtime.ps1')
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
# Build and verify the user-writable runtime before inspecting or stopping any
# running Codex process. A failed copy therefore cannot disrupt the official app.
$StandaloneRuntime = Ensure-DreamSkinStandaloneRuntime -StateRoot $StateRoot
$node = (Get-Command node -ErrorAction Stop).Source
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port
$StatePath = Join-Path $StateRoot 'state.json'
$StdoutPath = Join-Path $StateRoot 'injector.log'
$StderrPath = Join-Path $StateRoot 'injector-error.log'

function Test-CodexPortOwner([int]$CandidatePort) {
  try {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $CandidatePort -ErrorAction Stop | Where-Object {
      $_.LocalAddress -in @('127.0.0.1', '::1')
    })
    foreach ($listener in $listeners) {
      $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$listener.OwningProcess)" -ErrorAction Stop
      $path = [string]$owner.ExecutablePath
      if ($owner.Name -eq 'ChatGPT.exe' -and
          [string]::Equals([IO.Path]::GetFullPath($path), [IO.Path]::GetFullPath($StandaloneRuntime.Executable), [StringComparison]::OrdinalIgnoreCase)) {
        return $true
      }
    }
  } catch {}
  return $false
}
function Test-CodexDebugPort([int]$CandidatePort) {
  # Chromium may bind DevTools to either loopback stack depending on boot state;
  # accept whichever answers.
  foreach ($loopback in @('127.0.0.1', '[::1]')) {
    try {
      $targets = Invoke-RestMethod "http://$($loopback):$($CandidatePort)/json/list" -TimeoutSec 1
      if (($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) -and (Test-CodexPortOwner $CandidatePort)) { return $true }
    } catch {}
  }
  return $false
}

function Stop-CodexCompletely {
  $visible = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  foreach ($process in $visible) { [void]$process.CloseMainWindow() }
  Start-Sleep -Seconds 2
  $deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $deadline) {
    $procs = @(Get-Process ChatGPT -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) { break }
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
  }
  # Windows can auto-respawn a force-killed app moments later; give it a beat and swat once more,
  # otherwise the unflagged respawn wins the single-instance lock and the debug flag is silently lost.
  Start-Sleep -Milliseconds 900
  Get-Process ChatGPT -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}

$debugReady = Test-CodexDebugPort $Port
$mainProcesses = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })

if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count -gt 0) {
  if (-not $RestartExisting) {
    throw "Codex is already running without dream-skin debugging on port $Port. Close Codex or rerun with -RestartExisting."
  }
  Stop-CodexCompletely
}

function Start-CodexWithDebugPort {
  $arguments = @("--remote-debugging-port=$Port")
  if ($ProfilePath) {
    New-Item -ItemType Directory -Force -Path $ProfilePath | Out-Null
    $arguments += "--user-data-dir=$ProfilePath"
  }
  try {
    Start-Process -FilePath $StandaloneRuntime.Executable -WorkingDirectory $StandaloneRuntime.Root -ArgumentList $arguments
  } catch [System.InvalidOperationException] {
    throw "Windows denied launch of the verified per-user Codex runtime. $($_.Exception.Message)"
  }
}

function Wait-CodexDebugPort([int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while (-not (Test-CodexDebugPort $Port)) {
    if ((Get-Date) -ge $deadline) { return $false }
    Start-Sleep -Milliseconds 400
  }
  return $true
}

$maxLaunchAttempts = 1
$attempt = 0
while (-not (Test-CodexDebugPort $Port)) {
  if ($attempt -ge $maxLaunchAttempts) {
    throw "Codex did not expose CDP on 127.0.0.1/[::1]:$Port after $attempt launch attempt(s)."
  }
  $attempt++
  Start-CodexWithDebugPort
  if (Wait-CodexDebugPort 30) { break }
  throw "Codex did not expose CDP on 127.0.0.1/[::1]:$Port within 30 seconds; automatic retry is disabled to avoid another disruptive restart."
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $old = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($old.injectorPid) { Stop-Process -Id ([int]$old.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
}

if ($ForegroundInjector) {
  & $node $Injector --watch --port $Port
  exit $LASTEXITCODE
}

$injectorArgs = @("`"$Injector`"", '--watch', '--port', "$Port")
$daemon = Start-Process -FilePath $node -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
@{
  port = $Port
  injectorPid = $daemon.Id
  startedAt = (Get-Date).ToString('o')
  skillRoot = $SkillRoot
  profilePath = $ProfilePath
  runtimeRoot = $StandaloneRuntime.Root
  runtimeVersion = $StandaloneRuntime.Version
} | ForEach-Object { Write-DreamSkinJsonAtomic -Path $StatePath -Value $_ }

$verified = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
  Start-Sleep -Milliseconds 700
  & $node $Injector --verify --port $Port *> $null
  if ($LASTEXITCODE -eq 0) { $verified = $true; break }
}
if (-not $verified) { throw 'Dream skin launched but verification failed. See injector logs.' }
Write-Host "Codex Dream Skin is active on port $Port."
