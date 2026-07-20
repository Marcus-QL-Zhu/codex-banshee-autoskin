$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\runtime-state.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('codex-dream-skin-shortcut-test-' + [guid]::NewGuid().ToString('N'))
$path = Join-Path $root 'test.lnk'
try {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  $none = Get-DreamSkinShortcutDisposition -ShortcutPath $path -Records @()
  [IO.File]::WriteAllText($path, 'skin', [Text.UTF8Encoding]::new($false))
  $record = [pscustomobject]@{ path = $path; backupPath = (Join-Path $root 'backup.lnk'); createdHash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant() }
  $owned = Get-DreamSkinShortcutDisposition -ShortcutPath $path -Records @($record)
  [IO.File]::WriteAllText($path, 'user', [Text.UTF8Encoding]::new($false))
  $modified = Get-DreamSkinShortcutDisposition -ShortcutPath $path -Records @($record)
  Remove-Item -LiteralPath $path -Force
  $missing = Get-DreamSkinShortcutDisposition -ShortcutPath $path -Records @($record)
  $states = @($none.State, $owned.State, $modified.State, $missing.State)
  if (($states -join ',') -ne 'unregistered,owned-current,modified,owned-missing') { throw "Unexpected states: $($states -join ',')" }
  $states -join ','
} finally {
  if ((Test-Path -LiteralPath $root) -and $root.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $root -Recurse -Force
  }
}