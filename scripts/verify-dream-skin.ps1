[CmdletBinding()]
param(
  [int]$Port = 0,
  [string]$ScreenshotPath
)

$ErrorActionPreference = 'Stop'
$StateRoot = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
. (Join-Path $PSScriptRoot 'runtime-state.ps1')
$Port = Get-DreamSkinPersistedPort -StateRoot $StateRoot -RequestedPort $Port
$node = (Get-Command node -ErrorAction Stop).Source
$injector = Join-Path $PSScriptRoot 'injector.mjs'
$arguments = @($injector, '--verify', '--port', "$Port")
if ($ScreenshotPath) { $arguments += @('--screenshot', $ScreenshotPath) }
& $node @arguments
exit $LASTEXITCODE
