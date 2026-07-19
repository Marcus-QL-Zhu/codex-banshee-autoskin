[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ThemeArguments
)

$ErrorActionPreference = 'Stop'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
. (Join-Path $PSScriptRoot 'lifecycle.ps1')
. (Join-Path $PSScriptRoot 'standalone-runtime.ps1')
Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
$runtime = Get-DreamSkinStandaloneRuntime -StateRoot $StateRoot
if (-not $runtime) { throw 'Verified Dream Skin runtime is unavailable; rerun the installer.' }
$node = (Get-DreamSkinNodePreflight -NodePath $runtime.NodeExecutable).Path
$switcher = Join-Path $PSScriptRoot 'set-theme.mjs'
& $node $switcher @ThemeArguments
exit $LASTEXITCODE
