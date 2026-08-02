---
name: herdr-benchmark-pane
description: Launch interactive benchmark targets and agent CLI sessions (Claude, claude-heaven, pi-heaven) in a right side-by-side terminal pane using Herdr socket API when operating inside a Herdr terminal multiplexer environment. Use whenever running benchmark probes, side-by-side agent evaluations, or launching Claude inside Herdr.
---

# Herdr Benchmark & Side-Pane Launcher

Use this skill whenever you need to open an interactive target agent (`claude`, `claude-heaven`, `pi-heaven`, `codex`) or run a benchmark probe inside a **Herdr** terminal multiplexer environment.

## Hard Rules

1. **Right-Pane Isolation**: All benchmark runs, interactive probes, or secondary agent windows MUST open in a vertical split on the **RIGHT** (`--direction right --ratio 0.5`) of the controlling main window. Never replace or overwrite the controlling agent's active terminal pane.
2. **Socket-Driven Control**: Always use Herdr's CLI socket interface (`herdr pane split`, `herdr pane send-text`, `herdr pane read`) to orchestrate panes programmatically.
3. **Pristine Environment**: Ensure workspace directory (`--cwd`) is specified explicitly on split to prevent state leakage across panes.

---

## 1. Environment Detection

Before attempting pane operations, verify that the Herdr server and socket are responsive:

```bash
herdr status
```

If `server.status` is `running` and socket `/Users/marcotiongson/.config/herdr/herdr.sock` exists, proceed with Herdr socket operations.

---

## 2. Launching Claude / Target Agent in a Right Side Pane

### Step 1: Query the active main pane
```bash
herdr pane current
```
*Extract the `pane_id` of the controlling window (e.g. `w1:p3`).*

### Step 2: Split current pane to the right
```bash
herdr pane split <MAIN_PANE_ID> --direction right --ratio 0.5 --cwd "$(pwd)"
```
*Returns the new right `pane_id` (e.g. `w1:pA`).*

### Step 3: Launch Claude Code or `claude-heaven`

To launch standard Claude Code:
```bash
herdr pane send-text <RIGHT_PANE_ID> $'claude\n'
```

To launch `claude-heaven` clean posture:
```bash
herdr pane send-text <RIGHT_PANE_ID> $'node /Users/marcotiongson/Documents/skill-heaven/packages/claude-heaven/bin/claude-heaven.mjs\n'
```

To launch with a specific model (e.g. Opus or Sonnet):
```bash
herdr pane send-text <RIGHT_PANE_ID> $'node /Users/marcotiongson/Documents/skill-heaven/packages/claude-heaven/bin/claude-heaven.mjs --model opus\n'
```

---

## 3. Interacting with the Right Pane

### Inject Prompts / Input
```bash
herdr pane send-text <RIGHT_PANE_ID> $'Your prompt here\n'
herdr pane send-keys <RIGHT_PANE_ID> Enter
```

### Inspect Output & Terminal Buffer
```bash
herdr pane read <RIGHT_PANE_ID>
```

### Focus the Right Pane
```bash
herdr pane focus <RIGHT_PANE_ID>
```

### Teardown / Close Pane when Complete
```bash
herdr pane close <RIGHT_PANE_ID>
```

---

## 4. Multi-Agent Benchmark Suite Pattern

When executing side-by-side comparative benchmarks across postures (e.g. `claude-heaven` vs `native` vs `pi-heaven`):

1. **Tab 1 / Left Pane:** Orchestration & Telemetry Controller (Main Agent).
2. **Right Pane 1 (`--direction right`):** Benchmark Target A (`claude-heaven` posture).
3. **Right Pane 2 (`--direction down` on Pane 1):** Benchmark Target B (`pi-heaven` or baseline posture).

This layout maintains a clean visual matrix in Herdr while allowing the controlling agent to read output buffers, stream events, and measure standing-dose context bloat across all panes concurrently.
