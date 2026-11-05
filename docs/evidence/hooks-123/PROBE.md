# PROBE: the zero cut, live in Claude Code (#123 · gate #125)

**Date:** 2026-11-04 · **Harness:** Claude Code **2.1.318** (`claude --version`), headless
`-p` with `--output-format stream-json --verbose`.

This is a functional acceptance record, not a benchmark. No gold data, no floor, no
scoring. Every cell is one real session. The evidence is the harness's own
`hook_started`/`hook_response` events and the `tool_result`, not the model's account
of them.

## Current design: the summon server enforces the cut (commit `f005a15`)

Founder ruling, 2026-11-04: the core plugin installs **no hooks**, and `zero_cuts = all`
means no skill is used. The summon server refuses every route that would put a skill
into a session. The `PreToolUse` hook recorded under *Historical* below was removed in
`f005a15`.

| Cell | Setup | Observed (harness events, `tool_result`) | Result |
|---|---|---|---|
| **S0** inventory | `claude plugin details skill-heaven@gaia-skill-heaven` | `Hooks (0)` · `MCP servers (1) skill-summon` | **pass**: no hook installed |
| **S1** marketplace, cut on | `zero_cuts=all` via `pluginConfigs`; summon `Frontend Code Review` | Only the 2 ambient test hooks fired, none from Skill Heaven. The server answered `is_error: true` with the constant refusal and nothing was summoned. This also shows `${user_config.zero_cuts}` reaches the server's env. | **pass** |
| **S1p** preview, cut on | same, `preview: true` | Refused with the same text | **pass**: no catalogue cards either |
| **S2** marketplace, cut off | `zero_cuts=temporary` | Materialized `langgenius/frontend-code-review` | **pass** |
| **S6** launcher, cut on | `claude-zero` product floor, `SKILL_HEAVEN_ZERO_CUTS=all` | **No hook events at all.** The server refused. | **pass** |
| **S6b** launcher, cut unset | same, no variable | Materialized | **pass** |
| **R** re-run at `ca43c87` | after the review changed the refusal wording: S0, S1 and S6 repeated | `Hooks (0)`; marketplace and launcher both returned the new constant refusal; only the 2 ambient test hooks fired on the marketplace path, none on the launcher | **pass** |

Unit coverage (`packages/skill-summon/test/zero-cut.test.ts`) adds three checks for a
cut summon: no session directory is created, the registry is never loaded, and the
resource reader and describer are never called. `skills/list` and `resources/list`
come back empty, and `skills/get` and `resources/read` refuse.

---

## Isolation (P3) — both rounds

- Every marketplace session ran with `CLAUDE_CONFIG_DIR=<scratch>/config`, a fresh
  directory. The launcher cells used a second fresh `<scratch>/config-launch`.
- The real `~/.claude` gained no marketplace, plugin, hook or `pluginConfigs` entry.
  One earlier, unrelated auth check (`claude -p PONG`, no plugin) ran before isolation,
  and the host's own remote-settings sync touched `remote-settings.json`.
- The marketplace was the repository snapshot added as a `directory` source. The
  harness reads it in place, so the files under test are `git archive HEAD`, diffed
  equal to the working tree before the exact-head reruns.
- Environment noise, recorded rather than removed: the container's account syncs eight
  claude.ai plugins into every session (`small-business`, `pdf-viewer`, …). None of
  them declares a hook that fired on these tools.

Install and configuration, exactly as run:

```
claude plugin marketplace add <snapshot>
claude plugin install skill-heaven@gaia-skill-heaven --config zero_cuts=all
echo '{"zero_cuts":"temporary"}' | claude plugin configure skill-heaven@gaia-skill-heaven --values-stdin   # between cells
claude plugin details skill-heaven@gaia-skill-heaven
  → Hooks (1)  PreToolUse  (harness-only — no model context cost)
```

Coexistence fixtures:
- A **user** hook in `<config>/settings.json` and a **project** hook in
  `<work>/.claude/settings.json`.
- Both are `PreToolUse`, `matcher: "*"`, and append `{event, tool}` to a marker file.

## Not verified here

- Interactive (TUI) sessions, including console dormancy as painted: #227. All cells are headless `-p`.
- Desktop.
- Any Claude Code version other than 2.1.318. **Re-run S0, S1, S1p and S6 on every Claude
  Code upgrade (M0).**

## Decisions recorded with this probe

**SessionStart: not shipped.** The only facts a hook can truthfully report at session
start are configuration: `zero_cuts`, `skill_url`, and the launcher's boot posture.
There is no observed rung yet, because rung commands are stateless (#91) and
persisting one is what CONTROL-PLANE §7 says needs a core contract. Shipping that
context anyway:
- adds an always-on model-context dose to every session, the zero floor included;
  today `claude plugin details` reports the hook as "no model context cost";
- creates a projection nobody can turn off without a new setting, while CONTROL-PLANE
  requires every projection to be switch-off-able and none to be an authority channel;
- buys nothing for correctness, because the refusal already tells the model at the
  moment it matters.

It needs a founder decision on the standing dose and the toggle. It is not a code fix.

**PreCompact: not shipped.**
- PreCompact cannot inject context.
- #124's carry-over depended on hidden state written by the excluded `UserPromptSubmit`
  and `PostToolUse` hooks.
- The only stateless source is the transcript, and re-injecting skill names parsed
  from it would put remote-origin strings into context unasked (#85/#169).
- Cell K showed Claude Code's own summary keeps the observation.

Revisit only with a reproduced loss.

## Historical: the `PreToolUse` hook (commit `0a9aad3`, removed in `f005a15`)

**Plugin under test:** `skill-heaven` 0.1.2 at commit `0a9aad3`. Kept as evidence for
how Claude Code dispatches plugin hooks. It is not the shipped design.

### Cells

| Cell | Setup | Observed (harness events) | Result |
|---|---|---|---|
| **C1** marketplace, cut on | `zero_cuts=all` via `pluginConfigs`; model calls `mcp__plugin_skill-heaven_skill-summon__summon` | 3 hooks on the summon call: user and project exit 0, ours **exit 2**. Our stderr reached the model as `tool_result is_error: true`; the tool did not run. On the earlier `ToolSearch` call only the 2 ambient hooks fired. | **pass** (rerun on `0a9aad3` with an exact-name query that C2 shows would materialize) |
| **C2** marketplace, cut off | `zero_cuts=temporary` | Ours exit 0, no output. The tool ran and materialized `langgenius/frontend-code-review`. | **pass** |
| **C3** unrelated tool, cut on | `zero_cuts=all`; model runs `echo probe-ok` through Bash | Only the 2 ambient hooks fired. Ours was **not dispatched**, and Bash returned `probe-ok`. | **pass** |
| **C6** launcher, cut on | `claude-zero` product floor (`--plugin-dir` door, summon admitted by `--mcp-config` as `mcp__skill-summon__summon`, `--setting-sources ''`); `SKILL_HEAVEN_ZERO_CUTS=all` | One hook (ours) **exit 2**, the tool did not run. The ambient user/project marker files stayed **empty**, so the clean room still keeps them out. | **pass** (rerun on `0a9aad3`) |
| **C6b** launcher, cut off | same, no cut | Ours exit 0; the tool ran and materialized the skill. | **pass** |
| **C7** hook crash | snapshot-only: `zero-cut.mjs` replaced by a module that throws, `zero_cuts=all` | Ours exit 1, `outcome: error`. Claude Code treats a non-2 exit as **non-blocking** and the summon ran. | **recorded limit**: a crashed hook fails open. The snapshot was restored and re-diffed equal to HEAD. |
| **K** compaction | `zero_cuts=temporary`: summon one skill, `--resume` + `/compact` (51,754 → 13,625 tokens), then `--resume` asking, with no tools, which skill was materialized and where | The model answered with the exact id and the exact materialized path from Claude Code's own compact summary. | No carry-over gap shown in this case (n = 1, short session) |

What the cells establish:
- **Matcher:** `mcp__plugin_skill-heaven_skill-summon__summon|mcp__skill-summon__summon`
  dispatches on both real names and not on `ToolSearch` or `Bash`.
- **userConfig reaches the hook:** `pluginConfigs.<plugin>.options.zero_cuts` arrives
  as `CLAUDE_PLUGIN_OPTION_ZERO_CUTS`. C1 had no other source for the value.
- **Launcher env reaches the hook:** under `--setting-sources ''` no plugin option is
  exported, and the existing `SKILL_HEAVEN_ZERO_CUTS` is what reaches the hook.
- **Exit-2 contract:** stderr is shown to the model and the tool call is not executed.
- **Coexistence:** ambient hooks still run beside ours, and ours never answers
  "allow", so their denials keep working.
- **Plugin data:** the harness creates the plugin data directory and it stays empty.
  The hook writes nothing.

### Follow-up cells (same version, same isolation, after the #226 review request)

| Cell | Setup | Observed | Result |
|---|---|---|---|
| **M1** renderer vs stored setting | `zero_cuts=all` stored; `/skill-heaven:skill-zero`, then `/skill-heaven:summon frontend code review` | `/skill-zero` rendered `requested cut: temporary … manual /summon available`. The `/summon` renderer printed no refusal and the model called the tool. **Our hook blocked it (exit 2).** | Enforcement holds; **renderer misreports the stored setting**: #228 |
| **M2** what reaches a `!` block | probe-only command (in the snapshot, never committed): `` !`echo "subst=[${user_config.zero_cuts}] env=[$CLAUDE_PLUGIN_OPTION_ZERO_CUTS]"` `` | `subst=[all]`; the env variable was not exported | Substitution reaches command content; the hook-only env does not |

Interactive (TUI) cells are tracked in #227.


## #228: the renderer reads the stored setting (2026-11-05, Claude Code 2.1.318)

Headless `-p`, `--output-format stream-json --verbose`. Every cell used a fresh
`CLAUDE_CONFIG_DIR` in scratch, and the real `~/.claude` was not touched. The
marketplace was a snapshot of the working tree, diffed equal to
`plugins/skill-heaven` before the run. Evidence: the rendered `!` block in the
`result`, and the `tool_use` list (empty in every cell).

| Cell | Setup | Observed | Result |
|---|---|---|---|
| **Z1** marketplace, stored `all` | `install --config zero_cuts=all`; `/skill-heaven:skill-zero` | `stored cut: all skills — no automatic or manual summon` | **pass** |
| **Z2** marketplace, stored `all` | `/skill-heaven:summon frontend code review` | `⛔ manual /summon is cut by the configured zero_cuts = all.`, no tool call | **pass**: the renderer now refuses before the server needs to |
| **Z3** marketplace, stored `temporary` | `configure --values-stdin` → `temporary`; `/skill-heaven:skill-zero all` | `requested cut: all — not stored · stored cut: temporary …` plus the `/plugin configure` pointer | **pass** |
| **Z3b** same | `/skill-heaven:skill-zero` | `stored cut: temporary automatic skills — manual /summon available` | **pass** |
| **Z4** launch, `SKILL_HEAVEN_ZERO_CUTS=all` | `--setting-sources '' --plugin-dir <plugin>`; `/skill-heaven:skill-zero` | `stored cut: all skills …`. A probe command showed the placeholder stays literal on this route | **pass** |
| **Z4b** launch, unset | same, no variable | `stored cut: temporary …` | **pass** |

Attack cells, on a probe-only command that `cat`s the same heredoc shape (in the
snapshot, never committed). A marker file under scratch was the hard signal.

| Cell | Stored value | Observed | Result |
|---|---|---|---|
| **A1** | multi-line value through `claude plugin configure --values-stdin` | `must be a single line`; nothing saved | refused by the CLI |
| **A2** | `all' "q" $(touch M) …` (single line, settings hand-edited) | printed literally; no marker | inert |
| **A3** | ``all` !`node -e …` ` `` (an attempted second `!` block) | Claude Code escaped it to `\!`; no marker | inert |
| **A4** | `all⏎SKILL_HEAVEN_ARGS_EOF⏎node -e …` (hand-edited), default permission mode | `Shell command permission check failed`; no marker | refused by the harness |
| **A5** | same as A4, `--permission-mode bypassPermissions` | **marker written** | residual, same exposure as `$ARGUMENTS`; needs a hand edit of settings and confers nothing a settings writer lacks (they can add a hook) |

## #227: the interactive session (TUI), real PTY (2026-11-05, Claude Code 2.1.318)

These cells ran in the **interactive TUI**, not `-p`. `claude` ran inside a `tmux`
pane (a real PTY, 200×50) on Linux, and was driven by keystrokes. The evidence is the
painted pane (`tmux capture-pane`), the stored `settings.json`, and the summon
server's process environment (`/proc/<pid>/environ`). Onboarding (theme, security
notes, workspace trust) was answered in the pane. Isolation was the same as above:
a fresh `CLAUDE_CONFIG_DIR` in scratch and a working-tree snapshot of the
marketplace that includes the #228 renderer fix. The real `~/.claude` was not
touched. Tool permission prompts appeared (default mode) and were approved in the
pane.

| Cell | Setup | Observed in the pane | Result |
|---|---|---|---|
| **T1a** `/summon`, cut on | marketplace, `zero_cuts=all`; `/skill-heaven:summon frontend code review` | Renderer block `⛔ manual /summon is cut…`; the model reported it and made **no** tool call | **pass** |
| **T1b** tool + preview, cut on | same session; model asked to call `summon` (`surface:"any"`), then `preview:true` | Two permission prompts approved; both results `<error>Skill Heaven: nothing was summoned. zero_cuts = all is configured…</error>`; no `frontend-code-review` directory appeared under any summon session dir | **pass** |
| **T3** mid-session change | `/plugin configure skill-heaven@gaia-skill-heaven`, zero cuts edited inline to `temporary`, Enter | `Configuration saved.`, then Claude Code ran `/reload-plugins` **by itself** (`0 hooks`). The summon server restarted (new pid), its env read `SKILL_HEAVEN_ZERO_CUTS=temporary`, and `/skill-zero` reported `stored cut: temporary`. **No new session was needed** on 2.1.318 | **pass**: the CLI's "Restart Claude Code to apply it" applies to `claude plugin configure` outside a session; inside the TUI the reload does it |
| **T2** cut off | same session, after T3; `/skill-heaven:summon frontend code review` | `✳ /summon · manual discovery request`; materialized `langgenius__frontend-code-review` under a summon session dir | **pass** |
| **T4a** hooks | `/hooks` | `no hooks yet` | **pass**: Skill Heaven adds none |
| **T4b** disable, uninstall | `/plugin disable …`, then `/plugin uninstall skill-heaven@gaia-skill-heaven` typed in the TUI (console removed with `claude plugin uninstall`) | `settings.json` keeps only `extraKnownMarketplaces.gaia-skill-heaven` (from `marketplace add`), `enabledPlugins: {}`, `pluginConfigs: {}`, no `hooks` key. `plugins/cache/gaia-skill-heaven/` stays | **pass**: what remains is Claude Code's own uninstall residue |
| **T5** launcher, cut on | `claude-zero` (product floor) in the pane, `SKILL_HEAVEN_ZERO_CUTS=all` | Statusline `◇ entropy ‹‹ [ZERO] ›› · ? skills · 0 standing`. `/summon` showed the renderer refusal and no tool call. The direct tool call was refused with the constant text | **pass** |
| **T6** console dormant | `skill-heaven-console` installed; fresh session; `Read`, `Bash`, an `Agent` call | No console status entry and no Lens band at any point | **pass** |
| **T7** console wakes | same session; `/skill-heaven:skill-hell high`, then a summon | After the rung command the status row painted `⚠ skill-heaven-console: ◇ entropy ‹‹ [HIGH] ›› · 0 skills`; after the summon, `· 1 skill`. No Lens band opened (none is opened without `/lens`) | **pass**. Claude Code prefixes a mod's status row with `⚠ <plugin>:`; that is host chrome, not a console warning |
| **T8** `/clear` | same session | The status entry is gone; still absent after a new prompt | **pass** |

**#59, `/reload-skills`, in the same TUI.** Before a summon it read `136 skills
available (none added or removed)`. After a summon materialized
`langgenius__frontend-code-review` it read the same count, `none added or removed`.
A summon lands in a session-locked temp directory, not in a skill directory Claude
Code scans, and the model reads `SKILL.md` from the card's path. So
`/reload-skills` neither helps nor is needed for `/summon`. Making it register would
mean writing into a scanned skill directory, which is the installation that
`/summon` exists not to do.

Not covered: desktop paint, Windows, other harnesses (out of scope per #227).
