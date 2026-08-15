# FP-KATANA-01 — Focused Authority Review

Status: **PASS after deterministic debris cleanup**

## Scope

This is the one required focused review for the front-page katana replacement.
It evaluates only the one-shot `FP-KATANA-01` authority pack, its alpha
extraction, its Heaven/Hell relationship, and its promotion into Variations A
and B. It does not review characters, compositions, or the other front-page
assets.

## Inputs reviewed

- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Katana_reference.png`
- approved `KATANA` panel in
  `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png`
- one-call raw atlas:
  `packages/site/assets/workbench/lucy/FP-KATANA-01/raw-gpt-image-2.png`
- normal and inverted alpha-checker exports from the same atlas.

## Authority verdict

- Curved single-edged polished steel blades: pass.
- Dark navy-black tsuka-ito with pale diamond openings: pass.
- Ornate round/floral antique-gold tsuba and restrained fittings: pass.
- Dark lacquered saya and matching navy tassel language: pass.
- No character, hand, fantasy glass/energy blade, text, watermark, or old Hero
  katana raster: pass.

The initial deterministic extraction contained a small number of detached,
non-weapon atlas fragments in several generous crop regions. No generation was
repeated. `lucy-frontpage-katana-export.py` now retains only the intended
connected weapon silhouette (two for the dual asset) before fit/export, then
re-exports from the unchanged raw PNG. The cleaned normal and inverted
checkerboard views have no detached debris or chroma fringe.

## Mechanical verdict

- Shared authority pack: 15 lossless-alpha WebPs, all reopen successfully.
- Every file has transparent corners and fractional alpha; no matte is baked
  into the checkerboard-tested edges.
- Heaven and Hell: same `1200×320` dimensions, byte-identical alpha, and exact
  RGB inverse at every foreground pixel.
- Variation A and B each contain the same 15 katana filenames; every matching
  file is byte-identical to the shared authority source.
- Production front-page tree contains zero PNGs.
- The v1-style claims that sheathed katana and saya are source gaps are removed;
  isolated hair remains the only documented gap.

## Reproduction

```bash
python3 scripts/assets/lucy-frontpage-katana-export.py
python3 scripts/assets/promote-lucy-frontpage-katana.py
python3 scripts/assets/validate-lucy-frontpage-katana.py
```

The validator prints dimensions, alpha counts, Heaven/Hell inversion, exact
Variation A/B byte matches, and the production-PNG count.
