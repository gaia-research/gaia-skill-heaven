#!/bin/sh
# Skill Heaven "install everything" installer.
# POSIX sh; tested on macOS. Installs source-built doors and the summon engine
# under one user-owned directory, then registers the Claude plugin when Claude
# Code is already available. It never installs a harness.

set -eu

PROGRAM=skill-heaven-install
DEFAULT_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}/skill-heaven
INSTALL_HOME=${SKILL_HEAVEN_HOME:-$DEFAULT_HOME}
BIN_DIR=$INSTALL_HOME/bin
SOURCE_REF=${SKILL_HEAVEN_REF:-main}
SOURCE_ARCHIVE=${SKILL_HEAVEN_ARCHIVE_URL:-"https://codeload.github.com/gaia-research/skill-heaven/tar.gz/$SOURCE_REF"}
MCP_SPEC=${SKILL_HELL_PACKAGE:-"@gaia-research/mcp@0.3.0"}
PLUGIN_ID=claude-heaven@skill-heaven
MARKETPLACE=skill-heaven
PLUGIN_MANAGED=$INSTALL_HOME/.claude-plugin-managed
MARKETPLACE_MANAGED=$INSTALL_HOME/.claude-marketplace-managed

say() {
  printf '%s\n' "$*"
}

fail() {
  printf '%s: %s\n' "$PROGRAM" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: curl -fsSL https://gaia-research.github.io/skill-heaven/install.sh | sh
       $0 --uninstall

Installs the WORKING PROTOTYPE's five launcher doors, @gaia-research/mcp@0.3.0
(skill-hell), and the Claude plugin when the user's own claude binary is on PATH.
No harness is installed. Set SKILL_HEAVEN_HOME to override:
  $INSTALL_HOME
EOF
}

plugin_is_installed() {
  plugin_json=$INSTALL_HOME/.plugin-list.$$
  if ! claude plugin list --json >"$plugin_json" 2>/dev/null; then
    rm -f "$plugin_json"
    return 1
  fi
  if node -e '
    const fs = require("node:fs");
    const plugins = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit(plugins.some((plugin) => plugin.id === "claude-heaven@skill-heaven") ? 0 : 1);
  ' "$plugin_json"; then
    rm -f "$plugin_json"
    return 0
  fi
  rm -f "$plugin_json"
  return 1
}

marketplace_is_configured() {
  claude plugin marketplace list 2>/dev/null | grep -q "$MARKETPLACE"
}

uninstall_all() {
  if [ ! -d "$INSTALL_HOME" ]; then
    say "Skill Heaven is not installed at $INSTALL_HOME"
    exit 0
  fi

  say "Skill Heaven working prototype — uninstalling everything from $INSTALL_HOME"

  if [ -f "$PLUGIN_MANAGED" ]; then
    if command -v claude >/dev/null 2>&1; then
      say "Removing Claude plugin $PLUGIN_ID ..."
      claude plugin uninstall "$PLUGIN_ID"
    else
      say "Claude Code is not on PATH; remove the installer-managed plugin later with:"
      say "  claude plugin uninstall $PLUGIN_ID"
      fail "doors were left installed so the managed-plugin record is not lost"
    fi
  fi

  if [ -f "$MARKETPLACE_MANAGED" ]; then
    if command -v claude >/dev/null 2>&1; then
      say "Removing Claude marketplace $MARKETPLACE ..."
      claude plugin marketplace remove "$MARKETPLACE"
    else
      say "Claude Code is not on PATH; remove the installer-managed marketplace later with:"
      say "  claude plugin marketplace remove $MARKETPLACE"
      fail "doors were left installed so the managed-marketplace record is not lost"
    fi
  fi

  rm -rf "$INSTALL_HOME"
  say "Removed the five doors, skill-hell, and installer-managed Claude plugin state."
}

case ${1:-} in
  --help|-h)
    usage
    exit 0
    ;;
  --uninstall)
    uninstall_all
    exit 0
    ;;
  "")
    ;;
  *)
    usage >&2
    fail "unknown argument: $1"
    ;;
esac

say "SKILL HEAVEN — WORKING PROTOTYPE, actively tested for public use."
say "Installing all five doors, the Claude plugin, and the skill-hell summon engine."
say "Harnesses are never installed; every door uses the user's own harness binary."

missing=
for tool in node npm curl tar mktemp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    missing="$missing $tool"
  fi
done
if [ -n "$missing" ]; then
  fail "missing prerequisite(s):$missing. Install them with your OS package manager; Node must be 22+ (https://nodejs.org/), then run this command again. Nothing was installed."
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')
case $NODE_MAJOR in
  *[!0-9]*|"") NODE_MAJOR=0 ;;
esac
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "Node 22+ is required; found $(node --version 2>/dev/null || printf 'an unreadable Node install'). Install Node 22+ from https://nodejs.org/ and run this command again. Nothing was installed."
fi

INSTALL_PARENT=$(dirname "$INSTALL_HOME")
mkdir -p "$INSTALL_PARENT"
STAGE=$(mktemp -d "$INSTALL_PARENT/.skill-heaven-install.XXXXXX")
OLD=$INSTALL_PARENT/.skill-heaven-old.$$
cleanup() {
  rm -rf "$STAGE" "$OLD"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$STAGE/source" "$STAGE/engine" "$STAGE/bin"
ARCHIVE=$STAGE/source.tar.gz
say "Fetching Skill Heaven source ($SOURCE_REF) ..."
curl -fsSL "$SOURCE_ARCHIVE" -o "$ARCHIVE" || fail "could not download $SOURCE_ARCHIVE. Check the URL/network; nothing was installed."
tar -xzf "$ARCHIVE" -C "$STAGE/source" --strip-components=1 || fail "downloaded source could not be extracted; nothing was installed."
rm -f "$ARCHIVE"

for door in claude pi codex hermes grok; do
  [ -f "$STAGE/source/packages/$door-heaven/bin/$door-heaven.mjs" ] || fail "source archive is missing $door-heaven; nothing was installed."
done

say "Installing launcher runtime dependencies ..."
(
  cd "$STAGE/source"
  npm ci --omit=dev --ignore-scripts --no-audit --no-fund
) || fail "launcher dependency installation failed; nothing was installed."

say "Installing the published summon engine ($MCP_SPEC) ..."
npm install --prefix "$STAGE/engine" --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false "$MCP_SPEC" || fail "could not install $MCP_SPEC; nothing was installed."
ENGINE_BIN=$STAGE/engine/node_modules/.bin/skill-hell
ENGINE_PACKAGE=$STAGE/engine/node_modules/@gaia-research/mcp/package.json
[ -x "$ENGINE_BIN" ] || fail "$MCP_SPEC did not provide an executable skill-hell binary; nothing was installed."
[ -f "$ENGINE_PACKAGE" ] || fail "$MCP_SPEC did not provide package metadata; nothing was installed."
ENGINE_VERSION=$(node -p 'require(process.argv[1]).version' "$ENGINE_PACKAGE")

for door in claude pi codex hermes grok; do
  ln -s "../source/packages/$door-heaven/bin/$door-heaven.mjs" "$STAGE/bin/$door-heaven"
done
ln -s ../engine/node_modules/.bin/skill-hell "$STAGE/bin/skill-hell"
cat >"$STAGE/uninstall.sh" <<'EOF'
#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
PLUGIN_ID=claude-heaven@skill-heaven
MARKETPLACE=skill-heaven

printf '%s\n' "Skill Heaven working prototype — uninstalling everything from $ROOT"
if [ -f "$ROOT/.claude-plugin-managed" ]; then
  if ! command -v claude >/dev/null 2>&1; then
    printf '%s\n' "Claude Code is not on PATH; run this later before uninstalling:" >&2
    printf '%s\n' "  claude plugin uninstall $PLUGIN_ID" >&2
    exit 1
  fi
  printf '%s\n' "Removing Claude plugin $PLUGIN_ID ..."
  claude plugin uninstall "$PLUGIN_ID"
fi
if [ -f "$ROOT/.claude-marketplace-managed" ]; then
  if ! command -v claude >/dev/null 2>&1; then
    printf '%s\n' "Claude Code is not on PATH; run this later before uninstalling:" >&2
    printf '%s\n' "  claude plugin marketplace remove $MARKETPLACE" >&2
    exit 1
  fi
  printf '%s\n' "Removing Claude marketplace $MARKETPLACE ..."
  claude plugin marketplace remove "$MARKETPLACE"
fi
rm -rf "$ROOT"
printf '%s\n' "Removed the five doors, skill-hell, and installer-managed Claude plugin state."
EOF
chmod +x "$STAGE/uninstall.sh"

# Preserve ownership records across an idempotent update. These markers ensure
# uninstall never removes Claude state that predated this installer.
[ -f "$PLUGIN_MANAGED" ] && touch "$STAGE/.claude-plugin-managed"
[ -f "$MARKETPLACE_MANAGED" ] && touch "$STAGE/.claude-marketplace-managed"

if [ -d "$INSTALL_HOME" ]; then
  mv "$INSTALL_HOME" "$OLD"
fi
mv "$STAGE" "$INSTALL_HOME"
STAGE=$INSTALL_PARENT/.skill-heaven-stage-moved.$$
rm -rf "$OLD"

if command -v claude >/dev/null 2>&1; then
  say "Claude Code detected; installing its /skill-heaven and /skill-hell plugin ..."
  if marketplace_is_configured; then
    claude plugin marketplace update "$MARKETPLACE"
  else
    claude plugin marketplace add https://github.com/gaia-research/skill-heaven.git
    touch "$MARKETPLACE_MANAGED"
  fi

  if plugin_is_installed; then
    claude plugin update "$PLUGIN_ID"
  else
    claude plugin install --scope user "$PLUGIN_ID"
    touch "$PLUGIN_MANAGED"
  fi
  say "Claude plugin ready: /skill-heaven and /skill-hell."
else
  say "Claude Code was not detected, so no harness was installed and plugin registration is deferred."
  say "After installing Claude Code yourself, register the already-delivered plugin with:"
  say "  claude plugin marketplace add https://github.com/gaia-research/skill-heaven.git"
  say "  claude plugin install --scope user $PLUGIN_ID"
fi

say "Installed launcher doors:"
for door in claude pi codex hermes grok; do
  say "  $door-heaven"
done
say "Installed summon engine: skill-hell (@gaia-research/mcp@$ENGINE_VERSION)"

say "Harnesses detected (not installed by this script):"
for harness in claude pi codex hermes grok; do
  if command -v "$harness" >/dev/null 2>&1; then
    say "  $harness: yes"
  else
    say "  $harness: no"
  fi
done

case :$PATH: in
  *:"$BIN_DIR":*)
    say "PATH already includes $BIN_DIR"
    ;;
  *)
    say "Add the install directory to PATH (this installer does not edit shell rc files):"
    say "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
say "Uninstall everything this command added with:"
say "  $INSTALL_HOME/uninstall.sh"
say "Install complete. Re-run the same one-liner to update idempotently."
