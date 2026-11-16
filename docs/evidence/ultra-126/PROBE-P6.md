# Probe P6: additional doors — Pi and Antigravity (pass 1)

- **Date:** 2026-11-16 (`2026-11-15T22:54:48Z` – `2026-11-15T23:36:00Z`)
- **Herdr pane IDs:** `w31:p17` (initial `C1-t`/`C2-t`/`C3-t` runs) and `w31:p19` (clean `C2-t` re-runs and Antigravity `C3-t` `request-review` runs); tab `w31:tD`, `w31:p1` untouched.
- **Fixture:** [probes/p6/server.mjs](probes/p6/server.mjs), [probes/p6/write-record.mjs](probes/p6/write-record.mjs), and sanitized `C2` templates ([fixtures/pi-probe-decide.md](probes/p6/fixtures/pi-probe-decide.md), [fixtures/agy-probe-decide-skill.md](probes/p6/fixtures/agy-probe-decide-skill.md), [fixtures/agy-probe-decide-workflow.md](probes/p6/fixtures/agy-probe-decide-workflow.md))
- **Note:** All TUI inputs (including tool-permission choice `4. No, deny tool call`) and `/exit` or `/quit` commands in `w31:p17` / `w31:p19` were sent via `herdr` as test fixtures, not a human decision. All runs used fresh `mktemp -d` project directories; global MCP and trust files (`~/.pi/agent/mcp.json`, `~/.pi/agent/trust.json`, `~/.gemini/config/mcp_config.json`, `~/.gemini/antigravity-cli/settings.json`) were not modified.

---

## Door 1: Pi (`pi`)

- **Version:** `1.5.2` (`pi --version`)
- **Model:** `antigravity/gemini-4-hydrogen` (`--model antigravity/gemini-4-hydrogen --thinking low`), extensions enabled
- **MCP loading mechanism:** Native built-in MCP client (`@earendil-works/pi-mcp`). `pi --help` exposes `pi mcp <add|remove|list|login|logout>` and `--no-mcp`; `docs/mcp.md` documents reading `~/.pi/agent/mcp.json` and (in trusted projects) `.pi/mcp.json`. `~/.pi/agent/settings.json` lists installed packages (`npm:pi-antigravity`, `git:github.com/J3fp/piQuota`, `npm:@amaster.ai/pi-image-gen`, `npm:pi-free`, `npm:@ygncode/pi-insights`, `npm:pi-image-preview`, `npm:@parke.dev/pi-subagent`, `npm:pi-background-tasks`, `npm:pi-high-availability`), with no external MCP adapter package.
- **Config method:** Project-local `.pi/mcp.json` (`"exposure": "direct"`) and `.pi/prompts/probe-decide.md` inside a fresh `mktemp -d` directory, launched with `--approve` (project trust for the single run without writing `~/.pi/agent/trust.json`). `S-fresh` / `S-resume` used `--session-dir <run_dir>/sessions`; `C1`/`C2`/`C3` used `--no-session`.

### Results (`n = 3` per cell)

| Cell | Mode / Flags | Run | Observed signal |
|---|---|---:|---|
| `S-fresh` | headless `-p`, `--session-dir <run_dir>/sessions` | 1 | `server_start` `envNames`: `["AI_AGENT","ANTIGRAVITY_USER_AGENT","PI_BG_FEATURES","PI_CACHE_RETENTION","PI_CODING_AGENT","PI_MANAGED_INSTALL_ROOT","TERM_SESSION_ID"]`; `envValues`: `{"TERM_SESSION_ID":"78A2EC78-8E6F-47EF-BD4B-73CD9CF17227"}` (inherited terminal pane env var). `tools/call` `_meta`: `{"progressToken":3}`. Session file: `2026-11-15T22-54-45-565Z_01a1e16b-913c-703c-b4bc-fc5b02d38932.jsonl`. |
| `S-fresh` | headless `-p`, `--session-dir <run_dir>/sessions` | 2 | Identical `envNames` and `envValues` (`TERM_SESSION_ID` from pane); `tools/call` `_meta`: `{"progressToken":3}`. Session file: `2026-11-15T22-55-20-693Z_01a1e16c-1a75-7740-8c1f-e1d23298d13a.jsonl`. |
| `S-fresh` | headless `-p`, `--session-dir <run_dir>/sessions` | 3 | Identical `envNames` and `envValues` (`TERM_SESSION_ID` from pane); `tools/call` `_meta`: `{"progressToken":3}`. Session file: `2026-11-15T22-56-11-231Z_01a1e16c-dfde-73d8-9729-2fd0432c31e3.jsonl`. |
| `S-resume` | headless `-p`, `--continue`, same `--session-dir` | 1 | Same `envNames` and inherited `TERM_SESSION_ID`; no `PI_SESSION*` or `CONVERSATION*` env var injected; `tools/call` `_meta`: `{"progressToken":3}` (no session ID in `_meta`). |
| `S-resume` | headless `-p`, `--continue`, same `--session-dir` | 2 | Same `envNames` and inherited `TERM_SESSION_ID`; no `PI_SESSION*` or `CONVERSATION*` env var injected; `tools/call` `_meta`: `{"progressToken":3}`. |
| `S-resume` | headless `-p`, `--continue`, same `--session-dir` | 3 | Same `envNames` and inherited `TERM_SESSION_ID`; no `PI_SESSION*` or `CONVERSATION*` env var injected; `tools/call` `_meta`: `{"progressToken":3}`. |
| `C1-h` | headless `-p`, `probe_elicit` | 1 | `initialize.params`: `{"protocolVersion":"2025-11-25","capabilities":{"roots":{}},"clientInfo":{"name":"pi","version":"1.5.2"}}` (no `elicitation`). Client response to `elicitation/create` (1 ms): `{"jsonrpc":"2.0","id":"srv-1","error":{"code":-32601,"message":"Method not found: elicitation/create"}}`. |
| `C1-h` | headless `-p`, `probe_elicit` | 2 | Identical `initialize.params`; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","error":{"code":-32601,"message":"Method not found: elicitation/create"}}`. |
| `C1-h` | headless `-p`, `probe_elicit` | 3 | Identical `initialize.params`; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","error":{"code":-32601,"message":"Method not found: elicitation/create"}}`. |
| `C1-t` | TUI (`w31:p17`), `probe_elicit` | 1 | Identical `initialize.params` (`capabilities":{"roots":{}}`). No prompt appeared in pane; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","error":{"code":-32601,"message":"Method not found: elicitation/create"}}`. |
| `C1-t` | TUI (`w31:p17`), `probe_elicit` | 2 | Identical `initialize.params`; no prompt appeared in pane; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","error":{"code":-32601,"message":"Method not found: elicitation/create"}}`. |
| `C1-t` | TUI (`w31:p17`), `probe_elicit` | 3 | Identical `initialize.params`; no prompt appeared in pane; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","error":{"code":-32601,"message":"Method not found: elicitation/create"}}`. |
| `C2-h` | headless `-p "/probe-decide"`, `--mode json` ([fixture](probes/p6/fixtures/pi-probe-decide.md)) | 1 | JSON stream shows user prompt expanded literally to `` !`P6_LOG=... node .../write-record.mjs decide-x` `` (`userPromptExpandedContainsMarker: true`); `.check.json` confirms `cmdJsonExists: false`; assistant output: `NONE`. |
| `C2-h` | headless `-p "/probe-decide"`, `--mode json` | 2 | User prompt expanded literally without pre-execution; `cmdJsonExists: false`; assistant output: `NONE`. |
| `C2-h` | headless `-p "/probe-decide"`, `--mode json` | 3 | User prompt expanded literally without pre-execution; `cmdJsonExists: false`; assistant output: `NONE`. |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` | 1 | Pane shows literal expansion `!P6_LOG=... node .../write-record.mjs decide-x`; `cmdJsonExists: false`; pane model output: `NONE`. |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` | 2 | Pane shows literal expansion `!P6_LOG=... node .../write-record.mjs decide-x`; `cmdJsonExists: false`; pane model output: `NONE`. |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` | 3 | Pane shows literal expansion `!P6_LOG=... node .../write-record.mjs decide-x`; `cmdJsonExists: false`; pane model output: `NONE`. |
| `C3-t` | TUI (`w31:p17`), default mode, `operator_decide` | 1 | No permission prompt appeared; `operator_decide_called` (`note:"c3-t-r1"`) logged immediately and returned `{"ok":true}`. |
| `C3-t` | TUI (`w31:p17`), default mode, `operator_decide` | 2 | No permission prompt appeared; `operator_decide_called` (`note:"c3-t-r2"`) logged immediately and returned `{"ok":true}`. |
| `C3-t` | TUI (`w31:p17`), default mode, `operator_decide` | 3 | No permission prompt appeared; `operator_decide_called` (`note:"c3-t-r3"`) logged immediately and returned `{"ok":true}`. |

### Raw logs (Pi)

- `S-fresh`: [pi-S-fresh-r1.jsonl](probes/p6/logs/pi-S-fresh-r1.jsonl), [pi-S-fresh-r2.jsonl](probes/p6/logs/pi-S-fresh-r2.jsonl), [pi-S-fresh-r3.jsonl](probes/p6/logs/pi-S-fresh-r3.jsonl), [pi-S-sessionfiles-r1.txt](probes/p6/logs/pi-S-sessionfiles-r1.txt), [pi-S-sessionfiles-r2.txt](probes/p6/logs/pi-S-sessionfiles-r2.txt), [pi-S-sessionfiles-r3.txt](probes/p6/logs/pi-S-sessionfiles-r3.txt)
- `S-resume`: [pi-S-resume-r1.jsonl](probes/p6/logs/pi-S-resume-r1.jsonl), [pi-S-resume-r2.jsonl](probes/p6/logs/pi-S-resume-r2.jsonl), [pi-S-resume-r3.jsonl](probes/p6/logs/pi-S-resume-r3.jsonl)
- `C1-h`: [pi-C1-h-r1.jsonl](probes/p6/logs/pi-C1-h-r1.jsonl), [pi-C1-h-r2.jsonl](probes/p6/logs/pi-C1-h-r2.jsonl), [pi-C1-h-r3.jsonl](probes/p6/logs/pi-C1-h-r3.jsonl)
- `C2-h`: [pi-probe-decide.md](probes/p6/fixtures/pi-probe-decide.md), [pi-C2-h-r1.stream.jsonl](probes/p6/logs/pi-C2-h-r1.stream.jsonl), [pi-C2-h-r1.out.txt](probes/p6/logs/pi-C2-h-r1.out.txt), [pi-C2-h-r1.check.json](probes/p6/logs/pi-C2-h-r1.check.json), [pi-C2-h-r2.stream.jsonl](probes/p6/logs/pi-C2-h-r2.stream.jsonl), [pi-C2-h-r2.out.txt](probes/p6/logs/pi-C2-h-r2.out.txt), [pi-C2-h-r2.check.json](probes/p6/logs/pi-C2-h-r2.check.json), [pi-C2-h-r3.stream.jsonl](probes/p6/logs/pi-C2-h-r3.stream.jsonl), [pi-C2-h-r3.out.txt](probes/p6/logs/pi-C2-h-r3.out.txt), [pi-C2-h-r3.check.json](probes/p6/logs/pi-C2-h-r3.check.json)
- `C2-t`: [pi-C2-t-r1.pane.txt](probes/p6/logs/pi-C2-t-r1.pane.txt), [pi-C2-t-r1.check.json](probes/p6/logs/pi-C2-t-r1.check.json), [pi-C2-t-r2.pane.txt](probes/p6/logs/pi-C2-t-r2.pane.txt), [pi-C2-t-r2.check.json](probes/p6/logs/pi-C2-t-r2.check.json), [pi-C2-t-r3.pane.txt](probes/p6/logs/pi-C2-t-r3.pane.txt), [pi-C2-t-r3.check.json](probes/p6/logs/pi-C2-t-r3.check.json)
- `C1-t` / `C3-t` (combined initial TUI sessions, `w31:p17`): [pi-tui-r1.jsonl](probes/p6/logs/pi-tui-r1.jsonl), [pi-tui-r1.pane.txt](probes/p6/logs/pi-tui-r1.pane.txt), [pi-tui-r2.jsonl](probes/p6/logs/pi-tui-r2.jsonl), [pi-tui-r2.pane.txt](probes/p6/logs/pi-tui-r2.pane.txt), [pi-tui-r3.jsonl](probes/p6/logs/pi-tui-r3.jsonl), [pi-tui-r3.pane.txt](probes/p6/logs/pi-tui-r3.pane.txt)

---

## Door 2: Antigravity (`agy`)

- **Version:** `1.5.9` (`agy --version`)
- **Model:** `gemini-4-hydrogen-low` (`--model gemini-4-hydrogen-low`)
- **Config method:** Project-local plugin `.agents/plugins/p6/plugin.json` + `.agents/plugins/p6/mcp_config.json` inside a fresh `mktemp -d` git repository (`git init -q`). For TUI sessions, passed `--settings '{"trustedWorkspaces":["<run_dir>","/private<run_dir>"]}'` so workspace trust stayed session-only and never wrote to user-global config. For `C2`, tested `.agents/workflows/probe-decide.md` alone and `.agents/skills/probe-decide/SKILL.md` + `.agents/workflows/probe-decide.md` ([skill fixture](probes/p6/fixtures/agy-probe-decide-skill.md), [workflow fixture](probes/p6/fixtures/agy-probe-decide-workflow.md)). For `C3`, tested both the operator's `~/.gemini/antigravity-cli/settings.json` (`toolPermission: "always-proceed"`, `auto` mode) and a session-only non-bypass config (`--settings '{"trustedWorkspaces":[...],"toolPermission":"request-review","permissions":{"allow":[]}}'` in default `auto` mode).

### Results (`n = 3` per cell)

| Cell | Mode / Flags | Run | Observed signal |
|---|---|---:|---|
| `S-fresh` | headless `-p` | 1 | `server_start` `envNames`: `["ANTIGRAVITY_USER_AGENT","PI_CACHE_RETENTION","TERM_SESSION_ID"]`; `envValues`: `{"TERM_SESSION_ID":"78A2EC78-8E6F-47EF-BD4B-73CD9CF17227"}` (inherited terminal pane env var; no agy-injected env var). `tools/call` `params._meta`: `antigravity.google/conversation_id` = `fa28a752-eaf9-4125-b39a-8c1e61b8abc8`, `antigravity.google/root_conversation_id` = `fa28a752-eaf9-4125-b39a-8c1e61b8abc8`. |
| `S-fresh` | headless `-p` | 2 | Same `envNames`/`envValues`; `tools/call` `params._meta` `conversation_id` = `93219ab1-304a-4845-8eb4-4bb71ac527c6`. |
| `S-fresh` | headless `-p` | 3 | Same `envNames`/`envValues`; `tools/call` `params._meta` `conversation_id` = `33e6a1db-eb52-4b91-b95c-2a8fa8076236`. |
| `S-resume` | headless `-p`, `--continue` | 1 | Same `envNames`/`envValues`; `tools/call` `params._meta` `conversation_id` = `fa28a752-eaf9-4125-b39a-8c1e61b8abc8` (equal to `S-fresh` r1). |
| `S-resume` | headless `-p`, `--continue` | 2 | Same `envNames`/`envValues`; `tools/call` `params._meta` `conversation_id` = `93219ab1-304a-4845-8eb4-4bb71ac527c6` (equal to `S-fresh` r2). |
| `S-resume` | headless `-p`, `--continue` | 3 | Same `envNames`/`envValues`; `tools/call` `params._meta` `conversation_id` = `33e6a1db-eb52-4b91-b95c-2a8fa8076236` (equal to `S-fresh` r3). |
| `C1-h` | headless `-p`, `probe_elicit` | 1 | `initialize.params`: `{"clientInfo":{"name":"antigravity-client","version":"v1.0.0"},"protocolVersion":"2025-11-25","capabilities":{"elicitation":{"form":{},"url":{}},"roots":{"listChanged":true}}}` (also in `server/discover` `_meta`). Client response to `elicitation/create` (1 ms): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. |
| `C1-h` | headless `-p`, `probe_elicit` | 2 | Identical `initialize.params`; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. |
| `C1-h` | headless `-p`, `probe_elicit` | 3 | Identical `initialize.params`; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. |
| `C1-t` | TUI (`w31:p17`), `probe_elicit` | 1 | Same `initialize.params` (`elicitation:{"form":{},"url":{}}`). Note: MCP server connected asynchronously after startup (unavailable on turn 1, available on turn 2 as `p6_p6/probe_elicit`). No prompt appeared in pane; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. |
| `C1-t` | TUI (`w31:p17`), `probe_elicit` | 2 | Same `initialize.params`; no prompt appeared in pane; client response (5 ms): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. |
| `C1-t` | TUI (`w31:p17`), `probe_elicit` | 3 | Same `initialize.params`; no prompt appeared in pane; client response (1 ms): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. |
| `C2-h` | headless `-p "/probe-decide"`, `--output-format stream-json` (skill + workflow) | 1 | `stream-json` `init.expanded_commands`: `[{"name":"probe-decide","type":"skill"}]`; `.check.json` confirms `cmdJsonExists: false`; `result.response`: `NONE`. |
| `C2-h` | headless `-p "/probe-decide"`, `--output-format stream-json` (skill + workflow) | 2 | `init.expanded_commands`: `[{"name":"probe-decide","type":"skill"}]`; `cmdJsonExists: false`; `result.response`: `NONE`. |
| `C2-h` | headless `-p "/probe-decide"`, `--output-format stream-json` (skill + workflow) | 3 | `init.expanded_commands`: `[{"name":"probe-decide","type":"skill"}]`; `cmdJsonExists: false`; `result.response`: `NONE`. |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` (workflow-only `.agents/workflows/probe-decide.md`) | 1 (wf) | Slash menu showed `No matches`; submitting `/probe-decide` printed `Unknown command: /probe-decide`; `cmdJsonExists: false`. *(Note: an earlier interleaved session `agy-tui-r1` had typed `/probe-decide/help`, so this isolated workflow-only run in `w31:p19` replaced that ambiguity.)* |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` (skill + workflow) | 1 | Skill recognized; pane shows `> /probe-decide` and model output `NONE`; `cmdJsonExists: false`. |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` (skill + workflow) | 2 | Skill recognized; pane shows `> /probe-decide` and model output `NONE`; `cmdJsonExists: false`. |
| `C2-t` | TUI (`w31:p19`), `/probe-decide` (skill + workflow) | 3 | Skill recognized; pane shows `> /probe-decide` and model output `NONE`; `cmdJsonExists: false`. |
| `C3-t` | TUI (`w31:p19`), default `auto` mode, session `--settings` (`toolPermission: "request-review"`, `permissions.allow: []`), `operator_decide` | 1 | Permission prompt raised (`MCP` / `p6_p6/operator_decide` / `Allow calling this tool?`, options 1–6). Sending `4. No, deny tool call` printed `User declined the tool call` and prevented `tools/call` / `operator_decide_called` (`operatorDecideCalled: false`). |
| `C3-t` | TUI (`w31:p19`), default `auto` mode, session `--settings` (`toolPermission: "request-review"`, `permissions.allow: []`), `operator_decide` | 2 | Permission prompt raised (`Allow calling this tool?`). Sending `4. No, deny tool call` printed `User declined the tool call` and prevented `tools/call` / `operator_decide_called` (`operatorDecideCalled: false`). |
| `C3-t` | TUI (`w31:p19`), default `auto` mode, session `--settings` (`toolPermission: "request-review"`, `permissions.allow: []`), `operator_decide` | 3 | Permission prompt raised (`Allow calling this tool?`). Sending `4. No, deny tool call` printed `User declined the tool call` and prevented `tools/call` / `operator_decide_called` (`operatorDecideCalled: false`). |
| `C3-t` | TUI (`w31:p17`), `auto` mode + user config (`toolPermission: always-proceed`), `operator_decide` | 1 | Under user's `always-proceed` setting, no permission prompt appeared; `operator_decide_called` (`note:"c3-t-r1"`) logged immediately and returned `{"ok":true}`. |
| `C3-t` | TUI (`w31:p17`), `auto` mode + user config (`toolPermission: always-proceed`), `operator_decide` | 2 | Under user's `always-proceed` setting, no permission prompt appeared; `operator_decide_called` (`note:"c3-t-r2"`) logged immediately and returned `{"ok":true}`. |
| `C3-t` | TUI (`w31:p17`), `auto` mode + user config (`toolPermission: always-proceed`), `operator_decide` | 3 | Under user's `always-proceed` setting, no permission prompt appeared; `operator_decide_called` (`note:"c3-t-r3"`) logged immediately and returned `{"ok":true}`. |

### Raw logs (Antigravity)

- `S-fresh`: [agy-S-fresh-r1.jsonl](probes/p6/logs/agy-S-fresh-r1.jsonl), [agy-S-fresh-r2.jsonl](probes/p6/logs/agy-S-fresh-r2.jsonl), [agy-S-fresh-r3.jsonl](probes/p6/logs/agy-S-fresh-r3.jsonl)
- `S-resume`: [agy-S-resume-r1.jsonl](probes/p6/logs/agy-S-resume-r1.jsonl), [agy-S-resume-r2.jsonl](probes/p6/logs/agy-S-resume-r2.jsonl), [agy-S-resume-r3.jsonl](probes/p6/logs/agy-S-resume-r3.jsonl)
- `C1-h`: [agy-C1-h-r1.jsonl](probes/p6/logs/agy-C1-h-r1.jsonl), [agy-C1-h-r2.jsonl](probes/p6/logs/agy-C1-h-r2.jsonl), [agy-C1-h-r3.jsonl](probes/p6/logs/agy-C1-h-r3.jsonl)
- `C2-h`: [agy-probe-decide-skill.md](probes/p6/fixtures/agy-probe-decide-skill.md), [agy-probe-decide-workflow.md](probes/p6/fixtures/agy-probe-decide-workflow.md), [agy-C2-h-r1.stream.jsonl](probes/p6/logs/agy-C2-h-r1.stream.jsonl), [agy-C2-h-r1.out.txt](probes/p6/logs/agy-C2-h-r1.out.txt), [agy-C2-h-r1.check.json](probes/p6/logs/agy-C2-h-r1.check.json), [agy-C2-h-r2.stream.jsonl](probes/p6/logs/agy-C2-h-r2.stream.jsonl), [agy-C2-h-r2.out.txt](probes/p6/logs/agy-C2-h-r2.out.txt), [agy-C2-h-r2.check.json](probes/p6/logs/agy-C2-h-r2.check.json), [agy-C2-h-r3.stream.jsonl](probes/p6/logs/agy-C2-h-r3.stream.jsonl), [agy-C2-h-r3.out.txt](probes/p6/logs/agy-C2-h-r3.out.txt), [agy-C2-h-r3.check.json](probes/p6/logs/agy-C2-h-r3.check.json)
- `C2-t`: [agy-C2-t-workflow-only.pane.txt](probes/p6/logs/agy-C2-t-workflow-only.pane.txt), [agy-C2-t-workflow-only.check.json](probes/p6/logs/agy-C2-t-workflow-only.check.json), [agy-C2-t-r1.pane.txt](probes/p6/logs/agy-C2-t-r1.pane.txt), [agy-C2-t-r1.check.json](probes/p6/logs/agy-C2-t-r1.check.json), [agy-C2-t-r2.pane.txt](probes/p6/logs/agy-C2-t-r2.pane.txt), [agy-C2-t-r2.check.json](probes/p6/logs/agy-C2-t-r2.check.json), [agy-C2-t-r3.pane.txt](probes/p6/logs/agy-C2-t-r3.pane.txt), [agy-C2-t-r3.check.json](probes/p6/logs/agy-C2-t-r3.check.json)
- `C3-t` (`request-review`, `permissions.allow: []`): [agy-C3-t-rr-r1.prompt.pane.txt](probes/p6/logs/agy-C3-t-rr-r1.prompt.pane.txt), [agy-C3-t-rr-r1.denied.pane.txt](probes/p6/logs/agy-C3-t-rr-r1.denied.pane.txt), [agy-C3-t-rr-r1.jsonl](probes/p6/logs/agy-C3-t-rr-r1.jsonl), [agy-C3-t-rr-r1.check.json](probes/p6/logs/agy-C3-t-rr-r1.check.json), [agy-C3-t-rr-r2.prompt.pane.txt](probes/p6/logs/agy-C3-t-rr-r2.prompt.pane.txt), [agy-C3-t-rr-r2.denied.pane.txt](probes/p6/logs/agy-C3-t-rr-r2.denied.pane.txt), [agy-C3-t-rr-r2.jsonl](probes/p6/logs/agy-C3-t-rr-r2.jsonl), [agy-C3-t-rr-r2.check.json](probes/p6/logs/agy-C3-t-rr-r2.check.json), [agy-C3-t-rr-r3.prompt.pane.txt](probes/p6/logs/agy-C3-t-rr-r3.prompt.pane.txt), [agy-C3-t-rr-r3.denied.pane.txt](probes/p6/logs/agy-C3-t-rr-r3.denied.pane.txt), [agy-C3-t-rr-r3.jsonl](probes/p6/logs/agy-C3-t-rr-r3.jsonl), [agy-C3-t-rr-r3.check.json](probes/p6/logs/agy-C3-t-rr-r3.check.json)
- `C1-t` / `C3-t` (`always-proceed`, initial combined TUI sessions in `w31:p17`): [agy-tui-r1.jsonl](probes/p6/logs/agy-tui-r1.jsonl), [agy-tui-r1.pane.txt](probes/p6/logs/agy-tui-r1.pane.txt), [agy-tui-r2.jsonl](probes/p6/logs/agy-tui-r2.jsonl), [agy-tui-r2.pane.txt](probes/p6/logs/agy-tui-r2.pane.txt), [agy-tui-r3.jsonl](probes/p6/logs/agy-tui-r3.jsonl), [agy-tui-r3.pane.txt](probes/p6/logs/agy-tui-r3.pane.txt)

---

## Door 3: Codex (codex)

- **Date (pass 2):** 2026-11-16 (`2026-11-15T23:59:09Z` – `2026-11-16T00:09:16Z`)
- **Herdr pane IDs:** `w31:p1F` (headless `codex exec` batch, `C1-t` r1 and r3, `C2-t` slash menu / r1 / r3) and `w31:p1G` (`C1-t` r2, `C2-t` r2, `C3-t` `user` r1–r3, `C3-t` `auto` r1–r3); tab `w31:tM`, `w31:p1` untouched. Both probe panes were closed after recording.
- **Version:** `codex-cli 0.169.0` (`codex --version`)
- **Model:** `gpt-6-luna`, reasoning effort `low` (`-m gpt-6-luna -c 'model_reasoning_effort="low"'`). Verified in Codex's own rollout session logs (`~/.codex/sessions/.../rollout-*.jsonl` `turn_context`: `"model": "gpt-6-luna"`, `"effort": "low"`) on every run.
- **Config method:** Per-invocation `-c` overrides inside fresh `mktemp -d` directories (never editing `~/.codex/config.toml` or anything in `~/.codex/`; SHA-256 of `~/.codex/config.toml` verified unchanged before and after):
  - `-c 'mcp_servers.p6.command="node"'`
  - `-c 'mcp_servers.p6.args=["<REPO>/docs/evidence/ultra-126/probes/p6/server.mjs"]'`
  - `-c 'mcp_servers.p6.env={P6_LOG="<RUN_DIR>/<log>.jsonl"}'`
  - Headless (`codex exec`): passed `--skip-git-repo-check --json`.
  - TUI (`codex --no-alt-screen`): passed `-c 'projects."<RUN_DIR>".trust_level="trusted"'` per run so directory trust stayed session-only and never wrote to `~/.codex/config.toml`.
  - For `C2`: tested `.agents/skills/probe-decide/SKILL.md` ([codex-probe-decide-skill.md](probes/p6/fixtures/codex-probe-decide-skill.md)) invoked via `$probe-decide`, and captured TUI `/` slash menu + `/presets` + `--help` / binary evidence ([codex-C2-slash-menu.pane.txt](probes/p6/logs/codex-C2-slash-menu.pane.txt), [codex-C2-help-evidence.txt](probes/p6/logs/codex-C2-help-evidence.txt)).
  - For `C3`: tested both `Ask for approval` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `-c 'approvals_reviewer="user"'`) and the operator's `~/.codex/config.toml` setting `Approve for me` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `approvals_reviewer = "auto_review"`). Keystrokes (`ALPHA` in `C1-t`, `4` for `4. Cancel` in `C3-t`) were sent via `herdr` as labelled test fixtures, never a person's decision.

### Results (`n = 3` per cell)

| Cell | Mode / Flags | Run | Observed signal |
|---|---|---:|---|
| `S-fresh` | headless `codex exec`, `--skip-git-repo-check --json`, `-c mcp_servers.p6...` | 1 | `server_start` `envNames`: `[]`, `envValues`: `{}`. `tools/call` `_meta`: `sessionId` = `01a1e1a6-8816-7543-abc3-b548b612e3b8`, `threadId` = `01a1e1a6-8816-7543-abc3-b548b612e3b8`, `windowId` = `01a1e1a6-8816-7543-abc3-b548b612e3b8:0`, `x-codex-turn-metadata.session_id` = `01a1e1a6-8816-7543-abc3-b548b612e3b8`. Rollout verified `gpt-6-luna` / `low`. |
| `S-fresh` | headless `codex exec`, `--skip-git-repo-check --json` | 2 | `envNames`: `[]`, `envValues`: `{}`. `tools/call` `_meta` `sessionId` = `threadId` = `01a1e1a7-1439-78d3-b36b-9efb1674ad2d`. Rollout verified `gpt-6-luna` / `low`. |
| `S-fresh` | headless `codex exec`, `--skip-git-repo-check --json` | 3 | `envNames`: `[]`, `envValues`: `{}`. `tools/call` `_meta` `sessionId` = `threadId` = `01a1e1a7-ad9c-7d91-8e22-ec14b9e2c2ec`. Rollout verified `gpt-6-luna` / `low`. |
| `S-resume` | headless `codex exec resume <id>`, `--skip-git-repo-check --json` | 1 | `envNames`: `[]`, `envValues`: `{}`. `tools/call` `_meta` `sessionId` = `threadId` = `01a1e1a6-8816-7543-abc3-b548b612e3b8` (equal to `S-fresh` r1). Rollout verified `gpt-6-luna` / `low`. |
| `S-resume` | headless `codex exec resume <id>`, `--skip-git-repo-check --json` | 2 | `envNames`: `[]`, `envValues`: `{}`. `tools/call` `_meta` `sessionId` = `threadId` = `01a1e1a7-1439-78d3-b36b-9efb1674ad2d` (equal to `S-fresh` r2). Rollout verified `gpt-6-luna` / `low`. |
| `S-resume` | headless `codex exec resume <id>`, `--skip-git-repo-check --json` | 3 | `envNames`: `[]`, `envValues`: `{}`. `tools/call` `_meta` `sessionId` = `threadId` = `01a1e1a7-ad9c-7d91-8e22-ec14b9e2c2ec` (equal to `S-fresh` r3). Rollout verified `gpt-6-luna` / `low`. |
| `C1-h` | headless `codex exec`, `probe_elicit` | 1 | `initialize.params`: `{"protocolVersion":"2025-06-18","capabilities":{"experimental":{"codex/auth-change":{}},"elicitation":{"form":{},"url":{}}},"clientInfo":{"name":"codex-mcp-client","title":"Codex","version":"0.169.0"}}`. Client response to `elicitation/create` (`4 ms`): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. Rollout verified `gpt-6-luna` / `low`. |
| `C1-h` | headless `codex exec`, `probe_elicit` | 2 | Identical `initialize.params`; client response (`1 ms`): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. Rollout verified `gpt-6-luna` / `low`. |
| `C1-h` | headless `codex exec`, `probe_elicit` | 3 | Identical `initialize.params`; client response (`1 ms`): `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"cancel"}}`. Rollout verified `gpt-6-luna` / `low`. |
| `C1-t` | TUI (`w31:p1F`), `probe_elicit` | 1 | `initialize.params` adds `"extensions":{"openai/elicitation":{}}` alongside `"elicitation":{"form":{},"url":{}}`. Prompt appeared (`Field 1/1` / `P6 operator check: type the word ALPHA`). Sending `ALPHA` + `Enter` delivered `{"jsonrpc":"2.0","id":"srv-1","result":{"action":"accept","content":{"word":"ALPHA"}}}` (`527 ms`). Rollout (`01a1e1aa-13d6-7910-a43f-3203a9767573`) verified `gpt-6-luna` / `low`. |
| `C1-t` | TUI (`w31:p1G`), `probe_elicit` | 2 | Identical `initialize.params`; prompt appeared; sending `ALPHA` + `Enter` delivered `{"action":"accept","content":{"word":"ALPHA"}}` (`439 ms`). Rollout (`01a1e1ae-865d-7162-b4b7-c822f6fd3ca0`) verified `gpt-6-luna` / `low`. |
| `C1-t` | TUI (`w31:p1F`), `probe_elicit` | 3 | Identical `initialize.params`; prompt appeared; sending `ALPHA` + `Enter` delivered `{"action":"accept","content":{"word":"ALPHA"}}` (`631 ms`). Rollout (`01a1e1aa-9e10-7430-92a5-fcb832035b3d`) verified `gpt-6-luna` / `low`. |
| `C2-h` | headless `codex exec`, `$probe-decide` ([fixture](probes/p6/fixtures/codex-probe-decide-skill.md)); plus `/` menu & `/presets` evidence | 1 | No shell-pre-execution custom-prompt or slash-command mechanism (`/presets` states `"Presets support prompts and slash commands, not shell commands."`). `.agents/skills/probe-decide/SKILL.md` loaded in rollout (`skillLoadedInRollout: true`); `cmdJsonExists: false`; assistant output: `NONE`. Rollout verified `gpt-6-luna` / `low`. |
| `C2-h` | headless `codex exec`, `$probe-decide` | 2 | `skillLoadedInRollout: true`; `cmdJsonExists: false`; assistant output: `I can’t run tools to execute the skill’s command. I can’t report a P6_PREEXEC_STDOUT line from tool output.`. Rollout verified `gpt-6-luna` / `low`. |
| `C2-h` | headless `codex exec`, `$probe-decide` | 3 | `skillLoadedInRollout: true`; `cmdJsonExists: false`; assistant output: `NONE`. Rollout verified `gpt-6-luna` / `low`. |
| `C2-t` | TUI (`w31:p1F`), `$probe-decide` | 1 | `skillLoadedInRollout: true`; `cmdJsonExists: false`; pane output: `NONE`. Rollout (`01a1e1ab-9e6e-7c91-bf0e-441dcde1dbfb`) verified `gpt-6-luna` / `low`. |
| `C2-t` | TUI (`w31:p1G`), `$probe-decide` | 2 | `skillLoadedInRollout: true`; `cmdJsonExists: false`; pane output: `NONE`. Rollout (`01a1e1ae-cce7-7e00-a638-7da5198c7257`) verified `gpt-6-luna` / `low`. |
| `C2-t` | TUI (`w31:p1F`), `$probe-decide` | 3 | `skillLoadedInRollout: true`; `cmdJsonExists: false`; pane output: `NONE`. Rollout (`01a1e1ab-dfc2-7493-841d-c28e2ccb737b`) verified `gpt-6-luna` / `low`. |
| `C3-t` | TUI (`w31:p1G`), `Ask for approval` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `-c approvals_reviewer="user"`), `operator_decide` | 1 | Approval prompt raised (`Allow the p6 MCP server to run tool "operator_decide"?`, options `1. Allow`, `2. Allow for this session`, `3. Always allow`, `4. Cancel`). Sending `4` + `Enter` printed `Error: user cancelled MCP tool call` and prevented `tools/call` / `operator_decide_called` (`operatorDecideCalled: false`). Rollout verified `gpt-6-luna` / `low`. |
| `C3-t` | TUI (`w31:p1G`), `Ask for approval` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `-c approvals_reviewer="user"`), `operator_decide` | 2 | Approval prompt raised; sending `4` + `Enter` cancelled tool call (`operatorDecideCalled: false`). Rollout verified `gpt-6-luna` / `low`. |
| `C3-t` | TUI (`w31:p1G`), `Ask for approval` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `-c approvals_reviewer="user"`), `operator_decide` | 3 | Approval prompt raised; sending `4` + `Enter` cancelled tool call (`operatorDecideCalled: false`). Rollout verified `gpt-6-luna` / `low`. |
| `C3-t` | TUI (`w31:p1G`), user config `Approve for me` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `approvals_reviewer = "auto_review"`), `operator_decide` | 1 | Under `auto_review`, no interactive prompt appeared; `operator_decide_called` (`note:"c3-t-auto-r1"`) logged immediately and returned `{"ok":true}`. Rollout verified `gpt-6-luna` / `low`. |
| `C3-t` | TUI (`w31:p1G`), user config `Approve for me` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `approvals_reviewer = "auto_review"`), `operator_decide` | 2 | Under `auto_review`, no interactive prompt appeared; `operator_decide_called` (`note:"c3-t-auto-r2"`) logged immediately and returned `{"ok":true}`. Rollout verified `gpt-6-luna` / `low`. |
| `C3-t` | TUI (`w31:p1G`), user config `Approve for me` (`approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`, `approvals_reviewer = "auto_review"`), `operator_decide` | 3 | Under `auto_review`, no interactive prompt appeared; `operator_decide_called` (`note:"c3-t-auto-r3"`) logged immediately and returned `{"ok":true}`. Rollout verified `gpt-6-luna` / `low`. |

### Raw logs (Codex)

- `S-fresh`: [codex-S-fresh-r1.jsonl](probes/p6/logs/codex-S-fresh-r1.jsonl), [codex-S-fresh-r1.stream.jsonl](probes/p6/logs/codex-S-fresh-r1.stream.jsonl), [codex-S-fresh-r1.check.json](probes/p6/logs/codex-S-fresh-r1.check.json), [codex-S-fresh-r2.jsonl](probes/p6/logs/codex-S-fresh-r2.jsonl), [codex-S-fresh-r2.stream.jsonl](probes/p6/logs/codex-S-fresh-r2.stream.jsonl), [codex-S-fresh-r2.check.json](probes/p6/logs/codex-S-fresh-r2.check.json), [codex-S-fresh-r3.jsonl](probes/p6/logs/codex-S-fresh-r3.jsonl), [codex-S-fresh-r3.stream.jsonl](probes/p6/logs/codex-S-fresh-r3.stream.jsonl), [codex-S-fresh-r3.check.json](probes/p6/logs/codex-S-fresh-r3.check.json)
- `S-resume`: [codex-S-resume-r1.jsonl](probes/p6/logs/codex-S-resume-r1.jsonl), [codex-S-resume-r1.stream.jsonl](probes/p6/logs/codex-S-resume-r1.stream.jsonl), [codex-S-resume-r1.check.json](probes/p6/logs/codex-S-resume-r1.check.json), [codex-S-resume-r2.jsonl](probes/p6/logs/codex-S-resume-r2.jsonl), [codex-S-resume-r2.stream.jsonl](probes/p6/logs/codex-S-resume-r2.stream.jsonl), [codex-S-resume-r2.check.json](probes/p6/logs/codex-S-resume-r2.check.json), [codex-S-resume-r3.jsonl](probes/p6/logs/codex-S-resume-r3.jsonl), [codex-S-resume-r3.stream.jsonl](probes/p6/logs/codex-S-resume-r3.stream.jsonl), [codex-S-resume-r3.check.json](probes/p6/logs/codex-S-resume-r3.check.json)
- `C1-h`: [codex-C1-h-r1.jsonl](probes/p6/logs/codex-C1-h-r1.jsonl), [codex-C1-h-r1.stream.jsonl](probes/p6/logs/codex-C1-h-r1.stream.jsonl), [codex-C1-h-r1.check.json](probes/p6/logs/codex-C1-h-r1.check.json), [codex-C1-h-r2.jsonl](probes/p6/logs/codex-C1-h-r2.jsonl), [codex-C1-h-r2.stream.jsonl](probes/p6/logs/codex-C1-h-r2.stream.jsonl), [codex-C1-h-r2.check.json](probes/p6/logs/codex-C1-h-r2.check.json), [codex-C1-h-r3.jsonl](probes/p6/logs/codex-C1-h-r3.jsonl), [codex-C1-h-r3.stream.jsonl](probes/p6/logs/codex-C1-h-r3.stream.jsonl), [codex-C1-h-r3.check.json](probes/p6/logs/codex-C1-h-r3.check.json)
- `C1-t`: [codex-C1-t-r1.prompt.pane.txt](probes/p6/logs/codex-C1-t-r1.prompt.pane.txt), [codex-C1-t-r1.pane.txt](probes/p6/logs/codex-C1-t-r1.pane.txt), [codex-C1-t-r1.jsonl](probes/p6/logs/codex-C1-t-r1.jsonl), [codex-C1-t-r1.check.json](probes/p6/logs/codex-C1-t-r1.check.json), [codex-C1-t-r2.prompt.pane.txt](probes/p6/logs/codex-C1-t-r2.prompt.pane.txt), [codex-C1-t-r2.pane.txt](probes/p6/logs/codex-C1-t-r2.pane.txt), [codex-C1-t-r2.jsonl](probes/p6/logs/codex-C1-t-r2.jsonl), [codex-C1-t-r2.check.json](probes/p6/logs/codex-C1-t-r2.check.json), [codex-C1-t-r3.prompt.pane.txt](probes/p6/logs/codex-C1-t-r3.prompt.pane.txt), [codex-C1-t-r3.pane.txt](probes/p6/logs/codex-C1-t-r3.pane.txt), [codex-C1-t-r3.jsonl](probes/p6/logs/codex-C1-t-r3.jsonl), [codex-C1-t-r3.check.json](probes/p6/logs/codex-C1-t-r3.check.json)
- `C2-h`: [codex-probe-decide-skill.md](probes/p6/fixtures/codex-probe-decide-skill.md), [codex-C2-help-evidence.txt](probes/p6/logs/codex-C2-help-evidence.txt), [codex-C2-h-r1.stream.jsonl](probes/p6/logs/codex-C2-h-r1.stream.jsonl), [codex-C2-h-r1.out.txt](probes/p6/logs/codex-C2-h-r1.out.txt), [codex-C2-h-r1.check.json](probes/p6/logs/codex-C2-h-r1.check.json), [codex-C2-h-r2.stream.jsonl](probes/p6/logs/codex-C2-h-r2.stream.jsonl), [codex-C2-h-r2.out.txt](probes/p6/logs/codex-C2-h-r2.out.txt), [codex-C2-h-r2.check.json](probes/p6/logs/codex-C2-h-r2.check.json), [codex-C2-h-r3.stream.jsonl](probes/p6/logs/codex-C2-h-r3.stream.jsonl), [codex-C2-h-r3.out.txt](probes/p6/logs/codex-C2-h-r3.out.txt), [codex-C2-h-r3.check.json](probes/p6/logs/codex-C2-h-r3.check.json)
- `C2-t`: [codex-C2-slash-menu.pane.txt](probes/p6/logs/codex-C2-slash-menu.pane.txt), [codex-C2-t-r1.pane.txt](probes/p6/logs/codex-C2-t-r1.pane.txt), [codex-C2-t-r1.check.json](probes/p6/logs/codex-C2-t-r1.check.json), [codex-C2-t-r2.pane.txt](probes/p6/logs/codex-C2-t-r2.pane.txt), [codex-C2-t-r2.check.json](probes/p6/logs/codex-C2-t-r2.check.json), [codex-C2-t-r3.pane.txt](probes/p6/logs/codex-C2-t-r3.pane.txt), [codex-C2-t-r3.check.json](probes/p6/logs/codex-C2-t-r3.check.json)
- `C3-t` (`Ask for approval`, `approvals_reviewer="user"`): [codex-C3-t-user-r1.prompt.pane.txt](probes/p6/logs/codex-C3-t-user-r1.prompt.pane.txt), [codex-C3-t-user-r1.denied.pane.txt](probes/p6/logs/codex-C3-t-user-r1.denied.pane.txt), [codex-C3-t-user-r1.jsonl](probes/p6/logs/codex-C3-t-user-r1.jsonl), [codex-C3-t-user-r1.check.json](probes/p6/logs/codex-C3-t-user-r1.check.json), [codex-C3-t-user-r2.prompt.pane.txt](probes/p6/logs/codex-C3-t-user-r2.prompt.pane.txt), [codex-C3-t-user-r2.denied.pane.txt](probes/p6/logs/codex-C3-t-user-r2.denied.pane.txt), [codex-C3-t-user-r2.jsonl](probes/p6/logs/codex-C3-t-user-r2.jsonl), [codex-C3-t-user-r2.check.json](probes/p6/logs/codex-C3-t-user-r2.check.json), [codex-C3-t-user-r3.prompt.pane.txt](probes/p6/logs/codex-C3-t-user-r3.prompt.pane.txt), [codex-C3-t-user-r3.denied.pane.txt](probes/p6/logs/codex-C3-t-user-r3.denied.pane.txt), [codex-C3-t-user-r3.jsonl](probes/p6/logs/codex-C3-t-user-r3.jsonl), [codex-C3-t-user-r3.check.json](probes/p6/logs/codex-C3-t-user-r3.check.json)
- `C3-t` (`Approve for me`, `approvals_reviewer="auto_review"`): [codex-C3-t-auto-r1.pane.txt](probes/p6/logs/codex-C3-t-auto-r1.pane.txt), [codex-C3-t-auto-r1.jsonl](probes/p6/logs/codex-C3-t-auto-r1.jsonl), [codex-C3-t-auto-r1.check.json](probes/p6/logs/codex-C3-t-auto-r1.check.json), [codex-C3-t-auto-r2.pane.txt](probes/p6/logs/codex-C3-t-auto-r2.pane.txt), [codex-C3-t-auto-r2.jsonl](probes/p6/logs/codex-C3-t-auto-r2.jsonl), [codex-C3-t-auto-r2.check.json](probes/p6/logs/codex-C3-t-auto-r2.check.json), [codex-C3-t-auto-r3.pane.txt](probes/p6/logs/codex-C3-t-auto-r3.pane.txt), [codex-C3-t-auto-r3.jsonl](probes/p6/logs/codex-C3-t-auto-r3.jsonl), [codex-C3-t-auto-r3.check.json](probes/p6/logs/codex-C3-t-auto-r3.check.json)

### Interpretation (orchestrator)

Door 3, interpreted by the Team A orchestrator (Opus 5.5). Codex 0.169.0, `gpt-6-luna` low (verified
in the rollouts), n = 3 per cell.

- **Session id:** none in the environment. `tools/call _meta.sessionId` (= `threadId`) was
  equal across `codex exec resume` (3/3). Like agy, this is a per-call key, so a Codex door
  adapter would bind the campaign on the first tool call, not at server start.
- **Channel 1 (elicitation) passes in the TUI:** a prompt appeared and the fixture answer
  arrived as `accept` (3/3). Headless `codex exec` auto-cancels (3/3) and fails closed, as on
  Claude Code. D-009 and FD-11 apply unchanged: it is terminal input, not authentication, and
  it fails closed when multiplexed unless the advanced opt-in is set.
- **Channel 2:** no pre-execution mechanism. Skills load but do not run a script (6/6).
- **Channel 3:** an approval prompt that can deny appears with `approvals_reviewer="user"`
  (3/3). It is void under the user's `auto_review` setting (3/3).
- **Consequence:** Codex is the second door, after Claude Code, where channel 1 works. A
  Codex door needs a first-call session binding before campaigns can re-attach.

---

### Interpretation (orchestrator)

Interpreted by the Team A orchestrator (Opus 5.5). Each door is judged only on its own cells
(n = 3 each). Nothing is inferred from Claude Code.

**Pi 1.5.2: no operator channel, no stable session id.**
- Session id: no harness session variable reaches the MCP child, and `tools/call _meta` carries
  none. `TERM_SESSION_ID` is the **terminal's** id, inherited from the pane. It is shared by
  every session in that pane, so it must never be used as campaign identity. L3 re-attach does
  not exist on Pi: a campaign ends when the server process does (plan section 5.9).
- Channel 1: the client does not advertise elicitation and answers `Method not found` (6/6).
  Channel 2: `!` lines in a prompt template are expanded literally and never executed (6/6).
  Channel 3: default mode raised no permission prompt (3/3).
- **Consequence:** on Pi the handshake stops at `DECISIONS` and says why. No campaign can be
  decided on this door at this version.

**Antigravity 1.5.9: a stable id through `_meta`; channel 3 only, and only under a setting.**
- Session id: none in the environment, but `tools/call params._meta.conversation_id` was equal
  across `--continue` (3/3). That is a per-call key, not a start-time one, so a door
  adapter would have to bind the campaign on the first call. U0b's environment-based key does
  not apply here unchanged.
- Channel 1: elicitation is advertised, but the TUI auto-cancels with no prompt shown (3/3) and
  headless cancels too (3/3). Channel 1 fails on agy.
- Channel 2: skills and workflows do not pre-execute a script (fails).
- Channel 3: with a session `toolPermission: "request-review"` setting, a permission prompt
  appeared and a denial blocked the call (3/3). Under the user's `always-proceed` setting there
  was no prompt (3/3).
- **Consequence:** agy can decide only through channel 3, and only when that setting is in force.
  This is a convention-class boundary like the others. FD-11's multiplexer default applies on top.

Codex: not probed in this pass.
