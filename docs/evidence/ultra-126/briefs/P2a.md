# Probe P2a: Claude Code session identity and MCP server lifetime (Team C, Antigravity; part of U7's P2)

U0b will build re-attach on what this probe measures. You record hard signals; the
orchestrator interprets. Read `docs/evidence/ultra-126/briefs/COMMON.md` (Visibility, Who
runs the review) and `docs/evidence/ultra-126/briefs/P1.md` (isolation rules,
`~/.local/bin/claude`, no private paths in committed files). Worktree
`~/skill-heaven-wt/p2a`, branch `feat/ws6-ultra-u7-p2a`.

Model under test: `claude-haiku-5-5`, on every invocation. Record the harness version.

## Fixture

`docs/evidence/ultra-126/probes/p2a/server.mjs` is a zero-dependency stdio MCP server
that, on start, appends one JSONL line to `$P2A_LOG` containing `{ts, pid, ppid,
CLAUDE_CODE_SESSION_ID, argv}`. It also appends a line on `SIGTERM`, `SIGINT` and
stdin `end`/exit, recording the reason, and exposes one no-op tool, `p2a_ping`, that logs
the call together with its pid. Do not log any other environment variables.

## Cells (n = 3 each)

| Cell | How | Record |
|---|---|---|
| A-fresh | TUI in a pane in your tab: start, prompt "call p2a_ping" | pid, session id |
| A-compact | same session: run `/compact`, then "call p2a_ping" | Is the server pid unchanged across `/compact`? Did any exit or start line appear? Is the session id unchanged? |
| A-resume | exit the TUI, then `claude --resume <id>` (TUI) and "call p2a_ping" | new pid? same session id? |
| A-continue | exit, then `claude --continue` in the same dir and "call p2a_ping" | new pid? same session id? |
| A-fork | exit, then `claude --resume <id> --fork-session` and "call p2a_ping" | new pid? new session id? |
| A-headless | `claude -p "call p2a_ping"`, then `claude -p --resume <id> "call p2a_ping"` | session id equality |

Get the session id from the server log, not from the model. For `/compact`, wait until
the TUI shows that compaction is complete.

## Record

Write `docs/evidence/ultra-126/PROBE-P2a.md`: version, flags, pane ids, and a cell × run
table with pid, session id (truncate to the first 8 hex characters), exit and start events,
and log file links under `probes/p2a/logs/`. Leave
`### Interpretation (orchestrator)` with `pending`.

## Review and finish

Run your own Terra review with `pi-reviewer` in a pane inside your tab (brief: verify
every row against the committed logs; flag any unsupported claim). Loop until there are no
blocking findings, and save the reviews under `docs/evidence/ultra-126/reviews/`. Escalate
to Argon if a finding survives two repair rounds. Commit with
`Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>`, push, then run
`gh pr create --base integration/skill-ultra-126 --draft --title "probe(ultra-126): P2a session identity"`.
Final reply: the four lines from COMMON.md.
