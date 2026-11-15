# Probe P6 pass 2: the Codex door (Team C, Antigravity drives; model under test is Codex Luna Low)

Same method as P6 pass 1. Read `docs/evidence/ultra-126/briefs/P6.md` (cells, fixture
rules, env-logging allowlist and denylist) and `docs/evidence/ultra-126/PROBE-P6.md`
(the format to follow), plus `COMMON.md` (Visibility, Reviewer invocation). Reuse
`docs/evidence/ultra-126/probes/p6/server.mjs` unchanged. Worktree `~/skill-heaven-wt/p6b`,
branch `feat/ws6-ultra-u7-p6b`. You record hard signals; the orchestrator interprets.

## Fixed parameters

- Harness: `codex` (record `codex --version`; expected 0.169.0).
- **Model under test: `gpt-6-luna`, reasoning effort low, on every invocation.**
  Pass it explicitly (e.g. `-m gpt-6-luna -c model_reasoning_effort="low"`). Verify from
  Codex's own session log which model actually ran, and record it.
- **Do not edit `~/.codex/config.toml` or anything in `~/.codex/`.** Register the probe MCP
  server per invocation with `-c` overrides, e.g.
  `-c 'mcp_servers.p6.command="node"' -c 'mcp_servers.p6.args=["<abs>/server.mjs"]'`
  plus `-c 'mcp_servers.p6.env={P6_LOG="<run_dir>/log.jsonl"}'`. If Codex cannot load an
  MCP server without editing global config, stop and report BLOCKED. Do not touch it.
- Run from a fresh `mktemp -d` per cell. TUI cells run in panes split inside your tab, and
  each pane is closed after recording. Keystrokes are a labelled test fixture, never a
  person's decision. No private absolute paths in committed files.
- n = 3 per cell. Keep the prompts tiny: this spends the shared OpenAI pool.

## Cells

| Cell | Question |
|---|---|
| S-fresh / S-resume | Does a session-id-like value reach the MCP child (env, or `_meta` on `tools/call`)? Is it equal after `codex exec resume <id>` (headless) or `codex resume <id>` (TUI)? |
| C1 | Is elicitation advertised in `initialize`? TUI: does a prompt appear, and does a fixture answer reach the server? Headless (`codex exec`): what comes back? |
| C2 | Does Codex have a custom-prompt or slash-command mechanism that runs a script before the model's turn? Test it if one exists; otherwise record "no mechanism" with the evidence (help text or docs). |
| C3 | In the default approval mode, does calling an un-allowed MCP tool raise an approval prompt that can deny it? Record the approval mode and sandbox flags used. |

## Record, review, finish

Append `## Door 3: Codex (codex)` to `docs/evidence/ultra-126/PROBE-P6.md`, in the same shape
as doors 1 and 2, with logs under `probes/p6/logs/codex-*`. Leave a
`### Interpretation (orchestrator)` heading for door 3 containing `pending`. Run your own Terra
review from your own shell (`~/.pi/agent/bin/pi-reviewer --cwd ~/skill-heaven-wt/p6b --timeout 10800 --json --prompt-file <brief>`;
it has bash, so have it verify rows against the logs itself). Loop until there are no blocking
findings, and save the reviews under `docs/evidence/ultra-126/reviews/P6b-<sha>.md`. Commit with
`Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>`, push, then run
`gh pr create --base integration/skill-ultra-126 --draft --title "probe(ultra-126): P6 pass 2 codex door"`.
Final reply: the four lines from COMMON.md.
