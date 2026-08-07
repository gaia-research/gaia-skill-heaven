# Core and Quirks

Five doors in, the boundary is clear enough to name. This document fixes it, so that adding
harness six is *additive* — a quirks table entry and a probe, not a redesign.

**The rule:** the core owns the ladder, the postures, the guarantees, and the summon engine.
A harness owns only *how* it is asked to suppress things. If a change to one harness touches
core, that is a signal the core abstraction is wrong, not that the harness is special.

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
- `med`…`max` → Skill Hell — progressively more *summoned* context (currently P2-gated)
- `ultra` → unratified

The ladder is the primary product interface on every door:

```bash
<door>-heaven                         # defaults to --level off
<door>-heaven --level off
<door>-heaven --level low --skill /path/to/skill
<door>-heaven --level native          # explicitly leave the user's setup untouched
<door>-heaven --help                  # ladder first; postures are compatibility vocabulary
```

`med|high|xhigh|max` are accepted as rung names and hard-refused by P2. `ultra`
is accepted so the surface can say the honest thing: it is **unratified**, which
is distinct from the P2 gate. `--posture` remains available for benchmark and
compatibility invocations, but is not the product's lead vocabulary.

A bare launcher selects `off`/`product-floor`. Claude, pi, and Hermes have live
exec routes. Codex and Grok keep their existing recipe-only honesty boundary:
their bare command selects off but refuses to spawn, while `--print` emits the
plan and its negative-probe caveat. None silently falls back to `native`.

### 2. Postures

`floor` · `product-floor` · `curated` · `native`. `floor` is the doorless benchmark
placebo-of-record and is **never product vocabulary**. The two floors are priced as separate
arms and never averaged — the gap between them *is* the door's cost.

### 3. Guarantees

- **P2** — the Hell lane is gated. A refusal is a policy hold, not a harness limit, and says so.
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

Search → untuned rank (relevance **gates**, rating **orders**) → clone → validate → materialize
the whole skill directory → session-lock → GC → payload cache. Harness-agnostic by construction:
it produces a **directory on disk**. What a harness does with that directory is a quirk.

**It is also tree-agnostic, and that is deliberate** (founder, 2026-08-07). The same summon will
eventually point at a different tree — a user's own, an enterprise's, anything. The registry is
a *parameter*, not part of the engine's identity. The plumbing already reflects this: the source
URLs are env-overridable (`GAIA_REGISTRY_URL`, `GAIA_NAMED_SKILLS_URL`), so pointing summon at
another tree is configuration, not a fork.

This is why the tool is named **`summon`** and not `gaia_summon`. A tool name carrying the tree's
name would be a lie the moment the tree changes. Same reasoning retires the `gaia_*` prototype
names generally (`gaia.mcp` lexicon, D4 — the ratified surface is `search_skills` + `summon`);
the three published v0.1.0 names stay only because renaming a live public interface is a breaking
change a lexicon entry does not authorise.

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

- **pi can load a summoned skill mid-session; Claude cannot.** So `/skill-hell` on pi genuinely
  *loads* the skill, while on Claude it pastes the body into context. Same command, different
  depth. The core does not care — it hands over a directory either way.
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

The summon engine is entirely harness-agnostic. Only the **hand-off** is a quirk:

| harness | how a summoned skill enters the session |
|---|---|
| claude | `/skill-hell` prints the SKILL.md body into context |
| pi | extension loads the directory via resource discovery + reload — a real skill |
| codex / hermes / grok | tbd; likely place the directory into the scoped config home |

The `med…max` rungs will differ only in **how much** is summoned, never in the mechanism. That
is the property worth protecting: if a rung ever needs harness-specific logic, the summon
contract has leaked.

---

## Open

- `ultra` is unratified. It exists as a ledger arm and, coincidentally, as a level name in
  Hermes' reasoning dial — which is **not** evidence about our rung.
- The `med…max` rungs are P2-gated and compose nothing yet. Wiring them to the summon engine is
  what turns a gate into a product.
- Delivery is `npx`, shipping **the launcher and never a harness** — the door execs whatever the
  user already has on `PATH`. Consequence: the harness version is the user's and can move under
  us, so a door should report the version it actually launched. A dose is a statement about a
  version, never a standing guarantee.
