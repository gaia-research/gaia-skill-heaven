# GEN-01 — Ultra primary homepage master

## Generation receipt

- Model: `gpt-image-2` via built-in image generation.
- Paid calls for this job: exactly 1.
- Authority inputs:
  - `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` — canonical identity and state sheet.
  - `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` — saturated skin, hair, and ribbon rendering authority.
  - `packages/site/src/assets/hero-commission/v01/sword.png` — approved steel katana construction.
  - `packages/site/src/assets/hero-commission/v01/wing-left.png`
  - `packages/site/src/assets/hero-commission/v01/wing-right.png` — approved shard-wing language.
- Tool-native raw: `/Users/marcotiongson/.codex/generated_images/019ff288-fe59-7a63-a526-b2b89b585f2c/exec-ad1c2d1f-6f13-446a-862a-505d4bb08b9f.png` (1536×1024, opaque chroma result).
- Preserved raw: `packages/site/assets/workbench/lucy/GEN-01/raw-gpt-image-2.png`.
- Backup: `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-01/raw-gpt-image-2.png`, made by `scripts/assets/backup-lucy-pngs.sh` immediately after the raw landed.

## Exact prompt

```text
Use case: stylized-concept
Asset type: isolated full-body premium website hero master, GEN-01 Ultra Lucy
Input images: Image 1 is the canonical character sheet and exact identity/state authority; Image 2 is the original rendering and lighting authority; Image 3 is the approved steel katana construction reference; Images 4 and 5 are approved shard-wing language references.
Primary request: Create one isolated, complete, full-body Ultra Lucy (one young adult woman) for a cinematic desktop homepage. Follow the supplied authorities exactly. She is the same Lucy: slender anime proportions, porcelain skin with saturated cyan/pink reflected lighting and deep navy modeled shadows, shoulder-length silver-white hair, dark Japanese sailor uniform with a prismatic chest ribbon, and bare feet. She falls decisively downward on a strong diagonal, while her hair and ribbon stream upward by airflow. Preserve generous clear space to her left for layout. One eye is an open luminous gold diamond iris. The opposite eye is closed and has exactly one vivid red tear. She holds exactly two matching, physically real steel Japanese katanas; both are fully visible, anatomically held, with curved steel blades, dark wrapped handles, dark saya where visible, and restrained antique-gold hardware. A powerful ordered gold-prismatic shard-wing system frames her silhouette; wings consist only of separated floating faceted glass/prism shards with clear negative space, never feathers, membranes, bird anatomy, or armor. Gold interference is exclusive to Ultra. She is never inverted.
Scene/backdrop: a perfectly flat, uniform #00FF00 chroma-key background for deterministic background removal; no transparent glass is green.
Style/medium: premium full-body anime illustration matching the approved character sheet and original visual reference, crisp silhouette, detailed hair optics, high-frequency glass facets, clean anatomy, legible hands, feet, and weapons.
Composition/framing: complete full silhouette with generous padding, no environment, no ground, no cast/contact shadow; nothing may be cropped including hair, toes, swords, or shards.
Text (verbatim): ""
Constraints: no text, labels, watermark, signature, frame, border, UI, extra characters, horns, crown, boots, heavy jewelry, fantasy weapon redesign, biological wings, or opaque fantasy armor. Keep #00FF00 out of the subject and do not add green bounce, gradient, texture, reflection, floor plane, or lighting variation to the background.
```

## Deterministic output and alpha audit

`node scripts/assets/lucy-gen01-02-export.mjs` performs the local #00FF00 key, despill, lossless WebP exports, crops, desktop composition, and preview generation. It never makes a model call.

- Workbench alpha intermediate: `packages/site/assets/workbench/lucy/GEN-01/cutout-alpha.png` — 1536×1024 RGBA; 1,241,924 fully transparent pixels; 81,388 partially transparent pixels; 0 hidden-RGB pixels where alpha is zero.
- Normal checker audit: `packages/site/assets/workbench/lucy/GEN-01/alpha-normal-checker.png`.
- Inverted checker audit: `packages/site/assets/workbench/lucy/GEN-01/alpha-inverted-checker.png`.
- Machine-readable audit: `packages/site/assets/workbench/lucy/GEN-01/alpha-audit.json`.
- The production WebPs reopen with alpha and retain the same transparent/partial pixel counts. Decoders may expose undefined RGB below a fully transparent WebP pixel; the inspected cutout PNG has zero hidden RGB and neither normal nor inverted preview shows a matte or green fringe.

## Production outputs

- `packages/site/src/assets/lucy/hero/lucy-ultra-primary.webp` — 1536×1024, lossless alpha.
- `packages/site/src/assets/lucy/hero/lucy-ultra-desktop-wide.webp` — 2560×1080, dark Ultra plate with clear copy space on the left.
- `packages/site/src/assets/lucy/states/lucy-ultra.webp` — 1536×1024, lossless alpha.
- `packages/site/src/assets/lucy/states/panels/lucy-ultra-panel.webp` — 1024×1280 (4:5), lossless alpha.
- `packages/site/src/assets/lucy/backgrounds/lucy-bg-ultra-desktop.webp` — 2560×1440.
- `packages/site/src/assets/lucy/portraits/lucy-ultra.webp` — 1024×1024, lossless alpha.
- Katana subset sourced only from approved `hero-commission/v01` artwork: `components/katana/lucy-katana-{neutral-steel,right,left,handle,dual}.webp` and `components/katana/lucy-katana-slash-01.webp` under `packages/site/src/assets/lucy/`.

## One-pass self-review

- [x] Same canonical Lucy: silver-white upward hair, dark sailor uniform, prismatic ribbon, and bare feet.
- [x] Ultra gate: decisive falling diagonal, one gold diamond eye, opposite closed red-tear eye, two visible steel katanas, ordered gold-prismatic disconnected shards, no inversion.
- [x] No text, labels, signature, watermark, frame, or UI.
- [x] Full visible silhouette, hair, toes, swords, and shard field in the raw.
- [x] Real alpha after deterministic keying; normal and inverted checker previews are visually free of chroma matte.
- [x] Required assigned dimensions and paths verified; production WebPs reopen.
- [x] Raw PNG preserved and backed up as-is.
- [!] Blocked: no defensible independent `hair/upward` or `hair/ultra` component crop can be separated from the head/body from this flattened one-shot master. No attempt was made to fabricate a layer.
- [!] Blocked: sheathed/saya-specific katana assets are not derivable from the approved unsheathed sword reference and were not exported.
