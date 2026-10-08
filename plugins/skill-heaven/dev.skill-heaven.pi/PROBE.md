# PROBE — Skill Heaven Agent Plugin on Pi 0.84.2

**Harness:** `pi` 0.84.2 (`pi --version` → `0.84.2`)  
**Date:** 2026-08-19  
**Node:** 22.23.1  
**Model for invocation:** `openai-codex/gpt-5.6-luna:low`  
**cwd:** `/Users/marcotiongson/skill-heaven`

## Finding first

Pi 0.84.2 is **not an Agent Plugins 1.0.0 client** and does not appear in the
standard's compatible-client list. It discovers Agent Skills, but it has no
native `plugin.json` / `mcp.json` loader and deliberately ships without MCP.
Installing the portable directory without a Pi package manifest would load the
skills by convention but not the bundled summon server.

That negative is not papered over. `plugins/skill-heaven/package.json` and the
namespaced `dev.skill-heaven.pi/skill-heaven.ts` adapter are the Pi delivery
shim. The adapter consumes the portable `mcp.json`, starts the bundled server,
registers its one `summon` tool natively, and maps the five explicit slash
surfaces to the portable skills. It does not reimplement the summon engine.

## Install from this source checkout

```bash
pi install ./plugins/skill-heaven --approve
```

`pi list` then reported:

```text
../../skill-heaven/plugins/skill-heaven
  /Users/marcotiongson/skill-heaven/plugins/skill-heaven
```

This is a user-scoped Pi package install, so an already-running Pi session needs
`/reload` once. The command mutates Pi's package list because installation was
explicitly requested; the plugin and launcher still never mutate user/project
configuration during summon (P3).

## Discovery hard signal

The discovery check was repeated with `PI_CODING_AGENT_DIR` pointing at a
fresh `/tmp/skill-heaven-pi-isolated.*` directory. Only the plugin path was
installed there; that isolated settings file contained one `packages` entry.
A fresh `pi --mode rpc --no-session --offline --approve` process then received
`{"type":"get_commands"}`. It returned all five extension commands:

```text
/summon · /skill-zero · /skill-heaven · /skill-hell · /skill-ultra
```

and all five skills, with source paths under the installed plugin:

```text
/skill:summon
/skill:skill-zero
/skill:skill-heaven
/skill:skill-hell
/skill:skill-ultra
```

This is harness-owned command metadata, not model self-report.

## Invocation hard signal

The RPC probe sent:

```text
/summon review a Rust PR for unsafe blocks
```

The event stream showed, in order:

1. the prompt accepted;
2. `tool_execution_start` for tool `summon` with exactly
   `{"query":"review a Rust PR for unsafe blocks"}`;
3. `tool_execution_end` with `isError: false`;
4. a materialized whole-skill path under a disposable
   `skill-summon-session-*` temp root;
5. the engine's card as the tool's exact visible text, then the same card in
   the assistant response.

Observed invocation after the adapter confined its payload cache to the
session root:

```text
[Summoned] Plan CEO Review
  ID: garrytan/plan-ceo-review
  Trust: Level 3★ · Trust Magnitude 67.4 · Overall Trust Grade B
  Ranking: trust then relevance — level, trustMagnitude
  Install: 8.446s · cold/remote · 5 files
  Path: /var/folders/.../T/skill-summon-session-2fqFHd/skills/garrytan__plan-ceo-review
  Inspect: https://github.com/garrytan/gstack/blob/main/plan-ceo-review/SKILL.md
```

The selected skill's relevance is engine behavior and was not changed in this
packaging task.

## Lifecycle and safety

The adapter starts no process and creates no temp directory during extension
factory/load. On the first tool call it creates one disposable
`skill-summon-session-*` root, places `PLUGIN_DATA` and the bounded payload
cache inside it, starts the portable stdio server, and pins
`SKILL_SUMMON_SESSION` to that root. It overrides ambient cache/session values
rather than adopting shared state.

The lifecycle probe confirmed the session root and its `plugin-data/` child
existed while Pi was running, then sent Pi `SIGTERM`; after graceful
`session_shutdown`, the MCP child had exited and the whole root no longer
existed. Failed startup also routes through the same awaited cleanup. The MCP
bundle remains the only summon implementation.

---

# Re-probe on Pi 1.0.4 (PR #187, 2026-10-08)

**Harness:** `pi` 1.0.4 · macOS 26.4.1 arm64 · Node 22 · model `openai-codex/gpt-5.6-luna:low`.
Cells ran in a visible Herdr pane over `--mode rpc`, and every record was logged. Install cells used
a throwaway `HOME` and `PI_CODING_AGENT_DIR` (auth copied in for the run, then deleted), so the
user's Pi settings were never written.

## The stale premise

The finding above ("deliberately ships without MCP") is **no longer true**. Pi 0.99.0 added
built-in MCP: `mcp.json` (user or trusted project), `pi mcp add|list|…`, and
`pi.registerMcpServer(name, config)` for extensions. Pi still has no Agent Plugins loader. A package
manifest can declare `extensions`, `skills`, `prompts` and `themes`, but not MCP servers, and the
five `commands/*.md` use Claude-only `!` shell expansion, so Pi still needs the five command aliases.

## Is the adapter still correct? Yes. Is a simpler route available? Not an equivalent one.

| Cell | Route | Hard signal | Result |
|---|---|---|---|
| P1 | `pi install ./plugins/skill-heaven` (isolated), RPC `get_commands --offline` | `summon`, `skill-zero`, `skill-heaven`, `skill-hell`, `skill-ultra` with `source: extension` at the adapter path, plus `skill:*` at the plugin's own `skills/` | pass |
| P3/P7 | same, live: `/summon frontend code review` + four surfaces | `tool_execution_start/end` for `summon` `isError: false`; the model `read` the materialized `skill-summon-session-*/…/SKILL.md`; each surface's user message is that surface's `<skill … location=".../plugins/skill-heaven/skills/<surface>/SKILL.md">` | pass |
| P4 | prototype adapter: `pi.registerMcpServer("skill-summon", { …mcp.json, exposure: "direct" })`, built-in MCP, clean HOME | tool `mcp__skill_summon__summon` declared directly; call returned the JSON text; body read | pass |
| P5 | the same prototype under this machine's real Pi config (`"extensions": ["-builtin:mcp"]` + `npm:pi-mcp-adapter` 5.1.0), loaded with `-e` only | `exposure: "direct"` **not honoured**: the model called the `mcp` proxy, got `configured but not connected`, connected, then called `skill-summon_summon` through the proxy | degraded |
| P5′ | current adapter, same real config | one native `summon` call | pass |

**Decision:** keep the adapter. Pi's own MCP route depends on which MCP runtime the user runs. Pi's
docs name `pi-mcp-adapter` as a replacement that takes over `mcp.json` and registrations, and
`--no-mcp` or `-builtin:mcp` without a replacement removes the tool entirely. The adapter's summon
tool works the same under all of them. Only the stale "no MCP" wording changed. Every other line of
the adapter stands.

## Defect the re-probe found (fixed)

`/skill-zero` reached the model as the literal text `/skill:skill-zero`, and Pi's command list had no
`skill:skill-zero`. Pi 1.0.4 parses frontmatter as strict YAML and silently skipped the skill,
whose description `Report the zero cut: temporary …` is not a valid plain scalar. Claude's lenient
reader had loaded it. Fixed in `skills/skill-zero/SKILL.md`, with a regression test holding every
surface's skill and command frontmatter to strict plain scalars. Re-run P7: all five surfaces pass.

## Environment note (not a product defect)

On this machine, `~/.agents/skills/{summon,skill-*}` are user-made symlinks into an older Claude
marketplace clone. Pi discovers `~/.agents/skills` and they won the `skill:*` names over the
plugin's own skills (cell P2, discarded). Every load-bearing cell above ran with a clean HOME.

## Status API

`ctx.ui.setStatus(key, text)` appends one entry per extension key. A probe extension that folded
the summon tool's `details` through the committed status bundle (`eventFromSummonResult` →
`reduceStatus` → `renderStatusSegments` → `toPlain`) emitted RPC `extension_ui_request
setStatus` records: `◇ entropy ‹‹ [NATIVE] ›› · 0 skills / 0 summons`, then `… · 1 skill / 1 summon
· +Frontend Code Review`. Pi can carry the canonical line without a second source of truth. It
is **not wired** into the plugin yet: that needs the status bundle shipped inside the portable
package.
