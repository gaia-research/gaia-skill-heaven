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

Skill Heaven governs an AI agent's **skill entropy** — the disorder a skill
loadout adds to a session's context (N11). The whole product is one **entropy
ladder** (`off · low · med · high · xhigh · max · ultra`): a clean, low-entropy
context at the bottom, a rich, high-entropy one at the top, with quality and
cost rising together as you climb. It composes a benchmarked skill surface at
launch — nothing installed permanently, nothing mutated, nothing left behind.
Success is a visitor understanding, in seconds, that they can summon exactly the
skills they need for a session and otherwise run at a measured, honest `off`
(the product-floor).

## Positioning

The thesis is the **entropy curve** — how quality and cost move together along
the skill-entropy axis (N11/B6) — *not* a single token-savings headline. Real
measured figures are cited as evidence, never as the claim. The mechanism a
neighbor can't truthfully copy: a per-skill **Hell/Heaven (HH) Index** — every skill benchmarked, not guessed — plus a launcher that *composes
flags and execs; it never stashes, restores, or mutates shared state*. The only
writes live in a disposable session dir (crash-safe by construction). Doses are
always reported as two numbers (standing, paid every session; invocation, paid
on invoke), never averaged into one.

## Operating Context

Used from the terminal inside a coding-agent harness. Install a per-harness
"door" (Claude's is the flagship `claude-heaven`; Pi is the vanguard; Codex and
others are recipe-track). Invoke `/skill-heaven` to summon a posture; launch
`claude-heaven` to enter; `/skill-hell` is a visible but **locked** door. The
public site lives at **`skill-heaven.dev`**, served from `packages/site` inside
the `skill-heaven` monorepo (N12).

## Capabilities and Constraints

- **The entropy ladder:** one axis measuring skill entropy —
  `off · low · med · high · xhigh · max · ultra`. Heaven is the low-entropy
  region (`off · low · med`), Hell the high-entropy region (`high · xhigh ·
  max`), `ultra` above; up the ladder quality and cost rise together (N11).
  Mode (Heaven / Hell / Ultra) is a *region* of the ladder, not a second dial.
  The rungs are discrete, never a continuous fader.
- **User-facing postures:** product-floor (`off` — the cleanest *launchable*
  posture, +515 tok, −28.9% vs native) → curated (a clean base plus a
  hand-picked fraction of your own skills) → native (nothing composed; exiting
  Heaven is just switching back). The absolute-zero benchmark `floor` is an
  internal ruler only — never a user-facing row or choice (P8).
- **Hell is mixture-of-agents for skills, and gated (P2):** the hell lane
  routes through **gaia mcp** — the deterministic router (D5) — so more
  summoned skills means more experts in context: better but costlier, raising
  skill entropy until it isn't worth it. Every surface hard-errors on
  high|xhigh|max (and ultra); `/skill-hell` is a locked door shown in all
  modes, not an activator.
- **Never mutate shared state (P3):** compose + exec only; writes confined to a
  disposable mkdtemp session dir.
- **Free, with `gaia mcp` bundled (C1/C2):** the doors, the engine, and the
  `gaia mcp` transport cost nothing; `gaia mcp` defaults to the Gaia Skill Tree
  as its skill source, no configuration required. Custom / private (non-Gaia)
  skill trees are a separate, in-progress enterprise product paywalled per MCP
  usage (C4, working name reserved); whether the free tier is metered is
  deliberately undecided (C3) — no paywall sits on the free path.
- Per-harness support varies: Claude/Pi have probed clean surfaces; Codex is
  recipe-track (mechanism proven, surface not yet a clean floor); Grok refuses
  rather than guesses.
- WORK IN PROGRESS: not yet published to npm; hell lane not yet open.

## Brand Commitments

- Name: **Skill Heaven**; system verbs **summon** (skills), **enter** (a door),
  **break loose** (hell, when it opens).
- Persona/figure: **the Skill Angel (public name reserved)** — the line's own
  persona, distinct from Milim (the Gaia Research lab mascot, N7). Its design is
  final: in Heaven a luminous, translucent glass-shard angel with
  prismatic/holographic detail, single oversized wing, and an angel katana; in
  Hell, a fallen-angel inversion. The public name is undecided and reserved — no
  user-facing copy or shipped code may hard-code one (N7).
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
- No customer testimonials, logos, or press exist yet — future work
  must not fabricate them. Skill Heaven and Skill Hell are **free** (C1); no paid
  tier, metering, or enterprise pricing has shipped and the free-tier meter is
  undecided (C3) — do not present any paywall as live.
- Concept art pegs for the Skill Angel (Heaven and Hell) supplied by the owner as visual
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
6. **One entropy ladder.** The user-facing control is a single skill-entropy
   axis; modes are regions of it, not a separate dial (N11). Up the ladder,
   quality and cost rise together.

## Accessibility & Inclusion

Standard web accessibility (WCAG AA): legible contrast, honored
prefers-reduced-motion, keyboard-operable controls. No product-specific
assistive requirement established beyond that.
