# Skill Heaven installer for the Skill Zero launcher doors (Windows PowerShell).
# Installs source-built doors under one user-owned directory, then registers the
# Claude plugin (which bundles its own summon engine) when Claude Code is already
# available. It never installs a harness.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

$PROGRAM = "gaia-skill-heaven-install"
$DEFAULT_HOME = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "gaia-skill-heaven"
} elseif ($env:USERPROFILE) {
  Join-Path $env:USERPROFILE ".local\share\gaia-skill-heaven"
} else {
  Join-Path $HOME ".local\share\gaia-skill-heaven"
}
$INSTALL_HOME = if ($env:SKILL_HEAVEN_HOME) { $env:SKILL_HEAVEN_HOME } else { $DEFAULT_HOME }
$BIN_DIR = Join-Path $INSTALL_HOME "bin"
$SOURCE_REF = if ($env:SKILL_HEAVEN_REF) { $env:SKILL_HEAVEN_REF } else { "main" }
$SOURCE_ARCHIVE = if ($env:SKILL_HEAVEN_ARCHIVE_URL) {
  $env:SKILL_HEAVEN_ARCHIVE_URL
} else {
  "https://codeload.github.com/gaia-research/gaia-skill-heaven/zip/$SOURCE_REF"
}
$PLUGIN_ID = "skill-heaven@gaia-skill-heaven"
$MARKETPLACE = "gaia-skill-heaven"
$PLUGIN_MANAGED = Join-Path $INSTALL_HOME ".claude-plugin-managed"
$MARKETPLACE_MANAGED = Join-Path $INSTALL_HOME ".claude-marketplace-managed"

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
Usage: irm https://gaia-research.github.io/gaia-skill-heaven/install.ps1 | iex
       .\install.ps1 -Uninstall

Installs the WORKING PROTOTYPE's five Skill Zero launcher doors and the Claude
plugin (/summon, /skill-zero, /skill-heaven, /skill-hell, /skill-ultra) when the
user's own claude binary is on PATH. The plugin bundles its own summon engine —
no external package is installed. No harness is installed. Set SKILL_HEAVEN_HOME
to override:
  $INSTALL_HOME
"@
}

function Plugin-Is-Installed {
  try {
    $pluginJson = claude plugin list --json 2>$null
    if (-not $pluginJson) { return $false }
    $plugins = $pluginJson | ConvertFrom-Json
    return ($plugins | Where-Object { $_.id -eq $PLUGIN_ID }).Count -gt 0
  } catch {
    return $false
  }
}

function Marketplace-Is-Configured {
  try {
    $marketplaces = claude plugin marketplace list 2>$null
    if (-not $marketplaces) { return $false }
    return ($marketplaces -match [regex]::Escape($MARKETPLACE))
  } catch {
    return $false
  }
}

function Uninstall-All {
  if (-not (Test-Path $INSTALL_HOME)) {
    Say-Message "Skill Heaven is not installed at $INSTALL_HOME"
    exit 0
  }

  Say-Message "Skill Heaven working prototype — uninstalling everything from $INSTALL_HOME"

  if (Test-Path $PLUGIN_MANAGED) {
    if (Get-Command claude -ErrorAction SilentlyContinue) {
      Say-Message "Removing Claude plugin $PLUGIN_ID ..."
      claude plugin uninstall $PLUGIN_ID
    } else {
      Say-Message "Claude Code is not on PATH; remove the installer-managed plugin later with:"
      Say-Message "  claude plugin uninstall $PLUGIN_ID"
      Fail-Installation "doors were left installed so the managed-plugin record is not lost"
    }
  }

  if (Test-Path $MARKETPLACE_MANAGED) {
    if (Get-Command claude -ErrorAction SilentlyContinue) {
      Say-Message "Removing Claude marketplace $MARKETPLACE ..."
      claude plugin marketplace remove $MARKETPLACE
    } else {
      Say-Message "Claude Code is not on PATH; remove the installer-managed marketplace later with:"
      Say-Message "  claude plugin marketplace remove $MARKETPLACE"
      Fail-Installation "doors were left installed so the managed-marketplace record is not lost"
    }
  }

  Remove-Item -Recurse -Force $INSTALL_HOME
  Say-Message "Removed the five doors and installer-managed Claude plugin state."
  exit 0
}

if ($Help) {
  Show-Usage
  exit 0
}

if ($Uninstall) {
  Uninstall-All
}

Say-Message "SKILL HEAVEN — WORKING PROTOTYPE, actively tested for public use."
Say-Message "Installing all five Skill Zero doors and the Claude plugin under the Skill Heaven umbrella; the plugin bundles its own summon engine."
Say-Message "Harnesses are never installed; every door uses the user's own harness binary."

$missing = @()
foreach ($tool in @("node", "npm", "git")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    $missing += $tool
  }
}
if ($missing.Count -gt 0) {
  Fail-Installation ("missing prerequisite(s): " + ($missing -join " ") + ". Install them with your package manager; Node must be 22+ (https://nodejs.org/), then run this command again. Nothing was installed.")
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
  $currentVersion = try { node --version 2>$null } catch { "an unreadable Node install" }
  Fail-Installation "Node 22+ is required; found $currentVersion. Install Node 22+ from https://nodejs.org/ and run this command again. Nothing was installed."
}

$INSTALL_PARENT = Split-Path -Parent $INSTALL_HOME
if (-not (Test-Path $INSTALL_PARENT)) {
  New-Item -ItemType Directory -Force -Path $INSTALL_PARENT | Out-Null
}

$uuid = [System.Guid]::NewGuid().ToString("N")
$STAGE = Join-Path $INSTALL_PARENT ".gaia-skill-heaven-install.$uuid"
$OLD = Join-Path $INSTALL_PARENT ".gaia-skill-heaven-old.$uuid"

try {
  New-Item -ItemType Directory -Force -Path (Join-Path $STAGE "source") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $STAGE "bin") | Out-Null

  $ARCHIVE = Join-Path $STAGE "source.zip"
  Say-Message "Fetching Skill Heaven source ($SOURCE_REF) ..."
  Invoke-WebRequest -Uri $SOURCE_ARCHIVE -OutFile $ARCHIVE -UseBasicParsing

  $EXTRACT_TEMP = Join-Path $STAGE "extract_temp"
  Expand-Archive -Path $ARCHIVE -DestinationPath $EXTRACT_TEMP -Force
  Remove-Item -Force $ARCHIVE

  $extractedDirs = Get-ChildItem -Path $EXTRACT_TEMP -Directory
  if ($extractedDirs.Count -eq 1) {
    Get-ChildItem -Path $extractedDirs[0].FullName | Move-Item -Destination (Join-Path $STAGE "source")
  } else {
    Get-ChildItem -Path $EXTRACT_TEMP | Move-Item -Destination (Join-Path $STAGE "source")
  }
  Remove-Item -Recurse -Force $EXTRACT_TEMP

  $doors = @("claude", "pi", "codex", "hermes", "grok")
  foreach ($door in $doors) {
    $doorFile = Join-Path $STAGE "source\packages\$door-zero\bin\$door-zero.mjs"
    if (-not (Test-Path $doorFile)) {
      Fail-Installation "source archive is missing $door-zero; nothing was installed."
    }
  }

  Say-Message "Installing launcher runtime dependencies ..."
  Push-Location (Join-Path $STAGE "source")
  try {
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      Fail-Installation "launcher dependency installation failed; nothing was installed."
    }
  } finally {
    Pop-Location
  }

  foreach ($door in $doors) {
    $cmdContent = "@echo off`r`nnode `"%~dp0..\source\packages\$door-zero\bin\$door-zero.mjs`" %*"
    Set-Content -Path (Join-Path $STAGE "bin\$door-zero.cmd") -Value $cmdContent -Encoding ASCII
  }

  $uninstallScript = @'
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ROOT = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$PLUGIN_ID = "skill-heaven@gaia-skill-heaven"
$MARKETPLACE = "gaia-skill-heaven"

Write-Host "Skill Heaven working prototype — uninstalling everything from $ROOT"
$pluginManaged = Join-Path $ROOT ".claude-plugin-managed"
if (Test-Path $pluginManaged) {
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "Removing Claude plugin $PLUGIN_ID ..."
    claude plugin uninstall $PLUGIN_ID
  } else {
    Write-Error "Claude Code is not on PATH; run this later before uninstalling:`n  claude plugin uninstall $PLUGIN_ID"
    exit 1
  }
}

$marketplaceManaged = Join-Path $ROOT ".claude-marketplace-managed"
if (Test-Path $marketplaceManaged) {
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    Write-Host "Removing Claude marketplace $MARKETPLACE ..."
    claude plugin marketplace remove $MARKETPLACE
  } else {
    Write-Error "Claude Code is not on PATH; run this later before uninstalling:`n  claude plugin marketplace remove $MARKETPLACE"
    exit 1
  }
}

Remove-Item -Recurse -Force $ROOT
Write-Host "Removed the five doors and installer-managed Claude plugin state."
'@
  Set-Content -Path (Join-Path $STAGE "uninstall.ps1") -Value $uninstallScript -Encoding UTF8

  # Preserve ownership records across an idempotent update.
  if (Test-Path $PLUGIN_MANAGED) {
    New-Item -ItemType File -Force -Path (Join-Path $STAGE ".claude-plugin-managed") | Out-Null
  }
  if (Test-Path $MARKETPLACE_MANAGED) {
    New-Item -ItemType File -Force -Path (Join-Path $STAGE ".claude-marketplace-managed") | Out-Null
  }

  if (Test-Path $INSTALL_HOME) {
    Move-Item -Path $INSTALL_HOME -Destination $OLD
  }
  Move-Item -Path $STAGE -Destination $INSTALL_HOME

  if (Test-Path $OLD) {
    Remove-Item -Recurse -Force $OLD -ErrorAction SilentlyContinue
  }

  if (Get-Command claude -ErrorAction SilentlyContinue) {
    Say-Message "Claude Code detected; installing its /summon, /skill-zero, /skill-heaven, /skill-hell, and /skill-ultra plugin ..."
    if (Marketplace-Is-Configured) {
      claude plugin marketplace update $MARKETPLACE
    } else {
      claude plugin marketplace add https://github.com/gaia-research/gaia-skill-heaven.git
      New-Item -ItemType File -Force -Path (Join-Path $INSTALL_HOME ".claude-marketplace-managed") | Out-Null
    }

    if (Plugin-Is-Installed) {
      claude plugin update $PLUGIN_ID
    } else {
      claude plugin install --scope user $PLUGIN_ID
      New-Item -ItemType File -Force -Path (Join-Path $INSTALL_HOME ".claude-plugin-managed") | Out-Null
    }
    Say-Message "Claude plugin ready: /summon, /skill-zero, /skill-heaven, /skill-hell, /skill-ultra."
  } else {
    Say-Message "Claude Code was not detected, so no harness was installed and plugin registration is deferred."
    Say-Message "After installing Claude Code yourself, register the already-delivered plugin with:"
    Say-Message "  claude plugin marketplace add https://github.com/gaia-research/gaia-skill-heaven.git"
    Say-Message "  claude plugin install --scope user $PLUGIN_ID"
  }

  Say-Message "Installed Skill Zero doors:"
  foreach ($door in $doors) {
    Say-Message "  $door-zero"
  }

  Say-Message "Harnesses detected (not installed by this script):"
  foreach ($harness in $doors) {
    if (Get-Command $harness -ErrorAction SilentlyContinue) {
      Say-Message "  ${harness}: yes"
    } else {
      Say-Message "  ${harness}: no"
    }
  }

  $pathEntries = if ($env:Path) { $env:Path -split ';' } else { @() }
  if ($pathEntries -contains $BIN_DIR) {
    Say-Message "PATH already includes $BIN_DIR"
  } else {
    Say-Message "Add the install directory to PATH (this installer does not edit shell profile files):"
    Say-Message "  `$env:Path = `"$BIN_DIR;`$env:Path`""
  }
  Say-Message "Uninstall everything this command added with:"
  Say-Message "  $INSTALL_HOME\uninstall.ps1"
  Say-Message "Install complete. Re-run the same one-liner to update idempotently."

} finally {
  if (Test-Path $STAGE) {
    Remove-Item -Recurse -Force $STAGE -ErrorAction SilentlyContinue
  }
  if (Test-Path $OLD) {
    Remove-Item -Recurse -Force $OLD -ErrorAction SilentlyContinue
  }
}
