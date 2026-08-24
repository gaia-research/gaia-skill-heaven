# Core and Quirks

Five doors in, the boundary is clear enough to name. This document fixes it, so that adding
harness six is *additive* — a quirks table entry and a probe, not a redesign.

**The rule:** the core owns the ladder, the postures, and the guarantees; it
consumes the in-repo summon engine (`packages/skill-summon`, bundled into the
Claude plugin — see `docs/AGENT-PLUGIN.md`). A harness owns only *how*
it is asked to suppress things. If a change to one harness touches core, that
is a signal the core abstraction is wrong, not that the harness is special.

---

## What a door actually suppresses

The early framing was "skills". That was too narrow — it is why Hermes and Grok both surprised us.

A harness loads **context sources**, and skills are one of several:

| Context source | Examples |
|---|---|
| **skills** | `.claude/skills`, pi skills, hermes bundled skills, grok plugins |
| **rule / instruction files** | `CLAUDE.md`, `AGENTS.md`, `SOUL.md`, `.cursorrules` |
| **memory** | cross-session memory stores |
| **prompt templates** | pi prompt templates |
| **tools / toolsets** | built-in tool surface |
| **plugins / extensions / MCP** | third-party capability surfaces |
| **subagents** | spawnable agent definitions |

Every rung of the ladder is a **statement about which context sources are admitted** — not about
skills alone. Marcus's `.cursorrules` observation is exactly this: cursor's quirk is an extra
*rule* surface to slice, and it slots into the matrix without changing the ladder.

---

## Core — harness-agnostic, lives in `packages/core`

### 1. The ladder

`zero · low · med · high · xhigh · max · ultra`

**Skill- and context-scoped.** It is *not* the harness's reasoning dial — `--thinking`,
`model_reasoning_effort`, `--reasoning` are model-scoped and share level names by pure
coincidence. Hold reasoning constant across arms; it is a control variable, never the thing
under test.

- `zero` → `product-floor` — the nearest zero a user can actually launch at, door still open
- `low` → `curated` — suppress everything, readmit exactly these
- `med` → `native` — the user's setup untouched; top of Heaven
- `high` → Hell's representative rung; the default the explore band opens on
- `xhigh` · `max` → broader explore rungs
- `ultra` → the crown rung: the controller that picks direction + depth per gap

A rung names a direction and a position along its band. **No rung carries a
count and no summon is capped** — how far to reach on a given gap is the
agent's call, worked out in use while the benchmark is built. What stays
**PROVISIONAL** is only the representative rung per band: Heaven's is `low`,
Hell's is `high`.

The ladder is the primary product interface on every door:

```bash
<door>-heaven                         # defaults to --level zero
<door>-heaven --level zero
<door>-heaven --level low --skill /path/to/skill
<door>-heaven --level native          # explicitly leave the user's setup untouched
<door>-heaven --help                  # ladder first; postures are compatibility vocabulary
```

Launchers own the current subtractive choices `zero|low|med`. The bundled
summon engine owns the usable additive levels: `high` is the default,
while `xhigh` and `max` broaden the requested summoning behavior. This is a
product mapping, not a fixed per-rung count, score-band, HH score, or
routing-eligibility contract. `ultra` is **ratified** (N13) and refuses
nowhere. `--posture` remains
available for benchmark and compatibility invocations, but is not the product's
lead vocabulary.

A bare launcher selects `zero`/`product-floor`. Execution support is
harness- and version-specific: consult each door's probe rather than inferring a
universal live route from the five source-built door commands. `--print` emits
the plan and its caveats; no door silently falls back to `native`.

### 2. Postures

`floor` · `product-floor` · `curated` · `native`. `floor` is the doorless benchmark
placebo-of-record and is **never product vocabulary**. The two floors are priced as separate
arms and never averaged — the gap between them *is* the door's cost.

### 3. Guarantees

- **Ladder split** — Heaven is the boot-time subtraction surface; Hell is the
  usable additive prototype, defaulting to `high`. This does not establish HH
  scoring, routing eligibility, or a fixed per-rung count contract.
- **P3** — never mutate shared state. Everything materializes into an `mkdtemp` session dir via
  `fsPlan` with a `$SESSION` placeholder, and is removed after.
- **D12** — upward-only. No mid-session recomposition into a cleaner posture.
  Claude Code 2.1.224 exposes no native mid-session skill-load command (visible
  help probe, pane `w8:p0`, 2026-08-07), so Claude's `/skill-heaven` chooser
  emits exact launch commands rather than faking an in-session transition.
- **D8 / M0** — nothing ships ahead of a probe on a pinned harness version. Negative results are
  first-class.

### 4. The compiler

`compile(input) → { command, argv, env, fsPlan, notes, doseSummary, execSupport }` — pure, zero
I/O. `exec()` materializes and spawns. `execSupport: "recipe"` (emit a plan, never spawn) is an
honest state, not a failure.

### 4b. R2 benchmark recording

`skill-zero --record` is the runtime driver for the frozen `hh-ledger/v1` arms. A run must name
both the coarse arm and its exact coordinate:

| ledger arm | accepted `--rung` | launch base |
|---|---|---|
| `placebo` | `benchmark-floor` | `floor` — doorless, and the only placebo |
| `heaven` | `zero · low · med` | `zero` is the distinct doorful product floor |
| `hell` | `high · xhigh · max` | `product-floor`; rung activation remains in-session summon behavior |
| `ultra` | `ultra` | `product-floor`; activation remains in-session summon behavior |

The ledger schema is unchanged. Its existing `notes` carries a stable `rung=...` tag, while a
separate `skill-zero/r2-run-receipt/v1` JSON receipt carries the typed rung, boot posture, floor
kind, activation kind, skill hashes, and provisioning evidence. Non-zero treatment rungs require
at least one `--skill` or `--record-skill`; the latter attributes a skill summoned by the door
without pretending it was a boot loadout.

B5 recording also refuses to execute a shared/global harness binary. Prepare a complete isolated
harness install directory, pin its exact `--version` output and deterministic tree hash, then pass
that bundle to the driver. The bundle is copied into the run's `mkdtemp` sandbox, hashed again,
and executed only from the copy:

```bash
npm run launcher -- --posture product-floor --record -p "$TASK_PROMPT" \
  --benchmark-id hh-r2 --task "$TASK_ID" --arm hell --rung high --repeat 0 \
  --record-skill /absolute/path/to/target-skill \
  --harness-bundle /absolute/path/to/clean-harness-install \
  --harness-entry bin/claude --harness-version "$PINNED_VERSION_OUTPUT" \
  --harness-sha256 "$BUNDLE_SHA256" \
  --record-out run.jsonl --receipt-out run.receipt.json
```

`hashBundle()` is exported by core so provisioning code can calculate the pin before a trial.
It hashes sorted relative paths, bytes, and safe internal symlink targets; rejects any symlink
that escapes the bundle; and fails closed on content or version drift. Output files are explicit benchmark artifacts; harness config, auth sources, and
skill sources are read-only, and all provisioning writes stay under the disposable session.
Every emitted ledger line still has to pass gaia-research's frozen `ledger.ts validate` gate.

### 5. The summon engine (`packages/skill-summon`)

The summon engine is an **in-repo TypeScript port**, not an independent
package — `packages/skill-summon`, ported from the external `@gaia-research/mcp`
prototype and shipped as a committed MCP bundle inside the Claude plugin
(`plugins/skill-heaven/mcp/`, wired through `.mcp.json`; see
`docs/AGENT-PLUGIN.md` for the packaging contract). Its surface is **one
tool**: `summon` (`{ query: string, limit?: positive integer }`). There is no
upper cap — nothing assigns a ceiling, so the engine must not invent one; a
malformed `limit` is refused, never clamped.

Its `summon` flow is: search → untuned candidate ordering → clone/validate →
materialize the whole skill directory → session lock → GC → payload cache. It
produces a directory on disk; what a harness can do with that directory is a
quirk and needs its own evidence.

One `SKILL_SOURCE` URL selects the source. A website root derives the tree's
generic and named projections; a GitHub repository becomes a flat `SKILL.md`
fleet. The paired `TREE_URL` and `TREE_NAMED_URL` variables are deprecated
migration compatibility.

The external prototype's rich Registry/Bond surface — `gaia_search`,
`gaia_inspect`, and `gaia_status` — is **not ported**. Whether dropping them
degrades summon quality is a benchmark question, filed upstream. The external
`@gaia-research/mcp` package itself is **deprecated**: this repo's installer
and plugin no longer reference it, and it is kept installable on npm only so
that copies of `install.sh` predating this change keep working.

The engine does **not** ship Hell/Heaven scoring, routing eligibility, or
content-hash admission or verification. Its displayed per-invocation ordering
must not be presented as any of those systems.

**Rule of thumb for anything new on this surface: name the capability, never the tree.**

### 6. Measurement

`gaia-research/skill-cost` is the canonical cost basis — persisted harness session logs priced
against LiteLLM, never self-report. Install timing carries cold-vs-warm always.

### 7. The door package shape

`package.json` · `bin/*.mjs` · `src/launcher.ts` · `src/cli.ts` · `PROBE.md`. Identical
everywhere. Copy the nearest door by *mechanism class*, not alphabetically.

---

## Quirks — per harness, additive

Adding a harness means filling one row and writing one `PROBE.md`. Nothing in core moves.

| | claude | pi | codex | hermes | grok |
|---|---|---|---|---|---|
| **mechanism class** | allowlist | native evict/readmit | config-home | on-disk + toolset | config-home + foreign dirs |
| **skills lever** | `--setting-sources ''` | `--no-skills` / `--skill <path>` | `CODEX_HOME` + `skills.config` | `--toolsets` omitting `skills` | `GROK_HOME` |
| **config home** | — | — | `CODEX_HOME` | `HERMES_HOME` | `GROK_HOME` |
| **auth copy needed** | no | no | **yes** | yes | likely |
| **rule files** | `CLAUDE.md` | `--no-context-files` | `--ignore-rules` | `--ignore-rules` (AGENTS/SOUL/.cursorrules) | tbd |
| **mid-session skill load** | **no** (2.1.224 help probe, `w8:p0`) | **yes** | tbd | tbd | tbd |
| **reads other harnesses' dirs** | no | no | no | no | **yes — reads `.claude`** |
| **probe instrument** | listing probe | `--mode json` totalTokens | `tokens used` line | snapshot file / canary | **`grok inspect`** |
| **door cost** | +515 tok | ~1,762 tok | unmeasured | unmeasured | unmeasured |

Two entries in that table are load-bearing product facts, not trivia:

- **pi can load a summoned skill mid-session; Claude cannot.** On pi,
  `resources_discover` + reload makes it a native skill. On Claude, the card is
  the listing entry and points the agent at the whole materialized directory.
  Card-only probes succeeded on both harnesses (Claude pane `w8:p13`, pi pane
  `w8:p14`, 2026-08-07): each read a sibling reference and returned
  `CARD_ONLY_OK:7319` without a pasted body.
- **Grok reads Claude's skill directories.** A harness's context is not necessarily its own.
  Never assume the sources are self-contained; enumerate them.

### Adding harness six

1. Identify the mechanism class (see `harness-door-pattern` skill — four classes, that is the
   whole taxonomy).
2. Probe it. Hard signals only; self-report confabulates. Commit `PROBE.md` first.
3. Fill the quirks row, including any **extra context source** the harness exposes
   (cursor's `.cursorrules` is the obvious next one).
4. Add the compile route and the door package by copying the nearest class-mate.

If step 4 requires editing anything in core beyond adding a `case`, stop — the abstraction is
leaking and that is worth fixing before the sixth door bakes it in.

---

## Skill Hell across harnesses

The summon engine's temporary directory contract is harness-agnostic. The
**hand-off** is a quirk, and this table is not a claim that every door has a
universal live-execution route:

| harness | how a summoned skill enters the session |
|---|---|
| claude | card points to the whole materialized directory; the agent reads `SKILL.md` from disk |
| pi | card plus resource discovery + reload loads the directory as a real native skill |
| codex / hermes / grok | tbd; likely place the directory into the scoped config home |

The current engine accepts a caller-supplied `limit`; the usable engine
maps `high`, `xhigh`, and `max` to progressively broader additive requests, but
does not publish fixed per-rung counts or score bands. HH scoring, routing
eligibility, and relevance-band filtering remain unshipped.

---

## Open

- `ultra` is ratified (N13); what is outstanding is the controller's
  heuristics, not permission. The usable Hell engine does not establish a
  score band, HH score, or routing-eligibility policy for its levels.
- Relevance-band filtering and routing eligibility are open engine seams.
- Delivery is the **Claude Code plugin** (`/plugin install
  skill-heaven@gaia-skill-heaven`), with `install.sh` as the optional
  standalone launcher install. **`npx` is not an install path**
  (`docs/AGENT-PLUGIN.md`). Either way the launcher ships and **never a
  harness** — the door execs whatever the
  user already has on `PATH`. Consequence: the harness version is the user's and can move under
  us, so a door should report the version it actually launched. A dose is a statement about a
  version, never a standing guarantee.
