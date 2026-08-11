# GEN-04 — Hell canonical master and white plate

Status: produced from the single permitted call; user-directed deterministic full-scene inversion, alpha isolation, and exports complete.

## Paid generation receipt

- Model: `gpt-image-2`
- Paid calls: 1 (no variations, no regeneration)
- Authority inputs:
  - `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` — SHA-256 `0bbce5d34ad3fca16cc0b835b6daca7a35868e4abb0ac89ba626a97d5adf5894`
  - `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` — SHA-256 `4e1609df1de28a67b5e8d4f45f3a0b8a70c7fec02f8ab4ff597185cc1450c973`
- Built-in generation artifact retained at: `/Users/marcotiongson/.codex/generated_images/019ff289-2681-7752-b47c-a70e8a020bfd/exec-bc93f555-1475-4c02-80fc-e818ac9c96bf.png`
- Preserved raw: `packages/site/assets/workbench/lucy/GEN-04/lucy-hell-raw.png` — 1024×1536 RGB PNG, SHA-256 `d23f4b718bcbd4a74ee6be5c9677c985db6983c562c7cfd9baafa3e302153024`
- Backup: `scripts/assets/backup-lucy-pngs.sh` ran after the raw and alpha PNGs landed; the as-is raw is present under `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-04/`.

## Exact prompt

```text
Use case: stylized-concept
Asset type: canonical Hell state master and canonical white-background plate for the Skill Heaven website.
Input images: Image 1 is the approved Lucy canonical character sheet and state/costume/anatomy authority; Image 2 is the original Lucy rendering-style authority. Match both faithfully. Do not copy any text from them.
Primary request: Create exactly one complete full-body premium anime illustration of Lucy in the HELL state, a distinct unstable falling pose that cannot be mistaken for the Heaven or Ultra poses. Her body descends while shoulder-length hair and the prismatic chest ribbon flow strongly upward. She is the same young adult woman as the references: slender lightweight anatomy, naturally bare feet, dark Japanese sailor uniform with broad sailor collar, long sleeves and short pleated skirt, and one correctly scaled traditional real-steel Japanese katana with curved steel blade, dark wrapped handle, dark saya and restrained brass/antique-gold hardware. Both eyes are closed; exactly one vivid red tear descends from one eye. Her shard wings are floating, disconnected, faceted glass shards only: highly fragmented, asymmetric and visibly less controlled; never feathers or a membrane.
Scene/backdrop: a perfectly pure, uniform #FFFFFF white field, no gradients, texture, horizon, floor plane, cast shadow, contact shadow, reflection, environmental objects, text, or UI. This white field is the canonical Hell presentation plate and must make the full subject cleanly isolatable deterministically; all body parts, weapon, hair, ribbon, and shards remain fully inside the frame with generous padding.
Style/medium: polished detailed anime character painting, clean anatomy, crisp silhouette, same high-saturation original-reference optical treatment.
Color and physics: apply a genuine full-scene chromatic inversion to the entire visual world: hair, skin lighting, uniform, ribbon, steel reflections, wings and optical effects all participate. Hair is predominantly dark/black with crimson, hot-pink and complementary spectral highlights. The tear remains exactly one vivid red tear. Do not reinterpret inversion as a change of ethnicity or anatomy.
Constraints: no gold, no second sword, no open eyes, no extra tears, no armor, boots, horns, crown, biological wings, feathers, membrane, halo, text, labels, watermark, signature, frame, border, or other people. No subject clipping.
Transparency instruction: real alpha is desired if supported; otherwise preserve the perfectly flat #FFFFFF canonical plate with clean, crisp, anti-aliased edges so the same one-shot result can yield a deterministic isolated-alpha derivative. Do not place #00FF00 or any green color in the subject.
```

## Deterministic correction, processing, and outputs

Raw self-review found the first one-shot composition had the required pose, white field, closed eyes, one tear, one katana, and fragmented shards, but was **not** a genuine whole-scene inversion: it was mainly black/pink on white. On explicit user direction, `scripts/assets/lucy-gen03-04-export.mjs` flood-isolated the white background, inverted every isolated RGB pixel (hair, skin lighting, uniform, ribbon, steel reflections, shards), restored the original tear-region semantic accent to exactly vivid red (941 pixels), then recomposed the result over canonical pure white. No paid call followed.

| Output | Dimensions | Alpha |
|---|---:|---|
| `packages/site/assets/workbench/lucy/GEN-04/lucy-hell-alpha.png` | 1024×1536 | real mixed alpha, transparent corners |
| `packages/site/src/assets/lucy/states/lucy-hell.webp` | 1024×1536 | real mixed alpha, transparent corners |
| `packages/site/src/assets/lucy/states/lucy-hell-white.webp` | 1024×1536 | opaque canonical pure-white plate |
| `packages/site/src/assets/lucy/states/panels/lucy-hell-panel.webp` | 1024×1280 (4:5) | opaque pure-white presentation panel |
| `packages/site/src/assets/lucy/portraits/lucy-hell.webp` | 1024×1024 | opaque pure-white portrait |
| `packages/site/src/assets/lucy/backgrounds/lucy-bg-hell-desktop.webp` | 2560×1440 | opaque deterministic background |
| `packages/site/assets/workbench/lucy/GEN-04/audit/lucy-hell-normal-checkerboard.webp` | 1024×1536 | normal-preview audit |
| `packages/site/assets/workbench/lucy/GEN-04/audit/lucy-hell-inverted-checkerboard.webp` | 1024×1536 | inverted-preview audit |

## One-pass raw self-review and final audit

- Raw reviewed exactly once with `view_image` before processing.
- Same Lucy / sailor uniform / ribbon / bare feet / one steel katana: pass.
- Hell pose and state: distinct unstable fall, closed eyes, single red tear, fragmented asymmetric glass shards, pure-white plate: pass.
- Canon failure in raw: full-scene inversion failed. This was not hidden and was corrected deterministically under explicit user direction; no regeneration was made.
- Corrected `lucy-hell-white.webp` visually reviewed: the entire isolated visual world now inverts while the canonical presentation field stays pure white; one vivid red tear remains: pass.
- Corrected alpha derivative visually reviewed on the inverted checkerboard: transparent background is real alpha; hair, feet, katana, and shards have no white matte/halo: pass.
- No text, watermark, signature, frame, or UI: pass.

## Honest blocked items

No isolated inverted-hair, ribbon, tear-only, eye-only, or left/right wing components were exported. GEN-04 is a single merged state render; deriving them would require speculative segmentation/repainting and would not be defensible under the one-shot contract.
