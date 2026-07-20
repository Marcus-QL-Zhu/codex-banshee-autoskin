Set-StrictMode -Version Latest


function Assert-DreamSkinPort([int]$Port, [switch]$AllowZero) {
  if ($AllowZero -and $Port -eq 0) { return }
  if ($Port -lt 1024 -or $Port -gt 65535) {
    throw "Dream Skin port must be between 1024 and 65535: $Port"
  }
}
function Get-DreamSkinFreePort {
  for ($attempt = 0; $attempt -lt 32; $attempt++) {
    $ipv4 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $ipv6 = $null
    try {
      $ipv4.Server.ExclusiveAddressUse = $true
      $ipv4.Start()
      $port = ([System.Net.IPEndPoint]$ipv4.LocalEndpoint).Port
      $ipv6 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Loopback, $port)
      $ipv6.Server.DualMode = $false
      $ipv6.Server.ExclusiveAddressUse = $true
      $ipv6.Start()
      return $port
    } catch {
      if ($attempt -eq 31) { throw 'Unable to allocate a port free on both IPv4 and IPv6 loopback.' }
    } finally {
      if ($ipv6) { $ipv6.Stop() }
      $ipv4.Stop()
    }
  }
}
function Get-DreamSkinPersistedPort([string]$StateRoot, [int]$RequestedPort, [switch]$Allocate) {
  Assert-DreamSkinPort -Port $RequestedPort -AllowZero
  if ($RequestedPort -gt 0) { return $RequestedPort }
  foreach ($file in @('install-transaction.json', 'state.json', 'watcher-state.json')) {
    $path = Join-Path $StateRoot $file
    if (-not (Test-Path -LiteralPath $path)) { continue }
    try {
      $state = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
      if ([int]$state.port -ge 1024 -and [int]$state.port -le 65535) { return [int]$state.port }
    } catch {}
  }
  if ($Allocate) { return Get-DreamSkinFreePort }
  return 9335
}

function Test-DreamSkinLoopbackPortFree([int]$Port) {
  Assert-DreamSkinPort -Port $Port
  $ipv4 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  $ipv6 = $null
  try {
    $ipv4.Server.ExclusiveAddressUse = $true
    $ipv4.Start()
    $ipv6 = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::IPv6Loopback, $Port)
    $ipv6.Server.DualMode = $false
    $ipv6.Server.ExclusiveAddressUse = $true
    $ipv6.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($ipv6) { $ipv6.Stop() }
    $ipv4.Stop()
  }
}

function Get-DreamSkinShortcutDisposition([string]$ShortcutPath, [object[]]$Records) {
  $record = @($Records | Where-Object { [string]$_.path -eq $ShortcutPath }) | Select-Object -First 1
  if (-not $record) { return [pscustomobject]@{ State = 'unregistered'; Record = $null } }
  if (-not (Test-Path -LiteralPath $ShortcutPath)) { return [pscustomobject]@{ State = 'owned-missing'; Record = $record } }
  $currentHash = (Get-FileHash -LiteralPath $ShortcutPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($currentHash -eq ([string]$record.createdHash).ToLowerInvariant()) {
    return [pscustomobject]@{ State = 'owned-current'; Record = $record }
  }
  return [pscustomobject]@{ State = 'modified'; Record = $record }
}
function Write-DreamSkinTextAtomic([string]$Path, [string]$Content) {
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $temporary = Join-Path $directory ('.' + [IO.Path]::GetFileName($Path) + '.' + [guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::WriteAllText($temporary, $Content, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

function Write-DreamSkinJsonAtomic([string]$Path, [object]$Value) {
  Write-DreamSkinTextAtomic -Path $Path -Content ($Value | ConvertTo-Json -Depth 8)
}
