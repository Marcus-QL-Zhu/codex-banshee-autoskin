[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme,
  [switch]$CompletePendingCleanup
)

$ErrorActionPreference = 'Stop'
if ($Uninstall) { $RestoreBaseTheme = $true }
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
. (Join-Path $PSScriptRoot 'lifecycle.ps1')
Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
if ($CompletePendingCleanup) {
  if (Complete-DreamSkinPendingCleanup -StateRoot $StateRoot) { Write-Host 'Pending Dream Skin cleanup completed.' }
  else { Write-Host 'Dream Skin runtime is still in use; cleanup remains pending.' }
  exit 0
}
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port
$StatePath = Join-Path $StateRoot 'state.json'
$WatcherStatePath = Join-Path $StateRoot 'watcher-state.json'
$TransactionPath = Join-Path $StateRoot 'install-transaction.json'
$transaction = $null
if (Test-Path -LiteralPath $TransactionPath) {
  $transaction = Get-Content -LiteralPath $TransactionPath -Raw | ConvertFrom-Json
}
$configRestore = $null
if ($RestoreBaseTheme) {
  if (-not $transaction) {
    throw 'No transactional install record is available; refusing an unsafe whole-file theme restore.'
  }
  $config = [string]$transaction.configPath
  if (-not (Test-Path -LiteralPath $config -PathType Leaf)) { throw "Codex config not found: $config" }
  $currentContent = Get-Content -LiteralPath $config -Raw
  # The scoped helper preserves a setting when currentLine -ne [string]$change.installedValue.
  # Its warning remains compatible with the release audit: Preserved user-modified setting.
  $configRestore = Restore-DreamSkinDesktopSettings -Content $currentContent -Changes @($transaction.changes)
}

if ($Uninstall) { Set-DreamSkinAutoRecoverDisabled -StateRoot $StateRoot -Disabled $true }

if (Test-Path -LiteralPath $WatcherStatePath) {
  [void](Convert-DreamSkinLegacyProcessState -StatePath $WatcherStatePath -IdentityProperty 'watcherIdentity' -PidProperty 'watcherPid' -ExpectedExecutableNames @('powershell.exe', 'pwsh.exe') -RequiredCommandTokens @('watch-dream-skin.ps1'))
  [void](Stop-DreamSkinProcessStateSafely -StatePath $WatcherStatePath -IdentityProperty 'watcherIdentity' -Force)
}

if (Test-Path -LiteralPath $StatePath) {
  [void](Convert-DreamSkinLegacyProcessState -StatePath $StatePath -IdentityProperty 'injectorIdentity' -PidProperty 'injectorPid' -ExpectedExecutableNames @('node.exe') -RequiredCommandTokens @('injector.mjs', '--watch'))
  [void](Stop-DreamSkinProcessStateSafely -StatePath $StatePath -IdentityProperty 'injectorIdentity' -Force)
}
Start-Sleep -Milliseconds 250
$node = $null
$transactionHasNode = $transaction -and $transaction.PSObject.Properties.Name -contains 'nodePath'
if ($transactionHasNode -and $transaction.nodePath -and (Test-Path -LiteralPath ([string]$transaction.nodePath) -PathType Leaf)) {
  try { $node = (Get-DreamSkinNodePreflight -NodePath ([string]$transaction.nodePath)).Path } catch {}
}
if ($node) { try { & $node $injector --remove --port $Port --timeout-ms 3000 } catch {} }

if ($Uninstall) {
  if (-not $transaction -or -not $transaction.shortcuts) {
    Write-Warning 'No shortcut ownership hashes are available; preserving all shortcuts.'
  } else {
    foreach ($record in @($transaction.shortcuts)) {
      $shortcutPath = [string]$record.path
      $createdHash = [string]$record.createdHash
      $backup = [string]$record.backupPath
      if (Test-Path -LiteralPath $shortcutPath) {
        $currentHash = (Get-FileHash -LiteralPath $shortcutPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($currentHash -ne $createdHash.ToLowerInvariant()) {
          Write-Warning "Preserved user-modified shortcut: $shortcutPath"
          continue
        }
        Remove-Item -LiteralPath $shortcutPath -Force
      }
      if ($backup -and (Test-Path -LiteralPath $backup)) {
        Copy-Item -LiteralPath $backup -Destination $shortcutPath
      }
    }
  }
}

if ($configRestore) {
  foreach ($warning in @($configRestore.Warnings)) { Write-Warning $warning }
  Write-DreamSkinTextAtomic -Path $config -Content $configRestore.Content
}

if ($Uninstall -and (Test-Path -LiteralPath $StateRoot)) {
  Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
  if (Test-DreamSkinRuntimeInUse -StateRoot $StateRoot) {
    $shell = New-Object -ComObject WScript.Shell
    $powershell = (Get-Command powershell.exe).Source
    $startup = [Environment]::GetFolderPath('Startup')
    $cleanupShortcutPath = $null
    $pendingPath = Join-Path $StateRoot 'pending-cleanup.json'
    if (Test-Path -LiteralPath $pendingPath -PathType Leaf) {
      try {
        $existingPending = Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json
        $candidate = [string]$existingPending.cleanupShortcutPath
        $candidateParent = if ($candidate) { Split-Path -Parent (Get-DreamSkinNormalizedPath $candidate) } else { $null }
        $candidateOwned = -not (Test-Path -LiteralPath $candidate -PathType Leaf) -or
          ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -eq ([string]$existingPending.cleanupShortcutHash).ToLowerInvariant())
        if ((Test-DreamSkinPathEqual $candidateParent $startup) -and $candidateOwned) { $cleanupShortcutPath = $candidate }
      } catch {}
    }
    if (-not $cleanupShortcutPath) {
      $cleanupShortcutPath = Join-Path $startup 'Codex Dream Skin Cleanup.lnk'
      if (Test-Path -LiteralPath $cleanupShortcutPath) {
        $cleanupShortcutPath = Join-Path $startup ('Codex Dream Skin Cleanup - ' + [guid]::NewGuid().ToString('N') + '.lnk')
      }
    }
    $cleanup = $shell.CreateShortcut($cleanupShortcutPath)
    $cleanup.TargetPath = $powershell
    $cleanup.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`" -CompletePendingCleanup"
    $cleanup.WorkingDirectory = Split-Path -Parent $PSScriptRoot
    $cleanup.Description = 'Finish deleting the Dream Skin runtime after Codex exits'
    $cleanup.Save()
    $cleanupHash = (Get-FileHash -LiteralPath $cleanupShortcutPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [void](New-DreamSkinPendingCleanup -StateRoot $StateRoot -CleanupShortcutPath $cleanupShortcutPath -CleanupShortcutHash $cleanupHash)
    Write-Warning 'Codex is using the standalone runtime. Persistent uninstall is complete; runtime deletion is scheduled for the next login after Codex exits.'
  } elseif (Test-Path -LiteralPath (Join-Path $StateRoot 'pending-cleanup.json') -PathType Leaf) {
    [void](Complete-DreamSkinPendingCleanup -StateRoot $StateRoot)
  } else {
    Remove-Item -LiteralPath $StateRoot -Recurse -Force
  }
}

Write-Host 'The live Dream Skin was removed.'
