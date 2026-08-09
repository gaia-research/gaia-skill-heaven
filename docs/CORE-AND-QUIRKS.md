# Core and Quirks

Five doors in, the boundary is clear enough to name. This document fixes it, so that adding
harness six is *additive* — a quirks table entry and a probe, not a redesign.

**The rule:** the core owns the ladder, the postures, and the guarantees; it
consumes the independently released summon engine. A harness owns only *how*
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

`off · low · med · high · xhigh · max · ultra`

**Skill- and context-scoped.** It is *not* the harness's reasoning dial — `--thinking`,
`model_reasoning_effort`, `--reasoning` are model-scoped and share level names by pure
coincidence. Hold reasoning constant across arms; it is a control variable, never the thing
under test.

- `off` → `product-floor` — the nearest zero a user can actually launch at, door still open
- `low` → `curated` — suppress everything, readmit exactly these
- `med` → `native` — the user's setup untouched; top of Heaven
- `high` → Skill Hell default — request one match per capability gap
- `xhigh` → Skill Hell — request up to three matches
- `max` → Skill Hell — request up to five matches
- `ultra` → unratified

The ladder is the primary product interface on every door:

```bash
<door>-heaven                         # defaults to --level off
<door>-heaven --level off
<door>-heaven --level low --skill /path/to/skill
<door>-heaven --level native          # explicitly leave the user's setup untouched
<door>-heaven --help                  # ladder first; postures are compatibility vocabulary
```

The ladder has two capability-defined halves; [LADDER-FLOW.md](LADDER-FLOW.md)
is authoritative. Launchers own subtractive `off|low|med`. In the product
model, `/skill-hell` owns additive `high|xhigh|max|ultra` and defaults to
`high`; a live hand-off is only claimed where the relevant harness has evidence.
Hell is not P2-gated. `ultra` alone refuses because it is **unratified**.
`--posture` remains available for benchmark and compatibility invocations, but
is not the product's lead vocabulary.

A bare launcher selects `off`/`product-floor`. Execution support is
harness- and version-specific: consult each door's probe rather than inferring a
universal live route from the five source-built door commands. `--print` emits
the plan and its caveats; no door silently falls back to `native`.

### 2. Postures

`floor` · `product-floor` · `curated` · `native`. `floor` is the doorless benchmark
placebo-of-record and is **never product vocabulary**. The two floors are priced as separate
arms and never averaged — the gap between them *is* the door's cost.

### 3. Guarantees

- **Ladder split** — Heaven is boot-time subtraction; Hell is the additive
  product lane. A live hand-off remains a per-harness evidenced capability.
  Only `ultra` refuses, as unratified rather than gated.
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

### 5. The summon engine (`gaia-mcp`)

The published [`@gaia-research/mcp@0.4.0`](https://github.com/gaia-research/gaia-mcp/releases/tag/mcp-v0.4.0)
prototype is an independent package. Its current rich Registry/Bond surface is
`gaia_search`, `gaia_inspect`, `summon`, and `gaia_status`.

Its `summon` flow is: search → untuned candidate ordering → clone/validate →
materialize the whole skill directory → session lock → GC → payload cache. It
produces a directory on disk; what a harness can do with that directory is a
quirk and needs its own evidence.

The source URLs are env-overridable as `TREE_URL` and `TREE_NAMED_URL`, so the
engine can be configured against another tree without a fork.

`summon` is the current tool name; `gaia_summon` is not a current package tool.
D4's thin `search_skills` + `summon` Heaven/Summon profile is a separate
profile/dose constraint. It does not make the rich package an implemented or
measured two-tool profile, and it does not deprecate `gaia_search`,
`gaia_inspect`, or `gaia_status`.

The prototype does **not** ship Hell/Heaven scoring, routing eligibility, or
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

The `high…max` rungs request only a summon count. The current engine accepts
`--limit`; relevance-band filtering and any HH scoring or routing-eligibility
meaning remain unshipped. A rung never proves a harness-specific live hand-off.

---

## Open

- `ultra` is unratified. It exists as a ledger arm and, coincidentally, as a level name in
  Hermes' reasoning dial — which is **not** evidence about our rung.
- Relevance-band filtering is an open engine seam. Doors can pass bounded
  `--limit` counts (high 1, xhigh 3, max 5), but the engine does not yet enforce
  declared score bands or a routing-eligibility policy.
- Delivery is `npx`, shipping **the launcher and never a harness** — the door execs whatever the
  user already has on `PATH`. Consequence: the harness version is the user's and can move under
  us, so a door should report the version it actually launched. A dose is a statement about a
  version, never a standing guarantee.
