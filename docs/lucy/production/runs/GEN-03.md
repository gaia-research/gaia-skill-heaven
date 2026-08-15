# GEN-03 — Zero canonical master

Status: produced from the single permitted call; deterministic extraction and exports complete.

## Paid generation receipt

- Model: `gpt-image-2`
- Paid calls: 1 (no variations, no regeneration)
- Authority inputs:
  - `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` — SHA-256 `0bbce5d34ad3fca16cc0b835b6daca7a35868e4abb0ac89ba626a97d5adf5894`
  - `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` — SHA-256 `4e1609df1de28a67b5e8d4f45f3a0b8a70c7fec02f8ab4ff597185cc1450c973`
- Built-in generation artifact retained at: `/Users/marcotiongson/.codex/generated_images/019ff289-2681-7752-b47c-a70e8a020bfd/exec-e1a8cd4c-a698-4ce2-8d6d-3273665b35e9.png`
- Preserved raw: `packages/site/assets/workbench/lucy/GEN-03/lucy-zero-raw.png` — 1024×1536 RGB PNG, SHA-256 `08dd8dba531f562f770ccdb57c33f47a76350ac9decb2215ef270fbd2689760d`
- Backup: `scripts/assets/backup-lucy-pngs.sh` ran after the raw and alpha PNGs landed; the as-is raw is present under `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-03/`.

## Exact prompt

```text
Use case: stylized-concept
Asset type: canonical Zero state master for the Skill Heaven website.
Input images: Image 1 is the approved Lucy canonical character sheet and state/costume/anatomy authority; Image 2 is the original Lucy rendering-style authority. Match both faithfully. Do not copy any text from them.
Primary request: Create exactly one isolated, complete full-body premium anime illustration of Lucy in the ZERO state, front three-quarter view, seated in a quiet calm zen pose. She is the same young adult woman as the references: slender lightweight anatomy, shoulder-length silver-white hair, pale porcelain skin with controlled saturated cyan/pink reflected light and deep navy shadow structure, dark near-black Japanese sailor uniform with broad sailor collar, long sleeves and short pleated skirt, a prismatic cyan chest ribbon, and naturally bare feet. Both eyes closed in a quiet neutral expression. Normal gravity: hair hangs naturally around her head and shoulders; ribbon is calm. Exactly one traditional real-steel Japanese katana with curved steel blade, dark wrapped handle, dark saya and restrained brass/antique-gold hardware rests horizontally across her lap or directly in front of her hands.
Scene/backdrop: perfectly flat solid #00FF00 chroma-key background for deterministic removal. No shadows, floor plane, gradients, texture, reflections, green bounce, or green glass.
Style/medium: polished detailed anime character painting, clean anatomy, crisp silhouette, same saturated optical treatment and hair structure as the authorities.
Composition/framing: full silhouette centered with generous padding; all hair, hands, toes, ribbon and the full katana visible, nothing clipped.
Constraints: absolutely no wings, glass shards, halo, feathers, membranes, floating debris, gold accents, tears, extra weapons, armor, boots, horns, crown, text, labels, watermark, signature, frame, border, or UI. No biological wings. No other people.
Transparency instruction: the intended production subject must be removable to real alpha from this one result; keep all subject edges clean against the flat #00FF00 field.
```

## Deterministic processing and outputs

`node scripts/assets/lucy-gen03-04-export.mjs` performed chroma extraction, white/silver edge unmixing, a three-pixel boundary-only green despill, resize/crop exports, and checkerboard audits. The raw and intermediate remain workbench-only.

| Output | Dimensions | Alpha |
|---|---:|---|
| `packages/site/assets/workbench/lucy/GEN-03/lucy-zero-alpha.png` | 1024×1536 | real mixed alpha, transparent corners |
| `packages/site/src/assets/lucy/states/lucy-zero.webp` | 1024×1536 | real mixed alpha, transparent corners |
| `packages/site/src/assets/lucy/states/panels/lucy-zero-panel.webp` | 1024×1280 (4:5) | opaque dark presentation panel |
| `packages/site/src/assets/lucy/portraits/lucy-zero.webp` | 1024×1024 | real mixed alpha |
| `packages/site/src/assets/lucy/backgrounds/lucy-bg-zero-desktop.webp` | 2560×1440 | opaque deterministic background |
| `packages/site/assets/workbench/lucy/GEN-03/audit/lucy-zero-normal-checkerboard.webp` | 1024×1536 | normal-preview audit |
| `packages/site/assets/workbench/lucy/GEN-03/audit/lucy-zero-inverted-checkerboard.webp` | 1024×1536 | inverted-preview audit |

## One-pass raw self-review and final audit

- Raw reviewed exactly once with `view_image` before processing.
- Same canonical Lucy / dark sailor uniform / ribbon / bare feet: pass.
- Zero pose and physics: seated, closed eyes, gravity-down hair, one horizontal steel katana: pass.
- Forbidden state effects: no wings, shards, halo, debris, gold, tear, or second weapon: pass.
- Framing: full silhouette, toes, hands, hair, and katana inside the raw frame: pass.
- Raw had the requested flat green field; deterministic alpha extraction initially exposed a green fringe in inverse preview. The exporter was corrected locally (no generation) with silver-edge unmixing plus a three-pixel boundary-only despill. Final normal and inverted checkerboard audits show real alpha, transparent corners, and no green matte/halo: pass.
- No text, watermark, signature, frame, or UI: pass.

## Honest blocked items

No isolated neutral-hair, ribbon, eye, tear, or wing components were exported. GEN-03 is a single merged character render; those sub-elements cannot be isolated without speculative segmentation or repainting, which this job does not permit.
