---
name: lucy-image-production
description: One-shot Lucy asset generation and deterministic export for Skill Heaven.
---

# Lucy Image Production

This is the Skill Heaven specialization of Gaia Image Production. It governs
every generated Lucy raster, background removal, upscale, crop, filter, and
WebP export in this repository.

## Authority

Read these before production, in this order:

1. `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png`
2. `docs/lucy/authority/LUCY_CANONICAL_CHARACTER_SHEET.md`
3. `docs/lucy/authority/lucy-canon.json`
4. `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg`
5. The assigned job in `docs/lucy/production/ASSET_PRODUCTION_PLAN.md`

The final sheet and written canon win over every earlier iteration. Lucy is one
character. Her anatomy and outfit do not transform between states.

## Paid generation contract

- Use `gpt-image-2` only.
- Make exactly one generation call for each assigned `GEN-*` job.
- Do not request alternates, variations, or a second attempt.
- Include the authority images in the generation context.
- Preserve the first result even when it fails a gate; mark the job blocked.
- Self-review the result once. Continue only with deterministic local
  processing: crop, resize, alpha extraction, cleanup, compositing, inversion,
  color filtering, and WebP export.

## Storage contract

- Raw/master/intermediate PNGs:
  `packages/site/assets/workbench/lucy/<job-id>/` (gitignored).
- As-is backup: run `scripts/assets/backup-lucy-pngs.sh` after any PNG lands.
- Production deliverables:
  `packages/site/src/assets/lucy/` as WebP.
- The only tracked production PNG is
  `authority/lucy-character-sheet-master.png`.
- Write a receipt to `docs/lucy/production/runs/<job-id>.md` with model,
  prompt path or full prompt, input authorities, raw path, outputs, dimensions,
  alpha result, self-review results, and any blocked item.

## Transparency and chroma fallback

When a brief says transparent, the final production WebP must contain real
alpha. No white, black, gray, or colored matte may remain in translucent edges.

1. Request a transparent background in generation.
2. Inspect the PNG alpha channel.
3. If the generator returns an opaque background, accept that one result and
   use deterministic removal. Prefer a flat `#00FF00` chroma field requested in
   the original brief; chroma green is deliberately distant from Lucy's cyan,
   blue, gold, red, silver, and skin palette.
4. Inspect normal and inverted checkerboard previews for halos, holes, and
   contaminated glass edges.
5. Export a lossless-alpha WebP and re-open it to verify alpha survived.

Chroma is a workbench surface, never a brand color. Do not regenerate because
alpha removal is inconvenient.

## Deterministic processing

Use free local processing wherever possible. The preferred portable runtime is:

```bash
npx -y --package=tsx --package=sharp --package=@img/sharp-wasm32 tsx <script>
```

Keep reusable processing logic in `scripts/assets/`; do not hide the workflow
inside an untracked one-off command. Derivatives from the same generation—wide
composites, state cards, portraits, social crops, filtered plates, and mobile
crops—are not new image-generation jobs.

## State gates

- **Zero:** seated zen, closed eyes, normal gravity, one katana, no wings and
  absolutely no shards.
- **Heaven:** unique falling pose, both diamond eyes open, one katana, ordered
  saturated cyan-blue glass-shard wings.
- **Hell:** unique falling pose, both eyes closed, one red tear, one katana,
  fragmented shards, full-scene chromatic inversion on white.
- **Ultra:** unique decisive falling pose, one gold diamond eye open, the other
  closed with a red tear, two matching katanas, gold shards, never inverted.

All states retain shoulder-length silver-white hair, dark sailor uniform,
prismatic ribbon, barefoot anatomy, real steel katana construction, and glass
shards with no feathers or membranes.

## One-pass self-review checklist

- [ ] Same canonical Lucy, proportions, uniform, hair length, ribbon, bare feet.
- [ ] Assigned pose, gravity, eye state, tear, weapon count, and shard language.
- [ ] No text, labels, signature, watermark, frame, or accidental UI.
- [ ] Full silhouette and required effects are not clipped.
- [ ] Transparent deliverables have real alpha and no matte/halo.
- [ ] Normal and inverted previews preserve hair, skin, glass, and steel edges.
- [ ] Output dimensions and file paths match the production plan.
- [ ] Production WebP re-opens successfully and stays within its target size.
- [ ] Raw PNG was backed up as-is.
- [ ] Receipt records pass/fail honestly; failed gates are not silently hidden.
