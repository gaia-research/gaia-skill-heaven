# V3-ULTRA-01 — Ultra master

Status: **PASS / accepted raw; deterministic matte recovered after owner-stack recheck.** No replacement call.

## Paid call

- Model: `gpt-image-2` through the built-in image generation tool.
- Paid calls: 1.
- Frozen prompt authority: `docs/lucy/production/v3/V3_PRODUCTION_BRIEF.md`,
  Call V3-ULTRA-01, with the complete anatomy, proportion, modesty, material,
  weapon-count, and non-inversion guards injected into the executed prompt.
- Non-anatomy inputs: canonical sheet for design/material language and original
  reference for saturation/rendering. No v1/v2/sheet body was anatomy authority.
- Raw: `packages/site/assets/workbench/lucy/V3-ULTRA-01/raw/ultra-gpt-image-2-raw.png`.

## One-pass self-review

- Anatomy — **PASS:** one head/torso; exactly two arms/hands; exactly two
  independently traceable legs and two feet; no extra, fused, phantom, or
  effect-shaped limb.
- Proportions — **PASS:** both legs retain adult-balanced length and normal
  thigh/knee/calf/ankle/foot construction; neither is short or needle-thin;
  waist and pelvis connect structurally.
- Modesty — **PASS:** opaque skirt naturally covers the underwear/pelvic section;
  no intimate under-skirt view or focal framing.
- State/material — **PASS:** one gold diamond eye, opposite closed eye with one
  red tear, exactly two complete matching real-steel authority-style katanas,
  gold disconnected shard wings, normal non-inverted skin, no third weapon.

The generated PNG was opaque RGB with a baked light checker field. The first
`isnet-general-use` matte created fractional alpha but incorrectly erased the
head, hair, and gold wings. That promoted matte is superseded. The accepted raw
itself passes the anatomy, proportion, modesty, and state guards, so no paid
replacement was justified.

`scripts/assets/lucy-v3-ultra-rematte.py` deterministically reconstructs the
known 16 px near-white checker plate, combines its color/luminance difference
with the retained body matte, rejects detached checker noise, and preserves RGB
only from the original raw. Light and dark checker composites were reviewed
after recovery. The validator now requires non-trivial alpha occupancy in the
head, hair, and gold-wing regions so the original headless promotion fails.
Raw/intermediate/audit PNGs were backed up as-is.
