# Evidence: #267 — Safari / WebKit compositing for Lucy Zero, Hell, and Ultra

## Scope & Playwright WebKit vs real Safari

Playwright WebKit (`27.2`) runs headless WebKit on macOS and **is not real macOS Safari**:

- **Reproduced in Playwright WebKit:** All sidecar alpha-corruption symptoms on Zero, Hell, and Ultra (Hero A `/` and `/landing` `LucyStage`) reproduced identically to the issue report, and a WebGL2 texel readback probe confirmed that `OffscreenCanvas.transferToImageBitmap()` in `predecode.worker.ts` dropped alpha premultiplication in WebKit (`2,288` non-zero RGB pixels at `alpha === 0` on `ultra-eye-glow-48.png`; `2,668` on `hell-lid-glow-22.png`, max channel `255`), while Chromium matched `HTMLImageElement` (`0` diffs).
- **Not reproduced in Playwright WebKit:** The sharp rectangular `drop-shadow(...)` bounding-box cutoff around `.lucy-rive` in Ultra did **not** appear in headless Playwright WebKit (it depends on real macOS Safari's CoreAnimation compositor layer clipping over an overflowing `<canvas>`), and Hell's CSS atmosphere rings (`.la-l--hell-ring-a > i`, `.la-l--hell-ring-b > i`) rendered smoothly in Playwright WebKit even with `?lucy=off`. **Real Safari still needs a founder visual check after merge.**

## Cause-to-Fix Isolation

Each proposed fix was applied alone and captured before combining:

1. **Fix 1 (kept) — Premultiply in `predecode.worker.ts` via `createImageBitmap(..., { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'default' })`**
   - *Isolated run:* Removed all Zero, Hell, and Ultra alpha-bleed corruption in WebKit on both `/` and `/landing` (Zero aura/silhouette steps, Hell jagged hair/aura boundary + red/orange eyelid blob, Ultra rainbow halo + square cutout + blown-out eye disc).
   - *Why no UA sniff:* `createImageBitmap(..., { premultiplyAlpha: 'premultiply' })` keeps Chromium, WebKit/Safari, and Firefox on the worker predecode path. In both Playwright WebKit and Chromium, it produced zero unpremultiplied alpha bleed (`0` non-zero RGB texels at `alpha === 0`; at most 1 LSB rounding/truncation difference vs `HTMLImageElement`). Firefox runtime parity was not tested here (no Firefox browser binary is installed in the local Playwright cache) and rests on `createImageBitmap(..., { premultiplyAlpha: 'premultiply' })` specification support. `predecoded.ts` drops the unused `OffscreenCanvas` gate in favor of `createImageBitmap`.
2. **Fix 2 (kept) — Strip `drop-shadow(...)` from `.lucy-rive` via `stripDropShadow()` in `LucyRiveFigure.tsx`**
   - *Isolated run:* Removed the CSS `drop-shadow(0 0 26px rgba(255,210,74,0.42))` filter from `.lucy-rive` (`boxFilter` became `saturate(1.06) brightness(1.03)`) without affecting alpha corruption (confirmed Fix 1 owns the alpha symptoms) and without regressing Ultra's visual glow (the Rive rig renders its own golden aura/energy layers).
   - *Why in `LucyRiveFigure.tsx`:* Commit `dcc7fbd` (#268) added a second `LucyRiveFigure` consumer in `packages/site/src/surfaces/refractions/LucyStage.tsx` (`LIVE_FILTER.ultra`) alongside `VariationHeroA.tsx`. Stripping `drop-shadow(...)` with balanced parenthesis scanning in `LucyRiveFigure.tsx` fixes both surfaces, avoids leaving a dangling `)` from nested `rgba(...)`, and leaves static `<img>` fallback filters intact (`VariationHeroA`, `VariationHeroB`, `LucyStage`).
3. **Fix 3 (dropped) — Widen `.la-l--hell-ring-a/b` `radial-gradient` mask stops in `atmosphere.css`**
   - *Isolated run:* Applying Fix 3 alone left Hell's jagged circular aura boundary completely unchanged. Applying Fix 1 alone removed it completely — proving that the "jagged circular clipping boundary around the character's aura/hair" was `hell-aura-37.png` from Cause 1, not the CSS atmosphere rings. Inspecting Hell with `?lucy=off` confirmed `.la-l--hell-ring-a/b` is already smooth and antialiased in WebKit. Dropped to avoid altering `atmosphere.css` unnecessarily.

## Symptom Matrix

| State & Surface | Symptom | Engine | Before | After | Fix |
|---|---|---|---|---|---|
| Heaven (Hero `/`) | Baseline (no corruption; regression check) | WebKit | [before](before/webkit-dsf1-hero-heaven.png) | [after](after/webkit-dsf1-hero-heaven.png) | None needed (no regression) |
| Heaven (`/landing`) | Baseline (no corruption; regression check) | WebKit | [before](before/webkit-dsf1-landing-heaven.png) | [after](after/webkit-dsf1-landing-heaven.png) | None needed (no regression) |
| Heaven (Hero `/`) | Baseline (no corruption; regression check) | Chromium | [before](before/chromium-dsf1-hero-heaven.png) | [after](after/chromium-dsf1-hero-heaven.png) | None needed (no regression) |
| Zero (Hero `/`) | Stepped/posterized white-grey head aura & lower silhouette box | WebKit | [before](before/webkit-dsf1-hero-zero.png) | [after](after/webkit-dsf1-hero-zero.png) | Fix 1 (`predecode.worker.ts`) |
| Zero (`/landing`) | Stepped/posterized aura & dark edges | WebKit | [before](before/webkit-dsf1-landing-zero.png) | [after](after/webkit-dsf1-landing-zero.png) | Fix 1 (`predecode.worker.ts`) |
| Zero (Hero `/`) | Clean baseline (parity check) | Chromium | [before](before/chromium-dsf1-hero-zero.png) | [after](after/chromium-dsf1-hero-zero.png) | Fix 1 (worker parity) |
| Hell (Hero `/`) | Jagged aura/hair boundary (`hell-aura-37.png`) & red/orange eyelid blob (`hell-lid-glow-22.png`) | WebKit | [before](before/webkit-dsf1-hero-hell.png) | [after](after/webkit-dsf1-hero-hell.png) | Fix 1 (`predecode.worker.ts`; Fix 3 dropped) |
| Hell (`/landing`) | Rainbow body/aura bleed & red/orange eyelid blob | WebKit | [before](before/webkit-dsf1-landing-hell.png) | [after](after/webkit-dsf1-landing-hell.png) | Fix 1 (`predecode.worker.ts`) |
| Hell (Hero `/`) | Clean baseline (parity check) | Chromium | [before](before/chromium-dsf1-hero-hell.png) | [after](after/chromium-dsf1-hero-hell.png) | Fix 1 (worker parity) |
| Ultra (Hero `/`) | Rainbow hair/wing halo, upper-left alpha cutout, blown-out right-eye disc (`ultra-eye-glow-48.png`) | WebKit | [before](before/webkit-dsf1-hero-ultra.png) | [after](after/webkit-dsf1-hero-ultra.png) | Fix 1 (`predecode.worker.ts`) |
| Ultra (`/landing`) | Rainbow halo/eye disc + `drop-shadow` on overflowing `.lucy-rive` box | WebKit | [before](before/webkit-dsf1-landing-ultra.png) | [after](after/webkit-dsf1-landing-ultra.png) | Fix 1 + Fix 2 (`LucyRiveFigure.tsx`) |
| Ultra (Hero `/`) | Rectangular `drop-shadow` box clip on overflowing `<canvas>` (not reproduced in headless WebKit; real Safari CoreAnimation behavior) | Real Safari (structural fix) | N/A (not captured; Playwright WebKit only) | N/A (needs founder check in real Safari) | Fix 2 (`stripDropShadow` in `LucyRiveFigure.tsx`) |
| Ultra (Hero `/`) | Clean baseline (parity check) | Chromium | [before](before/chromium-dsf1-hero-ultra.png) | [after](after/chromium-dsf1-hero-ultra.png) | Fix 1 + Fix 2 (static `<img>` filter intact) |

*(Note: `1x` and `2x` DPR captures were both verified in Chromium and WebKit; `1x` 800px-wide PNGs are committed here to keep repository assets compact.)*

## Commands Run

```bash
npm test
npm run typecheck
npm run build --prefix packages/site
PLAYWRIGHT_MODULE=<path-to-playwright> npm run e2e --prefix packages/site
```
