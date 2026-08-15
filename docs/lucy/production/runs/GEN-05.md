# GEN-05 — Neutral reusable model master

## Paid generation receipt

- Model: `gpt-image-2`
- Calls: exactly one; no variations and no regeneration.
- Authority inputs supplied to the call:
  - `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` — canonical identity, model pose, sailor silhouette, ribbon, bare feet, and katana.
  - `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` — saturated porcelain reflected-light and hair-rendering anchor.
- Raw one-shot PNG: `packages/site/assets/workbench/lucy/GEN-05/raw-gpt-image-2.png` (1024×1536, RGB opaque source; SHA-256 `04b589fc94b6049c5332f7dd138c8c496d83069f60e2d8d06fc3d861579642aa`).
- As-is PNG backup: `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-05/raw-gpt-image-2.png`, made by `scripts/assets/backup-lucy-pngs.sh` after the raw landed.

## Exact prompt

```text
Use case: stylized-concept
Asset type: production isolated neutral reusable character master for Skill Heaven
Input images: Image 1 reference image — canonical Lucy character sheet, which defines the exact same character, proportions, sailor silhouette, eyes, ribbon, bare feet, and katana; Image 2 reference image — original Lucy rendering reference, which defines saturated porcelain skin bounce, silver-white hair light flow, deep navy shadow structure, and crisp optical treatment.
Primary request: Create exactly one premium full-body anime illustration of canonical Lucy, an original young adult woman, standing naturally in a clean front three-quarter model pose. Normal gravity. Shoulder-length silver-white hair hanging naturally. Both eyes closed in a neutral restrained expression. Dark near-black Japanese sailor blouse with broad sailor collar, long sleeves, short pleated skirt, and iridescent prismatic chest ribbon. Bare feet. One properly scaled real-steel Japanese katana, either sheathed at a low resting position or safely held low; dark wrapped tsuka, dark saya, restrained antique-gold/brass fittings. Full complete silhouette with clean anatomy, legible hands, feet and weapon.
Scene/backdrop: perfectly flat, evenly lit #00FF00 chroma-key background only, for deterministic background removal. No floor, cast/contact shadow, gradient, texture, reflection, green bounce, environmental light, or green translucent material.
Style/medium: premium high-frequency anime character illustration matching supplied authorities; luminous porcelain skin with subtle cyan and controlled pink-violet reflected light, brilliant hair cores, narrow rim highlights, deep navy shadow masses. Quiet neutral reference rendering, not a dramatic scene.
Composition/framing: vertical full body, centered with generous padding on every side; nothing cropped.
Constraints: same canonical Lucy; no wings, no floating shards, no tear, no inversion, no state aura, no fall pose, no gold interference, no armor, horns, crown, boots, feathers, biological wings, glass/energy weapon, extra limbs, text, labels, watermark, signature, frame, or UI. Do not use #00FF00 anywhere in the subject.
```

## Deterministic exports and alpha audit

`node scripts/assets/lucy-gen05-06-export.mjs` converts the near-green workbench field to alpha, despills its edges, trims transparent margin, and writes lossless-alpha WebP.

| Output | Dimensions | Alpha result |
| --- | --- | --- |
| `packages/site/src/assets/lucy/models/lucy-neutral.webp` | 692×1442 | min 0, max 255; all four corners alpha 0; SHA-256 `ddd759ff53291178fdcfc8b324ec971cf3358ae375db3a8cffa9a8035f0c07af` |
| `packages/site/src/assets/lucy/portraits/lucy-neutral.webp` | 329×418 | min 0, max 255; all four corners alpha 0; atlas-derived neutral face; SHA-256 `21944fcb266a3ae0a3ce83dce410a39ab2c26a0d3efa561f93f18655a22dd1fa` |

Normal and RGB-inverted checkerboard previews were rendered and visually inspected at:

- `packages/site/assets/workbench/lucy/GEN-05/audit/model-normal-checker.png`
- `packages/site/assets/workbench/lucy/GEN-05/audit/model-inverted-checker.png`

The initial soft matte exposed faint canvas-corner alpha because the source field was near-green rather than literal `#00FF00`. The exporter detects green-dominant near-key pixels deterministically; re-exported corners are all zero alpha. No color halo, hole, or clipped hair/steel edge was found in either preview.

## One-pass self-review

- [x] Same canonical Lucy, shoulder-length silver-white hair, dark sailor uniform, prismatic ribbon, and bare feet.
- [x] Natural gravity, closed neutral eyes, quiet standing model pose, one low sheathed real-steel katana, and no state effects.
- [x] No text, label, signature, watermark, frame, UI, crop, wing, shard, tear, gold, or inversion.
- [x] Raw reviewed once with `view_image`; production WebP re-opened after export.
- [x] Alpha, dimensions, normal preview, and inverted preview checked; raw was backed up as-is.

## Blocked / deliberately not invented

- `components/hair/lucy-hair-neutral.webp` is not exported. GEN-05 does not provide a genuinely isolated neutral-hair layer, and guessing a mask would not be defensible under the one-shot contract.
- `components/katana/lucy-katana-sheathed.webp`, `components/katana/lucy-katana-saya.webp`, and `components/katana/lucy-katana-handle.webp` are not exported. A final raw-master inspection confirms the low sheathed katana is present, but its saya runs behind Lucy's legs and the tsuba/handle junction is covered by her right hand. A clean transparent component would require fabricating the hidden geometry or cutting through anatomy. No component PNG/WebP or normal/inverted alpha audit was therefore produced; this is a deliberate block, not an omitted processing step.
