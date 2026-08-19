# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Aesthetic-driven early adopters of AI coding agents — people who run harnesses
like Claude Code, Pi, Codex daily, are fluent in the culture, and are drawn as
much to the mythology and craft of a tool as to its numbers. They evaluate a
landing page as a signal of taste and seriousness before they read a benchmark.
Secondary: context-weary developers who feel their agent's context bloat, and
benchmark-minded evaluators who scrutinize the Hell/Heaven method.

## Product Purpose

**One mechanic, one line, four surfaces (N13).** The mechanic is **summon**: a skill enters
context on demand, for one session, and nothing is installed. `/summon` is that
mechanic in its single, explicit form and it is present in every implementation
— it is the product floor.

The other three surfaces are contiguous **bands on one line** — there is a
single ladder `zero · low · med · high · xhigh · max · ultra`, and the surface
is read from the current rung.

**What the line measures is skill entropy** — how much skill variety and volume
enters a session (`docs/LADDER-FLOW.md`). A rung is a reading of that quantity,
so it names a **direction** along the scale and a **position** along its band.
It never names a count.

- **Skill Zero** — the launcher and the `zero` rung. Severs the harness's skill
  catalogue to its nearest achievable zero and restores only what you name:
  zero skills, zero skill entropy. Ships with `/summon` by default, with none
  of the choosing automated.
- **Skill Heaven** — the **converge** band (`low · med`), the lower-entropy
  direction. `/skill-heaven` narrows onto the gap in front of you.
- **Skill Hell** — the **explore** band (`high · xhigh · max`), the
  higher-entropy direction. `/skill-hell` widens around the gap. Heaven and
  Hell are two directions of the same summon over one shared MCP.
- **Skill Ultra** — the **crown rung** (`ultra`). `/skill-ultra` picks the
  direction and the position for you, gap by gap. No sub-ladder of its own.

Success is a visitor understanding, in seconds, that a skill can be summoned for
one session instead of installed forever — and that they choose how much of the
choosing is automated.

## Positioning

Installing a skill is a permanent edit to your repo that loads on every turn
whether the task needs it or not. Summoning is borrowed: it enters context once,
for one session, and the tree on disk is byte-identical afterwards.

The mechanism a neighbour cannot truthfully copy: a per-skill **Hell/Heaven (HH)
Index** — skills benchmarked, not guessed — plus a launcher that *composes flags
and execs; it never stashes, restores, or mutates shared state*. The only writes
live in a disposable session dir. Doses are always reported as two numbers
(standing, paid every session; invocation, paid on invoke), never averaged.

The thesis is the **entropy curve** — how quality and cost move together as
skill entropy rises — not a single token-savings headline. **The benchmark that
would plot it is not built**, so the curve is a concept the instrument is being
built to test, never a result. Real measured figures are cited as evidence,
never as the claim.

## Operating Context

Used from inside a coding-agent harness. The install is settled in
`docs/AGENT-PLUGIN.md` ("Install — the final decision") and the site prints
nothing else.

**Primary — the plugin.** Two lines typed inside Claude Code, no terminal:

```
/plugin marketplace add gaia-research/gaia-skill-heaven
/plugin install skill-heaven@gaia-skill-heaven
```

That installs the one `skill-heaven` plugin with its summon engine bundled
inside it — no sibling checkout, no external package, no build step. It puts
five commands in the session: `/summon`, `/skill-zero`, `/skill-heaven`,
`/skill-hell`, `/skill-ultra`.

**Optional — the standalone launcher doors.** For the five source-built
`*-zero` binaries independent of Claude Code:

```
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

Then launch a door (`claude-zero` is the flagship). The script never installs a
harness.

**`npx` is not an install path** and **`skill-heaven.dev` is deferred** — it has
no DNS today, so no surface may print it. The site uses the host that actually
serves: `gaia-research.github.io/gaia-skill-heaven`.

The public site is served from `packages/site`.

## Capabilities and Constraints

- **The rungs are `zero · low · med · high · xhigh · max · ultra`** on ONE line,
  discrete, never a continuous fader. The surface is read from the rung:
  `zero`=Zero, `low·med`=Heaven, `high·xhigh·max`=Hell, `ultra`=Ultra. A rung
  names a **direction** and a **position along its band**; `zero` means none of
  the choosing is automated — `/summon` still works by hand.
- **No rung carries a count and no summon is capped.** The earlier working
  mapping (`off 0 · low 1 · med 2 · high 3 · xhigh 4 · max 5`) is **withdrawn**
  (owner ruling, 2026-08-19). `RUNG_SLOTS` no longer exists in `packages/core`.
  How far a rung reaches on a given gap is the agent's call, worked out in use
  while the benchmark is built. No surface may render a per-rung number.
- **Where each band opens is PROVISIONAL (WIP).** `/skill-heaven` opens at
  `low`; `/skill-hell` opens at `high`. Those are working defaults, not
  findings; every surface that renders the line carries the WIP mark.
- **Nothing on the line refuses.** Hell is not gated, locked, or sealed at any
  rung, and neither is Ultra. N13 ratified all four surfaces — what is
  outstanding is implementation, not permission.
- **Skill Ultra is the crown rung.** It is the auto controller over the whole
  line — no slider, no sub-ladder of its own; it sits at the top as `ultra`.
- **Never mutate shared state:** compose + exec only; writes confined to a
  disposable mkdtemp session dir.
- **Heaven/Hell stamps are not built.** Routing eligibility today falls back
  to relevance ranking; Skill Heaven will consume the stamps when they land. Do
  not present stamp-gated routing as running.
- **The entropy benchmark is not built.** No curve has been plotted, no turn
  located, and no rung shown to beat any other. Do not present it as a result.
- **One tool, one story.** The mechanic a reader needs is `/summon`. The wider
  `gaia_search` / `gaia_inspect` / `gaia_status` tool surface stays documented
  in `gaia-research` as WIP — it is not part of what this site presents.
- **Free.** The doors, the plugin, and the MCP transport cost nothing. No paid
  tier, metering, or enterprise pricing has shipped.
- Per-harness support varies: Claude Code is the flagship (the plugin);
  `pi-zero`, `codex-zero`, `hermes-zero`, `grok-zero` exist as prototypes.
- **WORK IN PROGRESS · v0.** The plugin installs from this repository's own
  marketplace; the five launcher doors are source-delivered through
  `install.sh`. Neither is on npm. The site carries a standing WIP disclosure
  in the chrome and footer.

## Brand Commitments

- Name: **Skill Heaven** (umbrella). Surfaces: **Skill Zero · Skill Heaven ·
  Skill Hell · Skill Ultra**. System verb: **summon**.
- **Skill Zero subtracts; Skill Heaven converges.** Zero is the floor that cuts
  the catalogue at launch. Heaven is the lower-entropy *summon direction*, not
  a subtraction mechanic. "Skill Heaven strips / evicts / subtracts" is a known
  historical error — never write it.
- The Claude Code plugin is **`skill-heaven@gaia-skill-heaven`**. The earlier
  `claude-zero@gaia-skill-heaven` id is retired (a `renames` entry in
  `marketplace.json` migrates existing installs).
- Launcher door names end in `-zero`: `claude-zero`, `pi-zero`, `codex-zero`,
  `hermes-zero`, `grok-zero`. The old `*-heaven` door names are retired.
- Persona/figure: **the line's own persona (public name reserved)** — internal
  working name `Lucy`, never hard-coded in shipped copy. Distinct from Milim,
  the Gaia Research lab mascot. Four states, and the state is carried by eyes,
  gravity, wings, weapon count and inversion — never by a costume change:
  **Zero** cyan `#37D6E0`, seated, eyes closed, no wings, one katana ·
  **Heaven** blue `#7CC4FF`, falling with gravity inverted, both diamond eyes
  open, ordered shards · **Hell** a full-scene RGB inversion of Heaven, both eyes
  closed, one red tear, white ground · **Ultra** gold `#FFD24A`, never inverted,
  one diamond eye open and one closed with a tear, two matching katanas.
- Duality: **Heaven ↔ Hell** as converge vs explore — restraint and reach, two
  directions of the same summon, not a good half and a locked half.
- Voice: precise, empirical, honest about negative results; no hype claims.
- Tagline in use: "Stop installing skills. Start summoning them."

## Evidence on Hand

- Real posture token figures (benchmark floor 19,661 tok; product floor
  20,176 tok; native 28,379 tok; −28.9% vs native; +515 tok door cost) are
  measured benchmark results, not marketing estimates.
- Real, working install and launch commands (see Operating Context). Verified
  2026-08-19: the plugin install path is the one settled in
  `docs/AGENT-PLUGIN.md`, and
  `https://gaia-research.github.io/gaia-skill-heaven/install.sh` serves `200`.
- **Dead paths, do not print:** `skill-heaven.dev` has no DNS (NXDOMAIN);
  `skill-zero` is not on npm (404); `skill-hell` and `@gaia-research/mcp` are
  **deprecated** on npm — the summon engine now ships bundled inside the
  plugin. The `*-zero` doors are not on npm by design.
- Approved character art: `src/assets/lucy/v4-approved/set-{a,b,c}/` (three
  parallel sets, all owner-approved — do not collapse to one) and the
  alpha-verified katana pack `src/assets/lucy/frontpage/katana-authority-v2/`.
- No customer testimonials, logos, press, or user counts exist. Do not fabricate
  them.

## Product Principles

1. **One mechanic.** Summon is the whole product; the surfaces only set how much
   of it is automatic.
2. **Honest dosing.** Two numbers, always; a negative result is a first-class
   finding, never papered over.
3. **Never mutate shared state.** The launcher composes and execs; the only
   writes are disposable.
4. **Provisional numbers say so.** Any figure that has not cleared the benchmark
   is marked WIP on the surface that shows it.
5. **The doors are the product; the engine is the research instrument.**
6. **Discrete rungs, never a fader — and never a count.** A rung is a direction
   and a position on skill entropy.
7. **Never print a command the tool would reject.** That is exactly how the
   earlier install copy went wrong.

## Accessibility & Inclusion

Standard web accessibility (WCAG AA): legible contrast, honored
prefers-reduced-motion, keyboard-operable controls. No product-specific
assistive requirement established beyond that.
