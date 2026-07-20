$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $repoRoot 'scripts\runtime-state.ps1')
. (Join-Path $repoRoot 'scripts\lifecycle.ps1')
. (Join-Path $repoRoot 'scripts\standalone-runtime.ps1')

$script:passed = 0
function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
  $script:passed++
}
function Assert-Throws([scriptblock]$Action, [string]$Message) {
  $threw = $false
  try { & $Action } catch { $threw = $true }
  Assert-True $threw $Message
}
function Write-TestFile([string]$Path, [string]$Content) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('codex-dream-skin-lifecycle-' + [guid]::NewGuid().ToString('N'))
$originalLocalAppData = $env:LOCALAPPDATA
try {
  New-Item -ItemType Directory -Force -Path $sandbox | Out-Null
  $env:LOCALAPPDATA = $sandbox

  Assert-Throws { Assert-DreamSkinPort -Port 1023 } 'Privileged ports must be rejected.'
  Assert-Throws { Assert-DreamSkinPort -Port 65536 } 'Out-of-range ports must be rejected.'
  Assert-DreamSkinPort -Port 9335
  $script:passed++

  $expected = [pscustomobject]@{
    processId = 41
    startTimeUtc = '2026-07-19T01:02:03.0000000Z'
    executablePath = 'C:\Tools\node.exe'
    commandLineSha256 = 'abc'
  }
  $same = [pscustomobject]@{
    processId = 41
    startTimeUtc = '2026-07-19T01:02:03.0000000Z'
    executablePath = 'c:\tools\NODE.exe'
    commandLineSha256 = 'abc'
  }
  Assert-True (Test-DreamSkinProcessIdentity -Expected $expected -Current $same) 'Exact process identity should pass.'
  $stalePid = $same.PSObject.Copy()
  $stalePid.startTimeUtc = '2026-07-19T01:02:04.0000000Z'
  Assert-True (-not (Test-DreamSkinProcessIdentity -Expected $expected -Current $stalePid)) 'PID reuse with a different start time must fail closed.'
  $wrongCommand = $same.PSObject.Copy()
  $wrongCommand.commandLineSha256 = 'def'
  Assert-True (-not (Test-DreamSkinProcessIdentity -Expected $expected -Current $wrongCommand)) 'A different command line must fail ownership.'
  $basicOnly = $same.PSObject.Copy()
  $basicOnly.commandLineSha256 = ''
  Assert-True (Test-DreamSkinProcessIdentity -Expected $expected -Current $basicOnly) 'PID, start time, and executable path must remain usable when WMI command-line access is denied.'

  $script:terminatedPackage = ''
  $validPackage = 'OpenAI.Codex_26.715.4045.0_x64__2p2nqsd0c76g0'
  Assert-True (Stop-DreamSkinStorePackageProcesses -PackageFullName $validPackage -Terminator { param($package) $script:terminatedPackage = $package; return 0 }) 'Verified Store package termination should accept a successful package lifecycle result.'
  Assert-True ($script:terminatedPackage -eq $validPackage) 'Package lifecycle termination must receive the exact verified package full name.'
  Assert-Throws { Stop-DreamSkinStorePackageProcesses -PackageFullName 'Other.App_1.0.0.0_x64__publisher' -Terminator { return 0 } } 'Package termination must reject an unrelated package identity.'
  Assert-Throws { Stop-DreamSkinStorePackageProcesses -PackageFullName $validPackage -Terminator { return -2147024891 } } 'A failing package lifecycle HRESULT must fail closed.'

  $originalToml = "[other]`r`nappearanceTheme = `"leave-$&-alone`"`r`n`r`n[desktop]`r`nappearanceTheme = `"light`"`r`nappearanceDarkCodeThemeId = `"user-$&`"`r`n[after]`r`nvalue = 1`r`n"
  $settings = [ordered]@{
    appearanceTheme = 'appearanceTheme = "dark"'
    appearanceDarkCodeThemeId = 'appearanceDarkCodeThemeId = "codex"'
  }
  $edited = Set-DreamSkinDesktopSettings -Content $originalToml -Settings $settings
  Assert-True ($edited.Content.Contains('appearanceTheme = "leave-$&-alone"')) 'Install must not edit a key in another TOML section.'
  $restored = Restore-DreamSkinDesktopSettings -Content $edited.Content -Changes @($edited.Changes)
  Assert-True ($restored.Content -eq $originalToml) 'Desktop restore must be literal and preserve dollar replacement tokens.'
  $userChanged = $edited.Content.Replace('appearanceTheme = "dark"', 'appearanceTheme = "system"')
  $cas = Restore-DreamSkinDesktopSettings -Content $userChanged -Changes @($edited.Changes)
  Assert-True ($cas.Content.Contains('appearanceTheme = "system"')) 'Restore must preserve a user-modified installed value.'
  Assert-True (@($cas.Warnings).Count -eq 1) 'CAS preservation must produce one warning.'

  $source = Join-Path $sandbox 'source'
  Write-TestFile (Join-Path $source 'scripts\start-dream-skin.ps1') 'start'
  Write-TestFile (Join-Path $source 'scripts\watch-dream-skin.ps1') 'watch'
  Write-TestFile (Join-Path $source 'scripts\restore-dream-skin.ps1') 'restore'
  Write-TestFile (Join-Path $source 'scripts\injector.mjs') 'injector'
  Write-TestFile (Join-Path $source 'scripts\lifecycle.ps1') 'helper'
  Write-TestFile (Join-Path $source 'assets\renderer-inject.js') 'renderer'
  Write-TestFile (Join-Path $source 'styles\banshee\style.css') 'style'
  Write-TestFile (Join-Path $source 'themes\banshee-armor\theme.json') '{}'
  $manifest = Get-DreamSkinEngineManifest -SourceRoot $source
  $stateRoot = Join-Path $sandbox 'CodexDreamSkin'
  $installed = Install-DreamSkinEngineSnapshot -SourceRoot $source -StateRoot $stateRoot -Manifest $manifest
  Assert-True (Test-DreamSkinEngineSnapshot -EngineRoot $installed.Root -Manifest $manifest) 'Installed engine snapshot must verify.'
  Write-TestFile (Join-Path $installed.Root 'scripts\unexpected.ps1') 'unowned-extra'
  Assert-True (-not (Test-DreamSkinEngineSnapshot -EngineRoot $installed.Root -Manifest $manifest)) 'Engine verification must reject extra executable content.'
  Remove-Item -LiteralPath (Join-Path $installed.Root 'scripts\unexpected.ps1') -Force
  Assert-True (Test-DreamSkinEngineSnapshot -EngineRoot $installed.Root -Manifest $manifest) 'Engine verification should recover after removing an extra file.'
  Remove-Item -LiteralPath $source -Recurse -Force
  Assert-True (Test-Path -LiteralPath (Join-Path $installed.Root 'scripts\start-dream-skin.ps1')) 'Installed engine must survive removal of the download source.'

  Set-DreamSkinAutoRecoverDisabled -StateRoot $stateRoot -Disabled $true
  Assert-True (Test-DreamSkinAutoRecoverDisabled -StateRoot $stateRoot) 'Disabled auto-recovery must be durable.'
  Set-DreamSkinAutoRecoverDisabled -StateRoot $stateRoot -Disabled $false
  Assert-True (-not (Test-DreamSkinAutoRecoverDisabled -StateRoot $stateRoot)) 'Re-enabling auto-recovery must remove the durable marker.'

  $staleStatePath = Join-Path $stateRoot 'stale-process.json'
  Write-DreamSkinJsonAtomic -Path $staleStatePath -Value @{ injectorIdentity = @{ processId = 2147483000; startTimeUtc = '2026-01-01T00:00:00.0000000Z'; executablePath = 'C:\missing\node.exe'; commandLineSha256 = 'deadbeef' } }
  Assert-True (-not (Stop-DreamSkinProcessStateSafely -StatePath $staleStatePath -IdentityProperty 'injectorIdentity' -Force)) 'A stale process record must not target a reused or missing PID.'
  Assert-True (-not (Test-Path -LiteralPath $staleStatePath)) 'A proven-stale process record should be cleared.'
  $invalidStatePath = Join-Path $stateRoot 'invalid-process.json'
  Write-TestFile $invalidStatePath '{ broken'
  Assert-Throws { Stop-DreamSkinProcessStateSafely -StatePath $invalidStatePath -IdentityProperty 'injectorIdentity' -Force } 'An invalid process record must fail closed.'
  Assert-True (Test-Path -LiteralPath $invalidStatePath) 'An ambiguous process record must be preserved for recovery.'
  Remove-Item -LiteralPath $invalidStatePath -Force
  $legacyStatePath = Join-Path $stateRoot 'legacy-process.json'
  Write-DreamSkinJsonAtomic -Path $legacyStatePath -Value @{ watcherPid = 41; scriptPath = 'C:\Dream\watch-dream-skin.ps1' }
  $legacyIdentity = [pscustomobject]@{ processId = 41; startTimeUtc = '2026-01-01T00:00:00.0000000Z'; executablePath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'; commandLineSha256 = 'legacy' }
  Assert-True (Convert-DreamSkinLegacyProcessState -StatePath $legacyStatePath -IdentityProperty 'watcherIdentity' -PidProperty 'watcherPid' -ExpectedExecutableNames @('powershell.exe') -RequiredCommandTokens @('watch-dream-skin.ps1') -IdentityResolver { param($id) $legacyIdentity } -ProcessRecordResolver { param($id) [pscustomobject]@{ CommandLine = 'powershell.exe -File C:\Dream\watch-dream-skin.ps1 -Port 9335' } }) 'A matching legacy process record should migrate to typed ownership.'
  $migratedLegacyState = Get-Content -LiteralPath $legacyStatePath -Raw | ConvertFrom-Json
  Assert-True ([int]$migratedLegacyState.watcherIdentity.processId -eq 41) 'Legacy migration must persist the typed process identity.'
  Remove-Item -LiteralPath $legacyStatePath -Force
  Write-DreamSkinJsonAtomic -Path $legacyStatePath -Value @{ watcherPid = 41; scriptPath = 'C:\Dream\watch-dream-skin.ps1' }
  Assert-Throws { Convert-DreamSkinLegacyProcessState -StatePath $legacyStatePath -IdentityProperty 'watcherIdentity' -PidProperty 'watcherPid' -ExpectedExecutableNames @('powershell.exe') -RequiredCommandTokens @('watch-dream-skin.ps1') -IdentityResolver { param($id) $legacyIdentity } -ProcessRecordResolver { param($id) [pscustomobject]@{ CommandLine = 'powershell.exe -File C:\Other\unrelated.ps1' } } } 'Legacy migration must reject a PID whose command line does not prove ownership.'
  Remove-Item -LiteralPath $legacyStatePath -Force
  $runtimeRoot = Join-Path $stateRoot 'runtime'
  foreach ($version in @('1.0.0', '2.0.0')) {
    Write-TestFile (Join-Path $runtimeRoot "$version\ChatGPT.exe") $version
    Write-DreamSkinJsonAtomic -Path (Join-Path $runtimeRoot "$version\.codex-dream-skin-runtime.json") -Value @{ schemaVersion = 1 }
  }
  $keep = Join-Path $runtimeRoot '2.0.0'
  $removed = @(Remove-DreamSkinObsoleteRuntimes -StateRoot $stateRoot -KeepRoots @($keep) -InUseEvaluator { param($path) $false })
  Assert-True ($removed.Count -eq 1) 'Exactly one obsolete owned runtime should be pruned.'
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot '1.0.0'))) 'Obsolete owned runtime should be removed.'
  Assert-True (Test-Path -LiteralPath $keep) 'Kept runtime must remain.'
  Write-TestFile (Join-Path $runtimeRoot '3.0.0\ChatGPT.exe') '3.0.0'
  Write-DreamSkinJsonAtomic -Path (Join-Path $runtimeRoot '3.0.0\.codex-dream-skin-runtime.json') -Value @{ schemaVersion = 1 }
  $blockedRemoval = @(Remove-DreamSkinObsoleteRuntimes -StateRoot $stateRoot -KeepRoots @($keep) -InUseEvaluator { param($path) $true })
  Assert-True ($blockedRemoval.Count -eq 0) 'A runtime reported in use must not be pruned.'
  Assert-True (Test-Path -LiteralPath (Join-Path $runtimeRoot '3.0.0')) 'In-use runtime directory must remain.'

  $trustedSource = Join-Path $sandbox 'trusted-app'
  Write-TestFile (Join-Path $trustedSource 'ChatGPT.exe') 'chatgpt'
  Write-TestFile (Join-Path $trustedSource 'resources\app.asar') 'asar'
  Write-TestFile (Join-Path $trustedSource 'resources\cua_node\bin\node.exe') 'node'
  Write-TestFile (Join-Path $trustedSource 'native\guard.dll') 'signed-package-bytes'
  $longSource = Join-Path $sandbox 'long-runtime-source'
  Write-TestFile (Join-Path $longSource 'ChatGPT.exe') 'chatgpt'
  Write-TestFile (Join-Path $longSource 'resources\app.asar') 'asar'
  Write-TestFile (Join-Path $longSource 'resources\cua_node\bin\node.exe') 'node'
  $longDirectory = Join-Path $longSource ((1..12 | ForEach-Object { 'long-runtime-segment' }) -join '\')
  $extendedLongDirectory = '\\?\' + $longDirectory
  [IO.Directory]::CreateDirectory($extendedLongDirectory) | Out-Null
  [IO.File]::WriteAllText(($extendedLongDirectory + '\addon.node'), 'native-addon', [Text.UTF8Encoding]::new($false))
  $longDirectoryBytes = Get-DreamSkinDirectoryBytes -Path $longSource
  Assert-True ($longDirectoryBytes -gt 0) 'Directory-size accounting must support paths longer than MAX_PATH.'
  $longCritical = @(Get-DreamSkinCriticalFiles -Root $longSource)
  Assert-True (@($longCritical | Where-Object { [string]$_['path'] -like '*addon.node' }).Count -eq 1) 'Critical-file enumeration must support paths longer than MAX_PATH.'
  Assert-True (Remove-DreamSkinDirectoryTreeLongPath -Path $longSource -Boundary $sandbox) 'Long-path runtime cleanup must succeed.'
  Assert-True (-not (Test-Path -LiteralPath $longSource)) 'Long-path runtime cleanup must remove the entire tree.'
  $integrityRoot = Join-Path $sandbox 'integrity-runtime'
  $integrityVersion = Join-Path $integrityRoot '9.9.9'
  Copy-Item -LiteralPath $trustedSource -Destination $integrityVersion -Recurse
  $critical = @(Get-DreamSkinCriticalFiles -Root $trustedSource)
  $package = [pscustomobject]@{ Version = '9.9.9'; PackageFullName = 'OpenAI.Codex_test'; SourceRoot = $trustedSource }
  Write-DreamSkinJsonAtomic -Path (Join-Path $integrityVersion '.codex-dream-skin-runtime.json') -Value @{
    schemaVersion = 1
    version = $package.Version
    packageFullName = $package.PackageFullName
    sourceRoot = $package.SourceRoot
    criticalFiles = $critical
  }
  Assert-True ($null -ne (Read-DreamSkinStandaloneRuntime -RuntimeRoot $integrityRoot -Package $package)) 'Untampered runtime should verify against the trusted source manifest.'
  Write-TestFile (Join-Path $integrityVersion 'native\guard.dll') 'tampered'
  Assert-True ($null -eq (Read-DreamSkinStandaloneRuntime -RuntimeRoot $integrityRoot -Package $package)) 'A tampered code-bearing runtime file must fail verification.'

  $ownedShortcut = Join-Path $sandbox 'owned.lnk'
  Write-TestFile $ownedShortcut 'managed'
  $ownedHash = (Get-FileHash -LiteralPath $ownedShortcut -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert-True (Remove-DreamSkinShortcutIfOwned -Path $ownedShortcut -ExpectedHash $ownedHash) 'Owned shortcut should be removed.'
  $modifiedShortcut = Join-Path $sandbox 'modified.lnk'
  Write-TestFile $modifiedShortcut 'user'
  Assert-True (-not (Remove-DreamSkinShortcutIfOwned -Path $modifiedShortcut -ExpectedHash $ownedHash)) 'Modified shortcut must be preserved.'
  Assert-True (Test-Path -LiteralPath $modifiedShortcut) 'Modified shortcut should still exist.'

  $cleanupRoot = Join-Path $sandbox 'PendingState'
  Write-TestFile (Join-Path $cleanupRoot 'engine\payload.txt') 'pending'
  $cleanupShortcut = Join-Path $sandbox 'cleanup.lnk'
  Write-TestFile $cleanupShortcut 'owned-cleanup'
  $cleanupHash = (Get-FileHash -LiteralPath $cleanupShortcut -Algorithm SHA256).Hash.ToLowerInvariant()
  [void](New-DreamSkinPendingCleanup -StateRoot $cleanupRoot -CleanupShortcutPath $cleanupShortcut -CleanupShortcutHash $cleanupHash)
  Assert-True (Complete-DreamSkinPendingCleanup -StateRoot $cleanupRoot) 'Pending cleanup should complete when no owned runtime is running.'
  Assert-True (-not (Test-Path -LiteralPath $cleanupRoot)) 'Pending cleanup must remove the owned state root.'
  Assert-True (-not (Test-Path -LiteralPath $cleanupShortcut)) 'Pending cleanup must remove its owned shortcut.'

  $ownershipText = (Get-Content -LiteralPath (Join-Path $repoRoot 'scripts\lifecycle.ps1') -Raw) + "`n" +
    (Get-Content -LiteralPath (Join-Path $repoRoot 'scripts\start-dream-skin.ps1') -Raw)
  Assert-True (-not [regex]::IsMatch($ownershipText, '(?im)Get-Process[^\r\n]*ChatGPT')) 'Lifecycle code must not enumerate Codex by Get-Process name.'
  Assert-True (-not [regex]::IsMatch($ownershipText, '(?im)Stop-Process[^\r\n]*ChatGPT')) 'Lifecycle code must not kill Codex by name.'
  Assert-True ($ownershipText.Contains('IPackageDebugSettings')) 'Store lifecycle control must use the documented Windows package interface.'
  Assert-True ($ownershipText.Contains('TerminateAllProcesses')) 'Store lifecycle control must terminate the verified package as one unit.'
  Assert-True ($ownershipText.Contains('taskkill.exe')) 'Verified process shutdown must provide a native process-tree fallback.'
  Assert-True (-not [regex]::IsMatch($ownershipText, '(?im)taskkill(?:\.exe)?[^\r\n]*/IM')) 'Native process-tree fallback must never target an image name.'
  $wrapperText = @('install-dream-skin.ps1', 'start-dream-skin.ps1', 'watch-dream-skin.ps1', 'restore-dream-skin.ps1', 'verify-dream-skin.ps1', 'set-theme.ps1') |
    ForEach-Object { Get-Content -LiteralPath (Join-Path $repoRoot "scripts\$_") -Raw } |
    Out-String
  Assert-True (-not [regex]::IsMatch($wrapperText, '(?im)Get-Command\s+node(?:\.exe)?')) 'Operational wrappers must use the verified bundled Node runtime.'

  Write-Output "windows lifecycle tests passed: $script:passed"
} finally {
  $env:LOCALAPPDATA = $originalLocalAppData
  if ((Test-Path -LiteralPath $sandbox) -and $sandbox.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase)) {
    [IO.Directory]::Delete(('\\?\' + $sandbox), $true)
  }
}
