# GEN-02 — Heaven alternate homepage master

## Generation receipt

- Model: `gpt-image-2` via built-in image generation.
- Paid calls for this job: exactly 1.
- Authority inputs:
  - `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` — canonical identity and state sheet.
  - `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` — saturated skin, hair, and ribbon rendering authority.
  - `packages/site/src/assets/hero-commission/v01/sword.png` — approved steel katana construction.
  - `packages/site/src/assets/hero-commission/v01/wing-left.png`
  - `packages/site/src/assets/hero-commission/v01/wing-right.png` — approved shard-wing language.
- Tool-native raw: `/Users/marcotiongson/.codex/generated_images/019ff288-fe59-7a63-a526-b2b89b585f2c/exec-61d265c4-1314-4128-b03c-763f81c4d971.png` (1402×1122, opaque chroma result).
- Preserved raw: `packages/site/assets/workbench/lucy/GEN-02/raw-gpt-image-2.png`.
- Backup: `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-02/raw-gpt-image-2.png`, made by `scripts/assets/backup-lucy-pngs.sh` immediately after the raw landed.

## Exact prompt

```text
Use case: stylized-concept
Asset type: isolated full-body premium website hero master, GEN-02 Heaven Lucy
Input images: Image 1 is the canonical character sheet and exact identity/state authority; Image 2 is the original rendering and lighting authority; Image 3 is the approved steel katana construction reference; Images 4 and 5 are approved shard-wing language references.
Primary request: Create one isolated, complete, full-body Heaven Lucy (one young adult woman) for an alternate cinematic desktop homepage master. Follow the supplied authorities exactly. She is the same Lucy: slender anime proportions, porcelain skin with saturated cyan/pink reflected lighting and deep navy modeled shadows, shoulder-length silver-white hair, dark Japanese sailor uniform with a prismatic chest ribbon, and bare feet. Her unique graceful falling/floating pose must not be mistaken for Ultra: her body moves downward while hair and ribbon flow strongly upward. Both eyes are open luminous blue/cyan/white diamond apertures with faint spectral edges. She holds exactly one physically real steel Japanese katana, fully visible and anatomically held, with a curved steel blade, dark wrapped handle, dark saya where visible, and restrained antique-gold hardware. Ordered symmetric-to-near-symmetric wing clusters consist only of saturated blue/cyan prismatic glass shards with brilliant white highlights and clear negative space; never feathers, membranes, bird anatomy, or armor. Preserve generous composition space to her right for layout. No gold and no red tear.
Scene/backdrop: a perfectly flat, uniform #00FF00 chroma-key background for deterministic background removal; no transparent glass is green.
Style/medium: premium full-body anime illustration matching the approved character sheet and original visual reference, crisp silhouette, detailed hair optics, high-frequency glass facets, clean anatomy, legible hands, feet, and weapon.
Composition/framing: complete full silhouette with generous padding, no environment, no ground, no cast/contact shadow; nothing may be cropped including hair, toes, sword, or shards.
Text (verbatim): ""
Constraints: no text, labels, watermark, signature, frame, border, UI, extra characters, horns, crown, boots, heavy jewelry, fantasy weapon redesign, biological wings, or opaque fantasy armor. Keep #00FF00 out of the subject and do not add green bounce, gradient, texture, reflection, floor plane, or lighting variation to the background.
```

## Deterministic output and alpha audit

`node scripts/assets/lucy-gen01-02-export.mjs` performs the local #00FF00 key, despill, lossless WebP exports, crops, desktop composition, and preview generation. It never makes a model call.

- Workbench alpha intermediate: `packages/site/assets/workbench/lucy/GEN-02/cutout-alpha.png` — 1402×1122 RGBA; 1,215,892 fully transparent pixels; 73,825 partially transparent pixels; 0 hidden-RGB pixels where alpha is zero.
- Normal checker audit: `packages/site/assets/workbench/lucy/GEN-02/alpha-normal-checker.png`.
- Inverted checker audit: `packages/site/assets/workbench/lucy/GEN-02/alpha-inverted-checker.png`.
- Machine-readable audit: `packages/site/assets/workbench/lucy/GEN-02/alpha-audit.json`.
- The production WebPs reopen with alpha and retain the same transparent/partial pixel counts. Decoders may expose undefined RGB below a fully transparent WebP pixel; the inspected cutout PNG has zero hidden RGB and neither normal nor inverted preview shows a matte or green fringe.

## Production outputs

- `packages/site/src/assets/lucy/hero/lucy-heaven-alternate.webp` — 1402×1122, lossless alpha.
- `packages/site/src/assets/lucy/hero/lucy-heaven-desktop-wide.webp` — 2560×1080, dark Heaven plate with clear copy space on the right.
- `packages/site/src/assets/lucy/states/lucy-heaven.webp` — 1402×1122, lossless alpha.
- `packages/site/src/assets/lucy/states/panels/lucy-heaven-panel.webp` — 1024×1280 (4:5), lossless alpha.
- `packages/site/src/assets/lucy/backgrounds/lucy-bg-heaven-desktop.webp` — 2560×1440.
- `packages/site/src/assets/lucy/portraits/lucy-heaven.webp` — 1024×1024, lossless alpha.
- The same approved-v01 katana subset is exported by the reusable script and is listed in the GEN-01 receipt.

## One-pass self-review

- [x] Same canonical Lucy: silver-white upward hair, dark sailor uniform, prismatic ribbon, and bare feet.
- [x] Heaven gate: unique controlled falling pose, two open blue diamond eyes, one visible steel katana, ordered blue/cyan disconnected shards, no gold, no red tear, no inversion.
- [x] No text, labels, signature, watermark, frame, or UI.
- [x] Full visible silhouette, hair, toes, sword, and shard field in the raw.
- [x] Real alpha after deterministic keying; normal and inverted checker previews are visually free of chroma matte.
- [x] Required assigned dimensions and paths verified; production WebPs reopen.
- [x] Raw PNG preserved and backed up as-is.
- [!] Constraint note: the raw Heaven wing field reaches further right than the ideal source composition. The deterministic 2560×1080 plate places Lucy at left and retains a clear right copy area; no new generation was requested.
- [!] Blocked: no defensible independent `hair/upward` component crop can be separated from the head/body from this flattened one-shot master. No attempt was made to fabricate a layer.
- [!] Blocked: sheathed/saya-specific katana assets are not derivable from the approved unsheathed sword reference and were not exported.
