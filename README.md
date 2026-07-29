# skill-heaven

> **WORK IN PROGRESS** — progress markers and benchmark results live in the research repo at
> [research.gaiaskilltree.com](https://research.gaiaskilltree.com).

**Strip your agent's context bloat — run clean.**

The Skill Heaven monorepo: shared profile-compiler engine + per-harness doors
(`claude-heaven`, `pi-heaven`, …). The `skill-heaven` bin itself is the
**research driver** — `--print` recipes, `--record` benchmark arms — for the
Hell/Heaven benchmark program
([gaia-research#62](https://github.com/gaia-research/gaia-research/issues/62)).
Launcher UX outside, M0-verified in-harness mechanics inside: it **composes
flags and execs; it never stashes, restores, or mutates shared state** (P3).
The only writes are inside a disposable `mkdtemp` session dir (crash-safe by
construction, AT-H2).

---

![skill-heaven site — WORK IN PROGRESS · HELL HEAVEN INDEX banner over the headline "STOP INSTALLING SKILLS. START SUMMONING THEM."](https://raw.githubusercontent.com/gaia-research/skill-heaven/main/docs/assets/site-preview.png)

The Hell Heaven (HH) Index — a per-skill hellHeaven stamp, benchmarked, not
guessed — is the research that keeps the product honest.

[![Read the benchmark method →](https://img.shields.io/badge/Read%20the%20benchmark%20method%20%E2%86%92-WIP%20%C2%B7%20help%20wanted-ff4fa3?style=flat-square)](https://research.gaiaskilltree.com/research/hh-benchmark)
[![Vision ↗](https://img.shields.io/badge/Vision%20%E2%86%97-gaia--research-00e5ff?style=flat-square)](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/VISION.md)
[![Mission ↗](https://img.shields.io/badge/Mission%20%E2%86%97-gaia--research-00e5ff?style=flat-square)](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/MISSION.md)

---

> **Naming ratified 2026-07-20** (RATIFICATION N8/N9, RFC
> [gaia-research#68](https://github.com/gaia-research/gaia-research/issues/68)):
> this repo is the product monorepo and doubles as the Claude Code plugin marketplace;
> user-facing installables are the per-harness doors. Monorepo package layout
> (`packages/core` engine, `packages/claude-heaven` + `packages/pi-heaven`
> doors) landed in WS2; the engine (seeded from the retired `hh-launcher`
> working checkout) now lives in `packages/core`. Not yet published to npm.
>
> **Decision authority:** `gaia-research/founder/RATIFICATION.md`
> (D1/D6/D8/D9/D12 + N8/N9 + P1/P2/P3 + B1–B5).
> Ids are never reused, so a citation here is only ever to a live entry. The
> retired ids — D7, D10, D11 and D13 — appear nowhere in this repo except in
> notes that say they are retired; a test enforces it.
> Plan: `gaia-research/docs/plans/m2-heaven-launcher-plan.md`.
> Evidence: `gaia-research/docs/labs/harness-capability-matrix.md`.

## Usage

```
skill-heaven
  --posture floor|product-floor|curated|native   # default floor (P1 vocabulary)
                                        # floor = the DOORLESS benchmark floor (alias: benchmark-floor)
                                        # product-floor = the DOORFUL product floor (claude only)
  [--level off|low]                     # aliases: off→floor, low→curated;
                                        # med|high|xhigh|max = hard error (hell lane gated, P2)
  [--harness claude|pi|codex|cursor|grok]   # default claude
  [--skill <path>]...                   # SKILL.md or its dir; required for curated, rejected otherwise
  [--door-plugin-dir <dir>]             # product-floor only; mounts the caller's door plugin
  [--mechanism plugin-dir|config-dir]   # claude curated route; default plugin-dir (T9 composition)
  [--print]                             # compile-only JSON {command, argv, env, fsPlan, notes, doseSummary}
  [-p <text>]                           # headless; omit → interactive (inherited stdio)
  [--model <m>] [--effort <lvl>] [--keep-temp] [-- <passthrough>]
  [--record --benchmark-id <id> --task <id> [--arm heaven|placebo] [--repeat <n>]
     [--endpoint-regex <re>] [--record-out <file>] [--note <text>]]
```

The flag vocabulary (`--posture`, the `--level` alias) is **provisional until
N5 closes** — mechanics are fixed, spelling may change.

## Posture mappings (what actually gets composed)

| Posture | claude (2.1.215) | pi (0.80.10) | codex (0.145.0) | cursor / grok |
|---|---|---|---|---|
| floor | `--disable-slash-commands --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources project` + env `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` (**T9b**) | `--no-skills` (see race caveat below) | `$CODEX_HOME` scoping, live exec (see caveat below) | recipe only (`--print`) |
| curated | `--setting-sources project --strict-mcp-config --mcp-config '{}' --plugin-dir $SESSION/heaven-set` + env `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` (**T9**) | `--no-skills --skill <dir>…` | `$CODEX_HOME` scoping + skill dirs copied in, live exec (see caveat below) | recipe only; grok hard-errors (no mechanism exists) |
| product-floor | floor's flags **minus** `--disable-slash-commands`, plus optional `--plugin-dir <door>` + the same env knob (**F7**) | — (no probed cell) | — (no probed cell) | — (no probed cell) |
| native | nothing — no flags, no env, no fsPlan (P3: exiting = switching) | nothing | nothing, live exec | nothing / recipe |

**codex moved off the recipe track (A2, 2026-07-29).** The per-session
`-c 'skills.config=[{path="<abs>",enabled=false}]'` scoping cell resolved
(matrix G1-skills-config-override, codex 0.145.0, gaia-research PR #133; a
targeted fixture skill was confirmed to drop out of the model-visible
listing — 74→73 entries, 2/2 byte-identical, nothing written to
`config.toml`) — `execSupport` is now `"exec"` for codex. **Caveat:** the
current `$CODEX_HOME`-scoping mechanism does not itself use that `-c` route
and does not evict `.agents/skills`, `~/.agents/skills`, `/etc/codex/skills`,
or bundled system skills (separate roots per the matrix's Skill discovery
row) — a live `--posture floor --harness codex` run is not yet a verified-empty
surface. Tracked as a known gap in `compileCodex`, not fixed as part of A2.

### The floor split (founder ruling V5-5, 2026-07-28)

There are **two floors** and they are different objects — measured and named
separately, priced as **separate arms (B1), never averaged into one number**.

- **`floor` — the doorless BENCHMARK floor.** Byte-frozen at T9b and the
  **placebo-of-record (B2)**. F6: `--disable-slash-commands` suppresses plugin
  *commands* as well as plugin skills, so `/skill-heaven` does not exist here —
  "the clean room as currently composed has no door". That is the ruling, not a
  defect. `--arm placebo` is accepted **only** for this posture.
- **`product-floor` — the doorful PRODUCT floor.** T9b minus that one flag, so
  the minimum control surface survives. F7 prices the door at **+515 tok**
  (20,176 vs the benchmark floor's 19,661), still **−28.9%** off native's
  28,379 (claude 2.1.216, probed 2026-07-24). It retains a control surface, so
  it can never stand in as the placebo; it records as `--arm heaven`.

The evidence numbers are recorded once in `FLOOR_EVIDENCE` (`packages/core/src/compile.ts`)
and are never re-derived. Every floor record is tagged `floor=benchmark` or
`floor=product` in `notes`, so the two arms cannot be pooled at analysis time.
`product-floor` has a verified cell on **claude only**; on any other harness it
hard-errors rather than guessing one into existence (M0 discipline).

`--door-plugin-dir` is caller-supplied on purpose: core does not assume which
package the door ships in. Omit it and `product-floor` still compiles — the
route permits a door, mounting one is the door package's business.

**Why curated does not ride on the floor flags (T6, resolved 2026-07-19):**
on Claude Code 2.1.215, `--disable-slash-commands` suppresses `--plugin-dir`
skills too, so the M0 caveat resolved **negative**. The frozen route (T9;
supersedes T8 after the owner vetoed its bundled-skills residual) uses
`--setting-sources project` for eviction (drops user-dir skills *and* the user
CLAUDE.md), `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` to remove the bundled CLI
skills, and `--plugin-dir` to re-admit the curated set.
⚠️ **This route is NOT zero listing residual — see the KC4 probe below,
which supersedes the "zero listing residual observed" claim this line used to
make.** The env knob is **undocumented** (string-probed from the 2.1.215
binary); it is version-pinned evidence — re-verify on every CLI upgrade.
The `config-dir` mechanism (T3/T7 route) is kept behind `--mechanism config-dir`
for reproducibility; note it is **auth-blocked on macOS** (Keychain-scoped
credentials).

**KC4 probe — curated listing residual is NON-ZERO (2026-07-29, claude
2.1.220, gaia-research/skill-heaven#10).** Prior notes on this route (and on
`packages/claude-heaven/src/launcher.ts`'s `scope: "session"` manifest field)
asserted "zero listing residual observed (2/2 runs)" on the strength of only
an argv **parse** check (PR #18) — a nonexistent `--plugin-dir` parses
identically, so that was never a positive result. `packages/claude-heaven/
scripts/probe-kc4-listing-residual.sh` is a re-runnable probe that instead
launches a real `claude` process through the actual door
(`claude-heaven` CLI → core's `compile()`, unmodified) and reads the
harness's own `system:init` stream-json event — the `skills`/`plugins`
arrays it constructs before any model call or auth check runs, so this works
even with no live credentials. Run **2/2 times**, byte-identical both times:

| Scenario | cwd | Composition | `skills` observed |
|---|---|---|---|
| S1 | project dir with a planted `<cwd>/.claude/skills/kc4-project-marker` | real curated route, one skill mounted via `--skill` | `["kc4-project-marker", "heaven-set:kc4-curated-marker", "doctor"]` |
| S2 | clean project dir (no `.claude/skills` at all) | same curated route | `["heaven-set:kc4-curated-marker", "doctor"]` |
| S3 | same planted project dir as S1 | same `--plugin-dir` mount, **without** `--setting-sources project` | full ~64-entry native-scale listing (user skills + project marker + curated marker + `doctor`) |
| S4 | same planted project dir as S1 | `native` posture (reference baseline) | full ~64-entry listing, no `heaven-set:` entries |

Findings:

- **Project-scope residual is real.** `--setting-sources project` keeps
  `<cwd>/.claude/skills` live — S1 shows the planted project marker sitting
  next to the curated set; S2 (same route, no project skill present) does
  not, so the marker's appearance in S1 is caused by project scope, not
  coincidence. **This directly answers the open question this README
  flagged:** yes, curated still loads project scope, and that is listing
  residual under KC4's own definition.
- **A bundled skill (`doctor`) leaks independent of both of the above.** It
  is present in S1, S2, S3, and S4 — i.e. with or without a project skill
  present, and with or without `--setting-sources project` — so
  `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` does not suppress it. `doctor`
  appears in the `skills` array itself (the same field the curated set and
  the project marker appear in), not merely in `slash_commands` alongside
  the already-documented, already-accepted built-in commands (`/help`,
  `/clear`, …) described under "Known floor residual" below — so it is not
  covered by that existing carve-out.
- **No marketplace-plugin skill leakage was observed.** `system:init`'s
  `plugins` array showed only `heaven-set` in every curated run (S1/S2) —
  none of this workstation's other installed marketplace plugins (e.g.
  `firecrawl-*`, `dataviz`) appeared, even though S3/S4 (which do not use
  `--setting-sources project`) show many of their skills once user scope is
  back in play. So plugin-provided residual specifically is clean; project
  scope and the one bundled skill are the two open leaks.

**Consequence:** KC4 ("curated mode shows zero listing residual") does not
close as passing. It closes with residual **confirmed non-zero** on two
independent axes (project scope, one bundled skill), zero on a third
(marketplace plugins). `launcher.ts`'s `scope: "session"` manifest field
— which KC2's statusline/`/skill-heaven` copy reads to decide whether to
print an exclusion caveat — was written on the disproven "zero residual"
premise; whether it should now carry a caveat is a KC2/product decision, not
settled here.

**pi caveat (P1):** `--no-skills` floor was verified live but shows an
intermittent discovery race on 0.80.10 (2 of ~9 headless floor runs still
listed skills). Benchmark floor runs on pi must assert the listing probe and
discard leak runs. Curated (`--no-skills --skill`) was clean in every run.

**Known floor residual (T9b/T10):** the T9b floor observes `NONE` — the
bundled skills and the user-CLAUDE.md leak are gone (`--setting-sources
project` also evicts user memory files as a side effect). What remains, in
every arm including vanilla, are the built-in CLI slash commands (`/help`,
`/code-review`, …): they are not skills, survive every suppression knob
(`CLAUDE_CODE_DISABLE_POLICY_SKILLS` does NOT remove them — T10 negative), and
are intermittently volunteered by the model, so strict `^NONE$` floor probes
keep such runs as honest endpoint failures. Full prompt eviction is M2b and
unratified; `tokens.system` stays `null` in every record.

## Dose summary

Every curated launch prints the loadout's standing/invocation dose using the
vendored `chars4` tokenizer (`max(1, floor(chars/4))`) — the by-construction
cross-check for the below-vanilla claim. Skill identity is
`sha256(exact SKILL.md bytes)`, byte-identical to the census artifact and
`ledger.SkillRef`.

## --record

Headless-only. Wraps the run, parses the harness JSON output (Claude 2.1.215
emits an event array; the final `type:"result"` event carries `result` +
`usage`), and emits an `hh-ledger/v1` record on stdout (and `--record-out`).

- `tokens.system` = `null` always (M2a unratified).
- either floor → `skillStanding`/`skillInvocation` = `0` **by construction**
  (both load zero skills; the door is a standing cost inside `perTurn`, not a
  skill cost).
- curated → `skillStanding` = chars4 sum; `skillInvocation` = `null` + note
  (stream-json invocation instrumentation is a follow-up).
- `perTurn` = `input_tokens + cache_creation_input_tokens +
  cache_read_input_tokens + output_tokens` from the result event's `usage`;
  `null` if usage is unparsable (unmeasured, never 0).
- `--arm placebo` is only accepted for the **doorless benchmark** floor
  (own-placebo anchoring, B2). `product-floor` is refused.
- Floor records carry a leading `floor=benchmark` / `floor=product` tag in
  `notes`. `hh-ledger/v1` has no posture field and this repo does not own that
  contract, so the tag rides `notes` until the schema carries it upstream.
- No `seed` field can ever be emitted (the vendored validator rejects it).

Appending to the ledger of record happens in `gaia-research`:

```bash
npx tsx scripts/hell-heaven-bench/ledger.ts append --record "$(cat rec.json)"
npx tsx scripts/hell-heaven-bench/ledger.ts validate
```

## Cross-repo contract (thin, D6)

This repo does **not** import `gaia-research` code. It vendors the small pure
pieces (`packages/core/src/vendor/`): the `chars4` tokenizer, the listing-line format, the
frontmatter reader, `sha256(SKILL.md)` refs, and the `hh-ledger/v1` type +
validator. Parity is enforced two ways:

1. `packages/core/test/parity.test.ts` — fixture generated by running the real
   `gaia-research` `census.ts` over `packages/core/test/fixtures/impeccable-skill`; the
   vendored helpers must reproduce its id/hash/token numbers exactly.
2. The hard gate: every emitted record must pass `ledger.ts validate` upstream.

## Development

```bash
npm install
npm test          # vitest: 30 tests incl. the parity fixture
npm run launcher -- --posture floor --print
```

Node ≥ 22, TypeScript ESM, zero runtime dependencies.
