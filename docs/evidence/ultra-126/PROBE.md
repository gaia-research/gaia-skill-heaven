# Skill Ultra (#126) — Empirical Probes

## P1 — operator channel

- **Date:** 2026-11-16 (`2026-11-15T21:33:36Z` – `2026-11-15T21:40:20Z`) (C3-h and C4-b re-run for committed excerpts at about `21:56Z`–`21:57Z`, P1c)
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
| `C3-h` | headless `-p "/probe-decide"` | 1 | `.cmd.json` created (`pid: 23654`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:56:48.573Z"`, [C3-h-r1.jsonl.cmd.json](probes/p1/logs/C3-h-r1.jsonl.cmd.json)). First `assistant` event timestamp: `2026-11-15T21:56:50.600Z` (cmd precedes model output); `result` echoed stdout verbatim: `"P1_PREEXEC_STDOUT 2026-11-15T21:56:48.573Z decide-x"` ([C3-h-r1.stream.jsonl](probes/p1/logs/C3-h-r1.stream.jsonl)) |
| `C3-h` | headless `-p "/probe-decide"` | 2 | `.cmd.json` created (`pid: 23699`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:56:52.802Z"`, [C3-h-r2.jsonl.cmd.json](probes/p1/logs/C3-h-r2.jsonl.cmd.json)). First `assistant` event timestamp: `2026-11-15T21:56:54.570Z` (cmd precedes model output); `result` echoed stdout verbatim: `"P1_PREEXEC_STDOUT 2026-11-15T21:56:52.802Z decide-x"` ([C3-h-r2.stream.jsonl](probes/p1/logs/C3-h-r2.stream.jsonl)) |
| `C3-h` | headless `-p "/probe-decide"` | 3 | `.cmd.json` created (`pid: 23743`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:56:56.555Z"`, [C3-h-r3.jsonl.cmd.json](probes/p1/logs/C3-h-r3.jsonl.cmd.json)). First `assistant` event timestamp: `2026-11-15T21:57:20.224Z` (cmd precedes model output); `result` echoed stdout verbatim: `"P1_PREEXEC_STDOUT 2026-11-15T21:56:56.555Z decide-x"` ([C3-h-r3.stream.jsonl](probes/p1/logs/C3-h-r3.stream.jsonl)) |
| `C3-t` | TUI pane (`w31:pA`, `/probe-decide`) | 1 | `.cmd.json` created (`pid: 53480`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:38:27.407Z"`, [C3-t-r1.jsonl.cmd.json](probes/p1/logs/C3-t-r1.jsonl.cmd.json)). Pane output `⏺ P1_PREEXEC_STDOUT 2026-11-15T21:38:27.407Z decide-x` at `2026-11-15T21:38:32Z` (observed in pane, not committed) |
| `C3-t` | TUI pane (`w31:pA`, `/probe-decide`) | 2 | `.cmd.json` created (`pid: 53589`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:38:48.022Z"`, [C3-t-r2.jsonl.cmd.json](probes/p1/logs/C3-t-r2.jsonl.cmd.json)). First model output `⏺ P1_PREEXEC_STDOUT 2026-11-15T21:38:48.022Z decide-x` via `wait-output` at `2026-11-15T21:38:50.121Z` (observed in pane, not committed) |
| `C3-t` | TUI pane (`w31:pA`, `/probe-decide`) | 3 | `.cmd.json` created (`pid: 53925`, `argv: ["decide-x"]`, `ts: "2026-11-15T21:39:01.949Z"`, [C3-t-r3.jsonl.cmd.json](probes/p1/logs/C3-t-r3.jsonl.cmd.json)). First model output `⏺ P1_PREEXEC_STDOUT 2026-11-15T21:39:01.949Z decide-x` via `wait-output` at `2026-11-15T21:39:03.619Z` (observed in pane, not committed) |
| `C4-t` | TUI pane (`w31:pA`, `--permission-mode manual`, `operator_decide` not allowed) | 1 | Prompt appeared (`Tool use / p1 — Operator Decide Tool: (MCP) / Do you want to proceed? / ❯ 1. Yes / 2. No`). Selecting `2. No` interrupted the call (`No result recorded for 1 call / p1 - operator_decide (MCP) / Interrupted · What should Claude do instead?`). Log `tools/call` count: `0` |
| `C4-t` | TUI pane (`w31:pA`, `--permission-mode manual`, `operator_decide` not allowed) | 2 | Same permission prompt appeared; selecting `2. No` prevented execution (`No result recorded for 1 call`). Log `tools/call` count: `0` |
| `C4-t` | TUI pane (`w31:pA`, `--permission-mode manual`, `operator_decide` not allowed) | 3 | Same permission prompt appeared; selecting `2. No` prevented execution (`No result recorded for 1 call`). Log `tools/call` count: `0` |
| `C4-b` | headless `-p --dangerously-skip-permissions` | 1 | `tools/call` for `operator_decide` logged at `2026-11-15T21:57:25.040Z` (`operator_decide_called` at `21:57:25.041Z`, [C4-b-r1.jsonl](probes/p1/logs/C4-b-r1.jsonl)); no prompt, `permission_denials: []` ([C4-b-r1.stream.jsonl](probes/p1/logs/C4-b-r1.stream.jsonl)) |
| `C4-b` | headless `-p --dangerously-skip-permissions` | 2 | `tools/call` for `operator_decide` logged at `2026-11-15T21:57:30.853Z` (`operator_decide_called` at `21:57:30.854Z`, [C4-b-r2.jsonl](probes/p1/logs/C4-b-r2.jsonl)); no prompt, `permission_denials: []` ([C4-b-r2.stream.jsonl](probes/p1/logs/C4-b-r2.stream.jsonl)) |
| `C4-b` | headless `-p --dangerously-skip-permissions` | 3 | `tools/call` for `operator_decide` logged at `2026-11-15T21:57:36.498Z` (`operator_decide_called` at `21:57:36.498Z`, [C4-b-r3.jsonl](probes/p1/logs/C4-b-r3.jsonl)); no prompt, `permission_denials: []` ([C4-b-r3.stream.jsonl](probes/p1/logs/C4-b-r3.stream.jsonl)) |

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
- `C3-h`: [C3-h-r1.jsonl](probes/p1/logs/C3-h-r1.jsonl), [C3-h-r1.jsonl.cmd.json](probes/p1/logs/C3-h-r1.jsonl.cmd.json), [C3-h-r1.stream.jsonl](probes/p1/logs/C3-h-r1.stream.jsonl), [C3-h-r2.jsonl](probes/p1/logs/C3-h-r2.jsonl), [C3-h-r2.jsonl.cmd.json](probes/p1/logs/C3-h-r2.jsonl.cmd.json), [C3-h-r2.stream.jsonl](probes/p1/logs/C3-h-r2.stream.jsonl), [C3-h-r3.jsonl](probes/p1/logs/C3-h-r3.jsonl), [C3-h-r3.jsonl.cmd.json](probes/p1/logs/C3-h-r3.jsonl.cmd.json), [C3-h-r3.stream.jsonl](probes/p1/logs/C3-h-r3.stream.jsonl)
- `C3-t`: [C3-t-r1.jsonl](probes/p1/logs/C3-t-r1.jsonl), [C3-t-r1.jsonl.cmd.json](probes/p1/logs/C3-t-r1.jsonl.cmd.json), [C3-t-r2.jsonl](probes/p1/logs/C3-t-r2.jsonl), [C3-t-r2.jsonl.cmd.json](probes/p1/logs/C3-t-r2.jsonl.cmd.json), [C3-t-r3.jsonl](probes/p1/logs/C3-t-r3.jsonl), [C3-t-r3.jsonl.cmd.json](probes/p1/logs/C3-t-r3.jsonl.cmd.json)
- `C4-t`: [C4-t-r1.jsonl](probes/p1/logs/C4-t-r1.jsonl), [C4-t-r2.jsonl](probes/p1/logs/C4-t-r2.jsonl), [C4-t-r3.jsonl](probes/p1/logs/C4-t-r3.jsonl)
- `C4-b`: [C4-b-r1.jsonl](probes/p1/logs/C4-b-r1.jsonl), [C4-b-r1.stream.jsonl](probes/p1/logs/C4-b-r1.stream.jsonl), [C4-b-r2.jsonl](probes/p1/logs/C4-b-r2.jsonl), [C4-b-r2.stream.jsonl](probes/p1/logs/C4-b-r2.stream.jsonl), [C4-b-r3.jsonl](probes/p1/logs/C4-b-r3.jsonl), [C4-b-r3.stream.jsonl](probes/p1/logs/C4-b-r3.stream.jsonl)

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
3. **Channel 2 (command pre-execution) works in headless mode** (C3-h, 3/3, committed stream-json excerpts). In the TUI
   (C3-t, 3/3) the writer ran (committed `.cmd.json`), but the ordering before the first model output was
   observed in the pane and is not independently verifiable from committed logs.
   Channel 2 remains a convention a model with shell access could imitate, so it is not adopted on Claude Code,
   where channel 1 passes.
4. **Channel 3 (permission prompt) worked in the tested manual-mode TUI runs** (C4-t, 3/3) and was void in the tested
   headless bypass runs (C4-b, 3/3). Other modes were not tested for channel 3. Not adopted.
5. **Selected for Claude Code: channel 1 only.** The plan's preference order picks the
   first channel that passes. Other doors are decided per door in P6.

**Gaps U3 must close before relying on channel 1** (each cell n = 3, same fixture):
- C2-t under `--dangerously-skip-permissions` and under `--permission-mode auto`,
  the founder's usual modes: does the elicitation prompt still appear, or is it
  auto-accepted? An auto-accept would void channel 1 in those modes, which is a
  blocking question.
- Whether any harness-side setting can auto-answer elicitation for the model.

## P1b: elicitation under bypass and auto modes

- **Date:** 2026-11-16 (`2026-11-15T21:43:48Z` – `2026-11-15T21:48:00Z`)
- **Harness binary & version:** `~/.local/bin/claude` — `2.1.325 (Claude Code)`
- **Model:** `claude-haiku-5-5` (`--model claude-haiku-5-5`)
- **Isolation flags (all runs):** fresh `mktemp -d` working directory, `--strict-mcp-config --mcp-config <run_dir>/mcp.json`, `--setting-sources project`
- **Additional per-cell flags:**
  - `C2-tb`: `--dangerously-skip-permissions`
  - `C2-ta`: `--permission-mode auto --allowedTools mcp__p1__probe_elicit`
  - `C2-hb`: `-p --no-session-persistence --output-format stream-json --verbose --dangerously-skip-permissions`
- **Herdr pane IDs (TUI cells):** `w32:p4` (`C2-tb` r1–r3), `w32:p5` (`C2-ta` r1–r3), split inside tab `w32:t3`. Both panes closed after recording.
- **Test fixture note:** Keystrokes sent to TUI panes (`Down` + `Enter` on workspace trust prompt, `Down` + `Enter` on bypass-permissions warning in `C2-tb`, `"call probe_elicit"` + `Enter`, `"ALPHA"` + `Down` + `Enter` + `Enter` on `Accept`) were sent via `herdr pane send-text` / `herdr pane send-keys` as a **test fixture standing in for an operator**, not a human decision.

### Results (n = 3 per cell)

| Cell | Mode | Run | Observed signal |
|---|---|---:|---|
| `C2-tb` | TUI pane (`w32:p4`, `--dangerously-skip-permissions`) | 1 | Elicitation prompt appeared (`MCP server “p1” requests your input` / `P1 operator check: type the word ALPHA` / `❯ * word: Type something…` / `Accept    Decline`). Server sent `elicitation/create` (`id:"srv-1"`) at `21:44:44.083Z`; after fixture typed `ALPHA` and selected `Accept`, server logged at `21:45:00.522Z`: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-tb` | TUI pane (`w32:p4`, `--dangerously-skip-permissions`) | 2 | Same elicitation prompt appeared. Server sent `elicitation/create` (`id:"srv-1"`) at `21:45:35.924Z`; after fixture typed `ALPHA` and selected `Accept`, server logged at `21:45:56.830Z`: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-tb` | TUI pane (`w32:p4`, `--dangerously-skip-permissions`) | 3 | Same elicitation prompt appeared. Server sent `elicitation/create` (`id:"srv-1"`) at `21:46:43.922Z`; after fixture typed `ALPHA` and selected `Accept`, server logged at `21:47:00.012Z`: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-ta` | TUI pane (`w32:p5`, `--permission-mode auto --allowedTools mcp__p1__probe_elicit`) | 1 | Elicitation prompt appeared (`MCP server “p1” requests your input` / `P1 operator check: type the word ALPHA` / `❯ * word: Type something…` / `Accept    Decline`). Server sent `elicitation/create` (`id:"srv-1"`) at `21:46:28.564Z`; after fixture typed `ALPHA` and selected `Accept`, server logged at `21:46:50.313Z`: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-ta` | TUI pane (`w32:p5`, `--permission-mode auto --allowedTools mcp__p1__probe_elicit`) | 2 | Same elicitation prompt appeared. Server sent `elicitation/create` (`id:"srv-1"`) at `21:47:20.707Z`; after fixture typed `ALPHA` and selected `Accept`, server logged at `21:47:31.088Z`: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-ta` | TUI pane (`w32:p5`, `--permission-mode auto --allowedTools mcp__p1__probe_elicit`) | 3 | Same elicitation prompt appeared. Server sent `elicitation/create` (`id:"srv-1"`) at `21:47:50.392Z`; after fixture typed `ALPHA` and selected `Accept`, server logged at `21:47:59.655Z`: `{"result":{"action":"accept","content":{"word":"ALPHA"}},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-hb` | headless `-p --dangerously-skip-permissions` | 1 | Server sent `elicitation/create` (`id:"srv-1"`) at `21:43:50.945Z`; client logged response at `21:43:50.953Z`: `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-hb` | headless `-p --dangerously-skip-permissions` | 2 | Server sent `elicitation/create` (`id:"srv-1"`) at `21:43:55.901Z`; client logged response at `21:43:55.903Z`: `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"srv-1"}` |
| `C2-hb` | headless `-p --dangerously-skip-permissions` | 3 | Server sent `elicitation/create` (`id:"srv-1"`) at `21:44:00.963Z`; client logged response at `21:44:00.965Z`: `{"result":{"action":"cancel"},"jsonrpc":"2.0","id":"srv-1"}` |

### TUI pane excerpts (test fixture interactions)

**`C2-tb` run 1 elicitation prompt (`w32:p4`):**
```text
────────────────────────────────────────────────────────────────────────
  MCP server “p1” requests your input

  P1 operator check: type the word ALPHA

  ❯ * word: Type something…

    Accept    Decline

  Esc to cancel · ↑/↓ to navigate · Backspace to unset
```

**`C2-ta` run 1 elicitation prompt (`w32:p5`):**
```text
────────────────────────────────────────────────────────────────────────
  MCP server “p1” requests your input

  P1 operator check: type the word ALPHA

  ❯ * word: Type something…

    Accept    Decline

  Esc to cancel · ↑/↓ to navigate · Backspace to unset
```

### Raw

Committed MCP JSONL logs:

- `C2-tb`: [C2-tb-r1.jsonl](probes/p1/logs/C2-tb-r1.jsonl), [C2-tb-r2.jsonl](probes/p1/logs/C2-tb-r2.jsonl), [C2-tb-r3.jsonl](probes/p1/logs/C2-tb-r3.jsonl)
- `C2-ta`: [C2-ta-r1.jsonl](probes/p1/logs/C2-ta-r1.jsonl), [C2-ta-r2.jsonl](probes/p1/logs/C2-ta-r2.jsonl), [C2-ta-r3.jsonl](probes/p1/logs/C2-ta-r3.jsonl)
- `C2-hb`: [C2-hb-r1.jsonl](probes/p1/logs/C2-hb-r1.jsonl), [C2-hb-r2.jsonl](probes/p1/logs/C2-hb-r2.jsonl), [C2-hb-r3.jsonl](probes/p1/logs/C2-hb-r3.jsonl)

### Interpretation (orchestrator)

Interpreted by the Team A orchestrator (Opus 5.5).

1. **Bypass mode and auto mode do not void channel 1.** The elicitation prompt appeared,
   waited for input and was not auto-accepted in either mode (C2-tb 3/3, C2-ta 3/3).
   Unlike channel 3, channel 1 holds in the founder's usual permission modes.
2. **Headless remains fail-closed even with bypass** (C2-hb 3/3, `cancel` within ~8 ms).
3. The two tested modes did not auto-accept in these runs (n = 3 each) on 2.1.325. This narrows the P1 gap
   but does not close it: whether **any** harness-side setting can auto-answer elicitation remains open
   and untested.

## Limit: channel 1 is terminal input, not authentication (decision D-009)

What channel 1 is not, stated plainly as plan section 5.3 requires: **it does not prove a
person answered.** The elicitation answer is whatever is typed into the terminal running
Claude Code. In P1 and P1b, a worker agent answered every TUI prompt by sending keystrokes
with `herdr pane send-text`. The server received an ordinary `accept`, indistinguishable
from a person's. Any process that can write to that terminal can do the same: a
multiplexer client (herdr, tmux), the person's own automation, or the session's **own
model** when it has a shell tool and its terminal sits inside a multiplexer. For example,
the model could issue a shell call that types into its own pane alongside the campaign call
that elicits.

This is the same class of boundary as channels 2 and 3 and as the steering brand: "not
authentication". Channel 1 still keeps the answer out of the model's tool path, and on
Claude Code 2.1.325 no channel authenticates a person. **Refined by founder ruling FD-11 and decision D-010 (decision log):** by default an elicitation
`accept` grants operator authority only when the server sees no multiplexer. Otherwise the
decisions step fails closed. Advanced users may opt in with an unadvertised, person-set env
var; every entry under opt-in is recorded as such. Probe P1d measures whether auto mode's
classifier blocks a self-approval attempt. Consequences, binding on U3 and U9:

- Every operator entry records `attribution: "terminal-input, unauthenticated"` and
  whether the server process sees a multiplexer (`HERDR_ENV` / `HERDR_SOCKET_PATH` /
  `TMUX`). The decisions render shows both.
- U9's real operator decision is made by the founder in a terminal no agent can write to
  (outside herdr and tmux), and `PROOF.md` says where it was made.
- No keystroke a test fixture sends is ever recorded as a person's decision.
