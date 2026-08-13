# Front Page Katana Authority Re-render

Target: stacked front-page draft PR #50 on `dev/lucy-frontpage-assets`.

## Why this replaces the current pack

The current Variation A/B katana files were copied from older commissioned
Hero assets. They are no longer production authority. This pass re-renders a
single internally consistent weapon system from:

1. `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Katana_reference.png`
2. the `KATANA (APPROVED)` panel in
   `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png`
3. `docs/lucy/authority/LUCY_CANONICAL_CHARACTER_SHEET.md` section 7

The crop and master are structural/material authority. No old katana raster is
an image-generation input.

## One-shot generation job — FP-KATANA-01

Use exactly one `gpt-image-2` call for one modular katana production atlas.
Include both authority images. Request genuine transparency first; if native
alpha is unavailable, use a perfectly flat `#00FF00` field with no green
reflection, bounce, tint, texture, shadow, or glass.

Generate separated, non-overlapping, fully visible components with generous
gutters and consistent scale:

1. one complete neutral unsheathed katana, blade pointing left;
2. the exact same complete neutral unsheathed katana, blade pointing right;
3. one complete katana fully seated in its dark saya, handle visible;
4. one dark empty saya alone, complete from koiguchi to kojiri;
5. one large handle/tsuba/habaki close-up;
6. two matching unsheathed katanas arranged in a clean Ultra dual pair;
7. one compact neutral unsheathed horizontal website component;
8. three separate abstract slash arcs that match the approved blade curvature
   and narrow steel highlight—no weapon or hand inside the arcs.

## Non-negotiable approved construction

- physically real Japanese steel katana, never glass or energy;
- elegant continuous curved steel blade with cool blue-white specular edge;
- correct single cutting edge, kissaki, shinogi, and restrained steel body;
- dark navy/black tsuka-ito wrap with pale diamond openings;
- ornate round/slightly floral antique-gold tsuba matching the reference;
- restrained antique-gold fuchi/kashira/habaki details;
- dark lacquered saya with matching restrained fittings;
- small braided/tassel ornament only where the approved reference shows it;
- every left/right/dual/sheathed detail is the same weapon design, not a family
  of unrelated swords.

Exclude straight blades, western swords, oversized fantasy blades, glass,
energy, glowing cores, serrations, blood, hands, arms, characters, UI, labels,
watermarks, signatures, frames, drop shadows, or overlapping components.

## Deterministic state derivatives

Do not generate separate state geometry.

- Zero: neutral steel with restrained cyan edge reflection.
- Heaven: same geometry with saturated cyan/blue reflection.
- Hell: exact RGB inversion of the Heaven katana with identical alpha,
  dimensions, and pixels-by-position.
- Ultra: same geometry with restrained gold interference; dual arrangement uses
  two matching copies.

## Required production files

Create an authority pack under:

`packages/site/src/assets/lucy/frontpage/katana-authority-v2/`

- `lucy-katana-neutral-steel.webp`
- `lucy-katana-unsheathed.webp`
- `lucy-katana-left.webp`
- `lucy-katana-right.webp`
- `lucy-katana-sheathed.webp`
- `lucy-katana-saya.webp`
- `lucy-katana-handle.webp`
- `lucy-katana-dual.webp`
- `lucy-katana-zero.webp`
- `lucy-katana-heaven.webp`
- `lucy-katana-hell.webp`
- `lucy-katana-ultra.webp`
- `lucy-katana-slash-01.webp`
- `lucy-katana-slash-02.webp`
- `lucy-katana-slash-03.webp`
- `ASSET_MANIFEST.json`

Replace every file under both:

- `frontpage/variation-a/components/katana/`
- `frontpage/variation-b/components/katana/`

with identical authority-pack copies. Add the new sheathed, saya, unsheathed,
and four state files to both variations. Update both manifests and remove their
sheathed/saya source-gap claims. Do not overwrite v1/v2 provenance outside the
front-page tree.

## Review and validation

- The render worker self-reviews once against both authority images.
- A second team member performs one focused authority/alpha review after
  extraction; no broad character or front-page visual review is needed.
- Transparent WebPs must reopen with fractional alpha, transparent corners, and
  no green/white/black matte on normal or inverted checkerboards.
- Heaven/Hell geometry and alpha must be byte-identical; Hell RGB must be the
  exact inversion of Heaven at every foreground pixel.
- Both variation directories must be byte-identical to the shared authority
  pack for matching filenames.
- No production PNG is tracked. Raw/intermediate PNGs remain ignored and are
  backed up as-is.
