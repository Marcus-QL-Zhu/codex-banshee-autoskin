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
. (Join-Path $PSScriptRoot 'lifecycle.ps1')
. (Join-Path $PSScriptRoot 'standalone-runtime.ps1')
Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
# Build and verify the user-writable runtime before inspecting or stopping any
# running Codex process. A failed copy therefore cannot disrupt the official app.
$StandaloneRuntime = Ensure-DreamSkinStandaloneRuntime -StateRoot $StateRoot
$Package = Get-TrustedCodexStorePackage
$nodeRuntime = Get-DreamSkinNodePreflight -NodePath $StandaloneRuntime.NodeExecutable
$node = $nodeRuntime.Path
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port
$StatePath = Join-Path $StateRoot 'state.json'
$StdoutPath = Join-Path $StateRoot 'injector.log'
$StderrPath = Join-Path $StateRoot 'injector-error.log'
$TrustedCodexExecutables = @($Package.Executable, $StandaloneRuntime.Executable) + @(Get-DreamSkinOwnedRuntimeExecutables -StateRoot $StateRoot)
$TrustedCodexExecutables = @($TrustedCodexExecutables | Sort-Object -Unique)

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
  Stop-DreamSkinTrustedCodexProcesses -ExecutablePaths $TrustedCodexExecutables -StorePackageFullName $Package.PackageFullName -StoreExecutable $Package.Executable
}

$debugReady = Test-CodexDebugPort $Port
$mainProcesses = @(Get-DreamSkinTrustedCodexProcesses -ExecutablePaths $TrustedCodexExecutables -VisibleOnly)

if (-not $debugReady -and -not (Test-DreamSkinLoopbackPortFree -Port $Port)) {
  throw "Dream Skin port $Port is occupied by an unrelated process; Codex was left untouched. Reinstall to allocate a new port."
}

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
  [void](Convert-DreamSkinLegacyProcessState -StatePath $StatePath -IdentityProperty 'injectorIdentity' -PidProperty 'injectorPid' -ExpectedExecutableNames @('node.exe') -RequiredCommandTokens @('injector.mjs', '--watch'))
  [void](Stop-DreamSkinProcessStateSafely -StatePath $StatePath -IdentityProperty 'injectorIdentity' -Force)
}

if ($ForegroundInjector) {
  & $node $Injector --watch --port $Port
  exit $LASTEXITCODE
}

$injectorArgs = @("`"$Injector`"", '--watch', '--port', "$Port")
$daemon = Start-Process -FilePath $node -ArgumentList $injectorArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
$injectorIdentity = $null
for ($identityAttempt = 0; $identityAttempt -lt 20 -and -not $injectorIdentity; $identityAttempt++) {
  Start-Sleep -Milliseconds 100
  $injectorIdentity = Get-DreamSkinProcessIdentity -ProcessId $daemon.Id
}
if (-not $injectorIdentity) {
  try { $daemon.Kill() } catch {}
  throw 'Injector started but its process ownership identity could not be captured.'
}
@{
  port = $Port
  injectorPid = $daemon.Id
  injectorIdentity = $injectorIdentity
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
if (-not $verified) {
  [void](Stop-DreamSkinOwnedProcess -Expected $injectorIdentity -Force)
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
  throw 'Dream skin launched but verification failed. See injector logs.'
}
Write-Host "Codex Dream Skin is active on port $Port."
