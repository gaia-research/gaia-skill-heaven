#!/bin/sh
# Portable Agent Plugin profiles. This bootstrap downloads/extracts the source;
# one generated Node helper owns staging, registration and both OS lifecycles.
set -eu
PROGRAM=skill-heaven-agent-plugin-install
INSTALL_HOME=${SKILL_HEAVEN_PLUGIN_HOME:-${XDG_DATA_HOME:-"$HOME/.local/share"}/gaia-skill-heaven-agent-plugin}
SOURCE_REF=${SKILL_HEAVEN_REF:-main}
SOURCE_ARCHIVE=${SKILL_HEAVEN_ARCHIVE_URL:-"https://codeload.github.com/gaia-research/gaia-skill-heaven/tar.gz/$SOURCE_REF"}
QUIET=0
UNINSTALL=0
PRINT_PATH=0
EXPECT_VALUE=0
for arg in "$@"; do
  if [ "$EXPECT_VALUE" -eq 1 ]; then EXPECT_VALUE=0; continue; fi
  case "$arg" in
    --quiet|-q) QUIET=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --print-path) PRINT_PATH=1 ;;
    --profile|--harness) EXPECT_VALUE=1 ;;
    --register) ;;
    --help|-h)
      printf '%s\n' 'Skill Heaven Agent Plugin — Core / Full' \
        'Usage: install-agent-plugin.sh [--profile core|full] [--harness claude|pi|codex|hermes|grok|agy] [--register]' \
        '       install-agent-plugin.sh --uninstall [--register]' \
        '       install-agent-plugin.sh --print-path' \
        'Core: summon + Zero/Heaven/Hell/Ultra surfaces, no console. Full: Core + native console.' \
        'Default: Core on a fresh install; repeat installs preserve the recorded profile.' \
        'Full requires an explicit harness. --register runs that host’s own registration commands.' \
        'Without --register only the artifact is staged and exact next commands are printed.' \
        'Registered Full → Core requires --register, so no installer-owned console registration is left.' \
        'No harness binaries are installed. Launchers are a separate optional install.' \
        'Environment: SKILL_HEAVEN_PLUGIN_HOME, SKILL_HEAVEN_PROFILE, SKILL_HEAVEN_HARNESS, SKILL_HEAVEN_REF.'
      exit 0 ;;
    *) printf '%s: unknown argument: %s\n' "$PROGRAM" "$arg" >&2; exit 1 ;;
  esac
done
[ "$EXPECT_VALUE" -eq 0 ] || { printf '%s: missing option value\n' "$PROGRAM" >&2; exit 1; }
if [ "$PRINT_PATH" -eq 1 ]; then printf '%s\n' "$INSTALL_HOME/marketplace/plugins/skill-heaven"; exit 0; fi
if [ "$UNINSTALL" -eq 1 ]; then
  if [ ! -e "$INSTALL_HOME" ]; then printf '%s\n' "Skill Heaven Agent Plugin is not installed at $INSTALL_HOME"; exit 0; fi
  [ ! -L "$INSTALL_HOME" ] && [ -f "$INSTALL_HOME/.skill-heaven-agent-plugin-install" ] && [ -f "$INSTALL_HOME/install-profile.mjs" ] || { printf '%s: refusing to remove unverified directory: %s\n' "$PROGRAM" "$INSTALL_HOME" >&2; exit 1; }
  exec node "$INSTALL_HOME/install-profile.mjs" --home "$INSTALL_HOME" "$@"
fi
for tool in node curl tar mktemp git; do
  command -v "$tool" >/dev/null 2>&1 || { printf '%s: missing prerequisite: %s. Nothing was installed.\n' "$PROGRAM" "$tool" >&2; exit 1; }
done
[ "$(node -p 'Number(process.versions.node.split(".")[0]) >= 22')" = true ] || { printf '%s: Node 22+ is required. Nothing was installed.\n' "$PROGRAM" >&2; exit 1; }
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
on_interrupt() {
  printf '%s\n' 'Installation cancelled by user' >&2
  exit 130
}
trap on_interrupt HUP INT TERM
[ "$QUIET" -eq 1 ] || printf '%s\n' '[1/4] Checking prerequisites...' "[2/4] Fetching Skill Heaven Agent Plugin ($SOURCE_REF) ..."
curl -fsSL "$SOURCE_ARCHIVE" -o "$WORK/source.tar.gz" || { printf '%s: could not download source. Nothing was installed.\n' "$PROGRAM" >&2; exit 1; }
[ "$QUIET" -eq 1 ] || printf '%s\n' '[3/4] Extracting plugin archive...'
mkdir "$WORK/source"
tar -xzf "$WORK/source.tar.gz" -C "$WORK/source" --strip-components=1
[ -f "$WORK/source/scripts/install-profile.mjs" ] || { printf '%s: source archive is missing scripts/install-profile.mjs. Nothing was installed.\n' "$PROGRAM" >&2; exit 1; }
[ "$QUIET" -eq 1 ] || printf '%s\n' '[4/4] Staging portable Agent Plugin artifact...'
node "$WORK/source/scripts/install-profile.mjs" --source "$WORK/source" --home "$INSTALL_HOME" "$@"
