# Install the portable Skill Heaven Agent Plugin to one stable local directory (Windows PowerShell).
# Client registration is intentionally separate: Agent Plugins standardizes the
# package, while every client owns its install/enable command.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$PrintPath,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

$PROGRAM = "skill-heaven-agent-plugin-install"
$DEFAULT_HOME = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "gaia-skill-heaven-agent-plugin"
} elseif ($env:USERPROFILE) {
  Join-Path $env:USERPROFILE ".local\share\gaia-skill-heaven-agent-plugin"
} else {
  Join-Path $HOME ".local\share\gaia-skill-heaven-agent-plugin"
}
$INSTALL_HOME = if ($env:SKILL_HEAVEN_PLUGIN_HOME) { $env:SKILL_HEAVEN_PLUGIN_HOME } else { $DEFAULT_HOME }
$MARKETPLACE_DIR = Join-Path $INSTALL_HOME "marketplace"
$PLUGIN_DIR = Join-Path $MARKETPLACE_DIR "plugins\skill-heaven"
$SOURCE_REF = if ($env:SKILL_HEAVEN_REF) { $env:SKILL_HEAVEN_REF } else { "main" }
$SOURCE_ARCHIVE = if ($env:SKILL_HEAVEN_ARCHIVE_URL) {
  $env:SKILL_HEAVEN_ARCHIVE_URL
} else {
  "https://codeload.github.com/gaia-research/gaia-skill-heaven/zip/$SOURCE_REF"
}

function Say-Message {
  param([string]$Message)
  Write-Host $Message
}

function Fail-Installation {
  param([string]$Message)
  Write-Error "${PROGRAM}: $Message"
  exit 1
}

function Show-Usage {
  @"
Usage: irm https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.ps1 | iex
       .\install-agent-plugin.ps1 -PrintPath
       .\install-agent-plugin.ps1 -Uninstall

Installs the portable Agent Plugin package to:
  $PLUGIN_DIR

It does not install or silently reconfigure an agent harness. Agent Plugins
clients load this directory; marketplace clients load $MARKETPLACE_DIR.
Set SKILL_HEAVEN_PLUGIN_HOME to override the installation root.
"@
}

if ($Help) {
  Show-Usage
  exit 0
}

if ($PrintPath) {
  Say-Message $PLUGIN_DIR
  exit 0
}

if ($Uninstall) {
  if (Test-Path $INSTALL_HOME) {
    $marker = Join-Path $INSTALL_HOME ".skill-heaven-agent-plugin-install"
    if (-not (Test-Path $marker)) {
      Fail-Installation "refusing to remove unverified directory: $INSTALL_HOME"
    }
    Remove-Item -Recurse -Force $INSTALL_HOME
    Say-Message "Removed the local Skill Heaven Agent Plugin artifact from $INSTALL_HOME"
    Say-Message "Client-managed plugin copies and registrations were not removed."
  } else {
    Say-Message "Skill Heaven Agent Plugin is not installed at $INSTALL_HOME"
  }
  exit 0
}

$missing = @()
foreach ($tool in @("node", "git")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    $missing += $tool
  }
}
if ($missing.Count -gt 0) {
  Fail-Installation ("missing prerequisite(s): " + ($missing -join " ") + ". Node must be 22+ and Git is required by /summon. Nothing was installed.")
}

$NODE_MAJOR = 0
try {
  $nodeVer = node -p 'process.versions.node.split(".")[0]' 2>$null
  if ($nodeVer -match '^\d+$') {
    $NODE_MAJOR = [int]$nodeVer
  }
} catch {
  $NODE_MAJOR = 0
}

if ($NODE_MAJOR -lt 22) {
  $currentVersion = try { node --version 2>$null } catch { "unknown" }
  Fail-Installation "Node 22+ is required; found $currentVersion. Nothing was installed."
}

$INSTALL_PARENT = Split-Path -Parent $INSTALL_HOME
if (-not (Test-Path $INSTALL_PARENT)) {
  New-Item -ItemType Directory -Force -Path $INSTALL_PARENT | Out-Null
}

$uuid = [System.Guid]::NewGuid().ToString("N")
$WORK = Join-Path $INSTALL_PARENT (".gaia-skill-heaven-agent-plugin.$uuid")
$NEXT = Join-Path $WORK "install"
$OLD = Join-Path $INSTALL_PARENT (".gaia-skill-heaven-agent-plugin-old.$uuid")
$BACKED_UP = $false

try {
  New-Item -ItemType Directory -Force -Path (Join-Path $WORK "source") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $NEXT "marketplace\plugins\skill-heaven") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $NEXT "marketplace\.claude-plugin") | Out-Null

  $ARCHIVE = Join-Path $WORK "source.zip"
  Say-Message "Fetching Skill Heaven Agent Plugin ($SOURCE_REF) ..."
  Invoke-WebRequest -Uri $SOURCE_ARCHIVE -OutFile $ARCHIVE -UseBasicParsing

  $EXTRACT_TEMP = Join-Path $WORK "extract_temp"
  Expand-Archive -Path $ARCHIVE -DestinationPath $EXTRACT_TEMP -Force
  Remove-Item -Force $ARCHIVE

  $extractedDirs = Get-ChildItem -Path $EXTRACT_TEMP -Directory
  if ($extractedDirs.Count -eq 1) {
    Get-ChildItem -Path $extractedDirs[0].FullName | Move-Item -Destination (Join-Path $WORK "source")
  } else {
    Get-ChildItem -Path $EXTRACT_TEMP | Move-Item -Destination (Join-Path $WORK "source")
  }
  Remove-Item -Recurse -Force $EXTRACT_TEMP

  $SOURCE_PLUGIN = Join-Path $WORK "source\plugins\skill-heaven"
  $requiredFiles = @("plugin.json", "mcp.json", "skills\summon\SKILL.md", "mcp\skill-summon.mjs")
  foreach ($req in $requiredFiles) {
    if (-not (Test-Path (Join-Path $SOURCE_PLUGIN $req))) {
      Fail-Installation "source archive is missing plugins/skill-heaven/$req. Nothing was installed."
    }
  }

  if (-not (Test-Path (Join-Path $WORK "source\.claude-plugin\marketplace.json"))) {
    Fail-Installation "source archive is missing the marketplace manifest. Nothing was installed."
  }

  Copy-Item -Recurse -Force (Join-Path $SOURCE_PLUGIN "*") (Join-Path $NEXT "marketplace\plugins\skill-heaven\")
  Copy-Item -Force (Join-Path $WORK "source\.claude-plugin\marketplace.json") (Join-Path $NEXT "marketplace\.claude-plugin\marketplace.json")

  # Hermes currently accepts a Git source rather than an arbitrary local
  # directory. A tiny local repository keeps the installed package usable there.
  # Do not inherit repository redirection, signing, or hooks from the caller.
  Push-Location (Join-Path $NEXT "marketplace\plugins\skill-heaven")
  try {
    $env:GIT_CONFIG_NOSYSTEM = '1'
    $nullDev = if ($IsWindows -or $env:OS -match "Windows") { "NUL" } else { "/dev/null" }
    $env:GIT_CONFIG_SYSTEM = $nullDev
    $env:GIT_CONFIG_GLOBAL = $nullDev

    git -c core.hooksPath=$nullDev init -q
    git -c core.hooksPath=$nullDev add --all
    git -c core.hooksPath=$nullDev -c commit.gpgsign=false -c user.name='Skill Heaven installer' -c user.email='installer@skill-heaven.invalid' commit --no-gpg-sign -qm "Install Skill Heaven Agent Plugin $SOURCE_REF"
    git ls-files --error-unmatch plugin.json mcp.json skills/summon/SKILL.md mcp/skill-summon.mjs 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Fail-Installation "could not prepare the complete local plugin repository. Nothing was installed."
    }
  } finally {
    Pop-Location
  }

  New-Item -ItemType File -Force -Path (Join-Path $NEXT ".skill-heaven-agent-plugin-install") | Out-Null

  $uninstallScript = @'
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$PROGRAM = "skill-heaven-agent-plugin-uninstall"
$ROOT = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

$marker = Join-Path $ROOT ".skill-heaven-agent-plugin-install"
$pluginJson = Join-Path $ROOT "marketplace\plugins\skill-heaven\plugin.json"

if (-not (Test-Path $marker) -or -not (Test-Path $pluginJson)) {
  Write-Error "${PROGRAM}: refusing to remove unverified directory: $ROOT"
  exit 1
}

Remove-Item -Recurse -Force $ROOT
Write-Host "Removed the local Skill Heaven Agent Plugin artifact from $ROOT"
Write-Host "Client-managed plugin copies and registrations were not removed."
'@
  Set-Content -Path (Join-Path $NEXT "uninstall.ps1") -Value $uninstallScript -Encoding UTF8

  if (Test-Path $INSTALL_HOME) {
    Move-Item -Path $INSTALL_HOME -Destination $OLD
    $BACKED_UP = $true
  }

  try {
    Move-Item -Path $NEXT -Destination $INSTALL_HOME
    $BACKED_UP = $false
  } catch {
    Fail-Installation "could not activate the new package; the previous installation will be restored."
  }

  if (Test-Path $OLD) {
    Remove-Item -Recurse -Force $OLD -ErrorAction SilentlyContinue
  }

  Say-Message "Installed the portable Skill Heaven Agent Plugin."
  Say-Message "Plugin directory: $PLUGIN_DIR"
  Say-Message "Marketplace directory: $MARKETPLACE_DIR"
  Say-Message ""
  Say-Message "Point any standards-conformant Agent Plugins client at the plugin directory above; clients outside the pinned probe remain unverified."
  Say-Message "Client registration is explicit because the Agent Plugins specification does not define one universal install command."
  Say-Message "Re-run this installer to update the local artifact; clients that cache plugins still need their own update/reinstall command."
  Say-Message "Uninstall the local artifact with:"
  Say-Message "  $INSTALL_HOME\uninstall.ps1"
  Say-Message "Client-managed plugin copies and registrations are not removed by that command."

} finally {
  if ($BACKED_UP -and (Test-Path $OLD)) {
    if (-not (Test-Path $INSTALL_HOME)) {
      Move-Item -Path $OLD -Destination $INSTALL_HOME -ErrorAction SilentlyContinue
    }
  }
  if (Test-Path $WORK) {
    Remove-Item -Recurse -Force $WORK -ErrorAction SilentlyContinue
  }
  if ((-not $BACKED_UP) -and (Test-Path $OLD)) {
    Remove-Item -Recurse -Force $OLD -ErrorAction SilentlyContinue
  }
}
