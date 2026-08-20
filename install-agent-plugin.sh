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

say() {
  printf '%s\n' "$*"
}

fail() {
  printf '%s: %s\n' "$PROGRAM" "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh
       $0 --print-path
       $0 --uninstall

Installs the portable Agent Plugin package to:
  $PLUGIN_DIR

It does not install or silently reconfigure an agent harness. Agent Plugins
clients load this directory; marketplace clients load $MARKETPLACE_DIR.
Set SKILL_HEAVEN_PLUGIN_HOME to override the installation root.
EOF
}

case ${1:-} in
  --help|-h)
    usage
    exit 0
    ;;
  --print-path)
    say "$PLUGIN_DIR"
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
trap cleanup EXIT HUP INT TERM

mkdir -p "$WORK/source" "$NEXT/marketplace/plugins"
ARCHIVE=$WORK/source.tar.gz
say "Fetching Skill Heaven Agent Plugin ($SOURCE_REF) ..."
curl -fsSL "$SOURCE_ARCHIVE" -o "$ARCHIVE" || fail "could not download $SOURCE_ARCHIVE. Nothing was installed."
tar -xzf "$ARCHIVE" -C "$WORK/source" --strip-components=1 || fail "downloaded source could not be extracted. Nothing was installed."

SOURCE_PLUGIN=$WORK/source/plugins/skill-heaven
for required in plugin.json mcp.json skills/summon/SKILL.md mcp/skill-summon.mjs; do
  [ -f "$SOURCE_PLUGIN/$required" ] || fail "source archive is missing plugins/skill-heaven/$required. Nothing was installed."
done
[ -f "$WORK/source/.claude-plugin/marketplace.json" ] || fail "source archive is missing the marketplace manifest. Nothing was installed."

cp -R "$SOURCE_PLUGIN/." "$NEXT/marketplace/plugins/skill-heaven/"
mkdir -p "$NEXT/marketplace/.claude-plugin"
cp "$WORK/source/.claude-plugin/marketplace.json" "$NEXT/marketplace/.claude-plugin/marketplace.json"

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

say "Installed the portable Skill Heaven Agent Plugin."
say "Plugin directory: $PLUGIN_DIR"
say "Marketplace directory: $MARKETPLACE_DIR"
say ""
say "Point any standards-conformant Agent Plugins client at the plugin directory above; clients outside the pinned probe remain unverified."
say "Client registration is explicit because the Agent Plugins specification does not define one universal install command."
say "Re-run this installer to update the local artifact; clients that cache plugins still need their own update/reinstall command."
say "Uninstall the local artifact with:"
say "  $INSTALL_HOME/uninstall.sh"
say "Client-managed plugin copies and registrations are not removed by that command."
