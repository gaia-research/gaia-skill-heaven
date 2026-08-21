# Skill Heaven — one portable Agent Plugin

**Status: the shape of record for the plugin.** The portable core targets the
[Agent Plugins 1.0.0 specification](https://agent-plugins.org/specification):
root `plugin.json`, root `mcp.json`, and shallow `skills/*/SKILL.md`. It is
implementation guidance, not a ratification — decision authority stays with
`gaia-research/founder/RATIFICATION.md` (see **Authority** below).

## Outcome

A user installs **one** plugin — `skill-heaven` — and gets the summon MCP plus
all five surfaces. No sibling repository, no `npx`, no external binary, no
build step. `gaia-mcp` is deprecated. Portable clients discover the same skills
and MCP declaration; client-only delivery shims stay namespaced or in legacy
compatibility locations.

Before: the marketplace shipped `claude-zero` with two commands, and
`/skill-hell` summoned by shelling out to a `skill-hell` binary hunted for at
runtime in a sibling `gaia-mcp` checkout. A user without that checkout got a
four-line "Fix one of:" error. Three rung tables disagreed with each other, and
`ultra` was refused as `⛔ UNRATIFIED` in four places while `docs/LADDER-FLOW.md`
(N13) said nothing on the line refuses.

## Package shape

```
plugins/skill-heaven/                    THE AGENT PLUGIN
├── plugin.json                          Agent Plugins 1.0.0 manifest
├── mcp.json                             skill-summon → node ${PLUGIN_ROOT}/mcp/skill-summon.mjs
├── skills/
│   ├── summon/SKILL.md
│   ├── skill-zero/SKILL.md
│   ├── skill-heaven/SKILL.md
│   ├── skill-hell/SKILL.md
│   └── skill-ultra/SKILL.md
├── mcp/skill-summon.mjs                 committed esbuild bundle (generated, CI-gated)
├── dev.skill-heaven.pi/                 Pi compatibility adapter + pinned probe
├── package.json                         Pi package delivery metadata
├── .codex-plugin/plugin.json            Codex delivery metadata
├── .codex.mcp.json                      Codex plugin-root MCP launch shim
├── .claude-plugin/plugin.json           retained Claude marketplace compatibility
├── .mcp.json                            retained Claude/Grok MCP compatibility
├── commands/*.md                        retained explicit command compatibility
├── scripts/render-ladder.mjs            one renderer, zero-dependency, bare Node
└── data/ladder.json                     generated from packages/core
```

The core manifest is closed: `displayName` and `userConfig` do not appear at its
top level. Client-owned files remain beside the portable core only where a
pinned client still requires its pre-standard delivery shape. They are thin
compatibility files, not alternate engines or portable manifests. The results
and hard signals are recorded in
[`plugins/skill-heaven/PROBE.md`](../plugins/skill-heaven/PROBE.md).

`packages/claude-zero` keeps its launcher, statusline and `claude-zero` bin. It
is not the plugin.

## One line, five entry points, one tool

The rung is a **standing instruction in context**. It names a *direction*, not a
number: the agent decides how far to reach on a given gap. No second MCP tool is
needed.

| Command | Sets rung | Direction | Note |
|---|---|---|---|
| `/skill-zero [all]` | `zero` | **temporary skills cut** | `/summon` by hand still works. `all` cuts that too. |
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
| `zero` | zero | temporary skills cut — manual `/summon` only |
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

### `zero` cuts temporary skills

`/skill-zero` sets the rung to `zero`, which cuts temporary automatic skills.

> **Naming note.** The bottom rung, its band and its surface are all spelled
> `zero`. The launcher's boot dial follows: `claude-zero --level zero`. The
> earlier `off` spelling is retired — one word for one thing.
Manual `/summon` still works — that is the product floor per N13 ("ships
`/summon` by default, with none of the choosing automated").
`/skill-zero all` additionally cuts manual `/summon`; the plugin's `zero_cuts`
userConfig (`temporary` | `all`, default `temporary`) sets the default.

**Honest limit:** the cut is a standing instruction the agent honours, not
something the tool enforces. Hard enforcement needs server-side session state —
filed as a follow-up, not faked.

`claude-zero --level zero` remains the boot-time all-skills-off launcher, and
is the only thing that gives a genuinely clean start: already-loaded skills
**cannot be evicted mid-session** (D12, probed).

## M0 probe — does `${user_config.*}` reach a command's `!` bash block?

**Status: not verified.** The four-cell live harness campaign in
`plugins/skill-heaven/PROBE.md` proved install, commands, and summon, but did not
change `zero_cuts` through Claude's config UI. Earlier work recorded only the
official-doc evidence below. This remains unknown per D8 rather than being
inferred from the successful default-path probes.

**Question:** does `${user_config.zero_cuts}` text-substitution, or a
`CLAUDE_PLUGIN_OPTION_ZERO_CUTS` environment variable, actually reach the
`!`-prefixed bash line inside `commands/skill-zero.md` (and the other rung
commands) — the mechanism `zeroCuts()` in `render-ladder.mjs` would need to
read the plugin's configured `zero_cuts` option at all?

**Documented, directly (plugins-reference, "User configuration"):**
- *"Each value is available for substitution as `${user_config.KEY}` in MCP
  and LSP server configs and hook commands. **Non-sensitive values can also
  be substituted in skill and agent content.**"* Command files under
  `commands/` are skill content per the docs merge ("Custom commands have
  been merged into skills... work[s] the same way"), so this is the closest
  direct statement that `${user_config.zero_cuts}`, written literally inside
  a command's `!` line, would interpolate before the line runs.
- The rejected-fields table for `${user_config.*}` (shell-form hook
  commands, monitor commands, MCP `headersHelper` — each rejected because
  "substituting a configured value into a shell command would let the shell
  run whatever that value contains") does **not** list skill/command
  content. It is not documented as rejected there.
- Separately: *"All values are exported to hook processes as
  `CLAUDE_PLUGIN_OPTION_<KEY>` environment variables."* This is scoped
  explicitly to **hook processes** — a different execution path from a
  command's `!` block, which runs through the session's Bash tool. Neither
  doc page says `CLAUDE_PLUGIN_OPTION_<KEY>` is exported into *that*
  subprocess's environment automatically.

**Inferred by analogy, not spelled out for `user_config` specifically:** the
three path variables (`CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`,
`CLAUDE_PROJECT_DIR`) get an explicit table in the same doc: for "Skill and
agent content" they resolve "Anywhere the placeholder appears" — and our own
`commands/summon.md` already relies on exactly that
(`` !`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" ...` ``), proven
by `verify-marketplace-install.mjs` to resolve inside a `!` block on a real
install. The `user_config` section reuses the words "substituted" and "skill
and agent content" but does not repeat "anywhere the placeholder appears"
verbatim for `user_config`, and the skills reference's own canonical
"Available string substitutions" table — the definitive list for
`$ARGUMENTS`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_PLUGIN_ROOT}`, etc. — does
**not** list `${user_config.*}` at all. That is an inconsistency between two
doc pages, not a confirmed answer either way.

**Net assessment.** Two distinct mechanisms are in play and the evidence
points different directions for each:

1. Writing `${user_config.zero_cuts}` literally into a command's `!` line
   (e.g. `CLAUDE_PLUGIN_OPTION_ZERO_CUTS='${user_config.zero_cuts}' node ...`)
   — plausible per the substitution-surface statement above, but **not
   implemented in this PR**: none of `plugins/skill-heaven/commands/*.md`
   do this today. Wiring it up is future work, not this probe's question.
2. Relying on `CLAUDE_PLUGIN_OPTION_ZERO_CUTS` simply appearing in
   `process.env` inside `render-ladder.mjs` without the command file doing
   anything — documented **only** for hook processes, so this is the weaker
   of the two paths and likely does not hold for a `!`-block subprocess.

**This degrades safely either way.** `zeroCuts()` in
`plugins/skill-heaven/scripts/render-ladder.mjs` reads
`CLAUDE_PLUGIN_OPTION_ZERO_CUTS ?? SKILL_HEAVEN_ZERO_CUTS`, and treats
anything other than `"all"` as `"temporary"`. If this probe resolves
negative, the floor still ships exactly what N13 specifies by default (cut
temporary automatic skills, keep manual `/summon`) — nothing breaks; the plugin's
`zero_cuts` userConfig option just stays inert until a follow-up wires the
substitution into the command files' `!` lines explicitly and a live pane
confirms it lands.

**What would close this out:** in a real `claude` session with the plugin
installed and `zero_cuts` set to `all` via the plugin's config UI, run
`/skill-zero` and check whether the rendered output
shows the `all`-cut copy — and separately, whether `${user_config.zero_cuts}`
written directly into a test command's `!` line comes through as literal
text or as the configured value. Neither was run here.

## What the MCP exposes

One server, `skill-summon`, one tool:

- **`summon`** — input `{ query: string, limit?: positive integer, surface?: "any" | "heaven" | "hell" }`. **There is
  no upper cap** — nothing assigns a ceiling, so the engine must not invent one.
  A malformed `limit` (zero, negative, fractional) is **refused, never clamped**;
  clamping would answer a question nobody asked. Materialises the whole skill directory
  (`SKILL.md` plus `reference/`, `scripts/`, fixtures) into a session-locked
  temp dir and returns a printable card per skill, plus source invocation and
  ranking disclosures. `heaven` excludes model-led-only fleet skills; `hell`
  excludes human-led-only fleet skills and is the safe omitted default; explicit
  manual `/summon` passes `any`.

`gaia_search`, `gaia_inspect` and `gaia_status` are **not ported**. Whether
dropping them degrades summon quality is a benchmark question, filed upstream.

### Auto-summon protocol

Presented as routing guidance for `/skill-heaven`, `/skill-hell` and
`/skill-ultra`:

> On a real capability gap — never preemptively — call the `summon` tool with
> `surface: "heaven"` while converging or `surface: "hell"` while exploring,
> and a depth you judge the gap needs. Show the returned card before using the
> skill, read the `SKILL.md` at the card's path, and apply relevant guidance to
> the current task. The card is the listing entry, not the skill body.

The card is the disclosure: it names the skill being summoned and carries the
ranking disclosure with it.

## Naming

Full rebrand. Server `skill-summon`, env `SKILL_SUMMON_SESSION`,
`SKILL_SUMMON_TTL_HOURS`, `SKILL_SUMMON_CACHE_DIR`, `SKILL_SUMMON_CACHE_MAX_MB`;
session dirs `/tmp/skill-summon-*`; payload cache
`skill-summon-payload-cache-v1`; source env `SKILL_SOURCE`. The old paired
`TREE_URL` / `TREE_NAMED_URL` variables remain a deprecated migration fallback.

## Packaging

The MCP ships as a **committed esbuild bundle** at
`plugins/skill-heaven/mcp/skill-summon.mjs`. Portable clients load it from root
`mcp.json` through `${PLUGIN_ROOT}`; the retained Claude compatibility file uses
`.mcp.json` and `${CLAUDE_PLUGIN_ROOT}`. Zero install step, offline-safe, and
the repo keeps **zero runtime dependencies** — the bundle has none by
construction. CI rebuilds the bundle and fails on `git diff --exit-code`.

## One Skill URL

The engine defaults to `SKILL_SOURCE=https://gaiaskilltree.com`. Claude exposes
that value as the `skill_url` user setting titled **Skill URL**.

A website root is a tree source. The adapter derives:

```
<root>/graph/gaia.json
<root>/graph/named/index.json
```

A `https://github.com/<owner>/<repo>` source is a flat fleet. The adapter scans
bounded conventional directories for `SKILL.md`, parses `name`, `description`,
and Matt Pocock's `disable-model-invocation` convention, then synthesizes
commit-pinned candidates. Flat fleets need no generic reference or tree trust
ordering; the agent query routes them by relevance.

`disable-model-invocation: true` means human-led Skill Heaven and explicit
invocation only. Absence means model-led Skill Hell and automatic invocation is
allowed. Each summon remains an atomic, session-only materialization.

## Install and client delivery

Agent Plugins standardizes the package, not one universal client-registration
command. `install-agent-plugin.sh` therefore installs one stable package and a
local marketplace without mutating any harness configuration:

```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh
```

The script requires Node 22+ and Git, then prints both paths. Any
standards-conformant Agent Plugins client can load the plugin directory, though
clients outside the pinned probe remain unverified. Pinned clients with their own package
manager use the commands in the README compatibility table; this is delivery
over one installed artifact, not five repackaged plugins. Clients may cache a
copy, so updating or deleting the local artifact does not update or unregister
client-managed copies.

Claude Code 2.1.237 still accepts the public marketplace flow:

```text
/plugin marketplace add gaia-research/gaia-skill-heaven
/plugin install skill-heaven@gaia-skill-heaven
```

Pi 0.84.2 remains a namespaced adapter because it is not a native Agent Plugins
client and deliberately has no built-in MCP runtime. The adapter maps portable
skills and `mcp.json` into Pi's extension API; see its
[`PROBE.md`](../plugins/skill-heaven/dev.skill-heaven.pi/PROBE.md).
`install.sh` remains separate and installs the standalone `*-zero` launchers.

`gaia-mcp` remains deprecated. Existing
`claude-zero@gaia-skill-heaven` marketplace installs migrate through the
`renames` entry in `marketplace.json` (Claude Code ≥ 2.1.193).

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
- **Every possible client's install UX.** The package is portable, but the
  Agent Plugins specification leaves install and enable flows to clients. The
  pinned Codex, Hermes, Grok, Claude and Pi paths are probed; other conformant
  clients may load the same installed directory through their own UI or command,
  but are not claimed as verified.

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
