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

**One mechanic, four surfaces.** The mechanic is **summon**: a skill enters
context on demand, for one session, and nothing is installed. `/summon` is that
mechanic in its single, explicit form and it is present in every implementation
— it is the product floor.

The other three surfaces are contiguous **bands on one line** — there is a
single ladder `off · low · med · high · xhigh · max · ultra`, and the surface is
read from the current rung. Each rung sets **how much summoning is automatic**:

- **Skill Zero** — the launcher and the `off` rung. Severs the harness's skill
  catalogue to its nearest achievable zero and restores only what you name.
  Ships with `/summon` by default.
- **Skill Heaven** — the **converge** band (`low · med`). `/skill-heaven`
  auto-summons narrowly — the right few skills per capability gap.
- **Skill Hell** — the **explore** band (`high · xhigh · max`). `/skill-hell`
  casts wider. Heaven and Hell are two directions of the same summon over one
  shared MCP; they are interswitchable — a rung is just *how much* (and the
  router picks *which*) enters the skill entropy.
- **Skill Ultra** — the **crown rung** (`ultra`). `/skill-ultra` is the auto
  mode: it picks the direction and the depth per gap. No sub-ladder of its own.

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
auto-summon depth rises — not a single token-savings headline. Real measured
figures are cited as evidence, never as the claim.

## Operating Context

Used from the terminal inside a coding-agent harness. Install once; the one-liner
brings every door with it:

```
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

Then launch a door (`claude-zero` is the flagship) and drive the four commands
from inside the session. Hell also runs standalone with no launcher:
`npx --yes skill-hell@latest summon "code review" --card`.

The public site is served from `packages/site`.

## Capabilities and Constraints

- **The rungs are `off · low · med · high · xhigh · max · ultra`** on ONE line,
  discrete, never a continuous fader. The surface is read from the rung:
  `off`=Zero, `low·med`=Heaven, `high·xhigh·max`=Hell, `ultra`=Ultra. A rung
  means *how many skills may be auto-summoned per capability gap*; `off` means
  none are automatic — `/summon` still works by hand.
- **Auto-summon depth per rung is PROVISIONAL (WIP).** The working mapping is
  `off 0 · low 1 · med 2 · high 3 · xhigh 4 · max 5`, chosen to sit inside the
  shipped summon tool's own `limit` range. **These numbers do not land until the
  benchmark does** and every surface that shows them must say so.
- **Defaults:** `/skill-heaven` opens at `low`; `/skill-hell` opens at `high`.
  Both provisional on the same footing as the numbers above.
- **Skill Ultra is the crown rung.** It is the auto controller over the whole
  line — no slider, no sub-ladder of its own; it sits at the top as `ultra`.
- **Never mutate shared state:** compose + exec only; writes confined to a
  disposable mkdtemp session dir.
- **Heaven/Hell stamps are not built yet.** Routing eligibility today falls back
  to relevance ranking; Skill Heaven will consume the stamps when they land. Do
  not present stamp-gated routing as running.
- **Free.** The doors, the engine, and the MCP transport cost nothing. No paid
  tier, metering, or enterprise pricing has shipped.
- Per-harness support varies: `claude-zero` is the flagship; `pi-zero`,
  `codex-zero`, `hermes-zero`, `grok-zero` exist as prototypes.
- **WORK IN PROGRESS · v0.** The doors are source-delivered through `install.sh`,
  not npm. The site carries a standing WIP disclosure in the chrome and footer.

## Brand Commitments

- Name: **Skill Heaven** (umbrella). Surfaces: **Skill Zero · Skill Heaven ·
  Skill Hell · Skill Ultra**. System verb: **summon**.
- Door names end in `-zero`: `claude-zero`, `pi-zero`, `codex-zero`,
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
- Real, working install and launch commands (see Operating Context).
- `@gaia-research/mcp` is published; the `skill-hell` npm alias works cold
  through `npx`. The `*-zero` doors are not on npm by design.
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
6. **Discrete rungs, never a fader.**

## Accessibility & Inclusion

Standard web accessibility (WCAG AA): legible contrast, honored
prefers-reduced-motion, keyboard-operable controls. No product-specific
assistive requirement established beyond that.
