Set-StrictMode -Version Latest

if (-not (Get-Command Assert-DreamSkinNoReparsePath -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'lifecycle.ps1')
}

$script:DreamSkinExpectedPublisherId = '2p2nqsd0c76g0'
$script:DreamSkinRuntimeMarkerName = '.codex-dream-skin-runtime.json'

function Resolve-DreamSkinContainedPath([string]$Path, [string]$Parent, [string]$Purpose) {
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $pathFull = [IO.Path]::GetFullPath($Path)
  if (-not $pathFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Purpose escaped its verified parent directory: $pathFull"
  }
  Assert-DreamSkinNoReparsePath -Path $pathFull -Boundary $Parent
  return $pathFull
}

function Get-TrustedCodexStorePackage {
  $package = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
  if (-not $package) { throw 'The OpenAI.Codex Store package is not installed.' }
  if ($package.Name -ne 'OpenAI.Codex' -or
      $package.PublisherId -ne $script:DreamSkinExpectedPublisherId -or
      [string]$package.SignatureKind -ne 'Store' -or
      [string]$package.Status -ne 'Ok') {
    throw "Codex Store package identity is not trusted: $($package.PackageFullName)"
  }

  $packageRoot = [IO.Path]::GetFullPath([string]$package.InstallLocation)
  $sourceRoot = Resolve-DreamSkinContainedPath -Path (Join-Path $packageRoot 'app') -Parent $packageRoot -Purpose 'Codex app payload'
  $executable = Resolve-DreamSkinContainedPath -Path (Join-Path $sourceRoot 'ChatGPT.exe') -Parent $sourceRoot -Purpose 'Codex executable'
  $asar = Resolve-DreamSkinContainedPath -Path (Join-Path $sourceRoot 'resources\app.asar') -Parent $sourceRoot -Purpose 'Codex application archive'
  $nodeExecutable = Resolve-DreamSkinContainedPath -Path (Join-Path $sourceRoot 'resources\cua_node\bin\node.exe') -Parent $sourceRoot -Purpose 'Bundled Node executable'
  foreach ($criticalPath in @($executable, $asar, $nodeExecutable)) {
    if (-not (Test-Path -LiteralPath $criticalPath -PathType Leaf)) { throw "Codex package is missing a critical file: $criticalPath" }
  }

  # Store apps are signed at the MSIX package/catalog level; the inner Chromium
  # executable may legitimately report NotSigned. Any other state still fails.
  $signature = Get-AuthenticodeSignature -LiteralPath $executable
  if ($signature.Status -notin @('Valid', 'NotSigned')) {
    throw "Codex executable signature state is not accepted: $($signature.Status)"
  }
  $nodeSignature = Get-AuthenticodeSignature -LiteralPath $nodeExecutable
  if ($nodeSignature.Status -ne 'Valid') {
    throw "Bundled Node executable signature is not valid: $($nodeSignature.Status)"
  }

  return [pscustomobject]@{
    Version = [string]$package.Version
    PackageFullName = [string]$package.PackageFullName
    PublisherId = [string]$package.PublisherId
    SourceRoot = $sourceRoot
    Executable = $executable
    Asar = $asar
    NodeExecutable = $nodeExecutable
  }
}

function Get-DreamSkinCriticalRelativePaths([string]$Root) {
  $extensions = @('.exe', '.dll', '.node', '.asar', '.bin', '.pak', '.dat')
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  Assert-DreamSkinNoReparsePath -Path $rootFull -Boundary $rootFull
  $extendedRoot = if ($rootFull.StartsWith('\\?\')) { $rootFull } else { '\\?\' + $rootFull }
  $directories = [Collections.Generic.Stack[string]]::new()
  $directories.Push($extendedRoot)
  $relativePaths = @()
  while ($directories.Count -gt 0) {
    $current = $directories.Pop()
    foreach ($directory in [IO.Directory]::EnumerateDirectories($current)) {
      $attributes = [IO.File]::GetAttributes($directory)
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Runtime manifest refuses reparse point: $directory"
      }
      $directories.Push($directory)
    }
    foreach ($file in [IO.Directory]::EnumerateFiles($current)) {
      $attributes = [IO.File]::GetAttributes($file)
      if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Runtime manifest refuses reparse point: $file"
      }
      if ($extensions -notcontains [IO.Path]::GetExtension($file).ToLowerInvariant()) { continue }
      $relativePaths += $file.Substring($extendedRoot.Length).TrimStart('\')
    }
  }
  $relativePaths = @($relativePaths | Sort-Object -Unique)
  foreach ($required in @('ChatGPT.exe', 'resources\app.asar', 'resources\cua_node\bin\node.exe')) {
    if ($relativePaths -notcontains $required) { throw "Runtime is missing a critical file: $required" }
  }
  return @($relativePaths)
}

function Get-DreamSkinCriticalFiles([string]$Root) {
  $relativePaths = @(Get-DreamSkinCriticalRelativePaths -Root $Root)
  $records = @()
  foreach ($relativePath in $relativePaths) {
    $fullPath = Resolve-DreamSkinContainedPath -Path (Join-Path $Root $relativePath) -Parent $Root -Purpose 'Runtime critical file'
    $ioPath = if ($fullPath.StartsWith('\\?\')) { $fullPath } else { '\\?\' + $fullPath }
    if (-not [IO.File]::Exists($ioPath)) { throw "Runtime is missing a critical file: $fullPath" }
    $item = [IO.FileInfo]::new($ioPath)
    $records += [ordered]@{
      path = $relativePath
      length = [long]$item.Length
      sha256 = (Get-FileHash -LiteralPath $ioPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  return @($records)
}

function Test-DreamSkinCriticalFiles([string]$Root, [object[]]$Expected) {
  try {
    $actualPaths = @(Get-DreamSkinCriticalRelativePaths -Root $Root)
    $expectedPaths = @($Expected | ForEach-Object { [string]$_.path } | Sort-Object -Unique)
    if (($actualPaths -join "`n") -ne ($expectedPaths -join "`n")) { return $false }
    foreach ($record in @($Expected)) {
      $relativePath = [string]$record.path
      if ([string]::IsNullOrWhiteSpace($relativePath)) { return $false }
      $fullPath = Resolve-DreamSkinContainedPath -Path (Join-Path $Root $relativePath) -Parent $Root -Purpose 'Runtime marker file'
      $ioPath = if ($fullPath.StartsWith('\\?\')) { $fullPath } else { '\\?\' + $fullPath }
      if (-not [IO.File]::Exists($ioPath)) { return $false }
      $item = [IO.FileInfo]::new($ioPath)
      if ([long]$item.Length -ne [long]$record.length) { return $false }
      $hash = (Get-FileHash -LiteralPath $ioPath -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($hash -ne ([string]$record.sha256).ToLowerInvariant()) { return $false }
    }
    return $true
  } catch {
    return $false
  }
}

function Read-DreamSkinStandaloneRuntime([string]$RuntimeRoot, [object]$Package) {
  $versionRoot = Resolve-DreamSkinContainedPath -Path (Join-Path $RuntimeRoot $Package.Version) -Parent $RuntimeRoot -Purpose 'Versioned runtime'
  $markerPath = Join-Path $versionRoot $script:DreamSkinRuntimeMarkerName
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { return $null }
  try {
    $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ([int]$marker.schemaVersion -ne 1 -or
        [string]$marker.packageFullName -ne $Package.PackageFullName -or
        [string]$marker.version -ne $Package.Version -or
        [string]$marker.sourceRoot -ne $Package.SourceRoot) { return $null }
    # PackageFullName and SourceRoot come from the verified Store package. The
    # source was fully hashed when this marker was created; rehashing the same
    # 1+ GiB read-only Store payload on every launch only doubles startup work.
    if (-not (Test-DreamSkinCriticalFiles -Root $versionRoot -Expected @($marker.criticalFiles))) { return $null }
    return [pscustomobject]@{
      Root = $versionRoot
      Executable = Join-Path $versionRoot 'ChatGPT.exe'
      NodeExecutable = Join-Path $versionRoot 'resources\cua_node\bin\node.exe'
      Version = $Package.Version
      PackageFullName = $Package.PackageFullName
      MarkerPath = $markerPath
    }
  } catch {
    return $null
  }
}

function Get-DreamSkinStandaloneRuntime([string]$StateRoot) {
  $package = Get-TrustedCodexStorePackage
  $runtimeRoot = Resolve-DreamSkinContainedPath -Path (Join-Path $StateRoot 'runtime') -Parent $StateRoot -Purpose 'Standalone runtime root'
  return Read-DreamSkinStandaloneRuntime -RuntimeRoot $runtimeRoot -Package $package
}

function Ensure-DreamSkinStandaloneRuntime([string]$StateRoot) {
  $package = Get-TrustedCodexStorePackage
  $runtimeRoot = Resolve-DreamSkinContainedPath -Path (Join-Path $StateRoot 'runtime') -Parent $StateRoot -Purpose 'Standalone runtime root'
  New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
  $existing = Read-DreamSkinStandaloneRuntime -RuntimeRoot $runtimeRoot -Package $package
  if ($existing) {
    try { Remove-DreamSkinObsoleteRuntimes -StateRoot $StateRoot -KeepRoots @($existing.Root) | Out-Null }
    catch { Write-Warning "Skipped obsolete runtime cleanup: $($_.Exception.Message)" }
    return $existing
  }

  $versionRoot = Resolve-DreamSkinContainedPath -Path (Join-Path $runtimeRoot $package.Version) -Parent $runtimeRoot -Purpose 'Versioned runtime'
  $staging = Resolve-DreamSkinContainedPath -Path (Join-Path $runtimeRoot ('.staging-' + [guid]::NewGuid().ToString('N'))) -Parent $runtimeRoot -Purpose 'Runtime staging directory'
  $retired = $null
  $copyLog = Join-Path $StateRoot ('runtime-copy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
  try {
    New-Item -ItemType Directory -Path $staging | Out-Null
    & robocopy.exe $package.SourceRoot $staging /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /XJ /NP /NFL /NDL "/LOG:$copyLog" | Out-Null
    $copyExitCode = $LASTEXITCODE
    if ($copyExitCode -ge 8) { throw "Codex standalone runtime copy failed with robocopy exit code $copyExitCode. See $copyLog" }

    $sourceCritical = @(Get-DreamSkinCriticalFiles -Root $package.SourceRoot)
    if (-not (Test-DreamSkinCriticalFiles -Root $staging -Expected $sourceCritical)) {
      throw 'Standalone runtime verification failed: copied critical files do not match the trusted Store package.'
    }
    $marker = [ordered]@{
      schemaVersion = 1
      createdAt = (Get-Date).ToString('o')
      version = $package.Version
      packageFullName = $package.PackageFullName
      publisherId = $package.PublisherId
      sourceRoot = $package.SourceRoot
      criticalFiles = $sourceCritical
    }
    Write-DreamSkinJsonAtomic -Path (Join-Path $staging $script:DreamSkinRuntimeMarkerName) -Value $marker

    if (Test-Path -LiteralPath $versionRoot) {
      $ownedMarker = Join-Path $versionRoot $script:DreamSkinRuntimeMarkerName
      if (-not (Test-Path -LiteralPath $ownedMarker -PathType Leaf)) {
        throw "Refusing to replace an unowned runtime directory: $versionRoot"
      }
      $retired = Resolve-DreamSkinContainedPath -Path (Join-Path $runtimeRoot ('.retired-' + [guid]::NewGuid().ToString('N'))) -Parent $runtimeRoot -Purpose 'Retired runtime directory'
      Move-Item -LiteralPath $versionRoot -Destination $retired
    }
    Move-Item -LiteralPath $staging -Destination $versionRoot
    $staging = $null
    $ready = Read-DreamSkinStandaloneRuntime -RuntimeRoot $runtimeRoot -Package $package
    if (-not $ready) { throw 'Standalone runtime failed final marker verification.' }
    if ($retired -and (Test-Path -LiteralPath $retired)) { [void](Remove-DreamSkinDirectoryTreeLongPath -Path $retired -Boundary $runtimeRoot) }
    try { Remove-DreamSkinObsoleteRuntimes -StateRoot $StateRoot -KeepRoots @($versionRoot) | Out-Null }
    catch { Write-Warning "Skipped obsolete runtime cleanup: $($_.Exception.Message)" }
    return $ready
  } catch {
    if ($retired -and (Test-Path -LiteralPath $retired) -and -not (Test-Path -LiteralPath $versionRoot)) {
      Move-Item -LiteralPath $retired -Destination $versionRoot -ErrorAction SilentlyContinue
      $retired = $null
    }
    throw
  } finally {
    if ($staging -and (Test-Path -LiteralPath $staging)) { try { [void](Remove-DreamSkinDirectoryTreeLongPath -Path $staging -Boundary $runtimeRoot) } catch {} }
    if ($retired -and (Test-Path -LiteralPath $retired)) { try { [void](Remove-DreamSkinDirectoryTreeLongPath -Path $retired -Boundary $runtimeRoot) } catch {} }
  }
}
