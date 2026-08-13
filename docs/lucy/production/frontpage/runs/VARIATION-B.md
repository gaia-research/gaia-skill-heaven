# Front Page Variation B — Ultra Judgment

Status: mechanically validated.

## Paid generation

- Model: `gpt-image-2`, via the built-in image-generation tool.
- Paid calls: **1 exactly**. No retry, alternate, edit, or regeneration call.
- Raw: `packages/site/assets/workbench/lucy/FRONTPAGE-B/raw/ultra-judgment-atlas-raw.png` (ignored and backed up as-is).
- Allocation: Terra High fallback. The requested Luna XHigh collaborator was not callable through the inline API; this fallback is recorded rather than mislabeled.

## Frozen prompt

```text
Use case: stylized-concept
Asset type: text-free atmospheric and optical-composition atlas for the Skill Heaven homepage, Variation B: Ultra Judgment.
Primary request: Produce exactly one clean, premium 16:9 atlas with four separated non-overlapping atmospheric zones and thin surrounding gutters, with NO raster text or labels. Zone layout must be spatially predictable: top-left = dramatic obsidian-and-gold Ultra hero plate, decisive diagonal energy, empty copy space on the left side of that zone; top-right = saturated cyan-and-blue Heaven plate, clear copy space on the right side of that zone; bottom-left = quiet near-black Zero plate with subtle cyan #37D6E0 depth; bottom-right = an unoccupied low-detail white region reserved for deterministic inversion treatment. Around the outer margin and in narrow, clearly separated strips, include only abstract optical graphics: angular gold interference, controlled cyan caustics, prismatic ribbon sweeps, disconnected glass-shard bands, sparse particles, and section-divider arcs. High-end optical glass refraction, disciplined composition, sharp premium graphic finish.
Scene/backdrop: opaque, edge-to-edge 16:9 production canvas. This is an atmosphere-only source atlas, not character art.
Color palette: Ultra gold #FFD24A to #F7C84B on obsidian; Heaven blue #7CC4FF and cyan; Zero cyan #37D6E0; black; white. No flat Hell pink.
Constraints: absolutely no character, person, face, body, limbs, clothing, hands, feet, weapon, sword, katana, wings, creature, icon, logo, UI, text, letters, numbers, watermark, signature, border, frame, or recognizable symbol. Never depict Lucy. Do not use a grid, dividers, labels, or typographic elements. The zones must be separated only by abstract negative space, not drawn panel borders. The final atlas must be clean and suitable for deterministic crops; no shadows from any character because there is no character.
```

## Deterministic materialization

- Exporter: `scripts/assets/lucy-frontpage-b-export.mjs`.
- Validator: `scripts/assets/lucy-frontpage-b-validate.mjs`.
- All Lucy-bearing outputs reuse accepted v2 Heaven/Hell/Ultra masters and validated v1 Zero/neutral assets. The atlas is used only for opaque background plates and abstract optical crops.
- The Variation B primary is Ultra and alternate is Heaven. The output set includes P0–P3 hero, state, reusable component, background, identity, and social paths under `packages/site/src/assets/lucy/frontpage/variation-b/`.
- Hell’s background is a lossless deterministic RGB complement of the generated Heaven plate. This is separate from, and does not change, the registered v2 Hell character master.

## Owner-directed review constraint

No visual review, image preview, contact sheet, or semantic self-review was performed on the raw atlas or final exports. The only gates run were mechanical file presence, WebP reopen, required dimensions, declared-alpha checks, no front-page PNG check, and exact Heaven/Hell background inversion verification.

## Source gaps retained honestly

- Separate isolated hair layers are unavailable from the accepted source set.
- Approved sheathed katana and saya assets are unavailable from the accepted source set.
- These gaps are recorded in `ASSET_MANIFEST.json`; no substitute pixels were fabricated.

## Backup

`scripts/assets/backup-lucy-pngs.sh` ran after raw-atlas landing and after deterministic export. The source PNG is preserved as-is beneath `lucy-masters-backup/`.
