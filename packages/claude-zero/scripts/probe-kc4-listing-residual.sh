#!/usr/bin/env bash
# KC4 probe — "curated mode shows zero listing residual" (GAIA Roadmap v5,
# Program 1, Arc I, gaia-research/skill-heaven issue #10).
#
# WHAT THIS MEASURES. compile()'s "curated" route for the claude harness
# composes:
#   --setting-sources project --strict-mcp-config --mcp-config '{}'
#   --plugin-dir $SESSION/heaven-set
#   env CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1
# An earlier attempt (PR #18) could only show that `claude` PARSES this argv —
# unknown flags are rejected before auth, so a clean parse proves the flags are
# valid, not that anything actually loaded. A nonexistent --plugin-dir parses
# identically. This script does NOT repeat that mistake: it launches a real
# `claude` process (via the actual claude-heaven CLI door, i.e.
# packages/claude-heaven/src/cli.ts -> core's compile()) and reads the
# harness's own `system:init` stream-json event, which enumerates
# `skills`/`plugins` BEFORE any model call or auth check runs. That event is
# ground truth from the harness itself, not a self-report the model could get
# wrong — and critically it is captured even when the environment has no live
# credentials (auth failure happens strictly after `system:init` is emitted).
#
# SCENARIOS
#   S1  curated, cwd has a PLANTED PROJECT-SCOPE marker skill + one curated
#       skill mounted via --skill. Tests the open question: does
#       `--setting-sources project` keep project scope live under curated?
#   S2  curated, cwd is a CLEAN project dir (no .claude/skills at all) + the
#       same curated skill. Isolates any residual that is NOT explained by
#       project scope (e.g. a bundled CLI skill CLAUDE_CODE_DISABLE_BUNDLED_
#       SKILLS=1 fails to suppress).
#   S3  raw `claude` invocation, SAME plugin-dir mount as S1/S2 but WITHOUT
#       `--setting-sources project`, cwd has the planted project marker.
#       Causal isolation: if the project marker disappears here, `--setting-
#       sources project` is confirmed as the specific cause of any S1 leak.
#   S4  native posture (via claude-heaven CLI), cwd has the planted project
#       marker. Reference baseline — shows the full, uncurated listing so S1/
#       S2/S3 can be read against it.
#
# PROBE HYGIENE (founder ruling, 2026-07-29): every artifact this script
# writes lives under $PROBE_ROOT and is NEVER deleted by this script. Re-runs
# get a fresh $PROBE_ROOT (timestamped) so nothing is overwritten either.
#
# USAGE
#   packages/claude-heaven/scripts/probe-kc4-listing-residual.sh
#   KC4_PROBE_ROOT=/some/dir packages/claude-heaven/scripts/probe-kc4-listing-residual.sh
#
# Requires: node/npx (tsx resolves via the workspace), jq. Does not require an
# authenticated `claude` session — see NOTE ON AUTH below.
#
# NOTE ON AUTH: the `system:init` stream-json event this script reads is
# emitted before Claude Code checks authentication, so this probe works
# identically authenticated or not. If your environment IS authenticated, this
# script still costs at most one trivial turn per scenario (the prompt is a
# short diagnostic ping) — it does not loop or retry.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLAUDE_HEAVEN_PKG="$REPO_ROOT/packages/claude-heaven"
CLAUDE_HEAVEN_CLI="$CLAUDE_HEAVEN_PKG/src/cli.ts"

if ! command -v jq >/dev/null 2>&1; then
  echo "probe-kc4-listing-residual: jq is required but not on PATH" >&2
  exit 1
fi
if ! command -v claude >/dev/null 2>&1; then
  echo "probe-kc4-listing-residual: the \`claude\` binary is required but not on PATH" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PROBE_ROOT="${KC4_PROBE_ROOT:-$(mktemp -d "${TMPDIR:-/tmp}/kc4-probe-${STAMP}.XXXXXX")}"
mkdir -p "$PROBE_ROOT"
EVIDENCE="$PROBE_ROOT/evidence"
mkdir -p "$EVIDENCE"

echo "== KC4 listing-residual probe =="
echo "probe root: $PROBE_ROOT"
echo "repo:       $REPO_ROOT"
echo "claude:     $(command -v claude) ($(claude --version 2>&1))"
echo "date (UTC): $STAMP"
echo

# ---------------------------------------------------------------------------
# Baseline snapshot — record BEFORE any run so drift is measurable afterward.
# ---------------------------------------------------------------------------
BASELINE="$EVIDENCE/00-baseline-snapshot.txt"
{
  echo "=== claude --version ==="
  claude --version
  echo
  echo "=== date ==="
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  echo
  echo "=== node --version ==="
  node --version
  echo
  echo "=== \$HOME/.claude/skills listing (baseline; this probe never writes here) ==="
  ls -la "$HOME/.claude/skills" 2>&1
  echo
  echo "=== \$HOME/.claude/skills content checksum ==="
  find "$HOME/.claude/skills" -type f 2>/dev/null | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256
  echo
  echo "=== \$HOME/.claude/settings.json sha256 ==="
  shasum -a 256 "$HOME/.claude/settings.json" 2>&1
} > "$BASELINE" 2>&1
echo "baseline snapshot -> $BASELINE"

# ---------------------------------------------------------------------------
# Fixtures: a project-scope marker (planted at <cwd>/.claude/skills) and a
# curated-set marker (mounted via --skill). Distinctive names so grep is
# unambiguous; description text says on its face what it is for.
# ---------------------------------------------------------------------------
PROJECT_WITH_MARKER="$PROBE_ROOT/project-with-marker"
PROJECT_CLEAN="$PROBE_ROOT/project-clean"
CURATED_SKILL_DIR="$PROBE_ROOT/curated-skill-src/kc4-curated-marker"

mkdir -p "$PROJECT_WITH_MARKER/.claude/skills/kc4-project-marker"
cat > "$PROJECT_WITH_MARKER/.claude/skills/kc4-project-marker/SKILL.md" <<'EOF'
---
name: kc4-project-marker
description: KC4 PROBE MARKER — project-scope skill planted at <cwd>/.claude/skills for the KC4 zero-listing-residual probe. If this name appears in a curated-posture session's skill listing, curated mode is leaking project scope.
---

# kc4-project-marker

This skill exists only to be detected. It must never be invoked.
EOF

mkdir -p "$PROJECT_CLEAN"

mkdir -p "$CURATED_SKILL_DIR"
cat > "$CURATED_SKILL_DIR/SKILL.md" <<'EOF'
---
name: kc4-curated-marker
description: KC4 PROBE MARKER — the ONE skill deliberately admitted into a curated posture via --skill for the KC4 zero-listing-residual probe. Its presence in the listing is the positive control proving the curated plugin-dir mount actually worked (not just parsed).
---

# kc4-curated-marker

This skill exists only to be detected. It must never be invoked.
EOF

echo "fixtures written under $PROBE_ROOT"
echo

# ---------------------------------------------------------------------------
# Helper: run a `claude ... --output-format stream-json --verbose` invocation,
# capture stdout/stderr, and pull the first `system`/`init` event's
# `skills`/`plugins`/`slash_commands` fields into a small summary.
# argv[1] = scenario id, argv[2] = evidence-file basename, argv[3] = cwd,
# remaining argv = the command to run (as an array via "$@" after shift).
# ---------------------------------------------------------------------------
run_scenario() {
  local id="$1" name="$2" cwd="$3"
  shift 3
  local raw="$EVIDENCE/${id}-${name}.stream.jsonl"
  local summary="$EVIDENCE/${id}-${name}.summary.json"

  echo "-- $id ($name) --"
  echo "   cwd: $cwd"
  echo "   cmd: $*"
  (
    cd "$cwd"
    # Real invocation. -p with a trivial prompt + stream-json + --verbose:
    # the system:init event (skills/plugins/slash_commands) is emitted before
    # any model call, so this is captured even when the environment has no
    # live `claude` credentials (see NOTE ON AUTH above).
    "$@" -p "diagnostic ping (KC4 probe, no action requested)" \
      --output-format stream-json --verbose
  ) > "$raw" 2> "${raw%.jsonl}.stderr.txt" || true

  jq -s --arg scenario "$id" --arg label "$name" --arg cwd "$cwd" '
    (map(select(.type == "system" and .subtype == "init")) | .[0]) as $init
    | (map(select(.type == "result")) | .[0]) as $result
    | {
        scenario: $scenario,
        label: $label,
        cwd: $cwd,
        init_seen: ($init != null),
        skills: ($init.skills // []),
        plugins: ($init.plugins // []),
        slash_commands: ($init.slash_commands // []),
        result_subtype: ($result.subtype // null),
        result_is_error: ($result.is_error // null),
        result_text: ($result.result // null)
      }
  ' "$raw" > "$summary" 2>/dev/null || echo '{"error":"jq parse failed, see raw stream"}' > "$summary"

  echo "   skills listed: $(jq -c '.skills' "$summary" 2>/dev/null || echo '(parse failed)')"
  echo "   raw     -> $raw"
  echo "   summary -> $summary"
  echo
}

# S1 — curated, cwd has the planted project-scope marker. THE headline test.
run_scenario S1 curated-with-project-marker "$PROJECT_WITH_MARKER" \
  npx --prefix "$CLAUDE_HEAVEN_PKG" tsx "$CLAUDE_HEAVEN_CLI" \
    --posture curated --skill "$CURATED_SKILL_DIR" --

# S2 — curated, cwd is a clean project (no .claude/skills at all). Isolates
# residual that ISN'T explained by project scope.
run_scenario S2 curated-clean-project "$PROJECT_CLEAN" \
  npx --prefix "$CLAUDE_HEAVEN_PKG" tsx "$CLAUDE_HEAVEN_CLI" \
    --posture curated --skill "$CURATED_SKILL_DIR" --

# S3 — raw `claude`, same plugin-dir mount as S1, WITHOUT
# --setting-sources project. Causal isolation for the open question.
S3_SESSION="$PROBE_ROOT/s3-manual-session"
mkdir -p "$S3_SESSION/heaven-set/skills" "$S3_SESSION/heaven-set/.claude-plugin"
cat > "$S3_SESSION/heaven-set/.claude-plugin/plugin.json" <<'EOF'
{
  "name": "heaven-set",
  "description": "Session-scoped curated skill set (Skill Heaven launcher) — S3 manual replica",
  "version": "0.0.0"
}
EOF
cp -R "$CURATED_SKILL_DIR" "$S3_SESSION/heaven-set/skills/kc4-curated-marker"

run_scenario S3 no-setting-sources-project "$PROJECT_WITH_MARKER" \
  env CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1 claude \
    --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
    --plugin-dir "$S3_SESSION/heaven-set"

# S4 — native, cwd has the planted project-scope marker. Reference baseline.
run_scenario S4 native-with-project-marker "$PROJECT_WITH_MARKER" \
  npx --prefix "$CLAUDE_HEAVEN_PKG" tsx "$CLAUDE_HEAVEN_CLI" \
    --posture native --

echo "== Done =="
echo "All evidence under: $EVIDENCE"
echo "Nothing under \$PROBE_ROOT was deleted by this script (probe hygiene ruling)."
echo "\$HOME/.claude was not written to; re-diff $BASELINE against a fresh baseline to confirm."
