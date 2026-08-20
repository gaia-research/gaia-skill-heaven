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
