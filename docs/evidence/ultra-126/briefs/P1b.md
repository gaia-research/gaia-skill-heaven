# Probe P1b: elicitation under bypass and auto permission modes (Team C, Antigravity)

Same rules, fixture and isolation as `docs/evidence/ultra-126/briefs/P1.md`. Read
that file first. Worktree `~/skill-heaven-wt/p1`, branch `feat/ws6-ultra-u3-p1`.
Reuse `docs/evidence/ultra-126/probes/p1/server.mjs` unchanged. Model under test:
`claude-haiku-5-5`. Harness binary: `~/.local/bin/claude`. You are in your own herdr tab.
Split TUI panes inside it, and close each one after recording.

## Cells (n = 3 each)

| Cell | Mode | Hard signal |
|---|---|---|
| C2-tb | TUI, `--dangerously-skip-permissions`, prompt "call probe_elicit" | Does the elicitation prompt appear in the pane? Record a `pane read` excerpt, then what the server receives (logged response verbatim) after the fixture types `ALPHA` and selects Accept. If no prompt appears, record the response the server got with no keystrokes. |
| C2-ta | TUI, `--permission-mode auto`, `--allowedTools mcp__p1__probe_elicit` | same |
| C2-hb | headless `-p --dangerously-skip-permissions` | logged response to `elicitation/create` |

Keystrokes are a test fixture standing in for an operator. Label them that way.

## Record

Append a `## P1b: elicitation under bypass and auto modes` section to
`docs/evidence/ultra-126/PROBE.md`: version, flags, pane ids, a cell × run table, and
log files under `probes/p1/logs/`. No interpretation. Leave
`### Interpretation (orchestrator)` with `pending`. Commit with
`Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>`, then push. PR #258 already
exists for this branch, so do not open another.

Final reply, exactly four lines:
```
PR: #258
Commit: <HEAD SHA>
Handoff: docs/evidence/ultra-126/PROBE.md
Status: READY FOR REVIEW | BLOCKED: <one line>
```
