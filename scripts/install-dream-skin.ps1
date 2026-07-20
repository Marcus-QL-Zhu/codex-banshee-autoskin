[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$NoShortcuts,
  [switch]$NoAutoRecover
)

$ErrorActionPreference = 'Stop'
$SkillRoot = Split-Path -Parent $PSScriptRoot
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
. (Join-Path $PSScriptRoot 'lifecycle.ps1')
. (Join-Path $PSScriptRoot 'standalone-runtime.ps1')
$TransactionPath = Join-Path $StateRoot 'install-transaction.json'
$ConfigPath = Join-Path $HOME '.codex\config.toml'
$BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'

# Fail every non-executable environmental preflight before creating state,
# copying the runtime, changing Codex configuration, or registering persistence.
# Windows may deny direct execution of binaries inside WindowsApps even when
# the current user can read them. The bundled Node executable is therefore run
# only after the verified Store payload has been copied to our local runtime.
Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
Assert-DreamSkinPort -Port $Port -AllowZero
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
$content = Get-Content -LiteralPath $ConfigPath -Raw
$previousTransaction = $null
$previousTransactionRaw = $null
if (Test-Path -LiteralPath $TransactionPath) {
  try {
    $previousTransactionRaw = Get-Content -LiteralPath $TransactionPath -Raw
    $previousTransaction = $previousTransactionRaw | ConvertFrom-Json
  }
  catch { throw "Existing install transaction is unreadable; refusing to overwrite recovery data: $TransactionPath" }
}
$Package = Get-TrustedCodexStorePackage
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port -Allocate
$engineManifest = Get-DreamSkinEngineManifest -SourceRoot $SkillRoot
$runtimeRoot = Join-Path $StateRoot 'runtime'
$existingRuntime = Read-DreamSkinStandaloneRuntime -RuntimeRoot $runtimeRoot -Package $Package
$engineVersionRoot = Join-Path (Join-Path $StateRoot 'engine') ('sha256-' + $engineManifest.SnapshotId.Substring(0, 20))
$engineExists = Test-DreamSkinEngineSnapshot -EngineRoot $engineVersionRoot -Manifest $engineManifest
$requiredBytes = [long](512MB)
if (-not $existingRuntime) { $requiredBytes += Get-DreamSkinDirectoryBytes -Path $Package.SourceRoot }
if (-not $engineExists) { $requiredBytes += [long]$engineManifest.TotalBytes }
Assert-DreamSkinDiskSpace -Destination $StateRoot -RequiredBytes $requiredBytes

$script:installMutationStarted = $false
$script:attemptOriginalConfigContent = $content
$script:attemptInstalledConfigContent = $null
$script:attemptPreviousTransactionRaw = $previousTransactionRaw
$script:attemptAutoRecoverDisabled = Test-DreamSkinAutoRecoverDisabled -StateRoot $StateRoot
$script:attemptShortcutSnapshots = @()
$script:attemptWatcherProcess = $null
$script:attemptWatcherIdentity = $null
$attemptRollbackRoot = Join-Path $StateRoot ('install-rollback-' + [guid]::NewGuid().ToString('N'))

function Save-DreamSkinAttemptShortcut([string]$ShortcutPath) {
  if (@($script:attemptShortcutSnapshots | Where-Object { Test-DreamSkinPathEqual ([string]$_.path) $ShortcutPath }).Count -gt 0) { return }
  $record = [ordered]@{
    path = $ShortcutPath
    existed = Test-Path -LiteralPath $ShortcutPath -PathType Leaf
    snapshotPath = $null
  }
  if ($record.existed) {
    New-Item -ItemType Directory -Force -Path $attemptRollbackRoot | Out-Null
    $record.snapshotPath = Join-Path $attemptRollbackRoot ((Get-DreamSkinSha256Text $ShortcutPath) + '.lnk')
    Copy-Item -LiteralPath $ShortcutPath -Destination $record.snapshotPath
  }
  $script:attemptShortcutSnapshots += $record
}

function Undo-DreamSkinInstallAttempt {
  if (-not $script:installMutationStarted) { return }
  if ($script:attemptWatcherProcess) {
    try {
      if (-not $script:attemptWatcherProcess.HasExited -and $script:attemptWatcherIdentity) {
        if (-not (Stop-DreamSkinOwnedProcess -Expected $script:attemptWatcherIdentity -Force)) {
          Write-Warning 'Could not verify that the failed install watcher process tree stopped.'
        }
      } elseif (-not $script:attemptWatcherProcess.HasExited) {
        $script:attemptWatcherProcess.Kill()
        [void]$script:attemptWatcherProcess.WaitForExit(5000)
      }
    } catch { Write-Warning "Could not stop the failed install watcher: $($_.Exception.Message)" }
  }
  for ($index = $script:attemptShortcutSnapshots.Count - 1; $index -ge 0; $index--) {
    $record = $script:attemptShortcutSnapshots[$index]
    try {
      if ([bool]$record.existed) {
        Copy-Item -LiteralPath ([string]$record.snapshotPath) -Destination ([string]$record.path) -Force
      } else {
        Remove-Item -LiteralPath ([string]$record.path) -Force -ErrorAction SilentlyContinue
      }
    } catch { Write-Warning "Could not roll back shortcut $($record.path): $($_.Exception.Message)" }
  }
  try {
    $currentConfig = Get-Content -LiteralPath $ConfigPath -Raw
    if ($currentConfig -eq $script:attemptInstalledConfigContent) {
      Write-DreamSkinTextAtomic -Path $ConfigPath -Content $script:attemptOriginalConfigContent
    } else {
      Write-Warning 'Preserved Codex config because it changed after the failed install wrote its values.'
    }
  } catch { Write-Warning "Could not roll back Codex config: $($_.Exception.Message)" }
  try {
    Set-DreamSkinAutoRecoverDisabled -StateRoot $StateRoot -Disabled $script:attemptAutoRecoverDisabled
  } catch { Write-Warning "Could not restore automatic-recovery state: $($_.Exception.Message)" }
  try {
    if ($null -ne $script:attemptPreviousTransactionRaw) {
      Write-DreamSkinTextAtomic -Path $TransactionPath -Content $script:attemptPreviousTransactionRaw
    } else {
      Remove-Item -LiteralPath $TransactionPath -Force -ErrorAction SilentlyContinue
    }
  } catch { Write-Warning "Could not restore the prior transaction journal: $($_.Exception.Message)" }
}

try {
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$StandaloneRuntime = Ensure-DreamSkinStandaloneRuntime -StateRoot $StateRoot
$nodePreflight = Get-DreamSkinNodePreflight -NodePath $StandaloneRuntime.NodeExecutable
$InstalledEngine = Install-DreamSkinEngineSnapshot -SourceRoot $SkillRoot -StateRoot $StateRoot -Manifest $engineManifest
$InstalledScriptRoot = Join-Path $InstalledEngine.Root 'scripts'
if (-not (Test-Path -LiteralPath $BackupPath)) { Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath }

$settings = [ordered]@{
  appearanceTheme = 'appearanceTheme = "dark"'
  appearanceDarkCodeThemeId = 'appearanceDarkCodeThemeId = "codex"'
  appearanceDarkChromeTheme = 'appearanceDarkChromeTheme = { accent = "#D9A23E", contrast = 68, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "#DCE7F8", opaqueWindows = true, semanticColors = { diffAdded = "#3FB950", diffRemoved = "#F85149", skill = "#A78BFA" }, surface = "#091321" }'
}
# The helper journals both beforeValue and installedValue for compare-and-swap restore.
$configEdit = Set-DreamSkinDesktopSettings -Content $content -Settings $settings
$content = $configEdit.Content
$changes = @($configEdit.Changes)
if ($previousTransaction) {
  foreach ($change in $changes) {
    $previousChange = @($previousTransaction.changes | Where-Object { $_.key -eq $change.key }) | Select-Object -First 1
    if ($previousChange) {
      $change.existed = [bool]$previousChange.existed
      $change.beforeValue = $previousChange.beforeValue
    }
  }
}

$transaction = [ordered]@{
  version = 4
  phase = 'prepared'
  port = $Port
  installedAt = (Get-Date).ToString('o')
  configPath = $ConfigPath
  runtimeRoot = $StandaloneRuntime.Root
  runtimeVersion = $StandaloneRuntime.Version
  runtimePackageFullName = $StandaloneRuntime.PackageFullName
  nodePath = $StandaloneRuntime.NodeExecutable
  nodeVersion = $nodePreflight.Version
  engineRoot = $InstalledEngine.Root
  engineVersion = $InstalledEngine.Version
  engineSnapshotId = $InstalledEngine.SnapshotId
  changes = $changes
  shortcuts = if ($previousTransaction -and $previousTransaction.shortcuts) { @($previousTransaction.shortcuts) } else { @() }
}
$script:attemptInstalledConfigContent = $content
$script:installMutationStarted = $true
Write-DreamSkinJsonAtomic -Path $TransactionPath -Value $transaction
Write-DreamSkinTextAtomic -Path $ConfigPath -Content $content
$transaction.phase = 'config-applied'
Write-DreamSkinJsonAtomic -Path $TransactionPath -Value $transaction

$ShortcutBackupRoot = Join-Path $StateRoot 'shortcut-backups'
function Backup-DreamSkinShortcut([string]$ShortcutPath) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($ShortcutPath.ToLowerInvariant())
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
  $backup = Join-Path $ShortcutBackupRoot ($hash + '.lnk')
  if (Test-Path -LiteralPath $ShortcutPath) {
    New-Item -ItemType Directory -Force -Path $ShortcutBackupRoot | Out-Null
    if (-not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $ShortcutPath -Destination $backup }
  }
  return $backup
}

$shortcutRecords = @($transaction.shortcuts)
function Get-DreamSkinShortcutPlan([string]$ShortcutPath) {
  $disposition = Get-DreamSkinShortcutDisposition -ShortcutPath $ShortcutPath -Records $script:shortcutRecords
  if ($disposition.State -eq 'modified') {
    Write-Warning "Preserved user-modified shortcut during reinstall: $ShortcutPath"
    return [pscustomobject]@{ Skip = $true; BackupPath = [string]$disposition.Record.backupPath }
  }
  if ($disposition.State -ne 'unregistered') {
    return [pscustomobject]@{ Skip = $false; BackupPath = [string]$disposition.Record.backupPath }
  }
  return [pscustomobject]@{ Skip = $false; BackupPath = (Backup-DreamSkinShortcut $ShortcutPath) }
}
function Register-DreamSkinShortcut([string]$ShortcutPath, [string]$BackupPath) {
  $script:shortcutRecords = @($script:shortcutRecords | Where-Object { [string]$_.path -ne $ShortcutPath })
  $script:shortcutRecords += [ordered]@{
    path = $ShortcutPath
    backupPath = $BackupPath
    createdHash = (Get-FileHash -LiteralPath $ShortcutPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $script:transaction.shortcuts = $script:shortcutRecords
  Write-DreamSkinJsonAtomic -Path $script:TransactionPath -Value $script:transaction
}

if (-not $NoShortcuts) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $powershell = (Get-Command powershell.exe).Source
  $startScript = Join-Path $InstalledScriptRoot 'start-dream-skin.ps1'
  $restoreScript = Join-Path $InstalledScriptRoot 'restore-dream-skin.ps1'
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcutPath = Join-Path $folder 'Codex Dream Skin.lnk'
    $shortcutPlan = Get-DreamSkinShortcutPlan $shortcutPath
    if (-not $shortcutPlan.Skip) {
      Save-DreamSkinAttemptShortcut $shortcutPath
      $shortcut = $shell.CreateShortcut($shortcutPath)
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port -RestartExisting"
      $shortcut.WorkingDirectory = $InstalledEngine.Root
      $shortcut.Description = 'Launch Codex with the Dream Skin theme engine'
      $shortcut.Save()
      Register-DreamSkinShortcut $shortcutPath $shortcutPlan.BackupPath
    }
  }
  $restorePath = Join-Path $desktop 'Codex Dream Skin - Restore.lnk'
  $restorePlan = Get-DreamSkinShortcutPlan $restorePath
  if (-not $restorePlan.Skip) {
    Save-DreamSkinAttemptShortcut $restorePath
    $restore = $shell.CreateShortcut($restorePath)
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port"
    $restore.WorkingDirectory = $InstalledEngine.Root
    $restore.Description = 'Remove the live Codex Dream Skin'
    $restore.Save()
    Register-DreamSkinShortcut $restorePath $restorePlan.BackupPath
  }
  $uninstallPath = Join-Path $desktop 'Codex Dream Skin - Uninstall.lnk'
  $uninstallPlan = Get-DreamSkinShortcutPlan $uninstallPath
  if (-not $uninstallPlan.Skip) {
    Save-DreamSkinAttemptShortcut $uninstallPath
    $uninstall = $shell.CreateShortcut($uninstallPath)
    $uninstall.TargetPath = $powershell
    $uninstall.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port -Uninstall -RestoreBaseTheme"
    $uninstall.WorkingDirectory = $InstalledEngine.Root
    $uninstall.Description = 'Fully uninstall Codex Dream Skin and restore the prior base theme'
    $uninstall.Save()
    Register-DreamSkinShortcut $uninstallPath $uninstallPlan.BackupPath
  }
}

$startup = [Environment]::GetFolderPath('Startup')
$watcherShortcutPath = Join-Path $startup 'Codex Dream Skin Watcher.lnk'
if ($NoAutoRecover) {
  Set-DreamSkinAutoRecoverDisabled -StateRoot $StateRoot -Disabled $true
  $watcherStatePath = Join-Path $StateRoot 'watcher-state.json'
  [void](Convert-DreamSkinLegacyProcessState -StatePath $watcherStatePath -IdentityProperty 'watcherIdentity' -PidProperty 'watcherPid' -ExpectedExecutableNames @('powershell.exe', 'pwsh.exe') -RequiredCommandTokens @('watch-dream-skin.ps1'))
  [void](Stop-DreamSkinProcessStateSafely -StatePath $watcherStatePath -IdentityProperty 'watcherIdentity' -Force)
  $watcherDisposition = Get-DreamSkinShortcutDisposition -ShortcutPath $watcherShortcutPath -Records $shortcutRecords
  if ($watcherDisposition.State -eq 'owned-current') {
    Save-DreamSkinAttemptShortcut $watcherShortcutPath
    Remove-Item -LiteralPath $watcherShortcutPath -Force
    $backup = [string]$watcherDisposition.Record.backupPath
    if ($backup -and (Test-Path -LiteralPath $backup -PathType Leaf)) { Copy-Item -LiteralPath $backup -Destination $watcherShortcutPath }
    $shortcutRecords = @($shortcutRecords | Where-Object { [string]$_.path -ne $watcherShortcutPath })
  } elseif ($watcherDisposition.State -eq 'owned-missing') {
    $shortcutRecords = @($shortcutRecords | Where-Object { [string]$_.path -ne $watcherShortcutPath })
  } elseif ($watcherDisposition.State -eq 'modified') {
    Write-Warning "Preserved user-modified Startup shortcut; the durable disabled marker prevents the installed watcher from acting: $watcherShortcutPath"
  }
} else {
  Set-DreamSkinAutoRecoverDisabled -StateRoot $StateRoot -Disabled $false
  $shell = New-Object -ComObject WScript.Shell
  $powershell = (Get-Command powershell.exe).Source
  $watchScript = Join-Path $InstalledScriptRoot 'watch-dream-skin.ps1'
  $watcherPlan = Get-DreamSkinShortcutPlan $watcherShortcutPath
  if (-not $watcherPlan.Skip) {
    Save-DreamSkinAttemptShortcut $watcherShortcutPath
    $watcherShortcut = $shell.CreateShortcut($watcherShortcutPath)
    $watcherShortcut.TargetPath = $powershell
    $watcherShortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchScript`" -Port $Port"
    $watcherShortcut.WorkingDirectory = $InstalledEngine.Root
    $watcherShortcut.Description = 'Automatically restore Codex Dream Skin after a normal Codex restart'
    $watcherShortcut.Save()
    Register-DreamSkinShortcut $watcherShortcutPath $watcherPlan.BackupPath
  }

  $watcherStatePath = Join-Path $StateRoot 'watcher-state.json'
  if (Test-Path -LiteralPath $watcherStatePath) {
    $recordedWatcherIdentity = $null
    try {
      $recordedWatcherState = Get-Content -LiteralPath $watcherStatePath -Raw | ConvertFrom-Json
      if ($recordedWatcherState.PSObject.Properties.Name -contains 'watcherIdentity') {
        $recordedWatcherIdentity = $recordedWatcherState.watcherIdentity
      }
    } catch {}
    [void](Convert-DreamSkinLegacyProcessState -StatePath $watcherStatePath -IdentityProperty 'watcherIdentity' -PidProperty 'watcherPid' -ExpectedExecutableNames @('powershell.exe', 'pwsh.exe') -RequiredCommandTokens @('watch-dream-skin.ps1'))
    [void](Stop-DreamSkinProcessStateSafely -StatePath $watcherStatePath -IdentityProperty 'watcherIdentity' -Force)
    if ($recordedWatcherIdentity) {
      $remainingWatcher = Get-DreamSkinProcessIdentity -ProcessId ([int]$recordedWatcherIdentity.processId)
      if (Test-DreamSkinProcessIdentity -Expected $recordedWatcherIdentity -Current $remainingWatcher) {
        if (-not (Stop-DreamSkinOwnedProcess -Expected $recordedWatcherIdentity -Force)) {
          throw 'The previously installed watcher remained alive after verified process-tree termination.'
        }
      }
    }
  }
  $watcherHealthToken = [guid]::NewGuid().ToString('N')
  $watcherProcess = Start-Process -FilePath $powershell -WindowStyle Hidden -PassThru -ArgumentList @(
    '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$watchScript`"", '-Port', "$Port", '-HealthToken', $watcherHealthToken
  )
  $script:attemptWatcherProcess = $watcherProcess
  $watcherHealthy = $false
  for ($attempt = 0; $attempt -lt 75; $attempt++) {
    Start-Sleep -Milliseconds 200
    $watcherProcess.Refresh()
    if ($watcherProcess.HasExited) { break }
    if (-not (Test-Path -LiteralPath $watcherStatePath -PathType Leaf)) { continue }
    try {
      $watcherState = Get-Content -LiteralPath $watcherStatePath -Raw | ConvertFrom-Json
      if ([int]$watcherState.watcherPid -ne $watcherProcess.Id) { continue }
      if ([string]$watcherState.healthToken -ne $watcherHealthToken) { continue }
      if ([string]$watcherState.phase -ne 'ready') { continue }
      if (-not (Test-DreamSkinPathEqual ([string]$watcherState.scriptPath) $watchScript)) { continue }
      $candidateWatcherIdentity = $watcherState.watcherIdentity
      $currentWatcherIdentity = Get-DreamSkinProcessIdentity -ProcessId ([int]$candidateWatcherIdentity.processId)
      if (-not (Test-DreamSkinProcessIdentity -Expected $candidateWatcherIdentity -Current $currentWatcherIdentity)) { continue }
      $script:attemptWatcherIdentity = $candidateWatcherIdentity
      $watcherHealthy = $true
      break
    } catch {}
  }
  if (-not $watcherHealthy -and $watcherProcess.HasExited -and $watcherProcess.ExitCode -eq 0) {
    throw 'Watcher exited normally because another watcher still owns the singleton mutex; the previous installation must be stopped before upgrade.'
  }
  if (-not $watcherHealthy -and $watcherProcess.HasExited) { throw "Watcher exited before acknowledging readiness (exit code $($watcherProcess.ExitCode))." }
  if (-not $watcherHealthy) { throw 'Watcher did not acknowledge readiness within 15 seconds.' }
}

$transaction.shortcuts = $shortcutRecords
$transaction.phase = 'installed'
Write-DreamSkinJsonAtomic -Path $TransactionPath -Value $transaction

if ($NoAutoRecover) {
  Write-Host 'Codex Dream Skin installed with automatic recovery disabled.'
} else {
  Write-Host 'Codex Dream Skin installed. Normal Codex restarts will now recover the skin automatically.'
}
$script:installMutationStarted = $false
} catch {
  $installFailure = $_
  Undo-DreamSkinInstallAttempt
  throw $installFailure
} finally {
  if (Test-Path -LiteralPath $attemptRollbackRoot) {
    Remove-Item -LiteralPath $attemptRollbackRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
