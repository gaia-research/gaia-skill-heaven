# hh-launcher (working name)

Launcher-shaped profile compiler for **Skill Heaven** postures — M2 of the
Hell/Heaven benchmark program. Launcher UX outside, M0-verified in-harness
mechanics inside: it **composes flags and execs; it never stashes, restores, or
mutates shared state** (P3). The only writes are inside a disposable
`mkdtemp` session dir (crash-safe by construction, AT-H2).

> **Naming:** `hh-launcher` is a deliberately unbranded working name. The real
> repo/binary name is OPEN item 8 in `gaia-research/founder/RATIFICATION.md`
> (pends N4/N5 + persona lane). Do not brand or publish under this name.
>
> **Decision authority:** `gaia-research/founder/RATIFICATION.md` (D1/D6/D7).
> Plan: `gaia-research/docs/plans/m2-heaven-launcher-plan.md`.
> Evidence: `gaia-research/docs/labs/harness-capability-matrix.md`.

## Usage

```
hh-launcher
  --posture floor|curated|native        # default floor (P1 vocabulary)
  [--level off|low]                     # aliases: off→floor, low→curated;
                                        # med|high|xhigh|max = hard error (hell lane gated, P2)
  [--harness claude|pi|codex|cursor|grok]   # default claude
  [--skill <path>]...                   # SKILL.md or its dir; required for curated, rejected otherwise
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

| Posture | claude (2.1.215) | pi (0.80.10) | codex / cursor / grok |
|---|---|---|---|
| floor | `--disable-slash-commands --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources project` + env `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` (**T9b**) | `--no-skills` (see race caveat below) | recipe only (`--print`) |
| curated | `--setting-sources project --strict-mcp-config --mcp-config '{}' --plugin-dir $SESSION/heaven-set` + env `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` (**T9**) | `--no-skills --skill <dir>…` | recipe only; grok hard-errors (no mechanism exists) |
| native | nothing — no flags, no env, no fsPlan (P3: exiting = switching) | nothing | nothing / recipe |

**Why curated does not ride on the floor flags (T6, resolved 2026-07-19):**
on Claude Code 2.1.215, `--disable-slash-commands` suppresses `--plugin-dir`
skills too, so the M0 caveat resolved **negative**. The frozen route (T9;
supersedes T8 after the owner vetoed its bundled-skills residual) uses
`--setting-sources project` for eviction (drops user-dir skills *and* the user
CLAUDE.md), `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` to remove the bundled CLI
skills, and `--plugin-dir` to re-admit the curated set — zero listing residual
observed. ⚠️ The env knob is **undocumented** (string-probed from the 2.1.215
binary); it is version-pinned evidence — re-verify on every CLI upgrade.
The `config-dir` mechanism (T3/T7 route) is kept behind `--mechanism config-dir`
for reproducibility; note it is **auth-blocked on macOS** (Keychain-scoped
credentials).

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
- floor → `skillStanding`/`skillInvocation` = `0` **by construction**.
- curated → `skillStanding` = chars4 sum; `skillInvocation` = `null` + note
  (stream-json invocation instrumentation is a follow-up).
- `perTurn` = `input_tokens + cache_creation_input_tokens +
  cache_read_input_tokens + output_tokens` from the result event's `usage`;
  `null` if usage is unparsable (unmeasured, never 0).
- `--arm placebo` is only accepted for floor (own-placebo anchoring, B2).
- No `seed` field can ever be emitted (the vendored validator rejects it).

Appending to the ledger of record happens in `gaia-research`:

```bash
npx tsx scripts/hell-heaven-bench/ledger.ts append --record "$(cat rec.json)"
npx tsx scripts/hell-heaven-bench/ledger.ts validate
```

## Cross-repo contract (thin, D6)

This repo does **not** import `gaia-research` code. It vendors the small pure
pieces (`src/vendor/`): the `chars4` tokenizer, the listing-line format, the
frontmatter reader, `sha256(SKILL.md)` refs, and the `hh-ledger/v1` type +
validator. Parity is enforced two ways:

1. `test/parity.test.ts` — fixture generated by running the real
   `gaia-research` `census.ts` over `test/fixtures/impeccable-skill`; the
   vendored helpers must reproduce its id/hash/token numbers exactly.
2. The hard gate: every emitted record must pass `ledger.ts validate` upstream.

## Development

```bash
npm install
npm test          # vitest: 30 tests incl. the parity fixture
npm run launcher -- --posture floor --print
```

Node ≥ 22, TypeScript ESM, zero runtime dependencies.
