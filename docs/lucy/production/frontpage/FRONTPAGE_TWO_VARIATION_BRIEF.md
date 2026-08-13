# Lucy Front Page — Two One-Shot Variations

This is the third PR in the stack:

`v1 (#48) ← v2 Heaven/Hell/Ultra (#49) ← front-page assets`

The deliverable is two complete front-page composition systems. Each variation
receives exactly one `gpt-image-2` call for a text-free atmospheric background
and optical-composition atlas. There are no retries and no visual review pass.
All character pixels come from accepted masters, preventing new anatomy,
modesty, face, weapon, or state drift.

## Shared character authority

- Heaven, registered Hell, and Ultra:
  `packages/site/src/assets/lucy/v2/masters/`
- Zero and neutral:
  existing v1 `states/lucy-zero.webp` and `models/lucy-neutral.webp`; the owner
  reported the three-leg contamination only for v1 Heaven/Hell/Ultra.
- Expressions, eyes, ribbons, wings, shards, katanas, FX, and identity motifs:
  v2 when available, otherwise the validated v1 production export.

Do not regenerate or edit Lucy. Preserve the v2 Hell registration contract.
Skin exposure is acceptable; underwear/pelvic overexposure is not. Because
characters are composited from accepted masters, no character guard replacement
call is available in this batch.

## Variation A — Heaven Ascension

Purpose: primary homepage direction with Heaven as the calm, luminous entry and
Ultra as the alternate escalation.

### One-shot generated atlas A

Create one text-free 16:9 atmospheric production atlas for a premium Skill
Heaven homepage. No character, face, body, clothing, hand, weapon, wings, text,
logo, UI, icon, watermark, or signature. Provide separated non-overlapping
zones that can be cropped deterministically: deep obsidian/cyan Heaven hero
plate with clear copy space on the left; restrained gold-dark Ultra plate with
clear copy space on the right; subtle black Zero plate; exact full-scene color
inverse of the Heaven plate for Hell; cyan/blue and gold optical caustics;
prismatic ribbon sweeps; shard bands; sparse particles; and section-divider
arcs. High-end glass refraction, saturated Heaven blue `#7CC4FF`, Zero cyan
`#37D6E0`, Ultra gold `#FFD24A`–`#F7C84B`; no flat Hell pink. Perfectly clean
edge-to-edge opaque canvas; no raster text.

## Variation B — Ultra Judgment

Purpose: more kinetic campaign-ready direction with Ultra as the primary hero
and Heaven as the alternate calm state.

### One-shot generated atlas B

Create one text-free 16:9 atmospheric production atlas for a premium Skill
Heaven homepage. No character, face, body, clothing, hand, weapon, wings, text,
logo, UI, icon, watermark, or signature. Provide separated non-overlapping
zones that can be cropped deterministically: dramatic obsidian/gold Ultra hero
plate with clear copy space on the left; saturated cyan-blue Heaven plate with
clear copy space on the right; quiet black Zero plate; exact full-scene color
inverse of the Heaven plate for Hell; angular gold interference; controlled
cyan caustics; prismatic ribbon sweeps; shard bands; sparse particles; and
section-divider arcs. High-end optical glass, decisive diagonal energy, same
canonical color values; no flat Hell pink. Perfectly clean edge-to-edge opaque
canvas; no raster text.

## Required outputs per variation

Every path is below
`packages/site/src/assets/lucy/frontpage/<variation-a|variation-b>/`.

### P0 hero and canonical states

- `hero/lucy-primary-desktop-2560x1080.webp`
- `hero/lucy-alternate-desktop-2560x1080.webp`
- `hero/lucy-primary-mobile-1440x2560.webp`
- `hero/lucy-alternate-mobile-1440x2560.webp`
- transparent character references `hero/lucy-primary.webp` and
  `hero/lucy-alternate.webp`
- `states/lucy-{zero,heaven,hell,ultra}.webp`
- `states/panels/lucy-{zero,heaven,hell,ultra}-panel.webp` at 4:5

Variation A primary/alternate is Heaven/Ultra. Variation B is Ultra/Heaven.

### P1 reusable front-page kit

- `portraits/lucy-{neutral,zero,heaven,hell,ultra}.webp`
- namespaced expression and eye exports
- hair inventory manifest recording unavailable isolated hair rather than
  fabricating it
- eight ribbon assets
- six wing sides plus assembled pairs
- at least twenty shards and state clusters
- 15-file `FP-KATANA-01` authority kit: neutral, unsheathed, left/right,
  sheathed, saya, handle, dual, Zero/Heaven/Hell/Ultra state pieces, and three
  slash arcs

### P2 living visual system

- four 2560×1440 state backgrounds
- named particle, filament, caustic, flare, reflection, aura, dust, trail, and
  shard overlays
- four dividers
- four state icons plus diamond-eye, red-tear, and wing-emblem motifs in SVG
  and/or WebP as available
- neutral/Heaven avatars and one wide transparent header composition

### P3 utility exports

- `social/lucy-og-1200x630.webp`
- `social/lucy-square-1080.webp`
- `social/lucy-portrait-1080x1350.webp`
- `social/lucy-story-1080x1920.webp`

## Processing and validation

- Raw atlas PNGs live in ignored workbench paths and are backed up as-is.
- Production contains WebP/SVG/JSON/text only; no front-page PNG is tracked.
- Workers perform no visual review of the generated atlas or final artwork.
  This is an explicit owner instruction for this batch.
- Mechanical processing still reopens every WebP, enforces exact dimensions,
  verifies alpha where expected, verifies no tracked PNG, and confirms every
  required path or documented source gap.
- Each variation has its own receipt, exporter, manifest, and validation report.
- Generated background zones are not used to alter character pixels.

## Model allocation

The requested allocation is Terra High for Variation A and Luna XHigh for
Variation B. The inline Codex collaboration API exposed Terra/Sol but rejected
Luna; no Luna-capable multi-agent tool was callable in this session. Variation
B therefore uses a declared Terra High fallback rather than being mislabeled.
