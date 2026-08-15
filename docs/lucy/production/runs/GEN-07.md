# GEN-07 — Wing and shard component atlas receipt

Status: exported from the one permitted one-shot generation. No regeneration or variation was requested.

## Paid call

- Model: `gpt-image-2` (generation metadata: `gpt-image`, version `2.0`).
- Count: one paid call for this job.
- Authority inputs: `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` (canonical sheet) and `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` (rendering/light reference).
- Raw result: `packages/site/assets/workbench/lucy/GEN-07/raw/GEN-07-atlas-raw.png`
- Raw SHA-256: `d220e27e9acdad6611de435def730f6a0f5840a78190a364d6b3804297529708`
- Raw dimensions / source alpha: `1536×1024`, RGB chroma source (no alpha).

## Exact prompt

```text
Use case: stylized-concept. Asset type: modular website component atlas for the Skill Heaven runtime mascot Lucy. Input images: Image 1 is the final canonical character sheet and strict structural authority; Image 2 is the original rendering and saturated optical-lighting authority. Generate exactly one large, clean production atlas for frozen job GEN-07, gpt-image-2. Primary request: one modular component atlas with generous non-overlapping spacing: Heaven left and right ordered cyan-blue glass-shard wings; Hell left and right fragmented fully chromatically inverted glass-shard wings; Ultra left and right decisive gold-prismatic glass-shard wings; and at least 20 individual faceted glass/prism shards at clearly separated large, medium, and small sizes. Preserve the canonical wing language: independent floating geometric prism shards with large negative space, never feathers, biological wings, solid membrane, armor, or a continuous surface. Each component must be fully visible with generous padding for deterministic extraction. Scene/backdrop: a perfectly flat solid #00FF00 chroma-key field, absolutely uniform, no shadows, gradients, floor, reflection, texture, green bounce, or green glass. Style/medium: premium crisp anime optical illustration, strong white/cyan/electric blue prismatic highlights, controlled violet refraction for Heaven; fully inverted dark/crimson/hot-pink spectrum for Hell; exclusive gold interference for Ultra. Composition/framing: clean atlas, components isolated with wide blank separation, no touching or overlaps. Constraints: no Lucy body, face, anatomy, hands, character, swords, labels, text, numbers, border, frame, UI, watermark, signature, or drop shadows; every wing and shard fully inside canvas; do not use #00FF00 in any component.
```

## Deterministic processing and outputs

`scripts/assets/lucy-gen07-08-export.mjs` uses the fixed non-overlapping atlas boxes and the chroma remover with `#00ff00`, soft matte `12..220`, and despill. It retained:

- Alpha intermediate: `packages/site/assets/workbench/lucy/GEN-07/intermediate/GEN-07-atlas-alpha.png` (`1536×1024`, alpha; SHA-256 `3d4b8ff04651e587824439b9a7ae71fc9fa7d8514f58dd5c1a7697c0b52547f2`).
- Normal/inverted checker previews: `.../GEN-07-atlas-alpha-checker-normal.png`, `.../GEN-07-atlas-alpha-checker-inverted.png`.
- Six wing sides: `components/wings/lucy-wing-{heaven,hell,ultra}-{left,right}.webp`, dimensions Heaven `286×416` / `270×416`; Hell `240×430` / `235×430`; Ultra `252×430` / `276×430`.
- Assembled wing pairs: `components/wings/lucy-wing-{heaven,hell,ultra}-pair.webp`, dimensions `604×416`, `523×430`, `576×430`.
- Twenty isolated shards: `components/shards/lucy-shard-{01..20}.webp`; plus `lucy-shard-cluster-{heaven,hell,ultra}.webp` (`520×570`, `500×570`, `500×570`).
- Wing/ribbon source and pair mapping: `components/wings/lucy-gen07-08-assembly-manifest.json`.

All final WebPs re-opened with an alpha channel; there are no opaque final WebPs in this family.

## One-pass self-review

The raw atlas was visually reviewed exactly once before processing. Passed: no character/anatomy/text/UI/borders; all three state wing pairs are visibly separate glass-shard systems; Heaven reads cyan-blue and ordered, Hell reads fragmented/inverted pink-dark, Ultra reads gold; well over twenty separate shard forms are available. The chrome background was flat enough for deterministic removal. Normal and inverted checker previews were generated for edge auditing; alpha-pixel verification found 1,144,066 fully transparent pixels and 79,892 antialiased edge pixels, with alpha surviving final WebP re-open.

Blocked / not claimed: model output is a flattened atlas, not layered PSD/CLIP source. It cannot provide authored per-shard material layers beyond the deterministic crops, and it does not cover Lucy body, uniform, hair, eyes, weapon, tear, or lighting layers because GEN-07 explicitly excludes them.

## Backup

`scripts/assets/backup-lucy-pngs.sh` ran after the raw, intermediate, and preview PNGs landed. The as-is raw is present under `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-07/raw/GEN-07-atlas-raw.png`.
