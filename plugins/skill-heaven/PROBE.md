# PROBE — Agent Plugin compatibility beyond Pi

**Date:** 2026-08-20  
**Branch:** `feat/ws5-agent-plugin-harness-install`, stacked on PR #78  

> Historical evidence: this predates the one `skill_url` / `SKILL_SOURCE` configuration, so references to the old paired settings document what the pinned clients did during that probe, not the current interface.

**Owner-requested visible-pane protocol:** although repository Rule 0 is lifted,
every harness invocation ran in the right-hand Herdr pane `wQ:p2`. The completed
pane was moved to an archive tab after verification.
Configuration writes were isolated under `.tmp/probes`; no real harness home was
modified. A final delivery cell ran `install-agent-plugin.sh` against a local
source archive, then used the README's exact installed marketplace/plugin paths
with Codex, Grok, and Hermes; all three inventories reported `skill-heaven`.

The query used for the live MCP cell was:

```text
/summon frontend accessibility audit
```

The three requested standing-lane cells were:

```text
/skill-heaven low
/skill-hell high
/skill-ultra
```

## Results

| Client | Pinned version | Install hard signal | Four command probes | MCP hard signal |
|---|---:|---|---|---|
| Codex | 0.146.0 | `codex plugin add` installed and enabled `skill-heaven@gaia-skill-heaven`; `codex mcp list --json` resolved `cwd` to the installed plugin cache | all four recognized; each lane read its portable `SKILL.md` and armed the requested rung | `mcp_tool_call` for `skill-summon/summon` completed and returned the verbatim Impeccable card |
| Grok | 1.0.5 (`5115b46bc909`) | `grok plugin validate` passed; local install inventory named `skill-heaven` and reported skills plus MCP | all four recognized; the lane commands rendered and armed low, high, and ultra | summon returned the verbatim Impeccable card; the later audit exhausted the account's usage limit, after the MCP success signal |
| Hermes | 0.20.0 (2026.8.3) | a package with `plugin.json` at Git root installed disabled, then `hermes plugins enable skill-heaven` reported enabled | all four recognized; Hermes described `skill_summon` as available from the installed Agent Plugin | summon loaded Impeccable and followed its audit workflow |
| Claude Code | 2.1.237 | isolated `marketplace add`, `plugin install`, `plugin list --json`, and `plugin details` all exited 0 | all four recognized through marketplace compatibility | session JSONL attributed the call to `plugin:skill-heaven:skill-summon`, printed the verbatim Impeccable card, then read its materialized `SKILL.md` |

Pi 0.84.2 was already pinned and probed in
[`dev.skill-heaven.pi/PROBE.md`](dev.skill-heaven.pi/PROBE.md); it was not
repeated in this follow-up. `/skill-zero` was outside the owner's requested
four-cell probe, but a closeout cell invoked it successfully on Codex and Hermes
and `grok inspect --json` resolved its installed `SKILL.md`. Claude's closeout
cell hit the account session limit; its earlier `plugin details` inventory had
already discovered both retained `skill-zero` entries.

## Findings that changed the package

### Codex needs its own delivery metadata

With only the Claude compatibility files present, Codex installed the plugin
but selected `.mcp.json`, leaving `${CLAUDE_PLUGIN_ROOT}` unresolved. The lane
skills worked, but `/summon` had no tool. A root-only portable copy also exposed
no MCP through Codex's plugin manager.

The fix is a thin `.codex-plugin/plugin.json` plus `.codex.mcp.json`. The latter
uses a plugin-relative argument and `cwd: "."`; Codex resolves that cwd to the
installed plugin cache. This is a client delivery shim over the same
`mcp/skill-summon.mjs`, not another engine.

### Grok preserves unknown Claude user-config placeholders

Grok loaded the Claude-compatible command and MCP path, but passed
`${user_config.tree_url}` to the server literally. The tool connected, then the
first fetch failed because that string is not a URL. The MCP entry remains
Claude-compatible; the server now treats an entirely unexpanded `${...}` value
as absent and falls back to the same public URL it already uses when the env var
is missing. Real configured URLs still win.

### Claude marketplace still works, with one visible duplication

The public marketplace flow is still valid on 2.1.237. Claude discovers both
portable `skills/*/SKILL.md` and retained `commands/*.md`, so `plugin details`
reports ten skill/command entries for five names. Invocation resolves to the
plugin-qualified command and all four probes work, but the doubled inventory is
a real compatibility wart and is recorded here rather than hidden.

**Closed on Claude Code 2.1.272 (2026-09-15).** The wart was user-visible: typing
`/` in a claude-zero session listed `/skill-heaven:summon` twice (the command's
"Summon one skill into context…" and the portable skill's "Explicitly summon
the best-matching skill…"), and portable twins such as `skill-ultra` ranked above
exact matches like `/model`. Every portable skill now carries
`user-invocable: false` beside `disable-model-invocation: true`.

- Hard signal (`claude -p --output-format stream-json --verbose`, init event,
  claude-zero's product-floor flags, plugin copy with `commands/` removed):
  without the key, `skills` and `slash_commands` list all five
  `skill-heaven:*` names; with it, both lists are empty. Claude drops the
  portable skill entirely, leaving `commands/*.md` as the one Claude entry.
- TUI (herdr pane): with the key, `/` shows one `/skill-heaven:summon` row.
- Negative, 3 cells: a `skills` field in `.claude-plugin/plugin.json` (`[]`
  or an empty directory) does **not** replace default `skills/` discovery.
- Portability: Codex 0.154.0 app-server `skills/list` still returns the skill
  `enabled: true` with the key, and Pi's loader reads only
  `disable-model-invocation`. Hermes was not re-probed.
- Where `/skill-heaven:summon` still sorts first on `/`, that is Claude's own
  recent-use ranking (`skillUsage` in `~/.claude.json`), not plugin inventory.

### Hermes requires the package at Git root

`hermes plugins install` accepts Git sources, and portable discovery expects
`plugin.json` at that Git root. The product repository keeps the package under
`plugins/skill-heaven`, so the universal installer prepares the installed
plugin directory as a tiny local Git repository. Hermes can install that exact
artifact through its normal command without a second package layout.

## Installation conclusion

Agent Plugins 1.0.0 standardizes the directory contract, **not** a universal
client-registration command. `install-agent-plugin.sh` therefore downloads one
stable plugin directory plus a local marketplace and prints both paths. Tested
clients register that same artifact with their own command; other conformant
clients have the directory contract but remain unverified here. The installer
does not guess at or mutate an unknown harness's configuration.

## Current-version cells (PR #187, 2026-10-08)

macOS 26.4.1 arm64. Every harness invocation ran in a visible Herdr pane. Each client used an
isolated home with its auth file copied in for the run and deleted afterwards. The plugin was the
one `install-agent-plugin.sh` built from this branch (`SKILL_HEAVEN_REF=<full sha>`; a short SHA
404s at codeload).

| Client | Version | Route | Hard signal | Result |
|---|---|---|---|---|
| Codex | 0.161.0 | `codex plugin marketplace add` + `codex plugin add skill-heaven@gaia-skill-heaven`, `codex exec --json` | `codex mcp list --json` resolves `skill-summon` (`PLUGIN_ROOT`/`PLUGIN_DATA` expanded); `mcp_tool_call` `skill-summon/summon` `status: completed`, `error: null` | pass. Headless `exec` under the default approval policy refused the MCP call (`requires approval, but approval policy is set to never`); passed with approvals bypassed in a throwaway workspace |
| Hermes | 0.20.0 (2026.8.3) | `hermes plugins install "file://…" --enable`, `hermes chat -q` (`openai-codex`/`gpt-5.6-luna`) | `agent.log`: `tool mcp__agent_plugin_skill_heaven_…_skill_summon__summon completed (1.27s)`; a new `skill-summon-session-*` root | pass. A cosmetic `Unknown toolsets: …__skill-summon` warning; `gpt-5.4` is not available to a ChatGPT-linked Codex account |
| Grok | 1.0.46 | `grok plugin install <dir> --trust`, `grok plugin details` | installed `skill-heaven v0.1.2`, components `1 skill dir, 1 command dir, MCP servers` | static only: Grok is not signed in on this machine, so no summon ran |
| Antigravity | 1.3.1 | see [`packages/agy-zero/PROBE.md`](../../packages/agy-zero/PROBE.md) §4 | `call_mcp_tool skill-heaven_skill-summon/summon DONE` | pass after the `mcp_config.json` shim |
| Pi | 1.0.4 | see [`dev.skill-heaven.pi/PROBE.md`](dev.skill-heaven.pi/PROBE.md) | native `summon` tool, five surfaces | pass after the `skill-zero` frontmatter fix |

### Claude Code 2.1.294: a bare surface is refused

In a logged-in 2.1.294 session, with both the marketplace install (0.1.1) and `--plugin-dir` of
this branch, typing a bare `/skill-zero` or `/skill-hell high` printed:

```
This skill can only be invoked by Claude, not directly by users. Ask Claude to use the "skill-zero" skill for you.
```

The bare name resolves to the portable skill, which is `user-invocable: false` (the #146 fix for
the doubled `/` menu). The qualified `/skill-heaven:skill-hell high`, the spelling the `/` menu
lists, reaches the command: the console then read `[HIGH]`. `/skill-heaven:summon …` summons. The
release receipt at 2.1.288 checked `slash_commands` but never typed a bare name, so whether
2.1.288 behaved the same is unknown. Dropping `user-invocable: false` would bring back the doubled
menu, so the fix is in what Skill Heaven tells people to type: the console's pre-fills, `/start`,
and both installers now use `/skill-heaven:<surface>` for Claude Code. Re-verify on every Claude
Code upgrade.
