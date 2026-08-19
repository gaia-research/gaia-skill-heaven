# Skill Heaven — one Agent Plugin

**Status: the shape of record for the plugin.** This document settles what
ships as *one* Claude Code plugin, so nothing downstream re-litigates it. It is
implementation guidance, not a ratification — decision authority stays with
`gaia-research/founder/RATIFICATION.md` (see **Authority** below).

## Outcome

A user installs **one** plugin — `skill-heaven` — and gets the summon MCP plus
all five surfaces. No sibling repository, no `npx`, no external binary, no
build step. `gaia-mcp` is deprecated.

Before: the marketplace shipped `claude-zero` with two commands, and
`/skill-hell` summoned by shelling out to a `skill-hell` binary hunted for at
runtime in a sibling `gaia-mcp` checkout. A user without that checkout got a
four-line "Fix one of:" error. Three rung tables disagreed with each other, and
`ultra` was refused as `⛔ UNRATIFIED` in four places while `docs/LADDER-FLOW.md`
(N13) said nothing on the line refuses.

## Target shape

```
skill-heaven/
├── .claude-plugin/marketplace.json      entry: skill-heaven → ./plugins/skill-heaven
├── plugins/skill-heaven/                THE PLUGIN
│   ├── .claude-plugin/plugin.json       name: skill-heaven · userConfig: tree_url, tree_named_url, zero_cuts
│   ├── .mcp.json                        skill-summon → node ${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs
│   ├── mcp/skill-summon.mjs             committed esbuild bundle (generated, CI-gated)
│   ├── commands/{summon,skill-heaven,skill-hell,skill-zero,skill-ultra}.md
│   ├── scripts/render-ladder.mjs        one renderer, zero-dependency, bare Node
│   └── data/ladder.json                 generated from packages/core
├── packages/skill-summon/               the ported engine (npm: skill-summon, one bin)
└── packages/claude-zero/                unchanged npm door/launcher — no longer the plugin
```

`packages/claude-zero` keeps its launcher, statusline and `claude-zero` bin. It
simply stops being the thing the marketplace points at.

## One line, five entry points, one tool

The rung is a **standing instruction in context**. It names a *direction*, not a
number: the agent decides how far to reach on a given gap. No second MCP tool is
needed.

| Command | Sets rung | Direction | Note |
|---|---|---|---|
| `/skill-zero [all]` | `zero` | **nothing automatic** | `/summon` by hand still works. `all` cuts that too. |
| `/skill-heaven [low\|med]` | `low` (default) | converge | narrowly, on the gap in front of you |
| `/skill-hell [high\|xhigh\|max]` | `high` (default) | explore | widely, around the gap |
| `/skill-ultra` | `ultra` | picks direction + depth per gap | crown rung, no sub-ladder |
| `/summon <intent>` | — | manual, one call | present at every rung including `zero` |

All four rung commands render **the same seven-rung line**, differing only in
the rung they open on and which band is highlighted. Every rendering carries the
`WIP · PROVISIONAL` mark.

### The rungs — no counts, no caps

`RUNG_BANDS` and `BAND_INFO` live in `packages/core/src/compile.ts` and are the
only place the line is written down:

| Rung | Band | What it means |
|---|---|---|
| `zero` | zero | nothing automatic — manual `/summon` only |
| `low` | heaven | converge — the band opens here |
| `med` | heaven | converge — further along the band |
| `high` | hell | explore — the band opens here |
| `xhigh` | hell | explore — further along the band |
| `max` | hell | explore — further along the band |
| `ultra` | ultra | the crown rung — picks direction and depth per gap |

**No rung carries a count, and no summon is capped.** A rung names a *direction*
and a position along the band; how far to reach on a given gap is the agent's
call. What `low` or `high` should actually reach for is being worked out in use —
by the agent using the product — while the benchmark is built. So there is no
number to keep in sync, and nothing to disagree about. Three tables used to
disagree (plugin code said `high 1 · xhigh 3 · max 5`); the disagreement is
resolved by there being no numbers.

`packages/claude-zero/scripts/generate-ladder.ts` emits the line into the
plugin's `data/ladder.json`. The site is a separate surface and is **out of
scope** for this work.

### `zero` cuts *automatic* summoning

`/skill-zero` sets the rung to `zero`, which cuts **automatic** summoning.

> **Naming note.** The bottom rung, its band and its surface are all spelled
> `zero`. The launcher's boot dial follows: `claude-zero --level zero`. The
> earlier `off` spelling is retired — one word for one thing.
Manual `/summon` still works — that is the product floor per N13 ("ships
`/summon` by default, with none of the choosing automated").
`/skill-zero all` additionally cuts manual `/summon`; the plugin's `zero_cuts`
userConfig (`automatic` | `all`, default `automatic`) sets the default.

**Honest limit:** the cut is a standing instruction the agent honours, not
something the tool enforces. Hard enforcement needs server-side session state —
filed as a follow-up, not faked.

`claude-zero --level zero` remains the boot-time all-skills-off launcher, and
is the only thing that gives a genuinely clean start: already-loaded skills
**cannot be evicted mid-session** (D12, probed).

## What the MCP exposes

One server, `skill-summon`, one tool:

- **`summon`** — input `{ query: string, limit?: positive integer }`. **There is
  no upper cap** — nothing assigns a ceiling, so the engine must not invent one.
  A malformed `limit` (zero, negative, fractional) is **refused, never clamped**;
  clamping would answer a question nobody asked. Materialises the whole skill directory
  (`SKILL.md` plus `reference/`, `scripts/`, fixtures) into a session-locked
  temp dir and returns a printable card per skill, plus the honest ranking
  disclosure.

`gaia_search`, `gaia_inspect` and `gaia_status` are **not ported**. Whether
dropping them degrades summon quality is a benchmark question, filed upstream.

### Auto-summon protocol

Written verbatim into the armed output of `/skill-heaven`, `/skill-hell` and
`/skill-ultra`:

> On a real capability gap — never preemptively — call the `summon` tool, with a
> depth you judge the gap needs while converging/exploring. Print the returned
> card **verbatim** before using anything from it, read the `SKILL.md` at the
> card's path, and follow it. The card is the listing entry, not the skill body.
> The lane stays armed.

The card is the disclosure: it names the skill being summoned and carries the
ranking disclosure with it.

## Naming

Full rebrand. Server `skill-summon`, env `SKILL_SUMMON_SESSION`,
`SKILL_SUMMON_TTL_HOURS`, `SKILL_SUMMON_CACHE_DIR`, `SKILL_SUMMON_CACHE_MAX_MB`;
session dirs `/tmp/skill-summon-*`; payload cache
`skill-summon-payload-cache-v1`. `TREE_URL` / `TREE_NAMED_URL` keep their names.

## Packaging

The MCP ships as a **committed esbuild bundle** at
`plugins/skill-heaven/mcp/skill-summon.mjs`, run by `.mcp.json` through
`${CLAUDE_PLUGIN_ROOT}`. Zero install step, offline-safe, and the repo keeps
**zero runtime dependencies** — the bundle has none by construction. CI rebuilds
the bundle and fails on `git diff --exit-code`.

## The tree

Defaults, both exposed as plugin `userConfig` so pointing at another projection
is a config change, not a code change:

```
TREE_URL       https://gaiaskilltree.com/graph/gaia.json          (278 generic skills)
TREE_NAMED_URL https://gaiaskilltree.com/graph/named/index.json   (267 named skills)
```

> **Correction to an earlier brief.** "Gaia Skill Tree Arbor I" does not exist
> in code — it is a founder-doc concept (`gaia-skill-tree/founder/ENDGAME -
> SCHEMA.md`, `schema: gaia.arbor-edge/v1`). The two URLs above are what the
> engine actually reads today.

## Install — the final decision

This settles issues #47 and #53 against each other.

1. **Primary install is the plugin**, two lines, copy-pasteable, no terminal —
   which is also the mobile answer #47 asked for:
   ```
   /plugin marketplace add gaia-research/gaia-skill-heaven
   /plugin install skill-heaven@gaia-skill-heaven
   ```
2. **`install.sh` is optional** — the standalone launcher install (the five
   `*-zero` doors). Not required for, and not part of, the plugin.
3. **`npx` is not an install path.** This settles #47's npx bullets against #53.
4. **`skill-heaven.dev` is deferred.** The site uses the URL that actually
   serves today: `gaia-research.github.io/gaia-skill-heaven/install.sh`.
5. **`gaia-mcp` is deprecated** — kept installable so copies of `install.sh` in
   the wild keep working, with a README banner pointing here.

Existing `claude-zero@gaia-skill-heaven` installs migrate automatically via a
`renames` entry in `marketplace.json` (needs Claude Code ≥ 2.1.193).

## Not built

Stated here so no surface implies otherwise:

- **Heaven/Hell stamps.** Routing falls back to relevance ranking, and no
  surface may present stamp-gated routing as running.
- **The entropy benchmark.** What each rung should reach for is being worked
  out in use until it lands.
- **Hard enforcement of the `zero` cut.** It is a standing instruction, not a
  server-side gate.
- **Ultra controller heuristics.** At `ultra` the agent picks direction and
  depth unaided.
- **Relevance-band filtering.** The engine takes a depth, not a score band.
- **The five surfaces on the non-Claude doors.** Claude Code first.

## Authority

Every surface in this repo cites **N13** (`docs/LADDER-FLOW.md`) for "nothing on
the line refuses — Hell and Ultra are ratified; what is outstanding is
implementation, not permission."

⚠️ **The local `gaia-research` checkout's `founder/RATIFICATION.md` carries no
N11, N12 or N13, and still carries `P2 | INVARIANT — Hell and ultra are
gated`.** Either that clone needs a fetch, or the ratification delta must land
upstream. This is flagged, not papered over: the implementation here follows
N13 as recorded in `docs/LADDER-FLOW.md`, and the owner needs to reconcile the
two (D9).
