# GEN-06 — Face, eye, and expression atlas

## Paid generation receipt

- Model: `gpt-image-2`
- Calls: exactly one; no variations and no regeneration.
- Authority inputs supplied to the call:
  - `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` — canonical face, hair construction, sailor collar, eye motifs, expressions, and state rendering.
  - `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` — saturated porcelain skin, cyan/pink optical bounce, blue-white hair lighting, and navy-shadow reference.
- Raw one-shot PNG: `packages/site/assets/workbench/lucy/GEN-06/raw-gpt-image-2.png` (1254×1254, RGB opaque source; SHA-256 `2eae2ecb5022d428e3b75ab0807a24faf4c5afbb4fb507b33efa63082e3bd860`).
- As-is PNG backup: `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-06/raw-gpt-image-2.png`, made by `scripts/assets/backup-lucy-pngs.sh` after the raw landed.

## Exact prompt

```text
Use case: stylized-concept
Asset type: production face, eye, and expression atlas for Skill Heaven; one 3×3 grid intended for deterministic extraction.
Input images: Image 1 reference image — canonical Lucy character sheet defining the exact face, silver-white shoulder-length hair construction, sailor collar, eye motifs, expressions, and state rendering; Image 2 reference image — original Lucy rendering reference defining the saturated porcelain skin, cyan/pink optical bounce, blue-white hair lighting, and deep navy shadow treatment.
Primary request: Create exactly one clean 3×3 production atlas with nine EQUAL, clearly separated, head-and-shoulders bust cells of the same canonical original young adult woman Lucy. Every cell must use identical camera angle, head size, centered framing, hair construction, dark sailor uniform collar, and shoulders. Read the cells left to right, top to bottom exactly as follows: 1 Zero closed neutral eyes; 2 Zero eyes open with pale blank empty-glass prismatic depth and no conventional iris; 3 Heaven both eyes open with embedded luminous cyan/electric-blue/white diamond irises; 4 Hell both eyes closed with exactly one vivid red tear and full-scene chromatic inversion of skin, hair, uniform, ribbon and lighting; 5 Ultra one open gold-prismatic embedded diamond eye plus opposite closed eye with exactly one red tear, normal non-inverted rendering and exclusive gold interference; 6 curious; 7 focused; 8 restrained soft smile; 9 distant/contemplative. The last four non-state expressions should use Lucy’s neutral non-inverted silver-white hair, normal porcelain skin, dark sailor collar, and prismatic ribbon visible at chest.
Scene/backdrop: one perfectly flat, evenly lit #00FF00 chroma-key field shared behind all cells, with uniform gutters between cells. No borders, panels, grid lines, labels, text, UI, shadows, gradients, reflections, or green bounce. Generous even spacing permits deterministic crop extraction; no cell overlaps another.
Style/medium: premium crisp anime character illustration precisely matching supplied authorities; shoulder-length silver-white hair with brilliant white cores, cyan/electric-blue and controlled pink-violet refraction, saturated porcelain skin bounce and deep navy shadow structure. No wings, hands, weapons, body below shoulders, or environmental scene.
Constraints: Lucy must remain recognizably the same face and outfit across all cells. No watermark, signature, frame, extra cells, color swatches, labels, characters, wings, shards, tear outside cells 4 and 5, gold outside cell 5, feathers, armor, horns, crowns, or boots. Do not use #00FF00 in Lucy or her clothing.
```

## Deterministic atlas extraction

`node scripts/assets/lucy-gen05-06-export.mjs` divides the raw at its exact 418×418 3×3 cell boundaries, removes the near-green chroma field, verifies lossless alpha after WebP re-open, and writes normal/inverted checkerboard audits. The ignored manifests at `packages/site/assets/workbench/lucy/GEN-{05,06}/export-manifest.json` retain the deterministic source/output mapping.

| Group | Outputs at validation | Alpha result |
| --- | --- | --- |
| Expressions | `components/expressions/lucy-expression-01.webp` through `lucy-expression-09.webp` | 01: 329×418; 02–08: 328×418; 09: 345×418. Each min 0/max 255 and all corners alpha 0. |
| Eye state cells | `components/eyes/lucy-eyes-{zero-closed,zero-blank,heaven,hell,ultra}.webp` | 329×418 for Zero closed/Hell; 328×418 for Zero blank/Heaven/Ultra. Each min 0/max 255 and all corners alpha 0. |
| Atlas-derived portraits | `portraits/lucy-{neutral,zero,heaven,hell,ultra}.webp` | neutral/zero/hell retain their extracted cells. The shared higher-resolution Heaven and Ultra state-master portraits intentionally remain preferred at their common production paths; recoverable GEN-06 alternatives are mapped in the ignored workbench manifest. |

Normal and RGB-inverted checkerboard previews were rendered and visually inspected at:

- `packages/site/assets/workbench/lucy/GEN-06/audit/atlas-normal-checker.png`
- `packages/site/assets/workbench/lucy/GEN-06/audit/atlas-inverted-checker.png`

The same near-green-key correction as GEN-05 leaves transparent corners fully alpha-zero. The previews showed no matte field, green halo, hole, or glass/tear edge contamination.

## One-pass self-review

- [x] Raw atlas reviewed once with `view_image`; exactly nine readable, non-overlapping cells in the frozen order.
- [x] Cells 01–05 visibly provide Zero closed, Zero blank, Heaven blue diamonds, full-inverted Hell closed with one red tear, and non-inverted Ultra gold diamond plus one red tear.
- [x] All cells preserve the same Lucy, hair construction, sailor collar, and prismatic ribbon; no wings, hands, weapons, text, labels, frame, watermark, or UI.
- [x] Atlas cells extracted deterministically; production WebPs re-opened and retained mixed alpha.
- [x] Raw was backed up as-is; normal and inverted previews were visually audited.
- [!] Cell 09 is a deliberate distant/contemplative three-quarter look rather than the requested strictly identical camera angle. It is retained and exported under the one-shot policy; no regeneration is permitted.

## Blocked / deliberately not invented

- No genuinely isolated neutral-hair component exists in GEN-05/06, so `components/hair/lucy-hair-neutral.webp` is intentionally absent.
- Eye exports remain complete state cells, not speculative eye-only cutouts: the atlas has no separable eye layer and cropping/masking would damage hair, facial, and tear edges.
