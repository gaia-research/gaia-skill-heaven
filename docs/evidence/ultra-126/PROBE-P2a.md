# Probe P2a: Claude Code session identity and MCP server lifetime

- **Unit:** P2a (Team C, Antigravity; part of U7's P2)
- **Harness:** Claude Code `2.1.325 (Claude Code)` (`~/.local/bin/claude`)
- **Model:** `claude-haiku-5-5` (on every invocation)
- **Flags:** `--model claude-haiku-5-5 --mcp-config <temp-dir>/mcp.json --strict-mcp-config --permission-mode bypassPermissions` (plus `-p` for `A-headless`, `--resume <id>` for `A-resume`/`A-headless`, `--continue` for `A-continue`, `--resume <id> --fork-session` for `A-fork`)
- **Pane IDs:** Lead pane `w31:p12` (tab `w31:tC`); probe pane `w31:p15` (tab `w31:tC`)
- **Fixture:** [`server.mjs`](probes/p2a/server.mjs)

## Results (cell × run, n = 3)

Session IDs are read from `CLAUDE_CODE_SESSION_ID` in the server JSONL logs and truncated to the first 8 hex characters.

| Cell | Run | PID | Session ID | Start / Exit events | Notes | Log |
|---|---|---|---|---|---|---|
| `A-fresh` | 1 | `41224` | `dd9d54d0` | `start`, `p2a_ping` | Initial TUI session | [`tui-run1.jsonl`](probes/p2a/logs/tui-run1.jsonl) |
| `A-fresh` | 2 | `50699` | `fc15e7b8` | `start`, `p2a_ping` | Initial TUI session | [`tui-run2.jsonl`](probes/p2a/logs/tui-run2.jsonl) |
| `A-fresh` | 3 | `53447` | `76dc6c5d` | `start`, `p2a_ping` | Initial TUI session | [`tui-run3.jsonl`](probes/p2a/logs/tui-run3.jsonl) |
| `A-compact` | 1 | `41224` | `dd9d54d0` | `p2a_ping` (`22:53:33Z`) → `compact_boundary` (`22:54:42Z`) → `p2a_ping` (`22:56:48Z`), no `exit`/`start` between pings; `exit` (`SIGINT`) on `/exit` | PID unchanged; session ID unchanged | [`tui-run1.jsonl`](probes/p2a/logs/tui-run1.jsonl), [`compact-events.jsonl`](probes/p2a/logs/compact-events.jsonl) |
| `A-compact` | 2 | `50699` | `fc15e7b8` | `p2a_ping` (`23:01:15Z`) → `compact_boundary` (`23:01:45Z`) → `p2a_ping` (`23:04:09Z`), no `exit`/`start` between pings; `exit` (`SIGINT`) on `/exit` | PID unchanged; session ID unchanged | [`tui-run2.jsonl`](probes/p2a/logs/tui-run2.jsonl), [`compact-events.jsonl`](probes/p2a/logs/compact-events.jsonl) |
| `A-compact` | 3 | `53447` | `76dc6c5d` | `p2a_ping` (`23:06:45Z`) → `compact_boundary` (`23:06:55Z`) → `p2a_ping` (`23:07:23Z`), no `exit`/`start` between pings; `exit` (`SIGINT`) on `/exit` | PID unchanged; session ID unchanged | [`tui-run3.jsonl`](probes/p2a/logs/tui-run3.jsonl), [`compact-events.jsonl`](probes/p2a/logs/compact-events.jsonl) |
| `A-resume` | 1 | `46066` | `dd9d54d0` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; same session ID | [`tui-run1.jsonl`](probes/p2a/logs/tui-run1.jsonl) |
| `A-resume` | 2 | `52728` | `fc15e7b8` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; same session ID | [`tui-run2.jsonl`](probes/p2a/logs/tui-run2.jsonl) |
| `A-resume` | 3 | `54030` | `76dc6c5d` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; same session ID | [`tui-run3.jsonl`](probes/p2a/logs/tui-run3.jsonl) |
| `A-continue` | 1 | `49521` | `dd9d54d0` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; same session ID | [`tui-run1.jsonl`](probes/p2a/logs/tui-run1.jsonl) |
| `A-continue` | 2 | `52993` | `fc15e7b8` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; same session ID | [`tui-run2.jsonl`](probes/p2a/logs/tui-run2.jsonl) |
| `A-continue` | 3 | `54371` | `76dc6c5d` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; same session ID | [`tui-run3.jsonl`](probes/p2a/logs/tui-run3.jsonl) |
| `A-fork` | 1 | `50507` | `58ecb669` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; new session ID | [`tui-run1.jsonl`](probes/p2a/logs/tui-run1.jsonl) |
| `A-fork` | 2 | `53205` | `40faa4bb` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; new session ID | [`tui-run2.jsonl`](probes/p2a/logs/tui-run2.jsonl) |
| `A-fork` | 3 | `54983` | `fcb575ac` | `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; new session ID | [`tui-run3.jsonl`](probes/p2a/logs/tui-run3.jsonl) |
| `A-headless` | 1 | `29869` → `37451` | `f3b91159` → `f3b91159` | Part 1: `start`, `p2a_ping`, `exit` (`SIGINT`); Part 2 (`--resume`): `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; equal session ID | [`headless-run1.jsonl`](probes/p2a/logs/headless-run1.jsonl) |
| `A-headless` | 2 | `38110` → `38354` | `1ac17760` → `1ac17760` | Part 1: `start`, `p2a_ping`, `exit` (`SIGINT`); Part 2 (`--resume`): `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; equal session ID | [`headless-run2.jsonl`](probes/p2a/logs/headless-run2.jsonl) |
| `A-headless` | 3 | `38815` → `40801` | `3de74b38` → `3de74b38` | Part 1: `start`, `p2a_ping`, `exit` (`SIGINT`); Part 2 (`--resume`): `start`, `p2a_ping`, `exit` (`SIGINT`) | New PID; equal session ID | [`headless-run3.jsonl`](probes/p2a/logs/headless-run3.jsonl) |

### Interpretation (orchestrator)

Interpreted by the Team A orchestrator (Opus 5.5). Claude Code 2.1.325, `claude-haiku-5-5`, n = 3 per cell.

1. **`/compact` does not restart the MCP server** (A-compact 3/3: same pid, no exit or start
   between pings across the `compact_boundary`). Server-held campaign state (L0) and the
   session directory survive compaction without help. Only the model's context is
   compacted; the digest in tool results (L1) and the Console hook (L2) re-anchor it.
2. **`--resume`, `--continue` and headless `-p --resume` start a new server process with the
   same `CLAUDE_CODE_SESSION_ID`** (3/3 each). U0b's re-attach rule ("same session id + old pid
   dead → re-attach") has a stable key on this harness version.
3. **`--fork-session` gets a new session id** (3/3), so a fork finds no campaign: PR-10 holds
   mechanically, with no special case.
4. On `/exit` the server receives `SIGINT`. Nothing in this probe shows the server removing
   its directory; the reaper behaviour in plan section 1.5 still governs. U0b must not delete the
   session root on `SIGINT`.
5. Scope: Claude Code only; other doors are in P6. Re-attach itself (finding and folding the
   directory) is tested by U0b and re-probed in U7's P2 cells.
