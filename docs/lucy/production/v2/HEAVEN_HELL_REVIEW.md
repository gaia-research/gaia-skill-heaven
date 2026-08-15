# Heaven / Hell v1 Review

Date: 2026-08-13
Scope: exactly one Heaven/Hell visual and pixel review, plus one separate anatomy-only pass.

## Disposition

- Heaven v1 passes character canon and composition, but its green-key cutout is
  reference-grade rather than master-grade: 193 of 30,424 foreground boundary
  pixels were strongly green and 1,362 were moderately green-dominant.
- Hell v1 fails the superseding registered-inversion canon. Its normalized
  alpha IoU with Heaven is 0.355, with 146,503 differing mask pixels. It is an
  independently posed illustration, not Heaven inverted.
- Hell v1's green/cyan color is largely the arithmetic complement of magenta,
  not simply leftover green chroma. Its actual matte defect is hard white
  isolation: alpha contains only 0/255, with no antialiasing, and 10.07% of
  boundary pixels are near-black after inversion.
- The delegated anatomy review initially reported no confirmed extra organs.
  The owner vetoed that finding after direct inspection: v1 Heaven, Hell, and
  Ultra exhibit a three-leg contamination inherited by the authority sheet.
  The owner verdict is final. Those full-body rasters are references for
  non-anatomy design only and must not seed v2 pose or limb structure.

## Superseding Heaven / Hell canon

Hell is Heaven's registered full-scene inversion, not a separate pose or
recolored illustration. Dimensions, alpha, pose, anatomy, silhouette, hair,
uniform, ribbon, katana, wings, shards, spatial composition, and crop remain
identical. Skin participates in the inversion. Only the following bounded face
edit is permitted after inversion:

1. close both eyes naturally;
2. add exactly one vivid red tear from one closed eye.

All pixels outside the declared eye/tear mask must equal the deterministic
inversion of Heaven.

## Chroma finding

Request true transparency first. If the generator cannot supply it, uniform
`#00FF00` remains the least unsafe single-color fallback for Heaven: blue
collides with shards/eyes, magenta with skin/ribbon/refraction, yellow with skin
and hardware, and white/black with hair and uniform. The production fix is not
a different chroma hue; it is fractional foreground matting, unpremultiplied
known-background recovery, narrow boundary despill, and checkerboard audits.
Hell must never be separately generated on chroma.

## Anatomy gate for v2

- exactly one Lucy, one head/face, two arms, two hands, two legs, and two feet;
- limbs trace continuously through joints and remain countable at reduced size;
- exactly one Heaven katana, visibly owned by the intended hand;
- hair, ribbon, and shards remain visually distinct from flesh silhouettes;
- no dense crossed-leg arrangement that resembles a third leg;
- raw, alpha, white, black, inverted-checker, and final WebP views are checked
  before promotion.

## v1 preservation

The immutable v1 reference is commit `3c9834b` on `dev/lucy-brandkit`, draft PR
#48. V2 is additive under `packages/site/src/assets/lucy/v2/`; no v1 production
file or ignored raw is deleted or overwritten.
