[CmdletBinding()]
param(
  [switch]$SkipWorktreeClean,
  [switch]$HygieneOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExpectedVersion = [version]'2.3.0'
$MaximumTrackedBytes = 5MB

function Invoke-Checked([string]$Label, [scriptblock]$Command) {
  Write-Host "==> $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
}

function Require-Match([string]$Path, [string]$Pattern, [string]$Description) {
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ($content -notmatch $Pattern) { throw "$Description is missing or inconsistent in $Path" }
}

Push-Location $RepoRoot
try {
  if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw 'Git is required for the release check.' }
  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js 22.4 or newer is required.' }

  $nodeVersionText = (& node -p 'process.versions.node').Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Node.js version.' }
  $nodeVersion = [version]$nodeVersionText
  if ($nodeVersion -lt [version]'22.4.0') {
    throw "Node.js 22.4 or newer is required; found $nodeVersionText."
  }
  Write-Host "Node.js $nodeVersionText"

  foreach ($required in @(
    '.gitignore', 'CHANGELOG.md', 'CONTRIBUTING.md', 'Install.cmd', 'LICENSE',
    'README.md', 'SECURITY.md', 'SKILL.md', 'agents/openai.yaml',
    'scripts/injector.mjs', 'scripts/set-theme.ps1', 'tests/banshee-static.test.mjs',
    'tests/renderer-safety.test.mjs', 'tests/shortcut-state.test.ps1',
    'tests/windows-lifecycle.test.ps1',
    'themes/banshee-armor/theme.json'
  )) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required release file is missing: $required" }
  }

  Require-Match 'README.md' 'v2\.3\.0' 'README version'
  Require-Match 'README.md' 'synchronized 20-second gold energy cycle' 'Banshee cycle documentation'
  Require-Match 'SKILL.md' '(?m)^version:\s*2\.3\.0\s*$' 'Skill version'
  Require-Match 'agents/openai.yaml' '\$codex-autoskin\b' 'Skill invocation name'
  Require-Match 'assets/renderer-inject.js' 'version:\s*"2\.3\.0"' 'Renderer version'
  Require-Match 'themes/banshee-armor/theme.json' '"--dream-banshee-wave-cycle"\s*:\s*"20s"' 'Banshee theme cycle'

  $releaseFiles = @(& git -c core.quotepath=false ls-files --cached --others --exclude-standard | Sort-Object -Unique)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate tracked and untracked release files.' }
  $forbiddenExtensions = @('.7z', '.asar', '.dll', '.exe', '.log', '.msi', '.tmp', '.zip')
  $textExtensions = @('.cmd', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ps1', '.py', '.toml', '.txt', '.yaml', '.yml')
  $secretPatterns = [ordered]@{
    'private key material' = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    'GitHub access token' = 'gh[pousr]_[A-Za-z0-9_]{20,}'
    'OpenAI-style secret key' = 'sk-[A-Za-z0-9_-]{20,}'
    'AWS access key' = 'AKIA[0-9A-Z]{16}'
    'Slack token' = 'xox[baprs]-[A-Za-z0-9-]+'
  }

  foreach ($relative in $releaseFiles) {
    if (-not (Test-Path -LiteralPath $relative -PathType Leaf)) { throw "Release path is missing: $relative" }
    $item = Get-Item -LiteralPath $relative
    if ($item.Length -gt $MaximumTrackedBytes) {
      throw "Release file exceeds 5 MiB: $relative ($($item.Length) bytes)"
    }
    $extension = [IO.Path]::GetExtension($relative).ToLowerInvariant()
    if ($forbiddenExtensions -contains $extension) { throw "Forbidden release artifact is present: $relative" }
    if (($textExtensions -notcontains $extension) -or $relative -eq 'tools/release-check.ps1') { continue }

    $content = Get-Content -LiteralPath $relative -Raw -Encoding UTF8
    if ($content -match '(?i)(?:[A-Z]:[\\/]+Users[\\/]+[^%$<{][^\\/\r\n]*|/home/[a-z0-9._-]+/)') {
      throw "Possible personal absolute path in release file: $relative"
    }
    foreach ($entry in $secretPatterns.GetEnumerator()) {
      if ($content -match $entry.Value) { throw "Possible $($entry.Key) in release file: $relative" }
    }
  }

  if (-not $SkipWorktreeClean) {
    $status = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect Git worktree status.' }
    if ($status.Count -gt 0) {
      throw "Release worktree is not clean:`n$($status -join [Environment]::NewLine)"
    }
  }

  if (-not $HygieneOnly) {
    Invoke-Checked 'Banshee static tests' { & node tests\banshee-static.test.mjs }
    Invoke-Checked 'Renderer safety tests' { & node tests\renderer-safety.test.mjs }
    Invoke-Checked 'PowerShell shortcut-state test' { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\shortcut-state.test.ps1 }
    Invoke-Checked 'PowerShell Windows lifecycle test' { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests\windows-lifecycle.test.ps1 }
    Invoke-Checked 'Offline payload validation' { & node scripts\injector.mjs --check }
    Invoke-Checked 'Offline theme inventory' { & node scripts\injector.mjs --themes }
  }

  if (-not $SkipWorktreeClean) {
    $finalStatus = @(& git status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect final Git worktree status.' }
    if ($finalStatus.Count -gt 0) {
      throw "Release checks changed the worktree:`n$($finalStatus -join [Environment]::NewLine)"
    }
  }

  Write-Host "Release checks passed for v$ExpectedVersion."
} finally {
  Pop-Location
}
