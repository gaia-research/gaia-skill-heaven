# GEN-08 — Ribbon and optical-effects atlas receipt

Status: exported from the one permitted one-shot generation. No regeneration or variation was requested.

## Paid call

- Model: `gpt-image-2` (generation metadata: `gpt-image`, version `2.0`).
- Count: one paid call for this job.
- Authority inputs: `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png` (canonical sheet) and `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` (rendering/light reference).
- Raw result: `packages/site/assets/workbench/lucy/GEN-08/raw/GEN-08-atlas-raw.png`
- Raw SHA-256: `da4d06dc7af9f953286fb3e7541d1f6c268b2ccf7cd36aa565ef600420feca1e`
- Raw dimensions / source alpha: `1536×1024`, RGB chroma source (no alpha).

## Exact prompt

```text
Use case: stylized-concept. Asset type: modular website optical-effects atlas for the Skill Heaven runtime mascot Lucy. Input images: Image 1 is the final canonical character sheet and strict structural authority; Image 2 is the original rendering and saturated optical-lighting authority. Generate exactly one large clean production atlas for frozen job GEN-08, gpt-image-2. Primary request: separated production elements only: exactly eight distinct flowing prismatic chest-ribbon forms — calm Zero ribbon, upward Heaven ribbon, fully inverted Hell ribbon, gold-interference Ultra ribbon, plus four alternate airflow/arc silhouettes. Add separate cyan, blue, and gold particle fields; separate white/cyan/gold caustic/refraction streaks; exactly three isolated abstract katana slash arcs with no sword; subtle cyan, fully inverted, and gold aura glows; fine glass-dust fields; sparse falling shard trails. Make all elements clearly separated with generous blank gutters for deterministic extraction. Scene/backdrop: perfectly flat solid #00FF00 chroma-key background, totally uniform with no shadows, gradients, texture, floor, reflection, green bounce, or green glass. Style/medium: premium crisp anime optical graphics that match the supplied authority: faceted prismatic glass, cyan/electric blue/violet highlights, inverted crimson/hot-pink/dark Hell physics, Ultra-exclusive gold interference. Composition/framing: modular atlas with every element fully inside canvas, no overlaps. Constraints: no Lucy character, face, anatomy, clothing, hand, weapon, wing, text, labels, numbers, UI, border, frame, watermark, signature, opaque background, or drop shadows; do not use #00FF00 in any component.
```

## Deterministic processing and outputs

`scripts/assets/lucy-gen07-08-export.mjs` removes the `#00ff00` chroma field with a soft `12..220` alpha matte and despill, then uses fixed atlas boxes. It retained:

- Alpha intermediate: `packages/site/assets/workbench/lucy/GEN-08/intermediate/GEN-08-atlas-alpha.png` (`1536×1024`, alpha; SHA-256 `6e9984ac86d3be543522130a85011d28e5f4b22dbd5afc8d256e61e2312e557e`).
- Normal/inverted checker previews: `.../GEN-08-atlas-alpha-checker-normal.png`, `.../GEN-08-atlas-alpha-checker-inverted.png`.
- Eight ribbons: `components/ribbons/lucy-ribbon-{zero,heaven,hell,ultra,airflow-01,airflow-02,airflow-03,airflow-04}.webp` (from `250×230` through `430×230`).
- Optical overlays: `fx/lucy-{particles,caustics,aura,glass-dust,shard-trail}-{cyan,inverted,gold}.webp`; dimensions respectively `500×120`, `500×90`, `500×90`, `500×75`, and `500×100`.
- Three isolated slash arcs: `components/katana/lucy-katana-slash-{01..03}.webp`, each `500×85`.
- Four transparent wide dividers, assembled only from these extracted GEN-08 ribbons/particles/caustics: `identity/lucy-divider-{zero,heaven,hell,ultra}.webp`, each `1920×240`.
- Simplified vector/raster identity derivatives: `identity/lucy-state-icon-{zero,heaven,hell,ultra}.{svg,webp}`, `identity/lucy-diamond-eye.{svg,webp}`, `identity/lucy-red-tear.{svg,webp}`, and `identity/lucy-wing-{heaven,hell,ultra}.{svg,webp}`. All WebP motifs are `512×512` with alpha.
- Semantic FX aliases/composites, all with retained alpha: `fx/lucy-{glass-flecks,spectral-specks,micro-shards,hell-red-fragments,ultra-gold-sparks}.webp` (`500×120`); `fx/lucy-{light-streaks,optical-filaments,rainbow-edge-flare,cyan-white-bloom,chromatic-aberration-streak,glass-reflection,spectral-band}.webp` (`500×90`); `fx/lucy-refraction-arc.webp` (`360×230`); and semantic state auras `fx/lucy-aura-{zero,heaven,hell,ultra}.webp` (`500×90`).

All final WebPs re-opened with alpha; there are no opaque final WebPs in this family. The four dividers additionally re-opened at their required `1920×240` dimensions with `alpha=true`.

## One-pass self-review

The raw atlas was visually reviewed exactly once before processing. Passed: no character/sword/wing/text/UI/borders; eight visibly distinct ribbon silhouettes are present; three slash arcs, three aura treatments, three particle fields, caustic strands, dust fields, and sparse shard trails are present; all were placed with separation adequate for fixed crops. Normal and inverted checker previews were generated for edge auditing; alpha-pixel verification found 1,228,749 fully transparent pixels and 175,047 antialiased edge pixels, with alpha surviving final WebP re-open.

A single final semantic-FX contact-sheet review was performed from `packages/site/assets/workbench/lucy/GEN-08/intermediate/GEN-08-semantic-fx-review.png`. It confirmed clean alpha/checkerboard edges, no text/matte, legible cyan, inverted red-pink, and gold state vocabulary, and a distinct ring/refraction-arc form. Mechanical reopen audit then confirmed real alpha for all 17 semantic exports. These are intentionally semantic aliases/composites of the one flattened atlas: glass flecks/spectral specks/micro-shards share the cyan particle field; light streaks/optical filaments/glass reflection share the cyan caustic field; and the Zero/Heaven auras share the only coherent cyan-blue aura geometry. Therefore they are suitable named web exports, but are **not** separately authored source passes. A uniquely saturated blue-only Heaven aura, separate blue-only particle field, and independently painted rainbow edge flare are blocked as distinct source elements; no new generation was used to fabricate them.

Blocked / not claimed: the source is a flattened one-shot atlas, so it does not supply editable layered FX source. The “blue” particle requirement is represented by the cyan/blue Heaven field, named `cyan` to match the production-plan filename vocabulary; separate named blue-only variants were not independently generated and are not claimed. No character, sword, or wing assets are expected from GEN-08 by brief.

## Backup

`scripts/assets/backup-lucy-pngs.sh` ran after the raw, intermediate, preview, and semantic-review PNGs landed. The as-is raw is present under `lucy-masters-backup/packages/site/assets/workbench/lucy/GEN-08/raw/GEN-08-atlas-raw.png`.
