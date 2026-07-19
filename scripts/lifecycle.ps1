Set-StrictMode -Version Latest

$script:DreamSkinEngineMarkerName = '.codex-dream-skin-engine.json'
$script:DreamSkinAutoRecoverDisabledName = 'auto-recover.disabled'
$script:DreamSkinPendingCleanupName = 'pending-cleanup.json'

function Get-DreamSkinSha256Text([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
    return [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-DreamSkinNormalizedPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Test-DreamSkinPathEqual([string]$Left, [string]$Right) {
  try {
    return [string]::Equals(
      (Get-DreamSkinNormalizedPath $Left),
      (Get-DreamSkinNormalizedPath $Right),
      [StringComparison]::OrdinalIgnoreCase
    )
  } catch {
    return $false
  }
}

function Assert-DreamSkinNoReparsePath([string]$Path, [string]$Boundary) {
  $pathFull = Get-DreamSkinNormalizedPath $Path
  $boundaryFull = Get-DreamSkinNormalizedPath $Boundary
  if (-not $pathFull -or -not $boundaryFull) { throw 'Path and boundary are required.' }
  if (-not ($pathFull -eq $boundaryFull -or $pathFull.StartsWith($boundaryFull + '\', [StringComparison]::OrdinalIgnoreCase))) {
    throw "Path escaped its boundary: $pathFull"
  }
  $cursor = $pathFull
  while ($cursor -and $cursor.Length -ge $boundaryFull.Length) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Reparse points are not accepted in a Dream Skin owned path: $cursor"
      }
    }
    if ($cursor -eq $boundaryFull) { break }
    $next = Split-Path -Parent $cursor
    if (-not $next -or $next -eq $cursor) { break }
    $cursor = Get-DreamSkinNormalizedPath $next
  }
}

function Assert-DreamSkinStateRootSafe([string]$StateRoot) {
  $local = Get-DreamSkinNormalizedPath $env:LOCALAPPDATA
  $state = Get-DreamSkinNormalizedPath $StateRoot
  if (-not $local -or -not $state.StartsWith($local + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Dream Skin state must be a child of LOCALAPPDATA: $state"
  }
  Assert-DreamSkinNoReparsePath -Path $state -Boundary $local
}

function Get-DreamSkinNodePreflight([string]$NodePath, [version]$MinimumVersion = [version]'22.4.0') {
  if ([string]::IsNullOrWhiteSpace($NodePath)) {
    $NodePath = (Get-Command node.exe -ErrorAction Stop).Source
  }
  if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw "Node.js executable was not found: $NodePath" }
  $probe = & $NodePath -e "if (typeof fetch !== 'function' || typeof WebSocket !== 'function') process.exit(7); process.stdout.write(process.versions.node)"
  if ($LASTEXITCODE -ne 0) {
    throw 'Node.js must provide global fetch and WebSocket without experimental flags.'
  }
  $version = $null
  if (-not [version]::TryParse(([string]$probe).Trim(), [ref]$version) -or $version -lt $MinimumVersion) {
    throw "Node.js $MinimumVersion or newer is required; found $probe."
  }
  return [pscustomobject]@{ Path = (Get-DreamSkinNormalizedPath $NodePath); Version = $version.ToString() }
}

function Get-DreamSkinDirectoryBytes([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return [long]0 }
  $rootFull = Get-DreamSkinNormalizedPath $Path
  Assert-DreamSkinNoReparsePath -Path $rootFull -Boundary $rootFull
  $extendedRoot = if ($rootFull.StartsWith('\\?\')) { $rootFull } else { '\\?\' + $rootFull }
  $directories = [Collections.Generic.Stack[string]]::new()
  $directories.Push($extendedRoot)
  $sum = [long]0
  while ($directories.Count -gt 0) {
    $current = $directories.Pop()
    foreach ($directory in [IO.Directory]::EnumerateDirectories($current)) {
      $attributes = [IO.File]::GetAttributes($directory)
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Directory-size scan refuses reparse point: $directory"
      }
      $directories.Push($directory)
    }
    foreach ($file in [IO.Directory]::EnumerateFiles($current)) {
      $attributes = [IO.File]::GetAttributes($file)
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Directory-size scan refuses reparse point: $file"
      }
      $sum += [long]([IO.FileInfo]::new($file).Length)
    }
  }
  return $sum
}

function Assert-DreamSkinDiskSpace([string]$Destination, [long]$RequiredBytes) {
  $root = [IO.Path]::GetPathRoot((Get-DreamSkinNormalizedPath $Destination))
  $drive = [IO.DriveInfo]::new($root)
  if (-not $drive.IsReady) { throw "Destination drive is not ready: $root" }
  if ([long]$drive.AvailableFreeSpace -lt $RequiredBytes) {
    $needGiB = [Math]::Round($RequiredBytes / 1GB, 2)
    $freeGiB = [Math]::Round([long]$drive.AvailableFreeSpace / 1GB, 2)
    throw "Insufficient free space for Dream Skin: need $needGiB GiB, available $freeGiB GiB."
  }
}

function ConvertTo-DreamSkinProcessIdentity([object]$CimProcess, [object]$Process) {
  if (-not $CimProcess -or -not $Process) { return $null }
  $commandLine = [string]$CimProcess.CommandLine
  $executablePath = [string]$CimProcess.ExecutablePath
  if ([string]::IsNullOrWhiteSpace($executablePath)) {
    try { $executablePath = [string]$Process.Path } catch { return $null }
  }
  try { $startTime = $Process.StartTime.ToUniversalTime().ToString('o') } catch { return $null }
  return [ordered]@{
    processId = [int]$Process.Id
    startTimeUtc = $startTime
    executablePath = Get-DreamSkinNormalizedPath $executablePath
    commandLineSha256 = Get-DreamSkinSha256Text $commandLine
  }
}

function Get-DreamSkinProcessIdentity([int]$ProcessId) {
  try {
    $process = Get-Process -Id $ProcessId -ErrorAction Stop
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    return ConvertTo-DreamSkinProcessIdentity -CimProcess $cim -Process $process
  } catch {
    return $null
  }
}

function Test-DreamSkinProcessIdentity([object]$Expected, [object]$Current) {
  if (-not $Expected -or -not $Current) { return $false }
  foreach ($field in @('processId', 'startTimeUtc', 'executablePath', 'commandLineSha256')) {
    if ($Expected.PSObject.Properties.Name -notcontains $field -or $Current.PSObject.Properties.Name -notcontains $field) { return $false }
  }
  return [int]$Expected.processId -eq [int]$Current.processId -and
    [string]$Expected.startTimeUtc -eq [string]$Current.startTimeUtc -and
    (Test-DreamSkinPathEqual ([string]$Expected.executablePath) ([string]$Current.executablePath)) -and
    [string]$Expected.commandLineSha256 -eq [string]$Current.commandLineSha256
}

function Stop-DreamSkinOwnedProcess([object]$Expected, [switch]$Force) {
  if (-not $Expected) { return $false }
  $current = Get-DreamSkinProcessIdentity -ProcessId ([int]$Expected.processId)
  if (-not (Test-DreamSkinProcessIdentity -Expected $Expected -Current $current)) { return $false }
  try {
    $process = Get-Process -Id ([int]$Expected.processId) -ErrorAction Stop
    if ($process.StartTime.ToUniversalTime().ToString('o') -ne [string]$Expected.startTimeUtc) { return $false }
    if ($Force) {
      $process.Kill()
      if (-not $process.WaitForExit(5000)) { return $false }
    } else {
      [void]$process.CloseMainWindow()
    }
    return $true
  } catch {
    return $false
  }
}

function Get-DreamSkinProcessStateStatus([string]$StatePath, [string]$IdentityProperty) {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
    return [pscustomobject]@{ Status = 'missing'; Expected = $null; Current = $null }
  }
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($state.PSObject.Properties.Name -notcontains $IdentityProperty -or -not $state.$IdentityProperty) {
      return [pscustomobject]@{ Status = 'invalid'; Expected = $null; Current = $null }
    }
    $expected = $state.$IdentityProperty
    foreach ($field in @('processId', 'startTimeUtc', 'executablePath', 'commandLineSha256')) {
      if ($expected.PSObject.Properties.Name -notcontains $field) {
        return [pscustomobject]@{ Status = 'invalid'; Expected = $expected; Current = $null }
      }
    }
    $current = Get-DreamSkinProcessIdentity -ProcessId ([int]$expected.processId)
    $status = if (Test-DreamSkinProcessIdentity -Expected $expected -Current $current) { 'owned-running' } else { 'stale' }
    return [pscustomobject]@{ Status = $status; Expected = $expected; Current = $current }
  } catch {
    return [pscustomobject]@{ Status = 'invalid'; Expected = $null; Current = $null }
  }
}

function Convert-DreamSkinLegacyProcessState(
  [string]$StatePath,
  [string]$IdentityProperty,
  [string]$PidProperty,
  [string[]]$ExpectedExecutableNames,
  [string[]]$RequiredCommandTokens,
  [scriptblock]$IdentityResolver = { param($Id) Get-DreamSkinProcessIdentity -ProcessId $Id },
  [scriptblock]$ProcessRecordResolver = { param($Id) Get-CimInstance Win32_Process -Filter "ProcessId = $Id" -ErrorAction Stop }
) {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { return $false }
  $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  if ($state.PSObject.Properties.Name -contains $IdentityProperty -and $state.$IdentityProperty) { return $true }
  if ($state.PSObject.Properties.Name -notcontains $PidProperty) {
    throw "Legacy process state has no ownership identity or PID: $StatePath"
  }
  $processId = [int]$state.$PidProperty
  $current = & $IdentityResolver $processId
  if (-not $current) {
    Remove-Item -LiteralPath $StatePath -Force
    return $false
  }
  $executableName = [IO.Path]::GetFileName([string]$current.executablePath)
  if ($ExpectedExecutableNames -notcontains $executableName) {
    throw "Legacy process PID belongs to an unexpected executable; refusing to stop it: $executableName"
  }
  $cim = & $ProcessRecordResolver $processId
  $commandLine = [string]$cim.CommandLine
  $scriptCandidates = @()
  if ($state.PSObject.Properties.Name -contains 'scriptPath' -and $state.scriptPath) {
    $scriptCandidates += [string]$state.scriptPath
  }
  if ($state.PSObject.Properties.Name -contains 'skillRoot' -and $state.skillRoot) {
    $leaf = if ($IdentityProperty -eq 'injectorIdentity') { 'injector.mjs' } else { 'watch-dream-skin.ps1' }
    $scriptCandidates += Join-Path ([string]$state.skillRoot) ('scripts\' + $leaf)
  }
  $scriptMatched = @($scriptCandidates | Where-Object {
    $candidate = [string]$_
    $candidate -and $commandLine.IndexOf($candidate, [StringComparison]::OrdinalIgnoreCase) -ge 0
  }).Count -gt 0
  $tokensMatched = @($RequiredCommandTokens | Where-Object {
    $commandLine.IndexOf([string]$_, [StringComparison]::OrdinalIgnoreCase) -lt 0
  }).Count -eq 0
  if (-not $scriptMatched -or -not $tokensMatched) {
    throw "Legacy process command line does not prove Dream Skin ownership; refusing to stop PID $processId."
  }
  $state | Add-Member -Force -NotePropertyName $IdentityProperty -NotePropertyValue $current
  Write-DreamSkinJsonAtomic -Path $StatePath -Value $state
  return $true
}

function Stop-DreamSkinProcessStateSafely([string]$StatePath, [string]$IdentityProperty, [switch]$Force) {
  $stateStatus = Get-DreamSkinProcessStateStatus -StatePath $StatePath -IdentityProperty $IdentityProperty
  if ($stateStatus.Status -eq 'missing') { return $false }
  if ($stateStatus.Status -eq 'invalid') {
    throw "Process state is unreadable or incomplete; refusing an ambiguous stop: $StatePath"
  }
  if ($stateStatus.Status -eq 'stale') {
    Remove-Item -LiteralPath $StatePath -Force
    return $false
  }
  if (-not (Stop-DreamSkinOwnedProcess -Expected $stateStatus.Expected -Force:$Force)) {
    throw "Verified Dream Skin process did not exit: $($stateStatus.Expected.processId)"
  }
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $remaining = Get-DreamSkinProcessStateStatus -StatePath $StatePath -IdentityProperty $IdentityProperty
    if ($remaining.Status -ne 'owned-running') {
      Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
      return $true
    }
    Start-Sleep -Milliseconds 100
  }
  throw "Verified Dream Skin process remained alive after stop: $($stateStatus.Expected.processId)"
}

function Stop-DreamSkinProcessFromState([string]$StatePath, [string]$IdentityProperty, [switch]$Force) {
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { return $false }
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ($state.PSObject.Properties.Name -notcontains $IdentityProperty) { return $false }
    return Stop-DreamSkinOwnedProcess -Expected $state.$IdentityProperty -Force:$Force
  } catch {
    return $false
  }
}

function Get-DreamSkinOwnedRuntimeExecutables([string]$StateRoot) {
  $runtimeRoot = Join-Path $StateRoot 'runtime'
  if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) { return @() }
  Assert-DreamSkinNoReparsePath -Path $runtimeRoot -Boundary $StateRoot
  $paths = @()
  foreach ($directory in @(Get-ChildItem -LiteralPath $runtimeRoot -Directory -Force -ErrorAction SilentlyContinue)) {
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $marker = Join-Path $directory.FullName '.codex-dream-skin-runtime.json'
    $executable = Join-Path $directory.FullName 'ChatGPT.exe'
    if ((Test-Path -LiteralPath $marker -PathType Leaf) -and (Test-Path -LiteralPath $executable -PathType Leaf)) {
      try {
        Assert-DreamSkinNoReparsePath -Path $executable -Boundary $runtimeRoot
        $paths += Get-DreamSkinNormalizedPath $executable
      } catch {}
    }
  }
  return @($paths | Sort-Object -Unique)
}

function Get-DreamSkinTrustedCodexProcesses([string[]]$ExecutablePaths, [switch]$VisibleOnly) {
  $allowed = @{}
  foreach ($path in @($ExecutablePaths)) {
    if (-not [string]::IsNullOrWhiteSpace($path)) { $allowed[(Get-DreamSkinNormalizedPath $path).ToLowerInvariant()] = $true }
  }
  if ($allowed.Count -eq 0) { return @() }
  $records = @()
  try { $candidates = @(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" -ErrorAction Stop) }
  catch { throw "Unable to inspect process executable paths safely: $($_.Exception.Message)" }
  foreach ($candidate in $candidates) {
    $path = [string]$candidate.ExecutablePath
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    try { $key = (Get-DreamSkinNormalizedPath $path).ToLowerInvariant() } catch { continue }
    if (-not $allowed.ContainsKey($key)) { continue }
    try {
      $process = Get-Process -Id ([int]$candidate.ProcessId) -ErrorAction Stop
      if ($VisibleOnly -and $process.MainWindowHandle -eq 0) { continue }
      $identity = ConvertTo-DreamSkinProcessIdentity -CimProcess $candidate -Process $process
      if ($identity) { $records += [pscustomobject]@{ Process = $process; Identity = $identity; ExecutablePath = $path } }
    } catch {}
  }
  return @($records)
}

function Stop-DreamSkinTrustedCodexProcesses([string[]]$ExecutablePaths) {
  $visible = @(Get-DreamSkinTrustedCodexProcesses -ExecutablePaths $ExecutablePaths -VisibleOnly)
  foreach ($record in $visible) { [void](Stop-DreamSkinOwnedProcess -Expected $record.Identity) }
  Start-Sleep -Seconds 2
  $deadline = (Get-Date).AddSeconds(12)
  $observedEmpty = $false
  while ((Get-Date) -lt $deadline) {
    $remaining = @(Get-DreamSkinTrustedCodexProcesses -ExecutablePaths $ExecutablePaths)
    if ($remaining.Count -eq 0) {
      if ($observedEmpty) { return }
      $observedEmpty = $true
      Start-Sleep -Milliseconds 900
      continue
    }
    $observedEmpty = $false
    foreach ($record in $remaining) { [void](Stop-DreamSkinOwnedProcess -Expected $record.Identity -Force) }
    Start-Sleep -Milliseconds 300
  }
  if (@(Get-DreamSkinTrustedCodexProcesses -ExecutablePaths $ExecutablePaths).Count -gt 0) {
    throw 'Verified Codex processes did not exit; refusing to target processes by name.'
  }
}

function Test-DreamSkinRuntimeInUse([string]$StateRoot) {
  $executables = @(Get-DreamSkinOwnedRuntimeExecutables -StateRoot $StateRoot)
  if ($executables.Count -eq 0) { return $false }
  try { return @(Get-DreamSkinTrustedCodexProcesses -ExecutablePaths $executables).Count -gt 0 }
  catch { return $true }
}

function Remove-DreamSkinObsoleteRuntimes(
  [string]$StateRoot,
  [string[]]$KeepRoots,
  [scriptblock]$InUseEvaluator
) {
  $runtimeRoot = Join-Path $StateRoot 'runtime'
  if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) { return @() }
  Assert-DreamSkinNoReparsePath -Path $runtimeRoot -Boundary $StateRoot
  $keep = @{}
  foreach ($root in @($KeepRoots)) { if ($root) { $keep[(Get-DreamSkinNormalizedPath $root).ToLowerInvariant()] = $true } }
  $removed = @()
  foreach ($directory in @(Get-ChildItem -LiteralPath $runtimeRoot -Directory -Force)) {
    $normalized = Get-DreamSkinNormalizedPath $directory.FullName
    if ($keep.ContainsKey($normalized.ToLowerInvariant()) -or $directory.Name.StartsWith('.')) { continue }
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
    $marker = Join-Path $normalized '.codex-dream-skin-runtime.json'
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { continue }
    $executable = Join-Path $normalized 'ChatGPT.exe'
    $inUse = if ($InUseEvaluator) {
      [bool](& $InUseEvaluator $executable)
    } else {
      @(Get-DreamSkinTrustedCodexProcesses -ExecutablePaths @($executable)).Count -gt 0
    }
    if ($inUse) { continue }
    Assert-DreamSkinNoReparsePath -Path $normalized -Boundary $runtimeRoot
    Remove-Item -LiteralPath $normalized -Recurse -Force
    $removed += $normalized
  }
  return @($removed)
}

function Get-DreamSkinRelativePath([string]$Root, [string]$Path) {
  $rootFull = (Get-DreamSkinNormalizedPath $Root) + '\'
  $pathFull = Get-DreamSkinNormalizedPath $Path
  if (-not $pathFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "File escaped engine source root: $pathFull"
  }
  return $pathFull.Substring($rootFull.Length).Replace('\', '/')
}

function Get-DreamSkinEngineManifest([string]$SourceRoot) {
  $source = Get-DreamSkinNormalizedPath $SourceRoot
  $topLevel = @('scripts', 'assets', 'styles', 'themes', 'themes-private')
  $records = @()
  foreach ($name in $topLevel) {
    $directory = Join-Path $source $name
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { continue }
    Assert-DreamSkinNoReparsePath -Path $directory -Boundary $source
    foreach ($item in @(Get-ChildItem -LiteralPath $directory -Recurse -Force -ErrorAction Stop)) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Engine snapshot refuses reparse point: $($item.FullName)"
      }
      if ($item.PSIsContainer) { continue }
      $records += [ordered]@{
        path = Get-DreamSkinRelativePath -Root $source -Path $item.FullName
        length = [long]$item.Length
        sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    }
  }
  $records = @($records | Sort-Object path)
  if (-not @($records | Where-Object { $_.path -eq 'scripts/start-dream-skin.ps1' }).Count -or
      -not @($records | Where-Object { $_.path -eq 'scripts/watch-dream-skin.ps1' }).Count -or
      -not @($records | Where-Object { $_.path -eq 'scripts/restore-dream-skin.ps1' }).Count -or
      -not @($records | Where-Object { $_.path -eq 'scripts/injector.mjs' }).Count) {
    throw 'Engine source is missing required lifecycle or injector files.'
  }
  $fingerprint = ($records | ForEach-Object { "$($_.path)|$($_.length)|$($_.sha256)" }) -join "`n"
  $totalBytes = [long]0
  foreach ($record in $records) { $totalBytes += [long]$record.length }
  return [pscustomobject]@{
    SnapshotId = Get-DreamSkinSha256Text $fingerprint
    Files = $records
    TotalBytes = $totalBytes
  }
}

function Test-DreamSkinEngineSnapshot([string]$EngineRoot, [object]$Manifest) {
  $markerPath = Join-Path $EngineRoot $script:DreamSkinEngineMarkerName
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { return $false }
  try {
    Assert-DreamSkinNoReparsePath -Path $EngineRoot -Boundary (Split-Path -Parent $EngineRoot)
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ([int]$marker.schemaVersion -ne 1 -or [string]$marker.snapshotId -ne [string]$Manifest.SnapshotId) { return $false }
    $actualFiles = @()
    foreach ($item in @(Get-ChildItem -LiteralPath $EngineRoot -Recurse -Force -ErrorAction Stop)) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { return $false }
      if ($item.PSIsContainer -or $item.FullName -eq $markerPath) { continue }
      $actualFiles += Get-DreamSkinRelativePath -Root $EngineRoot -Path $item.FullName
    }
    $actualFiles = @($actualFiles | Sort-Object -Unique)
    $expectedFiles = @($Manifest.Files | ForEach-Object { [string]$_.path } | Sort-Object -Unique)
    if (($actualFiles -join "`n") -ne ($expectedFiles -join "`n")) { return $false }
    foreach ($record in @($Manifest.Files)) {
      $relative = ([string]$record.path).Replace('/', '\')
      $path = Join-Path $EngineRoot $relative
      Assert-DreamSkinNoReparsePath -Path $path -Boundary $EngineRoot
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $false }
      $item = Get-Item -LiteralPath $path -Force
      if ([long]$item.Length -ne [long]$record.length) { return $false }
      if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$record.sha256) { return $false }
    }
    return $true
  } catch {
    return $false
  }
}

function Install-DreamSkinEngineSnapshot([string]$SourceRoot, [string]$StateRoot, [object]$Manifest) {
  Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
  $engineParent = Join-Path $StateRoot 'engine'
  New-Item -ItemType Directory -Force -Path $engineParent | Out-Null
  Assert-DreamSkinNoReparsePath -Path $engineParent -Boundary $StateRoot
  $versionName = 'sha256-' + ([string]$Manifest.SnapshotId).Substring(0, 20)
  $versionRoot = Join-Path $engineParent $versionName
  if (Test-DreamSkinEngineSnapshot -EngineRoot $versionRoot -Manifest $Manifest) {
    return [pscustomobject]@{ Root = $versionRoot; SnapshotId = $Manifest.SnapshotId; Version = $versionName }
  }
  if (Test-Path -LiteralPath $versionRoot) {
    $marker = Join-Path $versionRoot $script:DreamSkinEngineMarkerName
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw "Refusing to replace unowned engine directory: $versionRoot" }
  }
  $staging = Join-Path $engineParent ('.staging-' + [guid]::NewGuid().ToString('N'))
  $retired = $null
  try {
    New-Item -ItemType Directory -Path $staging | Out-Null
    foreach ($record in @($Manifest.Files)) {
      $relative = ([string]$record.path).Replace('/', '\')
      $source = Join-Path $SourceRoot $relative
      $destination = Join-Path $staging $relative
      $destinationDirectory = Split-Path -Parent $destination
      New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
      Copy-Item -LiteralPath $source -Destination $destination
      if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$record.sha256) {
        throw "Engine snapshot verification failed: $relative"
      }
    }
    $marker = [ordered]@{
      schemaVersion = 1
      snapshotId = $Manifest.SnapshotId
      createdAt = (Get-Date).ToString('o')
      files = $Manifest.Files
    }
    Write-DreamSkinJsonAtomic -Path (Join-Path $staging $script:DreamSkinEngineMarkerName) -Value $marker
    if (Test-Path -LiteralPath $versionRoot) {
      $retired = Join-Path $engineParent ('.retired-' + [guid]::NewGuid().ToString('N'))
      Move-Item -LiteralPath $versionRoot -Destination $retired
    }
    Move-Item -LiteralPath $staging -Destination $versionRoot
    $staging = $null
    if (-not (Test-DreamSkinEngineSnapshot -EngineRoot $versionRoot -Manifest $Manifest)) {
      throw 'Installed engine snapshot failed final verification.'
    }
    if ($retired -and (Test-Path -LiteralPath $retired)) { Remove-Item -LiteralPath $retired -Recurse -Force }
    return [pscustomobject]@{ Root = $versionRoot; SnapshotId = $Manifest.SnapshotId; Version = $versionName }
  } catch {
    if ($retired -and (Test-Path -LiteralPath $retired) -and -not (Test-Path -LiteralPath $versionRoot)) {
      Move-Item -LiteralPath $retired -Destination $versionRoot -ErrorAction SilentlyContinue
      $retired = $null
    }
    throw
  } finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
    if ($retired -and (Test-Path -LiteralPath $retired)) { Remove-Item -LiteralPath $retired -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

function Get-DreamSkinDesktopSection([string]$Content, [switch]$Create) {
  $match = [regex]::Match($Content, '(?ms)^\[desktop\][ \t]*\r?\n(?<body>.*?)(?=^\[|\z)')
  if (-not $match.Success -and $Create) {
    $Content = $Content.TrimEnd() + "`r`n`r`n[desktop]`r`n"
    $match = [regex]::Match($Content, '(?ms)^\[desktop\][ \t]*\r?\n(?<body>.*?)(?=^\[|\z)')
  }
  return [pscustomobject]@{ Content = $Content; Match = $match; Exists = $match.Success }
}

function Set-DreamSkinDesktopSettings([string]$Content, [Collections.IDictionary]$Settings) {
  $section = Get-DreamSkinDesktopSection -Content $Content -Create
  $body = $section.Match.Groups['body'].Value
  $changes = @()
  foreach ($key in $Settings.Keys) {
    $pattern = "(?m)^$([regex]::Escape([string]$key))\s*=.*$"
    $before = [regex]::Match($body, $pattern)
    $changes += [ordered]@{
      key = [string]$key
      existed = $before.Success
      beforeValue = if ($before.Success) { $before.Value.TrimEnd([char]13) } else { $null }
      installedValue = [string]$Settings[$key]
    }
    if ($before.Success) {
      $replacement = [string]$Settings[$key]
      $body = [regex]::Replace($body, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement }, 1)
    } else {
      $body = $body.TrimEnd() + "`r`n" + [string]$Settings[$key] + "`r`n"
    }
  }
  $start = $section.Match.Groups['body'].Index
  $length = $section.Match.Groups['body'].Length
  $next = $section.Content.Substring(0, $start) + $body + $section.Content.Substring($start + $length)
  return [pscustomobject]@{ Content = $next; Changes = $changes }
}

function Restore-DreamSkinDesktopSettings([string]$Content, [object[]]$Changes) {
  $section = Get-DreamSkinDesktopSection -Content $Content
  $warnings = @()
  if (-not $section.Exists) {
    return [pscustomobject]@{ Content = $Content; Warnings = @('Desktop section is missing; no settings were changed.') }
  }
  $body = $section.Match.Groups['body'].Value
  foreach ($change in @($Changes)) {
    $key = [string]$change.key
    $pattern = "(?m)^$([regex]::Escape($key))\s*=.*(?:\r?\n)?"
    $current = [regex]::Match($body, $pattern)
    $currentLine = if ($current.Success) { $current.Value.TrimEnd([char]13, [char]10) } else { $null }
    if ($currentLine -ne [string]$change.installedValue) {
      $warnings += "Preserved user-modified setting: $key"
      continue
    }
    $replacement = if ([bool]$change.existed) { [string]$change.beforeValue + [Environment]::NewLine } else { '' }
    $body = [regex]::Replace($body, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement }, 1)
  }
  $start = $section.Match.Groups['body'].Index
  $length = $section.Match.Groups['body'].Length
  $next = $section.Content.Substring(0, $start) + $body + $section.Content.Substring($start + $length)
  return [pscustomobject]@{ Content = $next; Warnings = $warnings }
}

function Set-DreamSkinAutoRecoverDisabled([string]$StateRoot, [bool]$Disabled) {
  Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
  $path = Join-Path $StateRoot $script:DreamSkinAutoRecoverDisabledName
  if ($Disabled) {
    Write-DreamSkinTextAtomic -Path $path -Content ((Get-Date).ToString('o'))
  } else {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  }
}

function Test-DreamSkinAutoRecoverDisabled([string]$StateRoot) {
  return Test-Path -LiteralPath (Join-Path $StateRoot $script:DreamSkinAutoRecoverDisabledName) -PathType Leaf
}

function New-DreamSkinPendingCleanup([string]$StateRoot, [string]$CleanupShortcutPath, [string]$CleanupShortcutHash) {
  Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
  $record = [ordered]@{
    schemaVersion = 1
    createdAt = (Get-Date).ToString('o')
    cleanupShortcutPath = $CleanupShortcutPath
    cleanupShortcutHash = $CleanupShortcutHash
  }
  Write-DreamSkinJsonAtomic -Path (Join-Path $StateRoot $script:DreamSkinPendingCleanupName) -Value $record
  return $record
}

function Remove-DreamSkinShortcutIfOwned([string]$Path, [string]$ExpectedHash) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $true }
  if (-not $ExpectedHash) { return $false }
  $current = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($current -ne $ExpectedHash.ToLowerInvariant()) { return $false }
  Remove-Item -LiteralPath $Path -Force
  return $true
}

function Complete-DreamSkinPendingCleanup([string]$StateRoot) {
  Assert-DreamSkinStateRootSafe -StateRoot $StateRoot
  $pendingPath = Join-Path $StateRoot $script:DreamSkinPendingCleanupName
  if (-not (Test-Path -LiteralPath $pendingPath -PathType Leaf)) { return $true }
  if (Test-DreamSkinRuntimeInUse -StateRoot $StateRoot) { return $false }
  $pending = Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json
  Remove-Item -LiteralPath $StateRoot -Recurse -Force
  [void](Remove-DreamSkinShortcutIfOwned -Path ([string]$pending.cleanupShortcutPath) -ExpectedHash ([string]$pending.cleanupShortcutHash))
  return $true
}
