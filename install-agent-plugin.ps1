# Portable Agent Plugin profiles (Windows PowerShell). Same generated Node
# helper as POSIX; no duplicated host registration/compatibility table.
[CmdletBinding()]
param(
  [ValidateSet('core','full')][string]$Profile,
  [ValidateSet('claude','pi','codex','hermes','grok','agy','other')][string]$Harness,
  [switch]$Register,
  [switch]$Uninstall,
  [switch]$PrintPath,
  [switch]$Quiet,
  [switch]$Help
)
$ErrorActionPreference = 'Stop'
$defaultHome = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'gaia-skill-heaven-agent-plugin' } else { Join-Path $HOME '.local/share/gaia-skill-heaven-agent-plugin' }
$installHome = if ($env:SKILL_HEAVEN_PLUGIN_HOME) { $env:SKILL_HEAVEN_PLUGIN_HOME } else { $defaultHome }
if ($Help) {
  Write-Output 'Skill Heaven Agent Plugin — Core / Full'
  Write-Output 'Usage: .\install-agent-plugin.ps1 -Profile core|full -Harness claude|pi|codex|hermes|grok|agy [-Register]'
  Write-Output 'Core: runtime only. Full: Core + native console. No harness binaries; launchers are optional and separate.'
  Write-Output 'Default: Core fresh; preserves the recorded profile on repeat installs. Full requires a harness.'
  Write-Output '-Register runs the host plugin manager. Without it: stage only, exact next commands printed.'
  Write-Output 'Registered Full → Core requires -Register. -Uninstall [-Register] removes the owned installation.'
  return
}
if ($PrintPath) { Write-Output (Join-Path $installHome 'marketplace/plugins/skill-heaven'); return }
$arguments = @('--home', $installHome)
if ($Profile) { $arguments += @('--profile', $Profile) }
if ($Harness) { $arguments += @('--harness', $Harness) }
if ($Register) { $arguments += '--register' }
if ($Quiet) { $arguments += '--quiet' }
if ($Uninstall) {
  if (-not (Test-Path $installHome)) { Write-Output "Skill Heaven Agent Plugin is not installed at $installHome"; return }
  if (-not (Test-Path (Join-Path $installHome '.skill-heaven-agent-plugin-install')) -or -not (Test-Path (Join-Path $installHome 'install-profile.mjs'))) { throw "refusing to remove unverified directory: $installHome" }
  & node (Join-Path $installHome 'install-profile.mjs') @arguments --uninstall
  if ($LASTEXITCODE -ne 0) { throw 'Skill Heaven uninstall failed' }
  return
}
foreach ($tool in @('node','git')) { if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "missing prerequisite: $tool. Nothing was installed." } }
$major = & node -p 'process.versions.node.split(".")[0]'
if ($LASTEXITCODE -ne 0 -or [int]$major -lt 22) { throw 'Node 22+ is required. Nothing was installed.' }
$sourceRef = if ($env:SKILL_HEAVEN_REF) { $env:SKILL_HEAVEN_REF } else { 'main' }
$sourceArchive = if ($env:SKILL_HEAVEN_ARCHIVE_URL) { $env:SKILL_HEAVEN_ARCHIVE_URL } else { "https://codeload.github.com/gaia-research/gaia-skill-heaven/zip/$sourceRef" }
$work = Join-Path ([IO.Path]::GetTempPath()) ('skill-heaven-install-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $work | Out-Null
  if (-not $Quiet) { Write-Output '[1/4] Checking prerequisites...'; Write-Output "[2/4] Fetching Skill Heaven Agent Plugin ($sourceRef) ..." }
  $archive = Join-Path $work 'source.zip'
  Invoke-WebRequest -Uri $sourceArchive -OutFile $archive -UseBasicParsing
  if (-not $Quiet) { Write-Output '[3/4] Extracting plugin archive...' }
  $extract = Join-Path $work 'source'
  Expand-Archive -Path $archive -DestinationPath $extract
  $dirs = @(Get-ChildItem -Path $extract -Directory)
  if ($dirs.Count -ne 1) { throw 'Unexpected source archive layout. Nothing was installed.' }
  $source = $dirs[0].FullName
  $helper = Join-Path $source 'scripts/install-profile.mjs'
  if (-not (Test-Path $helper)) { throw 'source archive is missing scripts/install-profile.mjs. Nothing was installed.' }
  if (-not $Quiet) { Write-Output '[4/4] Staging portable Agent Plugin artifact...' }
  & node $helper --source $source @arguments
  if ($LASTEXITCODE -ne 0) { throw 'Skill Heaven profile installation failed; inspect host output, then retry.' }
} finally {
  if (Test-Path $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
