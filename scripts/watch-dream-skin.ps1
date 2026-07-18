[CmdletBinding()]
param(
  [int]$Port = 0,
  [int]$PollSeconds = 2,
  [int]$LaunchGraceSeconds = 15,
  [int]$MaxConsecutiveFailures = 3,
  [int]$CooldownMinutes = 30,
  [int]$ProbeFailuresBeforeRecovery = 3,
  [int]$MaxRestartsPerWindow = 2,
  [int]$RestartWindowMinutes = 10
)

$ErrorActionPreference = 'Continue'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
. (Join-Path $PSScriptRoot 'standalone-runtime.ps1')
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port
$StatePath = Join-Path $StateRoot 'state.json'
$WatcherStatePath = Join-Path $StateRoot 'watcher-state.json'
$LogPath = Join-Path $StateRoot 'watcher.log'
$StartScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\CodexDreamSkinWatcher-$Port", [ref]$createdNew)
if (-not $createdNew) { exit 0 }

function Write-WatcherLog([string]$Message) {
  try {
    Add-Content -LiteralPath $LogPath -Encoding utf8 -Value "[$(Get-Date -Format o)] $Message"
  } catch {}
}

function Update-DreamSkinRuntimeRecord([object]$Runtime) {
  $transactionPath = Join-Path $StateRoot 'install-transaction.json'
  if (-not (Test-Path -LiteralPath $transactionPath -PathType Leaf)) { return }
  try {
    $transaction = Get-Content -LiteralPath $transactionPath -Raw | ConvertFrom-Json
    $next = [ordered]@{
      runtimeRoot = [string]$Runtime.Root
      runtimeVersion = [string]$Runtime.Version
      runtimePackageFullName = [string]$Runtime.PackageFullName
    }
    $changed = $false
    foreach ($name in $next.Keys) {
      if ($transaction.PSObject.Properties.Name -notcontains $name) {
        $transaction | Add-Member -NotePropertyName $name -NotePropertyValue $next[$name]
        $changed = $true
      } elseif ([string]$transaction.$name -ne $next[$name]) {
        $transaction.$name = $next[$name]
        $changed = $true
      }
    }
    if ($changed) {
      $transaction | Add-Member -Force -NotePropertyName runtimeRefreshedAt -NotePropertyValue ((Get-Date).ToString('o'))
      Write-DreamSkinJsonAtomic -Path $transactionPath -Value $transaction
    }
  } catch {
    Write-WatcherLog "Runtime is verified, but its informational install record could not be refreshed. $($_.Exception.Message)"
  }
}

function Sync-DreamSkinStandaloneRuntime {
  try {
    $existing = Get-DreamSkinStandaloneRuntime -StateRoot $StateRoot
  } catch {
    Write-WatcherLog "Codex Store package could not be verified yet; Codex will remain open without structural injection. $($_.Exception.Message)"
    return $null
  }
  if ($existing) {
    Update-DreamSkinRuntimeRecord -Runtime $existing
    return $existing
  }

  # A Store update changes the package identity and intentionally makes the old
  # copied runtime stale. Rebuild into a staging directory and verify hashes
  # before the watcher is allowed to touch the currently running Codex process.
  Write-WatcherLog 'Standalone runtime is missing or stale; securely refreshing it from the verified Codex Store package before recovery.'
  try {
    $refreshed = Ensure-DreamSkinStandaloneRuntime -StateRoot $StateRoot
    Update-DreamSkinRuntimeRecord -Runtime $refreshed
    Write-WatcherLog "Standalone runtime refresh completed for Codex $($refreshed.Version); the running Codex process was not interrupted during the copy."
    return $refreshed
  } catch {
    Write-WatcherLog "Standalone runtime refresh failed; Codex will keep running without structural injection. $($_.Exception.Message)"
    return $null
  }
}

$StandaloneRuntime = Sync-DreamSkinStandaloneRuntime
if (-not $StandaloneRuntime) { exit 2 }

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
function Test-DreamDebugPort {
  # Chromium may bind DevTools to either loopback stack depending on boot state;
  # accept whichever answers.
  foreach ($loopback in @('127.0.0.1', '[::1]')) {
    try {
      $targets = Invoke-RestMethod "http://$($loopback):$($Port)/json/list" -TimeoutSec 3
      if (($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://*' }) -and (Test-CodexPortOwner $Port)) { return $true }
    } catch {}
  }
  return $false
}

function Test-InjectorHealthy {
  if (-not (Test-Path -LiteralPath $StatePath)) { return $false }
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if (-not $state.injectorPid) { return $false }
    $process = Get-Process -Id ([int]$state.injectorPid) -ErrorAction Stop
    return $process.ProcessName -eq 'node'
  } catch {
    return $false
  }
}

@{
  watcherPid = $PID
  port = $Port
  startedAt = (Get-Date).ToString('o')
  scriptPath = $PSCommandPath
} | ForEach-Object { Write-DreamSkinJsonAtomic -Path $WatcherStatePath -Value $_ }
Write-WatcherLog "Watcher started (PID $PID, port $Port)."

$consecutiveFailures = 0
$suspendedUntil = $null
$missedProbes = 0
$restartTimes = New-Object System.Collections.Generic.List[datetime]

try {
  while ($true) {
    $debugReady = Test-DreamDebugPort
    if ($debugReady) { $missedProbes = 0 }

    if ($debugReady -and (Test-InjectorHealthy)) {
      if ($consecutiveFailures -gt 0 -or $null -ne $suspendedUntil) {
        Write-WatcherLog 'Dream Skin is healthy again; resuming normal watch.'
      }
      $consecutiveFailures = 0
      $suspendedUntil = $null
      Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
      continue
    }

    # Circuit breaker: after repeated recovery failures, stop touching Codex for a
    # cooldown period instead of kill-looping it. Codex keeps running unskinned.
    if ($null -ne $suspendedUntil) {
      if ((Get-Date) -ge $suspendedUntil) {
        Write-WatcherLog 'Cooldown ended; auto-recovery re-armed.'
        $suspendedUntil = $null
        $consecutiveFailures = 0
      } else {
        Start-Sleep -Seconds ([Math]::Max(5, $PollSeconds))
        continue
      }
    }

    $failed = $false
    $failureReason = ''

    if ($debugReady) {
      Write-WatcherLog 'Debug port is available but injector is missing; restarting injector.'
      try { & $StartScript -Port $Port | Out-Null } catch { $failed = $true; $failureReason = $_.Exception.Message }
    } else {
      $mainProcesses = @(Get-Process ChatGPT -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
      if ($mainProcesses.Count -eq 0) {
        $missedProbes = 0
        Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
        continue
      }
      $now = Get-Date
      $oldEnough = @($mainProcesses | Where-Object {
        try { ($now - $_.StartTime).TotalSeconds -ge $LaunchGraceSeconds } catch { $true }
      })
      if ($oldEnough.Count -eq 0) {
        Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
        continue
      }

      # Debounce: /json/list can transiently miss the app:// page (or time out) while
      # Codex is busy booting. Only treat the skin as lost after several consecutive misses.
      $missedProbes++
      if ($missedProbes -lt $ProbeFailuresBeforeRecovery) {
        Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
        continue
      }
      $missedProbes = 0

      # Codex can update from the Store while the watcher remains alive. Refresh
      # the verified runtime reference immediately before any recovery so the
      # owner-path check and the launcher agree on the same package version.
      $refreshedRuntime = Sync-DreamSkinStandaloneRuntime
      if (-not $refreshedRuntime) {
        $consecutiveFailures++
        if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
          $suspendedUntil = (Get-Date).AddMinutes($CooldownMinutes)
          Write-WatcherLog "Auto-recovery suspended until $($suspendedUntil.ToString('yyyy-MM-dd HH:mm:ss')) because the updated Store runtime could not be verified. Codex remains open without structural injection."
        }
        Start-Sleep -Seconds ([Math]::Max(5, $PollSeconds))
        continue
      }
      $StandaloneRuntime = $refreshedRuntime

      # Rate limit: even "successful" recoveries must not loop. If we already restarted
      # Codex $MaxRestartsPerWindow times inside the window, something is systemically
      # wrong — suspend instead of restarting again.
      while ($restartTimes.Count -gt 0 -and $restartTimes[0] -lt (Get-Date).AddMinutes(-$RestartWindowMinutes)) {
        $restartTimes.RemoveAt(0)
      }
      if ($restartTimes.Count -ge $MaxRestartsPerWindow) {
        $suspendedUntil = (Get-Date).AddMinutes($CooldownMinutes)
        Write-WatcherLog "Restart rate limit hit ($($restartTimes.Count) restarts within $RestartWindowMinutes minutes); auto-recovery suspended until $($suspendedUntil.ToString('yyyy-MM-dd HH:mm:ss')). Codex keeps running; run start-dream-skin.ps1 manually if the skin is missing."
        Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
        continue
      }

      Write-WatcherLog 'Detected Codex launched without Dream Skin; restarting it through the skin launcher.'
      $restartTimes.Add((Get-Date))
      try {
        & $StartScript -Port $Port -RestartExisting | Out-Null
        if (Test-DreamDebugPort) {
          Write-WatcherLog 'Codex restarted with Dream Skin.'
        } else {
          $failed = $true
          $failureReason = 'the launcher finished but CDP is still unreachable on both loopbacks'
        }
      } catch {
        $failed = $true
        $failureReason = $_.Exception.Message
      }
    }

    if ($failed) {
      $consecutiveFailures++
      Write-WatcherLog "Recovery failed ($consecutiveFailures/$MaxConsecutiveFailures): $failureReason"
      if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
        $suspendedUntil = (Get-Date).AddMinutes($CooldownMinutes)
        Write-WatcherLog "Auto-recovery suspended until $($suspendedUntil.ToString('yyyy-MM-dd HH:mm:ss')) after $consecutiveFailures consecutive failures. Codex keeps running WITHOUT the skin; run start-dream-skin.ps1 manually to retry sooner."
      } else {
        Start-Sleep -Seconds (10 * $consecutiveFailures)
      }
    } else {
      $consecutiveFailures = 0
    }

    Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
  }
} finally {
  try {
    if (Test-Path -LiteralPath $WatcherStatePath) {
      $state = Get-Content -LiteralPath $WatcherStatePath -Raw | ConvertFrom-Json
      if ([int]$state.watcherPid -eq $PID) { Remove-Item -LiteralPath $WatcherStatePath -Force }
    }
  } catch {}
  Write-WatcherLog "Watcher stopped (PID $PID)."
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
