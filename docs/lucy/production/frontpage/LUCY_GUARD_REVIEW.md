# Lucy Full-Body Guard Review

Status: **PASS after one deterministic Ultra matte recovery.**

## Review scope

- Direct visual review of Zero plus the v3 Heaven, registered Hell, and Ultra masters.
- Normal and dark transparency composites for Zero, Heaven, Hell, and recovered Ultra.
- Mechanical v3 gates: WebP reopen, alpha, exterior-green, registered inversion, bounded Hell face edit, and upper-silhouette occupancy.
- Front-page source audit: v2 character paths removed from both exporters and the React hero.

## State results

| State | Anatomy / modesty | State contract | Alpha / inversion | Result |
|---|---|---|---|---|
| Zero | seated anatomy readable; opaque skirt | closed eyes, one katana, no wings or shards | mixed alpha; normal/dark composites clean | PASS |
| Heaven | one head; 2 arms/hands; 2 legs/feet; covered skirt | two diamond eyes, one steel katana, cyan shard wings | mixed alpha; no strong-green exterior pixels | PASS |
| Hell | geometry identical to Heaven | closed eyes, one red tear, one katana | byte-identical alpha; full RGB inversion including skin outside bounded face mask | PASS |
| Ultra | one head; 2 arms/hands; 2 legs/feet; covered skirt | one gold diamond eye, one closed tear eye, two matching katanas, gold wings | recovered known-checker matte; light/dark composites clean | PASS |

## Corrected review finding

The first promoted Ultra v3 matte was headless and omitted the light hair and
gold wings even though the retained raw was complete. It has been superseded by
`scripts/assets/lucy-v3-ultra-rematte.py`, which uses only the retained raw,
known checker plate, and retained body matte. No model call or painted geometry
was added. The v3 validator now has explicit head/hair/gold-wing occupancy gates.

Zero's source retains green RGB under transparent pixels, which a raw-channel
viewer can display as green. Its normal and dark composites show that the alpha
field is valid; this is not a visible production matte.

## Non-blocking brandkit gaps

- Isolated hair layers remain unavailable.
- Flattened v3 wing/ribbon/shard crops include adjacent body/effect pixels and
  are retained as reference-only, not consumed by the React hero.
- Frozen atmospheric hero composites can show authored atlas panel bars; the
  live prototype uses true-alpha v3 bodies over layout/CSS instead.
