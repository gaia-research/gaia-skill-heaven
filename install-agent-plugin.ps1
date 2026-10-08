# Install the portable Skill Heaven Agent Plugin to one stable local directory (Windows PowerShell).
# Client registration is intentionally separate: Agent Plugins standardizes the
# package, while every client owns its install/enable command.

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$PrintPath,
  [switch]$Quiet,
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
  if (-not $Quiet) { Write-Host $Message }
}

# Detection is by name only: Get-Command never runs the harness, and no harness
# configuration is read or written.
function Test-Harness {
  param([string]$Bin)
  [bool](Get-Command $Bin -CommandType Application,ExternalScript -ErrorAction SilentlyContinue)
}

function Fail-Installation {
  param([string]$Message)
  Write-Error "${PROGRAM}: $Message"
  exit 1
}

function Show-Usage {
  @"
Usage: irm https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.ps1 | iex
       .\install-agent-plugin.ps1 -Quiet
       .\install-agent-plugin.ps1 -PrintPath
       .\install-agent-plugin.ps1 -Uninstall

Installs the portable Agent Plugin package to:
  $PLUGIN_DIR

It does not install or silently reconfigure an agent harness. Agent Plugins
clients load this directory; marketplace clients load $MARKETPLACE_DIR.
Set SKILL_HEAVEN_PLUGIN_HOME to override the installation root.

When it finishes it looks for the supported harnesses on your PATH (by name
only; it never runs one and never reads or writes their configuration) and
prints the exact next command for each one it finds.

Options:
  -Quiet      print only the plugin directory and the marketplace directory
              (one per line, nothing else), for scripts
  -PrintPath  print the plugin directory and exit
  -Uninstall  remove the local artifact (client registrations are removed in
              each client)
  -Help       show this help
"@
}

if ($Help) {
  Show-Usage
  exit 0
}

if ($PrintPath) {
  Write-Host $PLUGIN_DIR
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

Say-Message "[1/4] Checking prerequisites..."
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
  $nodeVerRaw = (node --version 2>$null) -replace '^v', ''
  $nodeVerParts = $nodeVerRaw -split '\.'
  if ($nodeVerParts[0] -match '^\d+$') {
    $NODE_MAJOR = [int]$nodeVerParts[0]
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
  Say-Message "[2/4] Fetching Skill Heaven Agent Plugin ($SOURCE_REF) ..."
  Invoke-WebRequest -Uri $SOURCE_ARCHIVE -OutFile $ARCHIVE -UseBasicParsing

  Say-Message "[3/4] Extracting plugin archive..."
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

  Say-Message "[4/4] Staging portable Agent Plugin artifact..."
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
  # The repository marketplace may list Claude-only plugins (the optional
  # console) that this portable artifact does not carry. List only what was
  # staged, so no client is pointed at an entry whose directory is missing.
  $market = Get-Content -Raw (Join-Path $WORK "source\.claude-plugin\marketplace.json") | ConvertFrom-Json
  $market.plugins = @($market.plugins | Where-Object { $_.source -eq "./plugins/skill-heaven" })
  if ($market.plugins.Count -ne 1) {
    Fail-Installation "could not write the local marketplace manifest. Nothing was installed."
  }
  $market | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 (Join-Path $NEXT "marketplace\.claude-plugin\marketplace.json")

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

  # ---- Onboarding epilogue (docs/CONTROL-PLANE.md section 1 and 5.4) ---------
  # The facts below mirror packages/status/src/compat.ts (HARNESS_PATHS); a
  # vitest drift test fails if they diverge.
  $START_URL = "https://gaia-research.github.io/gaia-skill-heaven/#/start"

  if ($Quiet) {
    Write-Host $PLUGIN_DIR
    Write-Host $MARKETPLACE_DIR
  } else {
    $script:found = 0
    $script:missing = @()
    function Write-HarnessHead {
      param([string]$Bin, [string]$Name, [string]$Status)
      $script:found++
      Say-Message ("  {0,-8} {1} - {2}" -f $Bin, $Name, $Status)
    }

    Say-Message "Installed the portable Skill Heaven Agent Plugin."
    Say-Message ""
    Say-Message "What changed on this machine"
    Say-Message "  + $PLUGIN_DIR  (the plugin, one directory)"
    Say-Message "  + $MARKETPLACE_DIR  (a local marketplace that lists it)"
    Say-Message "  No harness was installed or reconfigured."
    Say-Message ""
    Say-Message "Harnesses found on PATH"

    if (Test-Harness "claude") {
      Write-HarnessHead "claude" "Claude Code" "Verified (2.1.288)"
      Say-Message "           Inside Claude Code, type:"
      Say-Message "             /plugin marketplace add gaia-research/gaia-skill-heaven"
      Say-Message "             /plugin install skill-heaven@gaia-skill-heaven"
    } else { $script:missing += "claude" }
    if (Test-Harness "codex") {
      Write-HarnessHead "codex" "Codex" "Compatible (probed 0.146.0)"
      Say-Message "             codex plugin marketplace add `"$MARKETPLACE_DIR`""
      Say-Message "             codex plugin add skill-heaven@gaia-skill-heaven"
    } else { $script:missing += "codex" }
    if (Test-Harness "pi") {
      Write-HarnessHead "pi" "Pi" "Compatible (probed 0.84.2)"
      Say-Message "             pi install `"$PLUGIN_DIR`" --approve"
    } else { $script:missing += "pi" }
    if (Test-Harness "grok") {
      Write-HarnessHead "grok" "Grok" "Compatible (probed 1.0.5)"
      Say-Message "             grok plugin install `"$PLUGIN_DIR`" --trust"
    } else { $script:missing += "grok" }
    if (Test-Harness "hermes") {
      Write-HarnessHead "hermes" "Hermes" "Compatible (probed 0.20.0)"
      Say-Message "             hermes plugins install `"file://$PLUGIN_DIR`" --enable"
    } else { $script:missing += "hermes" }
    if (Test-Harness "agy") {
      Write-HarnessHead "agy" "Antigravity" "Partial (static check on 1.3.1)"
      Say-Message "           No registration command is printed until a logged-in probe shows Antigravity loading the summon server."
      Say-Message "           The agy-zero launcher (probed on 1.2.13) gives a clean start meanwhile."
    } else { $script:missing += "agy" }

    if ($script:found -eq 0) {
      Say-Message "  (none found)"
      Say-Message "  No supported harness was found on PATH. Skill Heaven runs inside a harness you already use; it never installs one."
      Say-Message "  When you have one, run its command from $START_URL"
    }
    if ($script:missing.Count -gt 0) {
      Say-Message ""
      Say-Message ("Not found: " + ($script:missing -join ", "))
    }
    Say-Message ""
    Say-Message "Another Agent Plugins client (Unverified)"
    Say-Message "  Point your client's own plugin install at $PLUGIN_DIR."
    Say-Message "  There is no universal registration command."
    Say-Message ""
    Say-Message "First run: inside your harness, type /summon <what you need>."
    Say-Message "Update:    re-run this installer (clients that cache plugins also need their own update)."
    Say-Message "Remove:    $INSTALL_HOME\uninstall.ps1   (client registrations are removed in each client)"
    Say-Message "Choose your harness and read what each step does: $START_URL"
  }

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
