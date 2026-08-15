# Lucy v4 Set B — downstream receipt

Status: PASS_WITH_RETAINED_ALPHA_GAPS

## Scope

- Owner-approved Set B Heaven, Hell, and Ultra candidates only; no model calls.
- Zero and neutral reuse the established source assets.
- The Hell source is the active exact-inversion lineage from the candidate manifest; no repaint or post-inversion recolor is performed.
- Heaven/Hell/Ultra candidate plates remain opaque because their matte-gate findings were retained by owner approval. This batch makes no synthetic alpha claim.

## Materialized

- P0: 18 WebP surfaces (masters, full states, responsive hero pair).
- P1: 9 WebP bust/neutral portraits.
- P2: modular assets referenced by exact existing paths in `SET_B_ASSET_MANIFEST.json`; not duplicated.
- P3: 4 WebP social surfaces.

## Review

- Normal and dark private composite sheets were rendered in the ignored workbench audit directory and visually checked once.
- Mechanical reopen/dimension/no-PNG checks ran for every production export.
- Character-bearing Heaven, Hell, and Ultra exports are intentionally opaque composite plates. Their visual approval is owner authority; their alpha gap is not downgraded or hidden.

## Mechanical result

- PASS: all generated outputs reopen as WebP at the registered dimensions; no production PNGs.
