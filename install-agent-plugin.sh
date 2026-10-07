#!/bin/sh
# Install the portable Skill Heaven Agent Plugin to one stable local directory.
# Client registration is intentionally separate: Agent Plugins standardizes the
# package, while every client owns its install/enable command.

set -eu

PROGRAM=skill-heaven-agent-plugin-install
DEFAULT_HOME=${XDG_DATA_HOME:-"$HOME/.local/share"}/gaia-skill-heaven-agent-plugin
INSTALL_HOME=${SKILL_HEAVEN_PLUGIN_HOME:-$DEFAULT_HOME}
MARKETPLACE_DIR=$INSTALL_HOME/marketplace
PLUGIN_DIR=$MARKETPLACE_DIR/plugins/skill-heaven
SOURCE_REF=${SKILL_HEAVEN_REF:-main}
SOURCE_ARCHIVE=${SKILL_HEAVEN_ARCHIVE_URL:-"https://codeload.github.com/gaia-research/gaia-skill-heaven/tar.gz/$SOURCE_REF"}

QUIET=0

say() {
  [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"
}

fail() {
  printf '%s: %s\n' "$PROGRAM" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh
       curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh -s -- --quiet
       $0 --quiet
       $0 --print-path
       $0 --uninstall

Installs the portable Agent Plugin package to:
  $PLUGIN_DIR

It does not install or silently reconfigure an agent harness. Agent Plugins
clients load this directory; marketplace clients load $MARKETPLACE_DIR.
Set SKILL_HEAVEN_PLUGIN_HOME to override the installation root.

When it finishes it looks for the supported harnesses on your PATH (by name
only; it never runs one and never reads or writes their configuration) and
prints the exact next command for each one it finds.

Options:
  --quiet, -q   print only the plugin directory and the marketplace directory
                (one per line, nothing else), for scripts
  --print-path  print the plugin directory and exit
  --uninstall   remove the local artifact (client registrations are removed in
                each client)
  --help, -h    show this help
EOF
}

case ${1:-} in
  --quiet|-q)
    QUIET=1
    shift
    ;;
esac

case ${1:-} in
  --help|-h)
    usage
    exit 0
    ;;
  --print-path)
    printf '%s\n' "$PLUGIN_DIR"
    exit 0
    ;;
  --uninstall)
    if [ -d "$INSTALL_HOME" ]; then
      [ -f "$INSTALL_HOME/.skill-heaven-agent-plugin-install" ] || fail "refusing to remove unverified directory: $INSTALL_HOME"
      rm -rf "$INSTALL_HOME"
      say "Removed the local Skill Heaven Agent Plugin artifact from $INSTALL_HOME"
      say "Client-managed plugin copies and registrations were not removed."
    else
      say "Skill Heaven Agent Plugin is not installed at $INSTALL_HOME"
    fi
    exit 0
    ;;
  "")
    ;;
  *)
    usage >&2
    fail "unknown argument: $1"
    ;;
esac

say "[1/4] Checking prerequisites..."
missing=
for tool in node curl tar mktemp git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    missing="$missing $tool"
  fi
done
[ -z "$missing" ] || fail "missing prerequisite(s):$missing. Node must be 22+ and Git is required by /summon. Nothing was installed."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')
case $NODE_MAJOR in
  *[!0-9]*|"") NODE_MAJOR=0 ;;
esac
[ "$NODE_MAJOR" -ge 22 ] || fail "Node 22+ is required; found $(node --version 2>/dev/null || printf unknown). Nothing was installed."

INSTALL_PARENT=$(dirname "$INSTALL_HOME")
mkdir -p "$INSTALL_PARENT"
WORK=$(mktemp -d "$INSTALL_PARENT/.gaia-skill-heaven-agent-plugin.XXXXXX")
NEXT=$WORK/install
OLD=$INSTALL_PARENT/.gaia-skill-heaven-agent-plugin-old.$$
BACKED_UP=0
cleanup() {
  if [ "$BACKED_UP" -eq 1 ] && [ -d "$OLD" ]; then
    if [ -e "$INSTALL_HOME" ]; then
      BACKED_UP=0
    elif mv "$OLD" "$INSTALL_HOME"; then
      BACKED_UP=0
    else
      printf '%s: rollback failed; previous installation preserved at %s\n' "$PROGRAM" "$OLD" >&2
    fi
  fi
  rm -rf "$WORK"
  [ "$BACKED_UP" -eq 1 ] || rm -rf "$OLD"
}

on_interrupt() {
  trap - EXIT HUP INT TERM
  say ""
  say "Installation cancelled by user. Cleaning up..."
  cleanup
  exit 130
}
trap on_interrupt INT TERM HUP
trap cleanup EXIT

mkdir -p "$WORK/source" "$NEXT/marketplace/plugins"
ARCHIVE=$WORK/source.tar.gz
say "[2/4] Fetching Skill Heaven Agent Plugin ($SOURCE_REF) ..."
curl -fsSL "$SOURCE_ARCHIVE" -o "$ARCHIVE" || fail "could not download $SOURCE_ARCHIVE. Nothing was installed."
say "[3/4] Extracting plugin archive..."
tar -xzf "$ARCHIVE" -C "$WORK/source" --strip-components=1 || fail "downloaded source could not be extracted. Nothing was installed."

say "[4/4] Staging portable Agent Plugin artifact..."
SOURCE_PLUGIN=$WORK/source/plugins/skill-heaven
for required in plugin.json mcp.json skills/summon/SKILL.md mcp/skill-summon.mjs; do
  [ -f "$SOURCE_PLUGIN/$required" ] || fail "source archive is missing plugins/skill-heaven/$required. Nothing was installed."
done
[ -f "$WORK/source/.claude-plugin/marketplace.json" ] || fail "source archive is missing the marketplace manifest. Nothing was installed."

cp -R "$SOURCE_PLUGIN/." "$NEXT/marketplace/plugins/skill-heaven/"
mkdir -p "$NEXT/marketplace/.claude-plugin"
# The repository marketplace may list Claude-only plugins (the optional
# console) that this portable artifact does not carry. List only what was
# staged, so no client is pointed at an entry whose directory is missing.
node -e '
  const fs = require("node:fs");
  const [from, to] = process.argv.slice(1);
  const market = JSON.parse(fs.readFileSync(from, "utf8"));
  market.plugins = (market.plugins || []).filter((p) => p && p.source === "./plugins/skill-heaven");
  if (market.plugins.length !== 1) process.exit(3);
  fs.writeFileSync(to, JSON.stringify(market, null, 2) + "\n");
' "$WORK/source/.claude-plugin/marketplace.json" "$NEXT/marketplace/.claude-plugin/marketplace.json" \
  || fail "could not write the local marketplace manifest. Nothing was installed."

# Hermes currently accepts a Git source rather than an arbitrary local
# directory. A tiny local repository keeps the installed package usable there.
# Do not inherit repository redirection, signing, or hooks from the caller.
(
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR GIT_NAMESPACE GIT_CONFIG_COUNT
  export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_GLOBAL=/dev/null
  cd "$NEXT/marketplace/plugins/skill-heaven"
  git -c core.hooksPath=/dev/null init -q
  git -c core.hooksPath=/dev/null add --all
  git -c core.hooksPath=/dev/null \
    -c commit.gpgsign=false \
    -c user.name='Skill Heaven installer' \
    -c user.email='installer@skill-heaven.invalid' \
    commit --no-gpg-sign -qm "Install Skill Heaven Agent Plugin $SOURCE_REF"
  git ls-files --error-unmatch \
    plugin.json mcp.json skills/summon/SKILL.md mcp/skill-summon.mjs >/dev/null
) || fail "could not prepare the complete local plugin repository. Nothing was installed."

touch "$NEXT/.skill-heaven-agent-plugin-install"
cat > "$NEXT/uninstall.sh" <<'EOF'
#!/bin/sh
set -eu
PROGRAM=skill-heaven-agent-plugin-uninstall
ROOT=$(CDPATH= cd -P "$(dirname "$0")" && pwd)
if [ ! -f "$ROOT/.skill-heaven-agent-plugin-install" ] || \
   [ ! -f "$ROOT/marketplace/plugins/skill-heaven/plugin.json" ]; then
  printf '%s: refusing to remove unverified directory: %s\n' "$PROGRAM" "$ROOT" >&2
  exit 1
fi
rm -rf "$ROOT"
printf '%s\n' "Removed the local Skill Heaven Agent Plugin artifact from $ROOT"
printf '%s\n' "Client-managed plugin copies and registrations were not removed."
EOF
chmod +x "$NEXT/uninstall.sh"

if [ -d "$INSTALL_HOME" ]; then
  mv "$INSTALL_HOME" "$OLD"
  BACKED_UP=1
fi
if ! mv "$NEXT" "$INSTALL_HOME"; then
  fail "could not activate the new package; the previous installation will be restored."
fi
BACKED_UP=0
rm -rf "$OLD"

# ---- Onboarding epilogue (docs/CONTROL-PLANE.md section 1 and 5.4) -----------
# The facts below mirror packages/status/src/compat.ts (HARNESS_PATHS); a vitest
# drift test fails if they diverge. Detection is `command -v` by name only: no
# harness is ever executed, and no harness configuration is read or written.
START_URL=https://gaia-research.github.io/gaia-skill-heaven/#/start

if [ "$QUIET" -eq 1 ]; then
  printf '%s\n' "$PLUGIN_DIR"
  printf '%s\n' "$MARKETPLACE_DIR"
  exit 0
fi

FOUND=0
MISSING=
have() {
  command -v "$1" >/dev/null 2>&1
}
found_head() {
  FOUND=$((FOUND + 1))
  printf '  %-8s %s - %s\n' "$1" "$2" "$3"
}
missing() {
  if [ -z "$MISSING" ]; then MISSING=$1; else MISSING="$MISSING, $1"; fi
}

say "Installed the portable Skill Heaven Agent Plugin."
say ""
say "What changed on this machine"
say "  + $PLUGIN_DIR  (the plugin, one directory)"
say "  + $MARKETPLACE_DIR  (a local marketplace that lists it)"
say "  No harness was installed or reconfigured."
say ""
say "Harnesses found on PATH"

if have claude; then
  found_head claude "Claude Code" "Verified (2.1.288)"
  say "           Inside Claude Code, type:"
  say "             /plugin marketplace add gaia-research/gaia-skill-heaven"
  say "             /plugin install skill-heaven@gaia-skill-heaven"
else
  missing claude
fi
if have codex; then
  found_head codex "Codex" "Compatible (probed 0.146.0)"
  say "             codex plugin marketplace add \"$MARKETPLACE_DIR\""
  say "             codex plugin add skill-heaven@gaia-skill-heaven"
else
  missing codex
fi
if have pi; then
  found_head pi "Pi" "Compatible (probed 0.84.2)"
  say "             pi install \"$PLUGIN_DIR\" --approve"
else
  missing pi
fi
if have grok; then
  found_head grok "Grok" "Compatible (probed 1.0.5)"
  say "             grok plugin install \"$PLUGIN_DIR\" --trust"
else
  missing grok
fi
if have hermes; then
  found_head hermes "Hermes" "Compatible (probed 0.20.0)"
  say "             hermes plugins install \"file://$PLUGIN_DIR\" --enable"
else
  missing hermes
fi
if have agy; then
  found_head agy "Antigravity" "Partial (static check on 1.3.1)"
  say "           No registration command is printed until a logged-in probe shows Antigravity loading the summon server."
  say "           The agy-zero launcher (probed on 1.2.13) gives a clean start meanwhile."
else
  missing agy
fi

if [ "$FOUND" -eq 0 ]; then
  say "  (none found)"
  say "  No supported harness was found on PATH. Skill Heaven runs inside a harness you already use; it never installs one."
  say "  When you have one, run its command from $START_URL"
fi
if [ -n "$MISSING" ]; then
  say ""
  say "Not found: $MISSING"
fi
say ""
say "Another Agent Plugins client (Unverified)"
say "  Point your client's own plugin install at $PLUGIN_DIR."
say "  There is no universal registration command."
say ""
say "First run: inside your harness, type /summon <what you need>."
say "Update:    re-run this installer (clients that cache plugins also need their own update)."
say "Remove:    $INSTALL_HOME/uninstall.sh   (client registrations are removed in each client)"
say "Choose your harness and read what each step does: $START_URL"
