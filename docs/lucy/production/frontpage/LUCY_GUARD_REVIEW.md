# Lucy Full-Body Guard Review

Status: **FAIL — owner rejection supersedes the prior v3 pass.**

## Review scope

- Direct visual review of Zero plus the v3 Heaven, registered Hell, and Ultra masters.
- Normal and dark transparency composites for Zero, Heaven, Hell, and recovered Ultra.
- Mechanical v3 gates: WebP reopen, alpha, exterior-green, registered inversion, bounded Hell face edit, and upper-silhouette occupancy.
- Front-page source audit: v2 character paths removed from both exporters and the React hero.

## State results

| State | Anatomy / modesty | State contract | Alpha / inversion | Result |
|---|---|---|---|---|
| Zero | seated anatomy readable; opaque skirt | closed eyes, one katana, no wings or shards | mixed alpha; normal/dark composites clean | PASS |
| Heaven | anatomy count was previously accepted | state art present | face/head/hair are present in RGB but ghosted by low alpha; face-core alpha-density gate fails | FAIL |
| Hell | registered to Heaven | inversion and face edit present | byte-identical defective Heaven alpha; head loss remains | FAIL |
| Ultra | anatomy count was previously accepted | Ultra state art present | 21,372 strong-magenta exterior partial-alpha pixels | FAIL |

## Corrected review finding

The prior occupancy-based validator was insufficient. Heaven's nominal head
occupancy hid a median nonzero alpha of only 38 in the reviewed head/hair ROI,
while its tight face core has only 6.625 percent of pixels at alpha 192 or
higher. Ultra's checker reconstruction promoted magenta plate contamination.
Both failures are now regression controls in
`scripts/assets/test-lucy-matte-guard.py`.

Zero's source retains green RGB under transparent pixels, which a raw-channel
viewer can display as green. Its normal and dark composites show that the alpha
field is valid; this is not a visible production matte.

## Recovery disposition

- All v3 Heaven/Hell/Ultra character pixels and character-bearing derivatives
  are rejected references, not approved brandkit assets.
- Character-free background/FX plates, Zero/shared sources, canonical authority,
  and the authority katana pack remain eligible.
- V4 is an active three-set owner candidate gate. No downstream rebuild or live
  import change occurs before owner selection.
