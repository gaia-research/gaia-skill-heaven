# @skill-heaven/site — landing page prototype

> **Prototype, not the product.** This is a marketing landing page for Skill
> Heaven, kept separate from the engine (`packages/core`) and the doors
> (`packages/claude-heaven`, `packages/pi-heaven`). It ships nothing
> load-bearing and imports no product code.

Six hero variations behind a preview switcher — pick one to take forward. The
first three were hand-authored from the owner's pegs; the second three were
derived fresh through the **impeccable** design skill (see `DESIGN.md` for the
roll provenance and direction contracts).

| Route | Name | Direction |
|---|---|---|
| `#/overdrive` | **Overdrive** (v1) | Landing-page overdrive. Oversized kinetic `SKILL / HEAVEN` typeset, single oversized glass wing, angel katana, scroll-world parallax, and the signature **Heaven→Hell glitch slice** — the page inverts to black-on-white mid-scroll as Lucy falls, then heals. |
| `#/manifesto` | **Wood-Type Manifesto** | 1914 letterpress conviction. Dark-on-light "paper," oversized imperative verbs (`SUMMON THEM. / RESTRAIN. / BREAK LOOSE`), numbered ordinals, `//` ticker. A red blade slices diagonally mid-scroll and destroys the grid. One accent, no gradients, no glow. |
| `#/instrument` | **Honest Instrument** | Nixie-tube lab counter. Six CSS glass tubes glow the real standing dose (20176) on a machined chassis; `−28.9% vs native`. Interactive posture rail. Serif headline "Numbers you can summon." Proves the two-number honest-dosing / HH-Index value. |
| `#/onebit` | **One-Bit Invert** | Classic 1-bit OS desktop — dithered wallpaper, real window chrome, gated `HELL.app`. Heaven→Hell is a literal `filter: invert()`; the invert *is* the material. Strictly monochrome. |
| `#/prism` | **Prism** | Luminance / prismatic. Lucy the Skill Angel as a translucent glass-shard figure with holographic hair and a refracting halo. Reverent, ethereal, restrained color. |
| `#/default` | **Default** | White-on-black Swiss/dev-tool restraint. Typographic, negative space, one prism accent. Linear/Vercel energy. |

All variations share one content source (`src/content.ts`) and the same real,
measured token figures, so messaging stays consistent while the visual
treatment differs. Every variation shows `/skill-hell` as a locked, gated door
(P2) and never averages doses into one number.

## Run

```bash
npm -w @skill-heaven/site run dev      # dev server on :5178
npm -w @skill-heaven/site run build    # production build → dist/
npm -w @skill-heaven/site run preview  # serve the build
```

## Design system

`src/styles/tokens.css` defines the **Luminance / Prismatic** motif — a new
palette (near-black canvas, luminous white type, a refracted spectrum accent),
deliberately distinct from the research repo's pink/cyan scheme. Motifs (glass
wing, angel katana, prism halo) are pure SVG in `src/components/Art.tsx` — no
image assets, so everything scales and animates and the prototype stays
self-contained.

## Preview screenshots

`scripts/shots.mjs` captures each variation with Playwright + Chrome. Output
lands in `preview/` (gitignored). It resolves Playwright from `PW_ENTRY` if set,
else a normal `playwright` import.
