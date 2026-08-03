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

Skill Heaven strips an AI agent's context bloat so it runs clean. It composes a
lean, benchmarked skill surface at launch — nothing installed permanently,
nothing mutated, nothing left behind. Success is a visitor understanding, in
seconds, that they can summon exactly the skills they need for a session and
otherwise run at a measured, honest floor.

## Positioning

The mechanism a neighbor can't truthfully copy: a per-skill **Hell/Heaven (HH)
Index** — every skill benchmarked, not guessed — plus a launcher that *composes
flags and execs; it never stashes, restores, or mutates shared state*. The only
writes live in a disposable session dir (crash-safe by construction). Doses are
always reported as two numbers (standing, paid every session; invocation, paid
on invoke), never averaged into one.

## Operating Context

Used from the terminal inside a coding-agent harness. Install a per-harness
"door" (Claude's is the flagship `claude-heaven`; Pi is the vanguard; Codex and
others are recipe-track). Invoke `/skill-heaven` to summon a posture; launch
`claude-heaven` to enter; `/skill-hell` is a visible but **locked** door.

## Capabilities and Constraints

- **Posture slider:** floor (doorless benchmark floor, the placebo-of-record) →
  product-floor (doorful, minimum control surface, +515 tok, −28.9% vs native) →
  curated (a clean room with exactly the skills you summon) → native (nothing
  composed; exiting Heaven is just switching back).
- **Hell is gated (P2):** every surface hard-errors on med|high|xhigh|max;
  `/skill-hell` is a locked door shown in all modes, not an activator.
- **Never mutate shared state (P3):** compose + exec only; writes confined to a
  disposable mkdtemp session dir.
- Per-harness support varies: Claude/Pi have probed clean surfaces; Codex is
  recipe-track (mechanism proven, surface not yet a clean floor); Grok refuses
  rather than guesses.
- WORK IN PROGRESS: not yet published to npm; hell lane not yet open.

## Brand Commitments

- Name: **Skill Heaven**; system verbs **summon** (skills), **enter** (a door),
  **break loose** (hell, when it opens).
- Mascot/figure: **Lucy, the Skill Angel** — in Heaven a luminous, translucent
  glass-shard angel with prismatic/holographic detail, single oversized wing,
  and an angel katana; in Hell, a fallen-angel inversion.
- Duality: **Heaven ↔ Hell** as the core tension — restraint vs power, the fall
  vs the discipline of not falling. Hell being *gated and visibly so* is a
  product value, not a limitation to hide.
- Voice: precise, empirical, honest about negative results; no hype claims.
- Tagline in use: "Stop installing skills. Start summoning them."
- The research repo palette (hot-pink #ff4fa3 / cyan #00e5ff) is explicitly NOT
  binding for the marketing site; a fresh visual world is wanted.

## Evidence on Hand

- Real posture token figures above (floor 19,661 tok; product-floor 20,176 tok;
  −28.9% vs native) are measured benchmark results, not marketing estimates.
- Real commands and install flows (`claude plugin marketplace add …`,
  `/skill-heaven`, `claude-heaven`, `/skill-hell`).
- No customer testimonials, logos, pricing, or press exist yet — future work
  must not fabricate them.
- Concept art pegs for Lucy (Heaven and Hell) supplied by the owner as visual
  reference; not licensed production assets — recreate motifs, don't ship the
  reference images.

## Product Principles

1. **Honest dosing.** Two numbers, always; a negative result is a first-class
   finding, never papered over.
2. **Never mutate shared state.** The launcher composes and execs; the only
   writes are disposable.
3. **Hell is gated, and visibly so.** The locked door is shown in every mode.
4. **The doors are the product; the engine is the research instrument.**
5. **Empirical before load-bearing.** Nothing ships ahead of a probe on a
   pinned harness version.

## Accessibility & Inclusion

Standard web accessibility (WCAG AA): legible contrast, honored
prefers-reduced-motion, keyboard-operable controls. No product-specific
assistive requirement established beyond that.
