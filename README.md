# skill-heaven

> **WORKING PROTOTYPE — actively tested for public use, not a finished product.**
> Interfaces, flags, postures, and command surfaces may change. Progress markers
> and benchmark results live at
> [research.gaiaskilltree.com](https://research.gaiaskilltree.com).

**Strip your agent's context bloat — run clean.**

**One entropy ladder is the whole mental model (RATIFICATION N11).** The
user-facing dial is a single axis — `off · low · med · high · xhigh · max ·
ultra` — measuring **skill entropy**: the disorder a skill loadout adds to a
session's context. **Heaven is the low-entropy region** (`off · low · med`),
**Hell the high-entropy region** (`high · xhigh · max`), with **`ultra`
above**. A mode is a *region* of the one ladder, not a separate orthogonal
dial. Skill Hell can ask the published prototype to materialize a matching
skill into a temporary session on demand. The current
[`@gaia-research/mcp@0.4.0`](https://github.com/gaia-research/gaia-mcp/releases/tag/mcp-v0.4.0)
package is a rich four-tool Registry/Bond surface (`gaia_search`,
`gaia_inspect`, `summon`, `gaia_status`), not an implemented or measured D4
thin `search_skills` + `summon` profile. Hell/Heaven scoring, routing
eligibility, and content-hash admission or verification are not shipped.
Public domain:
[`skill-heaven.dev`](https://skill-heaven.dev), served from `packages/site`
(N12).

The Skill Heaven monorepo: shared profile-compiler engine + per-harness doors
(`claude-heaven`, `pi-heaven`, …). The `skill-heaven` bin itself is the
**research driver** — `--print` recipes, `--record` benchmark arms — for the
Hell/Heaven benchmark program
([gaia-research#62](https://github.com/gaia-research/gaia-research/issues/62)).
Launcher UX outside, M0-verified in-harness mechanics inside: it **composes
flags and execs; it never stashes, restores, or mutates shared state** (P3).
The only writes are inside a disposable `mkdtemp` session dir (crash-safe by
construction, AT-H2).

## Try the working prototype

> **WORKING PROTOTYPE — actively tested for public use.** Node 22 or newer is
> required. The launchers use your existing harness binaries; they never bundle
> Claude Code, pi, Codex, Grok, or Hermes.

### Install everything in one command

```bash
curl -fsSL https://gaia-research.github.io/skill-heaven/install.sh | sh
```

That one command installs `claude-heaven`, `pi-heaven`, `codex-heaven`,
`hermes-heaven`, and `grok-heaven`; a working `skill-hell` binary from the
published `@gaia-research/mcp@latest` package; and, when the user's own `claude`
binary is present, the Claude marketplace plugin that provides `/skill-heaven`
and `/skill-hell`. It never installs Claude Code, pi, Codex, Hermes, or Grok.
If Claude Code is absent, the doors and engine still install and the script
prints the exact two plugin-registration commands to run after the user
installs that harness themselves.

For a direct, one-shot engine invocation outside the installer, use the
npx-friendly alias at the current tag:

```bash
npx --yes skill-hell@latest summon "code review" --card
```

**Why `curl | sh`:** the five door packages deliberately are not published to
npm, while this repository already has a first-party HTTPS home on GitHub
Pages. A reviewed POSIX `install.sh` can therefore fetch the public source,
install all source-built doors and the published engine under one user-owned
directory, and perform an idempotent update without pretending an `npx` package
exists. The script checks Node 22+ and every prerequisite before changing the
install, and the URL is directly inspectable before execution.

The default bin directory is `$HOME/.local/share/skill-heaven/bin`. The
installer prints this exact line when it is not already on `PATH` and never
edits a shell rc file:

```bash
export PATH="$HOME/.local/share/skill-heaven/bin:$PATH"
```

Inspect every composed plan without starting a harness:

```bash
claude-heaven --print
pi-heaven --print
codex-heaven --print
hermes-heaven --print
grok-heaven --print
skill-hell summon "code review" --card
```

Re-run the install one-liner to update. Uninstall everything the installer owns,
including the Claude plugin and marketplace only when it added them, with:

```bash
$HOME/.local/share/skill-heaven/uninstall.sh
```

The installer uses a source archive because the door packages remain
unpublished source artifacts; their local manifest versions are not public
release lines. It does not publish them or install a harness as a side effect.

---

![skill-heaven site — WORK IN PROGRESS · HELL HEAVEN INDEX banner over the headline "STOP INSTALLING SKILLS. START SUMMONING THEM."](https://raw.githubusercontent.com/gaia-research/skill-heaven/main/docs/assets/site-preview.png)

The Hell/Heaven (HH) Index is a research question, not a current engine
admission system. The benchmark's priority is the **general entropy curve** —
how quality and cost move along the skill-entropy axis — not a token-savings
headline (B6). The current summon prototype does **not** ship per-skill HH
scores, routing eligibility, or content-hash admission or verification, so no
Skill Tree stamp is a live admission decision.

[![Read the benchmark method →](https://img.shields.io/badge/Read%20the%20benchmark%20method%20%E2%86%92-WIP%20%C2%B7%20help%20wanted-ff4fa3?style=flat-square)](https://research.gaiaskilltree.com/research/hh-benchmark)
[![Vision ↗](https://img.shields.io/badge/Vision%20%E2%86%97-gaia--research-00e5ff?style=flat-square)](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/VISION.md)
[![Mission ↗](https://img.shields.io/badge/Mission%20%E2%86%97-gaia--research-00e5ff?style=flat-square)](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/MISSION.md)

---

## The ladder

Entropy runs on one line of seven rungs — but it is served by **two commands**, because the two
halves are not the same kind of thing.

![The entropy ladder. Heaven is subtractive and holds off, low, and med (which equals native); it is served by /skill-heaven and needs a launcher. Hell labels high, xhigh, max, and ultra remain P2-gated rather than a current product ladder.](docs/assets/entropy-ladder.svg)

**Heaven is subtractive.** `off`, `low`, and `med` differ by how much of your ambient setup is
*withheld*. A running session cannot un-load what it already loaded, so that is a decision only
boot can make — which is why `/skill-heaven` needs the launcher, and says so plainly when it was
not used.

**Hell is not a current product ladder.** `high`, `xhigh`, `max`, and `ultra`
are ratified level names, but P2 keeps Hell activation gated pending its evidence
and owner-ratification conditions. This repository does not assign them a default,
a summon count, a score band, or a routing meaning.

| | current product choices | status |
|---|---|---|
| **Heaven** | `off` · `low` · `med` | launchable through `/skill-heaven` |
| **Hell** | `high` · `xhigh` · `max` · `ultra` | P2-gated; no current product mapping |

`floor` is **not on the ladder** — it is the byte-frozen benchmark placebo-of-record and is never
user-selectable. The published `skill-hell` prototype can materialize a requested skill, but that
manual capability does not activate or ratify the Hell ladder.

Full flow, including every branch: **[docs/LADDER-FLOW.md](docs/LADDER-FLOW.md)**. The diagram is
generated from the site's own design tokens — edit `scripts/gen-ladder-svg.py`, never the SVG.

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
                                        # product-floor = the DOORFUL product floor; execution evidence is per harness
  [--level off|low]                     # aliases: off→product-floor, low→curated;
                                        # med|high|xhigh|max = hard error (hell lane gated, P2)
  [--harness claude|pi|codex|cursor|grok|hermes]   # default claude
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

| Posture | claude (2.1.215) | pi (0.80.10) | codex (0.146.0) | hermes (0.20.0) | cursor | grok (0.2.118) |
|---|---|---|---|---|---|---|
| floor | `--disable-slash-commands --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources project` + env `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` (**T9b**) | `--no-skills` (see race caveat below) | session `CODEX_HOME`, auth copy, `skills/list` exact-path disables (**WP14**) | `--toolsets terminal,web,file --safe-mode` (**WP8**) | recipe only (`--print`) | iterative `inspect --json` exact-path ignores + observed plugin disables (**WP14**) |
| curated | `--setting-sources '' --strict-mcp-config --mcp-config '{}' --plugin-dir $SESSION/heaven-set` + env `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` (**KC4 clean room, 2026-07-30; supersedes T9**) | `--no-skills --skill <dir>…` | same discovery, readmitting named `$CODEX_HOME/skills/<id>` dirs (**WP14**) | session `HERMES_HOME`, auth copy, `.no-bundled-skills`, named skill copies + `--skills <id> --safe-mode` (**WP8**) | recipe only | same discovery, readmitting named `$GROK_HOME/skills/<id>` dirs (**WP14**) |
| product-floor | `--strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources ''` (P8 empty allowlist), plus optional `--plugin-dir <door>` + the same env knob (**F7 evidence**) | `--no-skills --no-context-files --no-prompt-templates` (**WP2**) | same verified clean-room composition as floor; Codex has no separate in-session door surface (**WP14**) | `--toolsets terminal,web,file --ignore-user-config --ignore-rules` (**WP8**) | recipe only (`--print`) | exact-path ignores leave observed plugins as the door surface (**WP14**) |
| native | nothing — no flags, no env, no fsPlan (P3: exiting = switching) | nothing | `codex exec` untouched | `hermes` untouched | nothing | `grok` untouched |

**codex-heaven is now an exec door (WP14, codex-cli 0.146.0).** The earlier
flag-only negative remains recorded in `packages/codex-heaven/PROBE.md`:
`CODEX_HOME` and `--ignore-user-config` do not evict independent roots. The
launcher closes that gap without mutating `~/.codex`: after copying auth and
materializing any curated skills, it asks Codex's disk-backed app-server
`skills/list` for exact paths, writes session-local `skills.config` disables
for every non-readmitted path, and then spawns `codex exec`. Repeated hard
counts were 76 discovered / 0 enabled in the composed floor, versus 90 / 45
in the baseline app-server scan; the real scoped launch authenticated and
answered. Cursor remains recipe-only because tracked `.cursor/rules` cannot
be suppressed per-session. Grok now uses the same dynamic inspect-derived route
(WP14), with product-floor intentionally retaining the observed plugin surface.

### The floor split (founder ruling V5-5, 2026-07-28)

There are **two floors** and they are different objects — measured and named
separately, priced as **separate arms (B1), never averaged into one number**.

- **`floor` — the doorless BENCHMARK floor.** Byte-frozen at T9b and the
  **placebo-of-record (B2)**. F6: `--disable-slash-commands` suppresses plugin
  *commands* as well as plugin skills, so `/skill-heaven` does not exist here —
  "the clean room as currently composed has no door". That is the ruling, not a
  defect. `--arm placebo` is accepted **only** for this posture.
- **`product-floor` — the doorful PRODUCT floor.** It keeps the minimum
  control surface and, under P8, uses an empty `--setting-sources` allowlist so
  project scope is not admitted. The locked F7 evidence prices the door at
  **+515 tok** (20,176 vs the benchmark floor's 19,661), still **−28.9%** off
  native's 28,379 (claude 2.1.216, probed 2026-07-24). It retains a control
  surface, so it can never stand in as the placebo; it records as `--arm heaven`.

The evidence numbers are recorded once in `FLOOR_EVIDENCE` (`packages/core/src/compile.ts`)
and are never re-derived. Every floor record is tagged `floor=benchmark` or
`floor=product` in `notes`, so the two arms cannot be pooled at analysis time.
The recorded compositions below are version-pinned, per-harness evidence;
they are not a universal guarantee that every door can execute live. Cursor
hard-errors rather than guessing a route into existence (M0 discipline).

`--door-plugin-dir` is caller-supplied on purpose: core does not assume which
package the door ships in. Omit it and `product-floor` still compiles — the
route permits a door, mounting one is the door package's business.

**Why curated does not ride on the floor flags (T6, resolved 2026-07-19):**
on Claude Code 2.1.215, `--disable-slash-commands` suppresses `--plugin-dir`
skills too, so the M0 caveat resolved **negative**. The route was frozen as T9
(`--setting-sources project`, supersedes T8 after the owner vetoed its
bundled-skills residual), but **T9 is itself superseded as of the KC4 clean
room fix (2026-07-30)** — see below. `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`
still removes the bundled CLI skills, and `--plugin-dir` still re-admits the
curated set (it is a flag, not a setting source, so it is unaffected by the
allowlist value). The `config-dir` mechanism (T3/T7 route) is kept behind
`--mechanism config-dir` for reproducibility; note it is **auth-blocked on
macOS** (Keychain-scoped credentials).

**KC4 clean room fix — `--setting-sources ''` (empty value), not `project`
(2026-07-30).** `--setting-sources` is an **allowlist**: naming `project`
explicitly *keeps* project-scope skills, which is exactly the residual the
2026-07-29 KC4 probe measured (below). Founder ruling: `curated` is a
personal-profile posture — a clean room plus the caller's own named skills —
never a benchmark arm, so a project-scope leak is not acceptable. The founder
chose the **empty value** deliberately over `local`: a clean `local` listing
on one machine only proves that machine had no local-scope skills, whereas
empty is structurally "no ambient sources" regardless of what scopes exist on
disk. **Empty value ≠ omitting the flag** — omitting `--setting-sources`
entirely restores the full ~68-entry bundled listing; the flag must still be
passed, just with an empty value. `--plugin-dir` survives unaffected since it
is not a setting source. Re-probed clean — see "KC4 probe — re-run after the
clean-room fix" below.

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

**Consequence (as of the 2026-07-29 probe, superseded below):** KC4 ("curated
mode shows zero listing residual") did not close as passing. It closed with
residual **confirmed non-zero** on two independent axes (project scope, one
bundled skill), zero on a third (marketplace plugins). `launcher.ts`'s
`scope: "session"` manifest field — which KC2's statusline/`/skill-heaven`
copy reads to decide whether to print an exclusion caveat — was written on
the disproven "zero residual" premise; whether it should now carry a caveat
is a KC2/product decision, not settled here.

**KC4 probe — re-run after the clean-room fix (2026-07-30, claude 2.1.220).**
`compile()`'s curated route for claude now composes `--setting-sources ''`
(empty value) instead of `--setting-sources project` — see "KC4 clean room
fix" above. Re-ran the same probe script, S1/S2 unmodified, **2/2 runs,
byte-identical both times**:

| Scenario | cwd | `skills` observed |
|---|---|---|
| S1 | project dir with a planted `<cwd>/.claude/skills/kc4-project-marker` | `["heaven-set:kc4-curated-marker", "doctor"]` |
| S2 | clean project dir (no `.claude/skills` at all) | `["heaven-set:kc4-curated-marker", "doctor"]` |

The project-scope marker from S1 is **gone** — the empty allowlist evicts it,
where naming `project` kept it live. The only entry beyond the curated marker
is `doctor`, which is present in both scenarios regardless of
`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` — the same bundled-skill residual the
2026-07-29 probe found, and **confirmed here as an upstream harness
limitation the founder has ruled stays as-is**, not a defect in this
composition. No other entry was observed in either scenario.

**KC4 now closes as PASSING**: curated mode's listing residual is `doctor`
only — the single founder-permitted residual — with the project-scope leak
eliminated. `launcher.ts`'s `scope: "session"` manifest field and the KC2
statusline/`/skill-heaven` disclosures now describe that remaining bundled
residual. P8 applies the same empty allowlist to product-floor, so project
scope is excluded there too.

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
npm test          # full Vitest suite, including the parity fixture
npm run launcher -- --posture floor --print
```

Node ≥ 22, TypeScript ESM. Published package entry points carry only the `tsx`
runtime loader; harnesses are never package dependencies.
