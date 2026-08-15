# FP-KATANA-01 — Authority katana atlas

## Immutable inputs

- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Katana_reference.png`
  — primary structural and material authority.
- `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png`
  — approved `KATANA` panel confirmation.
- `docs/lucy/authority/LUCY_CANONICAL_CHARACTER_SHEET.md` section 7.

## Generation record

- Model: `gpt-image-2`
- Paid calls: **1**
- Raw result: `packages/site/assets/workbench/lucy/FP-KATANA-01/raw-gpt-image-2.png`
- Raw dimensions: `1536 x 1024`, opaque `#00FF00` chroma field.
- No old Hero, v1, or v2 katana raster was supplied to the model.
- The raw PNG and all deterministic intermediate PNGs were copied as-is by
  `scripts/assets/backup-lucy-pngs.sh` into ignored `lucy-masters-backup/`.

### Exact generation prompt

```text
Use case: stylized-concept.
Asset type: modular transparent website katana atlas, FP-KATANA-01, for the Skill Heaven front page.
Input images: Image 1 is the primary structural and material authority for the katana; Image 2 contains the approved KATANA panel confirming the same construction. Match those authority references precisely. Do not borrow or reinterpret any older website katana assets.

Create exactly one clean production atlas on a perfectly flat, uniform #00FF00 chroma-key background for deterministic background removal. The background must contain no shadow, gradient, floor, texture, reflection, bounce, tint, or variation; do not use #00FF00 anywhere in the subject. No text, labels, watermark, signature, frame, or UI.

Arrange the following separated, non-overlapping, fully visible components with generous empty gutters and consistent scale, all in the same refined Japanese katana design:
1. one complete neutral unsheathed katana, blade pointing left;
2. the exact same complete neutral unsheathed katana, blade pointing right;
3. one complete katana fully seated in a dark lacquered saya, handle visible;
4. one dark empty saya alone, complete from koiguchi to kojiri;
5. one large handle / tsuba / habaki close-up;
6. two matching unsheathed katanas in a clean Ultra dual pair;
7. one compact neutral unsheathed horizontal website component;
8. three separate abstract slash arcs matching the approved blade curvature and narrow steel highlight, with no weapon or hand inside them.

Every weapon must have a physically real elegant continuous curved Japanese steel blade with one cutting edge, kissaki, shinogi, restrained blue-white specular edge, dark navy-black tsuka-ito wrap with pale diamond openings, an ornate round/slightly floral antique-gold tsuba matching Image 1, restrained antique-gold fuchi/kashira/habaki, and a dark lacquered saya with matching restrained fittings. Retain the approved small braided/tassel ornament only where shown. Use premium clean anime-product illustration matching the authority’s realistic polished-steel material read.

Exclude straight blades, western swords, oversized fantasy blades, glass, energy, glowing cores, serrations, blood, hands, arms, characters, faces, wings, clothing, labels, shadows, overlaps, clipping, or unrelated ornaments. Keep all component edges crisp and every whole object complete within the canvas.
```

## Deterministic export

`scripts/assets/lucy-frontpage-katana-export.py` removes the flat chroma field
with fractional alpha, straight-RGB recovery, and an exterior-only despill.
It crops/assembles all shared geometry and emits lossless-alpha WebP files to:

`packages/site/src/assets/lucy/frontpage/katana-authority-v2/`

State derivation is deterministic:

- Zero: neutral compact geometry, restrained cyan reflection.
- Heaven: identical neutral geometry, cyan-blue reflection.
- Hell: exact RGB inverse of Heaven; alpha and dimensions are byte-identical.
- Ultra: the matching dual arrangement, restrained gold interference.

The exporter records alpha counts, dimensions, input provenance, and the
Heaven/Hell invariant in `ASSET_MANIFEST.json`.

## One-pass self-review

Raw atlas and alpha checkerboard were inspected once against both authority
images. The pass confirms curved steel blades, navy-black wraps with pale
diamond openings, consistent ornate antique-gold round tsuba, restrained gold
fittings, dark lacquered saya, and matching tassel language. No character,
hands, fantasy glass/energy treatment, text, watermark, or overlapping weapon
components are present.

The first checkerboard inspection exposed a thin chroma-green exterior edge on
some steel contours. The same raw master was deterministically re-keyed with
an exterior-only despill; a second alpha-checker inspection confirms no visible
green fringe. This was processing correction, not a second generation.

All requested components are recoverable from the atlas; none is blocked.

## Mechanical checks

- Every production WebP reopens with alpha.
- All exported corners are transparent.
- Heaven/Hell alpha equality: pass.
- Heaven/Hell foreground RGB inverse equality: pass.
- No production PNG was written below `packages/site/src/assets/lucy/frontpage`.
