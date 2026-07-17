Set-StrictMode -Version Latest

$script:DreamSkinExpectedPublisherId = '2p2nqsd0c76g0'
$script:DreamSkinRuntimeMarkerName = '.codex-dream-skin-runtime.json'

function Resolve-DreamSkinContainedPath([string]$Path, [string]$Parent, [string]$Purpose) {
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  $pathFull = [IO.Path]::GetFullPath($Path)
  if (-not $pathFull.StartsWith($parentFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Purpose escaped its verified parent directory: $pathFull"
  }
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
  foreach ($criticalPath in @($executable, $asar)) {
    if (-not (Test-Path -LiteralPath $criticalPath -PathType Leaf)) { throw "Codex package is missing a critical file: $criticalPath" }
  }

  # Store apps are signed at the MSIX package/catalog level; the inner Chromium
  # executable may legitimately report NotSigned. Any other state still fails.
  $signature = Get-AuthenticodeSignature -LiteralPath $executable
  if ($signature.Status -notin @('Valid', 'NotSigned')) {
    throw "Codex executable signature state is not accepted: $($signature.Status)"
  }

  return [pscustomobject]@{
    Version = [string]$package.Version
    PackageFullName = [string]$package.PackageFullName
    PublisherId = [string]$package.PublisherId
    SourceRoot = $sourceRoot
    Executable = $executable
    Asar = $asar
  }
}

function Get-DreamSkinCriticalFiles([string]$Root) {
  $relativePaths = @('ChatGPT.exe', 'resources\app.asar')
  $optionalCodex = Join-Path $Root 'resources\codex.exe'
  if (Test-Path -LiteralPath $optionalCodex -PathType Leaf) { $relativePaths += 'resources\codex.exe' }
  $records = @()
  foreach ($relativePath in $relativePaths) {
    $fullPath = Resolve-DreamSkinContainedPath -Path (Join-Path $Root $relativePath) -Parent $Root -Purpose 'Runtime critical file'
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw "Runtime is missing a critical file: $fullPath" }
    $item = Get-Item -LiteralPath $fullPath
    $records += [ordered]@{
      path = $relativePath
      length = [long]$item.Length
      sha256 = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  return @($records)
}

function Test-DreamSkinCriticalFiles([string]$Root, [object[]]$Expected) {
  try {
    foreach ($record in @($Expected)) {
      $relativePath = [string]$record.path
      if ([string]::IsNullOrWhiteSpace($relativePath)) { return $false }
      $fullPath = Resolve-DreamSkinContainedPath -Path (Join-Path $Root $relativePath) -Parent $Root -Purpose 'Runtime marker file'
      if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { return $false }
      $item = Get-Item -LiteralPath $fullPath
      if ([long]$item.Length -ne [long]$record.length) { return $false }
      $hash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
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
    if (-not (Test-DreamSkinCriticalFiles -Root $versionRoot -Expected @($marker.criticalFiles))) { return $null }
    return [pscustomobject]@{
      Root = $versionRoot
      Executable = Join-Path $versionRoot 'ChatGPT.exe'
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
  if ($existing) { return $existing }

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
    if ($retired -and (Test-Path -LiteralPath $retired)) { Remove-Item -LiteralPath $retired -Recurse -Force }
    return $ready
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
