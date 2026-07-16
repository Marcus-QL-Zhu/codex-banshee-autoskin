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
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port -Allocate
$TransactionPath = Join-Path $StateRoot 'install-transaction.json'
New-Item -ItemType Directory -Force -Path $StateRoot | Out-Null
$ConfigPath = Join-Path $HOME '.codex\config.toml'
$BackupPath = Join-Path $StateRoot 'config.before-dream-skin.toml'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Codex config not found: $ConfigPath" }
if (-not (Test-Path -LiteralPath $BackupPath)) { Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath }

$content = Get-Content -LiteralPath $ConfigPath -Raw
$desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
if (-not $desktopMatch.Success) {
  $content = $content.TrimEnd() + "`r`n`r`n[desktop]`r`n"
  $desktopMatch = [regex]::Match($content, '(?ms)^\[desktop\]\s*\r?\n(?<body>.*?)(?=^\[|\z)')
}
$body = $desktopMatch.Groups['body'].Value
$settings = [ordered]@{
  appearanceTheme = 'appearanceTheme = "dark"'
  appearanceDarkCodeThemeId = 'appearanceDarkCodeThemeId = "codex"'
  appearanceDarkChromeTheme = 'appearanceDarkChromeTheme = { accent = "#D9A23E", contrast = 68, fonts = { code = "Cascadia Code", ui = "Microsoft YaHei UI" }, ink = "#DCE7F8", opaqueWindows = true, semanticColors = { diffAdded = "#3FB950", diffRemoved = "#F85149", skill = "#A78BFA" }, surface = "#091321" }'
}
$changes = @()
foreach ($key in $settings.Keys) {
  $capturePattern = "(?m)^$([regex]::Escape($key))\s*=.*$"
  $beforeMatch = [regex]::Match($body, $capturePattern)
  $changes += [ordered]@{
    key = $key
    existed = $beforeMatch.Success
    beforeValue = if ($beforeMatch.Success) { $beforeMatch.Value } else { $null }
    installedValue = $settings[$key]
  }
  $pattern = "(?m)^$([regex]::Escape($key))\s*=.*$"
  if ([regex]::IsMatch($body, $pattern)) { $body = [regex]::Replace($body, $pattern, $settings[$key]) }
  else { $body = $body.TrimEnd() + "`r`n" + $settings[$key] + "`r`n" }
}
$content = $content.Substring(0, $desktopMatch.Groups['body'].Index) + $body + $content.Substring($desktopMatch.Groups['body'].Index + $desktopMatch.Groups['body'].Length)
$previousTransaction = $null
if (Test-Path -LiteralPath $TransactionPath) {
  try {
    $previousTransaction = Get-Content -LiteralPath $TransactionPath -Raw | ConvertFrom-Json
    foreach ($change in $changes) {
      $previousChange = @($previousTransaction.changes | Where-Object { $_.key -eq $change.key }) | Select-Object -First 1
      if ($previousChange) {
        $change.existed = [bool]$previousChange.existed
        $change.beforeValue = $previousChange.beforeValue
      }
    }
  } catch {
    throw "Existing install transaction is unreadable; refusing to overwrite recovery data: $TransactionPath"
  }
}

Write-DreamSkinTextAtomic -Path $ConfigPath -Content $content
$transaction = [ordered]@{
  version = 2
  port = $Port
  installedAt = (Get-Date).ToString('o')
  configPath = $ConfigPath
  changes = $changes
  shortcuts = if ($previousTransaction -and $previousTransaction.shortcuts) { @($previousTransaction.shortcuts) } else { @() }
}
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
  $startScript = Join-Path $PSScriptRoot 'start-dream-skin.ps1'
  $restoreScript = Join-Path $PSScriptRoot 'restore-dream-skin.ps1'
  foreach ($folder in @($desktop, $startMenu)) {
    $shortcutPath = Join-Path $folder 'Codex Dream Skin.lnk'
    $shortcutPlan = Get-DreamSkinShortcutPlan $shortcutPath
    if (-not $shortcutPlan.Skip) {
      $shortcut = $shell.CreateShortcut($shortcutPath)
      $shortcut.TargetPath = $powershell
      $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port -RestartExisting"
      $shortcut.WorkingDirectory = $SkillRoot
      $shortcut.Description = 'Launch Codex with the Dream Skin theme engine'
      $shortcut.Save()
      Register-DreamSkinShortcut $shortcutPath $shortcutPlan.BackupPath
    }
  }
  $restorePath = Join-Path $desktop 'Codex Dream Skin - Restore.lnk'
  $restorePlan = Get-DreamSkinShortcutPlan $restorePath
  if (-not $restorePlan.Skip) {
    $restore = $shell.CreateShortcut($restorePath)
    $restore.TargetPath = $powershell
    $restore.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$restoreScript`" -Port $Port"
    $restore.WorkingDirectory = $SkillRoot
    $restore.Description = 'Remove the live Codex Dream Skin'
    $restore.Save()
    Register-DreamSkinShortcut $restorePath $restorePlan.BackupPath
  }
}

if (-not $NoAutoRecover) {
  $shell = New-Object -ComObject WScript.Shell
  $powershell = (Get-Command powershell.exe).Source
  $startup = [Environment]::GetFolderPath('Startup')
  $watchScript = Join-Path $PSScriptRoot 'watch-dream-skin.ps1'
  $watcherShortcutPath = Join-Path $startup 'Codex Dream Skin Watcher.lnk'
  $watcherPlan = Get-DreamSkinShortcutPlan $watcherShortcutPath
  if (-not $watcherPlan.Skip) {
    $watcherShortcut = $shell.CreateShortcut($watcherShortcutPath)
    $watcherShortcut.TargetPath = $powershell
    $watcherShortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watchScript`" -Port $Port"
    $watcherShortcut.WorkingDirectory = $SkillRoot
    $watcherShortcut.Description = 'Automatically restore Codex Dream Skin after a normal Codex restart'
    $watcherShortcut.Save()
    Register-DreamSkinShortcut $watcherShortcutPath $watcherPlan.BackupPath
  }

  $watcherStatePath = Join-Path $StateRoot 'watcher-state.json'
  if (Test-Path -LiteralPath $watcherStatePath) {
    try {
      $watcherState = Get-Content -LiteralPath $watcherStatePath -Raw | ConvertFrom-Json
      if ($watcherState.watcherPid) { Stop-Process -Id ([int]$watcherState.watcherPid) -Force -ErrorAction SilentlyContinue }
    } catch {}
    Remove-Item -LiteralPath $watcherStatePath -Force -ErrorAction SilentlyContinue
  }
  Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$watchScript`"", '-Port', "$Port"
  )
}

$transaction.shortcuts = $shortcutRecords
Write-DreamSkinJsonAtomic -Path $TransactionPath -Value $transaction

Write-Host 'Codex Dream Skin installed. Normal Codex restarts will now recover the skin automatically.'
