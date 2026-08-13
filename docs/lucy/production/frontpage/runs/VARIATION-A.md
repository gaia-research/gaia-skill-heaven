# Front-page Variation A — Heaven Ascension

Status: materialized

## Paid generation receipt

- Model: `gpt-image-2`, via the built-in image generation tool.
- Paid calls: exactly 1.
- Raw atlas: `packages/site/assets/workbench/lucy/FRONTPAGE-A/raw/heaven-ascension-atlas-gpt-image-2-raw.png` (ignored, copied as-is to `lucy-masters-backup/`).
- Visual review: deliberately not performed for the raw atlas or production outputs, per explicit owner instruction. No image/contact-sheet/viewer was used by this worker after generation.

## Frozen prompt

```text
Use case: stylized-concept
Asset type: a single 16:9 opaque atmospheric production atlas for a premium Skill Heaven homepage, to be deterministically cropped into background and optical-effect zones.
Primary request: Create a clean edge-to-edge text-free atlas containing separated, non-overlapping visual zones. Zone 1: deep obsidian and saturated cyan-blue Heaven hero atmosphere, bright concentrated prismatic refraction positioned on the right side, broad calm dark copy space on the left. Zone 2: restrained gold-dark Ultra atmosphere, intense but controlled gold interference positioned on the left, broad dark copy space on the right. Zone 3: subtle quiet near-black Zero field. Zone 4: the exact full-scene color inverse of the Heaven atmosphere, including all optical phenomena, for Hell. Additional separated zones: cyan-blue optical caustics; gold optical caustics; prismatic ribbon sweeps; angular shard bands; sparse spectral particles; clean section-divider arcs.
Scene/backdrop: abstract optical glass and deep-space atmosphere only.
Subject: no subject.
Style/medium: high-end luminous glass refraction, premium product-art direction, deep physical-looking optical layers, clean gradients.
Composition/framing: 16:9 atlas organized into clearly separated crop-safe zones with generous clean boundaries; no grids, labels, panels, or dividers drawn between zones.
Lighting/mood: Heaven is calm, luminous, organized; Ultra is decisive, gold-dark and restrained; Zero is quiet; Hell is a strict inverted optical counterpart of Heaven.
Color palette: Heaven blue #7CC4FF; Zero cyan #37D6E0; Ultra gold #FFD24A to #F7C84B; Hell is inversion only, never a standalone flat pink palette.
Materials/textures: glass prism shards, caustics, subtle refraction, spectral particles, graceful luminous ribbon-light, opaque backgrounds.
Constraints: absolutely no character, face, body, hand, clothing, skin, hair, weapon, wings, text, logo, UI, icon, watermark, signature, letters, numbers, border, frame, or flat Hell pink. No figure silhouettes. The canvas must be fully opaque with no transparency.
```

## Source and processing contract

- Heaven, Hell, and Ultra character sources: accepted `packages/site/src/assets/lucy/v2/masters/` exports.
- Hell is copied from `v2/masters/lucy-hell.webp` as-is. Its registered complement relationship with Heaven is not recalculated or altered.
- Zero and neutral are validated v1 `states/lucy-zero.webp` and `models/lucy-neutral.webp` sources.
- The generated atlas only supplies opaque background/FX zones. It never changes character pixels.
- `scripts/assets/lucy-frontpage-a-export.py` is the reproducible deterministic exporter.
- `scripts/assets/lucy-frontpage-a-validate.py` is the mechanical-only validator.

## Produced package

- `packages/site/src/assets/lucy/frontpage/variation-a/ASSET_MANIFEST.json`
- P0: Heaven primary and Ultra alternate desktop/mobile hero composites, transparent master references, four state exports, and four panels.
- P1: five portraits, namespaced expressions/eyes, eight ribbons, six wing sides plus pairs, 20 shards plus clusters, and katana exports.
- P2: four state backgrounds, atlas-derived overlays, reused production FX, dividers, motifs, icons, avatars, and header.
- P3: OpenGraph, square, portrait, and story exports.
- Honest component gaps: `SOURCE_GAPS.json` and `components/hair/INVENTORY.json` record isolated hair, sheathed katana, and saya as unavailable rather than fabricating them.

## Mechanical validation

`docs/lucy/production/frontpage/VARIATION_A_VALIDATION.md` records successful reopening of 143 WebPs, required path/dimension checks, alpha expectations, and zero production PNGs.
