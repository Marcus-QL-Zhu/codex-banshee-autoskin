$ErrorActionPreference = 'Stop'
$startPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts\start-dream-skin.ps1'
$parseErrors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($startPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$launchFunction = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Start-CodexWithDebugPort' }, $true)
$stopGuard = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.IfStatementAst] -and $n.Extent.Text.StartsWith('if (-not $debugReady -and -not $ProfilePath -and $mainProcesses.Count') }, $true)
if (-not $stopGuard) { throw 'Missing isolated-profile restart guard' }
function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function New-Item { param($ItemType, [switch]$Force, $Path) }
function Start-Process {
  param($FilePath, $WorkingDirectory, $ArgumentList)
  $script:observedPath = $env:CODEX_ELECTRON_USER_DATA_PATH
  $script:observedArgs = $ArgumentList
  if ($script:failLaunch) { throw [System.InvalidOperationException]::new('mock launch failure') }
}
function Stop-CodexCompletely { $script:stopCount++ }
Invoke-Expression $launchFunction.Extent.Text
$StandaloneRuntime = [pscustomobject]@{Executable='C:\Skin\ChatGPT.exe';Root='C:\Skin'}
$ProfilePath = 'C:\Dream Skin Test\Profile'
$Port = 53436
$savedUserData = $env:CODEX_ELECTRON_USER_DATA_PATH
try {
  $env:CODEX_ELECTRON_USER_DATA_PATH = 'original-value'
  $script:failLaunch = $false
  Start-CodexWithDebugPort
  Assert-True ($script:observedPath -eq $ProfilePath) 'Child did not receive the app userData override'
  Assert-True ($script:observedArgs -contains '"--user-data-dir=C:\Dream Skin Test\Profile"') 'Profile path with spaces is not quoted'
  Assert-True ($script:observedArgs -contains '--remote-debugging-address=127.0.0.1') 'Debugging address is not restricted to loopback'
  Assert-True ($env:CODEX_ELECTRON_USER_DATA_PATH -eq 'original-value') 'Successful launch leaked its environment override'
  $script:failLaunch = $true
  $failedAsExpected = $false
  try { Start-CodexWithDebugPort } catch { $failedAsExpected = $true }
  Assert-True $failedAsExpected 'Launch error was swallowed'
  Assert-True ($env:CODEX_ELECTRON_USER_DATA_PATH -eq 'original-value') 'Failed launch leaked its environment override'
  $debugReady = $false
  $mainProcesses = @(1)
  $RestartExisting = $true
  $script:stopCount = 0
  Invoke-Expression $stopGuard.Extent.Text
  Assert-True ($script:stopCount -eq 0) 'Isolated launch tried to close the official app'
  $ProfilePath = $null
  Invoke-Expression $stopGuard.Extent.Text
  Assert-True ($script:stopCount -eq 1) 'Legacy explicit restart behavior changed'
  'PASS: isolated profile, quoting, loopback, environment restoration, and restart isolation'
} finally {
  $env:CODEX_ELECTRON_USER_DATA_PATH = $savedUserData
}
