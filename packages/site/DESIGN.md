# DESIGN.md — Skill Heaven landing prototype

> **Persona note (N7, 2026-08-06).** The figure named **Lucy** throughout this
> internal doc is the line's **internal working name only**. Its design is
> final, but the **public name is reserved and undecided** — never hard-code it
> in shipped copy or user-facing code. **Milim is the Gaia Research lab mascot,
> not this line's persona.**

> **Prototype, not the product.** Eight hero variations behind a preview
> switcher (`src/components/Switcher.tsx`). All share one content source
> (`src/content.ts`) and the real, measured token figures — messaging stays
> constant while the visual world changes per route. The exception is Hero
> A/B (below): a separately-authored design-tool prototype with its own
> copy and its own risk-ladder framing, ported in as-is rather than rebuilt
> against `content.ts`.

## How the newer three were derived (impeccable provenance)

The first three routes (`/overdrive`, `/prism`, `/default`) were hand-authored
from the owner's concept pegs. The **second three** (`/manifesto`,
`/instrument`, `/onebit`) were derived through the **impeccable** design skill
(`.github/skills/impeccable/`, v4.0.4), fresh from the same pegs with **no
anchor to v1**, at the owner's request: *"I want to see from fresh start how
impeccable will use our pegs."*

- **The roll** — `concept-seed.mjs --scope direction --mode persuade`
  (`PRODUCT.md` present): seed key **`346e6ded`**, **assigned index 6** (build a
  grounded direction, not a challenger), six catalog challengers dealt.
- **Grounded brief** — audience: aesthetic-driven early adopters; the thing to
  prove: the **Heaven ↔ Hell tension**; relationship to v1: **fully fresh**.
- **Craft bar** judged against three challenger reference cards (wood-type
  manifesto, nixie lab counter, one-bit Mac desktop). Each new direction fuses
  the grounded index-6 read with one challenger.
- **detect.mjs** (60-rule anti-slop scanner) run over all three: the only
  standing flag is the one-bit dithered-dot **wallpaper**, which is the literal
  1-bit desktop surface (the rule's own canvas/measurement exception) — kept
  deliberately. The Instrument serif was swapped off the "overused" list
  (Fraunces → Spectral) to clear its flag.

## The eight routes

`#/hero-a` is the current winner — `/` and any unmatched route redirect there
(`src/main.tsx`). Hero A/B are ported from an external design-tool prototype
(`src/variations/hero/useHeroEngine.ts` — the shared 5-act, wheel/keyboard/
touch-driven state machine both routes render), not derived from the pegs/
impeccable process described below; the other six routes are unchanged.

| Route | Name | World |
|---|---|---|
| `#/hero-a` | **Hero A · Reredos** (current winner) | Full-viewport 5-act scrollytelling piece. Centered, monumental `SKILL / HEAVEN` typeset behind Lucy, symmetric single wing, katana slash on Act III. Act V hands off to a live 7-rung risk ladder (OFF..MAX, ULTRA sealed past the firebreak) driving Heaven/Hell/Ultra. |
| `#/hero-b` | **Hero B · Guillotine** | Same engine as Hero A, asymmetric frame-cropped layout: Lucy bleeds off the bottom-right corner, edge-to-edge `HELL` wordmark, vertical rail labels ("COMPOSED · NOT INSTALLED" / "SLASH TO SUMMON"). |
| `#/overdrive` | **Overdrive** (v1, prior winner) | Kinetic `SKILL / HEAVEN` typeset, glass wing, angel katana, scroll-world parallax, Heaven→Hell glitch slice. |
| `#/manifesto` | **Wood-Type Manifesto** | 1914 letterpress conviction. Dark-on-light "paper." Oversized imperative verbs `SUMMON THEM. / RESTRAIN. / BREAK LOOSE`, numbered ordinals (01 SUMMON / 02 ENTER / 03 GATED), `//` ticker. A red blade slices diagonally mid-scroll and **destroys the grid** — restraint vs the fall. One accent (a single warm red), no gradients, no glow. |
| `#/instrument` | **Honest Instrument** | Nixie-tube lab counter. Six CSS glass tubes glow the real standing dose **20176** on a machined chassis; `−28.9% vs native`. Interactive posture rail lights per-posture readouts. Serif headline "Numbers you can summon." Proves the **two-number honest-dosing / HH-Index** value. Amber-on-black, reverent; Hell = a cold tamper flicker. |
| `#/onebit` | **One-Bit Invert** | Classic 1-bit OS desktop. Dithered wallpaper, real window chrome (`HEAVEN.app`, `PROJECTS`, `POSTURES` control panel, `WELCOME.md`), desktop icons, gated `HELL.app` (a locked door raising a 1-bit alert dialog). Heaven→Hell is a **literal `filter: invert()`** — the invert *is* the material. Strictly monochrome. |
| `#/prism` | **Prism** | Luminance / prismatic. Lucy as a translucent glass-shard figure, holographic hair, refracting halo. |
| `#/default` | **Default** | White-on-black Swiss restraint. One prism accent. |

**Known deviation:** Hero A/B render Lucy from a raster image
(`src/assets/lucy-hero.jpg`) rather than the pure-SVG `Art.tsx` primitives
every other route uses. That breaks the "no external image assets" rule
`Art.tsx` states for the rest of the set; kept as an explicit, owner-approved
exception for these two routes rather than silently ported past review.

## Shared contract

- `src/content.ts` — `HEADLINE`, `HARNESSES`, `POSTURES` (real two-number
  doses: floor 19,661 tok; product-floor 20,176 tok / −28.9% vs native),
  `COMMANDS` (`/skill-heaven` · `claude-heaven` · `/skill-hell`), `CTA`.
- `src/styles/tokens.css` — the Luminance/Prismatic tokens (deliberately **not**
  the research-repo pink/cyan). Each variation may override locally; every
  selector is scoped under a per-variation root (`.vo .vm .vi .vb .vp .vd-…`) to
  prevent cross-variation CSS collisions.

## Product-truth guardrails honored across all six

- `/skill-hell` is shown in **every** variation as a **locked, gated** door —
  never an activator (P2).
- The launcher story is **compose + exec, never mutate shared state** (P3) —
  reflected in the "Composed, Not Installed" / "nothing mutated" copy.
- Doses are always **two numbers**, never averaged into one.
- No fabricated testimonials, logos, pricing, or counts. Token figures are the
  real measured benchmark results.

## Regenerate the previews

```bash
npm -w @skill-heaven/site run dev            # :5178
# then, with Playwright resolvable (PW_ENTRY or an installed `playwright`):
node packages/site/scripts/shots.mjs         # the original three
node packages/site/scripts/shots-new.mjs     # the newer three
```

Output lands in `packages/site/preview/` (gitignored — regenerate locally).
