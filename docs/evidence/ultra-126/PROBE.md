# Skill Ultra (#126) — Empirical Probes

## P1 — operator channel

- **Date:** 2026-11-16 (`2026-11-15T21:33:36Z` – `2026-11-15T21:40:20Z`)
- **Harness binary & version:** `~/.local/bin/claude` — `2.1.325 (Claude Code)`
- **Model:** `claude-haiku-5-5` (`--model claude-haiku-5-5`)
- **Isolation flags (all runs):** fresh `mktemp -d` working directory, `--strict-mcp-config --mcp-config <run_dir>/mcp.json`, `--setting-sources project`
- **Additional per-mode / per-cell flags:**
  - Headless cells (`C1-h`, `C2-h`, `C3-h`, `C4-b`): `-p`, `--no-session-persistence`, `--output-format stream-json --verbose`
  - `C2-h`, `C2-t`: `--allowedTools mcp__p1__probe_elicit`
  - `C4-t`: `--permission-mode manual` (observed: without `--permission-mode manual`, TUI displayed `auto mode on` under `--setting-sources project` due to user `defaultMode: "auto"`; `--permission-mode manual` placed the session in `manual mode on`)
  - `C4-b`: `--dangerously-skip-permissions`
- **Herdr pane IDs (TUI cells):** `w31:p8` (`C1-t` r1–r3, `C2-t` r1–r3), `w31:pA` (`C3-t` r1–r3, `C4-t` r1–r3). Both panes closed at teardown; `w31:p1` was not touched.
- **Test fixture note:** Keystrokes sent to TUI panes (`Down` + `Enter` on workspace trust prompt, `ALPHA` / `Down` + `Enter` on elicitation, `/probe-decide`, `Down` + `Enter` on permission prompt) were sent via `herdr pane send-text` / `herdr pane send-keys` as a **test fixture standing in for an operator**, not a human decision.

### Results (n = 3 per cell)

| Cell | Mode | Run | Observed signal |
|---|---|---:|---|
| `C1-h` | headless `-p` | 1 | `initialize` params: `{"protocolVersion":"2025-11-25","capabilities":{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}},"clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.325","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"}}` |
| `C1-h` | headless `-p` | 2 | Identical `initialize.params.capabilities`: `{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}}` |
| `C1-h` | headless `-p` | 3 | Identical `initialize.params.capabilities`: `{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}}` |
| `C1-t` | TUI pane (`w31:p8`) | 1 | `initialize` params: `{"protocolVersion":"2025-11-25","capabilities":{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}},"clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.325","description":"Anthropic's agentic coding tool","websiteUrl":"https://claude.com/claude-code"}}` |
| `C1-t` | TUI pane (`w31:p8`) | 2 | Identical `initialize.params.capabilities`: `{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}}` |
| `C1-t` | TUI pane (`w31:p8`) | 3 | Identical `initialize.params.capabilities`: `{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}}}` |
| `C2-h` | headless `-p` (`--allowedTools mcp__p1__probe_elicit`) | 1 | Server sent `elicitation/create` (`id:"srv-1"`) at `21:33:50.926Z`; client logged response at `21:33:50.934Z`: `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-h` | headless `-p` (`--allowedTools mcp__p1__probe_elicit`) | 2 | Server sent `elicitation/create` (`id:"srv-1"`) at `21:33:58.992Z`; client logged response at `21:33:58.998Z`: `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-h` | headless `-p` (`--allowedTools mcp__p1__probe_elicit`) | 3 | Server sent `elicitation/create` (`id:"srv-1"`) at `21:34:03.272Z`; client logged response at `21:34:03.278Z`: `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-t` | TUI pane (`w31:p8`, `--allowedTools mcp__p1__probe_elicit`) | 1 | Prompt appeared (`MCP server “p1” requests your input` / `P1 operator check: type the word ALPHA` / `❯ * word: Type something…` / `Accept    Decline`). Fixture sent `pane send-text "ALPHA\n"`: `\n` was inserted into the `word` field without submitting `Accept`; after `Down` + `Enter` on `Accept`, server logged: `{"result":{"action":"accept","content":{"word":"ALPHA\n"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-t` | TUI pane (`w31:p8`, `--allowedTools mcp__p1__probe_elicit`) | 2 | Same prompt appeared; fixture sent `pane send-text "ALPHA"` + `Down` + `Enter` on `Accept`. Server logged: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-t` | TUI pane (`w31:p8`, `--allowedTools mcp__p1__probe_elicit`) | 3 | Same prompt appeared; fixture sent `pane send-text "ALPHA"` + `Down` + `Enter` on `Accept`. Server logged: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C3-h` | headless `-p "/probe-decide"` | 1 | `.cmd.json` created (`pid: 27787`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:34:05.708Z"`). First `assistant` event timestamp: `2026-11-15T21:34:07.750Z` (cmd precedes model output). Model output echoed stdout verbatim: `"P1_PREEXEC_STDOUT 2026-11-15T21:34:05.708Z decide-x"` |
| `C3-h` | headless `-p "/probe-decide"` | 2 | `.cmd.json` created (`pid: 27944`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:34:09.198Z"`). First `assistant` event timestamp: `2026-11-15T21:34:11.342Z` (cmd precedes model output). Model output echoed stdout verbatim: `"P1_PREEXEC_STDOUT 2026-11-15T21:34:09.198Z decide-x"` |
| `C3-h` | headless `-p "/probe-decide"` | 3 | `.cmd.json` created (`pid: 28000`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:34:12.786Z"`). First `assistant` event timestamp: `2026-11-15T21:34:14.704Z` (cmd precedes model output). Model output echoed stdout verbatim: `"P1_PREEXEC_STDOUT 2026-11-15T21:34:12.786Z decide-x"` |
| `C3-t` | TUI pane (`w31:pA`, `/probe-decide`) | 1 | `.cmd.json` created (`pid: 53480`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:38:27.407Z"`). Pane output observed at `2026-11-15T21:38:32Z` (cmd precedes model output). Model displayed: `⏺ P1_PREEXEC_STDOUT 2026-11-15T21:38:27.407Z decide-x` |
| `C3-t` | TUI pane (`w31:pA`, `/probe-decide`) | 2 | `.cmd.json` created (`pid: 53589`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:38:48.022Z"`). First model output observed via `wait-output` at `2026-11-15T21:38:50.121Z` (cmd precedes model output). Model displayed: `⏺ P1_PREEXEC_STDOUT 2026-11-15T21:38:48.022Z decide-x` |
| `C3-t` | TUI pane (`w31:pA`, `/probe-decide`) | 3 | `.cmd.json` created (`pid: 53925`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:39:01.949Z"`). First model output observed via `wait-output` at `2026-11-15T21:39:03.619Z` (cmd precedes model output). Model displayed: `⏺ P1_PREEXEC_STDOUT 2026-11-15T21:39:01.949Z decide-x` |
| `C4-t` | TUI pane (`w31:pA`, `--permission-mode manual`, `operator_decide` not allowed) | 1 | Prompt appeared (`Tool use / p1 — Operator Decide Tool: (MCP) / Do you want to proceed? / ❯ 1. Yes / 2. No`). Selecting `2. No` interrupted the call (`No result recorded for 1 call / p1 - operator_decide (MCP) / Interrupted · What should Claude do instead?`). Log `tools/call` count: `0` |
| `C4-t` | TUI pane (`w31:pA`, `--permission-mode manual`, `operator_decide` not allowed) | 2 | Same permission prompt appeared; selecting `2. No` prevented execution (`No result recorded for 1 call`). Log `tools/call` count: `0` |
| `C4-t` | TUI pane (`w31:pA`, `--permission-mode manual`, `operator_decide` not allowed) | 3 | Same permission prompt appeared; selecting `2. No` prevented execution (`No result recorded for 1 call`). Log `tools/call` count: `0` |
| `C4-b` | headless `-p --dangerously-skip-permissions` | 1 | `tools/call` for `operator_decide` logged at `2026-11-15T21:34:18.831Z` (`operator_decide_called` at `21:34:18.832Z`); no prompt, `permission_denials: []` |
| `C4-b` | headless `-p --dangerously-skip-permissions` | 2 | `tools/call` for `operator_decide` logged at `2026-11-15T21:34:23.741Z` (`operator_decide_called` at `21:34:23.741Z`); no prompt, `permission_denials: []` |
| `C4-b` | headless `-p --dangerously-skip-permissions` | 3 | `tools/call` for `operator_decide` logged at `2026-11-15T21:34:28.359Z` (`operator_decide_called` at `21:34:28.360Z`); no prompt, `permission_denials: []` |

### TUI pane excerpts (test fixture interactions)

**`C2-t` run 2 elicitation prompt (`w31:p8`):**
```text
─────────────────────────────────────────────────────────────────────────
  MCP server “p1” requests your input

  P1 operator check: type the word ALPHA

  ❯ * word: Type something…

    Accept    Decline

  Esc to cancel · ↑/↓ to navigate · Backspace to unset
```

**`C4-t` run 1 permission prompt (`w31:pA`):**
```text
─────────────────────────────────────────────────────────────────────────
 Tool use
 p1 — Operator Decide Tool: (MCP)

 About the p1 — Operator Decide Tool:
 │ No-op probe tool that logs its invocation.

 Do you want to proceed?
 ❯ 1. Yes
   2. No

 Esc to cancel · Tab to amend
```

**`C4-t` run 1 after fixture selected `2. No` (`w31:pA`):**
```text
❯ call operator_decide

  No result recorded for 1 call
  ⎿  p1 - operator_decide (MCP)
  ⎿  Interrupted · What should Claude do instead?
```

### Raw

Committed MCP JSONL logs and pre-execution `.cmd.json` records:

- `C1-h`: [C1-h-r1.jsonl](probes/p1/logs/C1-h-r1.jsonl), [C1-h-r2.jsonl](probes/p1/logs/C1-h-r2.jsonl), [C1-h-r3.jsonl](probes/p1/logs/C1-h-r3.jsonl)
- `C1-t`: [C1-t-r1.jsonl](probes/p1/logs/C1-t-r1.jsonl), [C1-t-r2.jsonl](probes/p1/logs/C1-t-r2.jsonl), [C1-t-r3.jsonl](probes/p1/logs/C1-t-r3.jsonl)
- `C2-h`: [C2-h-r1.jsonl](probes/p1/logs/C2-h-r1.jsonl), [C2-h-r2.jsonl](probes/p1/logs/C2-h-r2.jsonl), [C2-h-r3.jsonl](probes/p1/logs/C2-h-r3.jsonl)
- `C2-t`: [C2-t-r1.jsonl](probes/p1/logs/C2-t-r1.jsonl), [C2-t-r2.jsonl](probes/p1/logs/C2-t-r2.jsonl), [C2-t-r3.jsonl](probes/p1/logs/C2-t-r3.jsonl)
- `C3-h`: [C3-h-r1.jsonl](probes/p1/logs/C3-h-r1.jsonl), [C3-h-r1.jsonl.cmd.json](probes/p1/logs/C3-h-r1.jsonl.cmd.json), [C3-h-r2.jsonl](probes/p1/logs/C3-h-r2.jsonl), [C3-h-r2.jsonl.cmd.json](probes/p1/logs/C3-h-r2.jsonl.cmd.json), [C3-h-r3.jsonl](probes/p1/logs/C3-h-r3.jsonl), [C3-h-r3.jsonl.cmd.json](probes/p1/logs/C3-h-r3.jsonl.cmd.json)
- `C3-t`: [C3-t-r1.jsonl](probes/p1/logs/C3-t-r1.jsonl), [C3-t-r1.jsonl.cmd.json](probes/p1/logs/C3-t-r1.jsonl.cmd.json), [C3-t-r2.jsonl](probes/p1/logs/C3-t-r2.jsonl), [C3-t-r2.jsonl.cmd.json](probes/p1/logs/C3-t-r2.jsonl.cmd.json), [C3-t-r3.jsonl](probes/p1/logs/C3-t-r3.jsonl), [C3-t-r3.jsonl.cmd.json](probes/p1/logs/C3-t-r3.jsonl.cmd.json)
- `C4-t`: [C4-t-r1.jsonl](probes/p1/logs/C4-t-r1.jsonl), [C4-t-r2.jsonl](probes/p1/logs/C4-t-r2.jsonl), [C4-t-r3.jsonl](probes/p1/logs/C4-t-r3.jsonl)
- `C4-b`: [C4-b-r1.jsonl](probes/p1/logs/C4-b-r1.jsonl), [C4-b-r2.jsonl](probes/p1/logs/C4-b-r2.jsonl), [C4-b-r3.jsonl](probes/p1/logs/C4-b-r3.jsonl)

### Interpretation (orchestrator)

Interpreted by the Team A orchestrator (Opus 5.5) from the signals above. The lane recorded the signals only.

1. **Channel 1, MCP elicitation, passes on Claude Code 2.1.325 in the TUI.** The client
   advertises `elicitation: {form, url}` in both modes (C1, 6/6). In the TUI the person
   sees the prompt from the server and the answer reaches the server directly, as
   `action:"accept"` with content (C2-t, 3/3). The model received only the tool's
   `{"sent":true}`. Run 1's `"ALPHA\n"` is an artifact of the fixture (a newline typed into
   the field). It is not a harness fault.
2. **In headless `-p`, elicitation fails closed.** The client answers `action:"cancel"`
   within about 6 ms, with no person involved (C2-h, 3/3). U3 must treat `cancel` and
   `decline` as *no decision*: the state stays `DECISIONS`, and a headless session
   cannot approve a charter. This is the degraded state from section 5.9 ("no operator
   channel passes"), applied per mode.
3. **Channel 2 (command pre-execution) works in both modes** (C3, 6/6). It stays a
   convention a model with shell access could imitate, so it is not adopted on Claude Code,
   where channel 1 passes.
4. **Channel 3 (permission prompt) works only in manual mode** (C4-t, 3/3). It is void under
   `--dangerously-skip-permissions` (C4-b, 3/3). Not adopted.
5. **Selected for Claude Code: channel 1 only.** The plan's preference order picks the
   first channel that passes. Other doors are decided per door in P6.

**Gaps U3 must close before relying on channel 1** (each cell n = 3, same fixture):
- C2-t under `--dangerously-skip-permissions` and under `--permission-mode auto`,
  the founder's usual modes: does the elicitation prompt still appear, or is it
  auto-accepted? An auto-accept would void channel 1 in those modes, which is a
  blocking question.
- Whether any harness-side setting can auto-answer elicitation for the model.
