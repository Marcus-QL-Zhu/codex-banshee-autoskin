[CmdletBinding()]
param(
  [int]$Port = 0,
  [switch]$Uninstall,
  [switch]$RestoreBaseTheme
)

$ErrorActionPreference = 'Stop'
if ($Uninstall) { $RestoreBaseTheme = $true }
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port
$StatePath = Join-Path $StateRoot 'state.json'
$WatcherStatePath = Join-Path $StateRoot 'watcher-state.json'
$TransactionPath = Join-Path $StateRoot 'install-transaction.json'
$transaction = $null
if (Test-Path -LiteralPath $TransactionPath) {
  $transaction = Get-Content -LiteralPath $TransactionPath -Raw | ConvertFrom-Json
}

if (Test-Path -LiteralPath $WatcherStatePath) {
  try {
    $watcherState = Get-Content -LiteralPath $WatcherStatePath -Raw | ConvertFrom-Json
    if ($watcherState.watcherPid) { Stop-Process -Id ([int]$watcherState.watcherPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
  Remove-Item -LiteralPath $WatcherStatePath -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $StatePath) {
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($state.injectorPid) { Stop-Process -Id ([int]$state.injectorPid) -Force -ErrorAction SilentlyContinue }
  } catch {}
  Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 250
try { & $node $injector --remove --port $Port --timeout-ms 3000 } catch {}

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

if ($RestoreBaseTheme) {
  if (-not $transaction) {
    throw 'No transactional install record is available; refusing an unsafe whole-file theme restore.'
  }
  $config = [string]$transaction.configPath
  if (-not (Test-Path -LiteralPath $config)) { throw "Codex config not found: $config" }
  $currentContent = Get-Content -LiteralPath $config -Raw
  foreach ($change in @($transaction.changes)) {
    $key = [string]$change.key
    $pattern = "(?m)^$([regex]::Escape($key))\s*=.*(?:\r?\n)?"
    $current = [regex]::Match($currentContent, $pattern)
    $currentLine = if ($current.Success) { $current.Value.TrimEnd([char]13, [char]10) } else { $null }
    if ($currentLine -ne [string]$change.installedValue) {
      Write-Warning "Preserved user-modified setting: $key"
      continue
    }
    $replacement = if ([bool]$change.existed) { [string]$change.beforeValue + [Environment]::NewLine } else { '' }
    $currentContent = [regex]::Replace($currentContent, $pattern, $replacement, 1)
  }
  Write-DreamSkinTextAtomic -Path $config -Content $currentContent
}

if ($Uninstall -and (Test-Path -LiteralPath $StateRoot)) {
  Remove-Item -LiteralPath $StateRoot -Recurse -Force
}

Write-Host 'The live Dream Skin was removed.'
