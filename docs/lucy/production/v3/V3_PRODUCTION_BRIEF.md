# Lucy Heaven / Hell / Ultra v3 Production Brief

Target: draft PR #49 on `dev/lucy-brandkit-v2`.

V3 exists because the v2 worker approved its first generation before the full
owner guard stack was applied. V1 and v2 remain recoverable references, but
neither is production anatomy authority. The complete guard stack below is
frozen before the Sol Medium worker generates any image.

## Authority hierarchy

1. Written guards in this brief and `packages/site/DESIGN.md`.
2. Written Lucy state/costume/material canon.
3. Original rendering reference for saturation and material language.
4. Canonical sheet only for face, hair, uniform, ribbon, eyes, katana, shards,
   colors, and materials.

The sheet and v1 full bodies are disqualified as pose/limb anatomy authority.
V2 full bodies are rejected visual references. Do not copy their lower-body
pose, leg proportions, skirt exposure, or anatomy.

## Hard anatomy guard

- Exactly one Lucy, one head/torso, two arms, two hands, two legs, two feet.
- Each leg traces continuously and separately from hip through thigh, knee,
  calf, ankle, and its own foot.
- No extra/fused/phantom leg, duplicated knee, detached flesh shape, ambiguous
  limb ownership, or hair/ribbon/shard silhouette that resembles anatomy.
- Avoid dense crossed-leg arrangements. Both legs and both feet must be
  countable at full size and reduced-card size.
- Heaven has exactly one katana. Ultra has exactly two matching katanas.

A hard-guard failure rejects the raw. Preserve it and permit one replacement
call for that state; no unrelated alternatives or style variants are allowed.

## Proportion guide with material acceptance effect

Lucy is slender but not abbreviated or needle-limbed. Use long balanced anime
fashion proportions: believable hip/thigh volume, readable knee transition,
calf taper, slim ankle, and a normally constructed foot. The lower body should
read as roughly half or slightly more of standing-equivalent height, allowing
natural falling perspective. The narrow waist must connect structurally to the
ribcage and pelvis. Reject materially short or needle-thin legs, tiny pelvis,
wasp-waist pinching, overlong torso, or a skirt that hides an implausibly short
hip-to-knee span. Minor stylistic variance is acceptable; clear distortion is
not.

## Hard modesty guard

Bare legs, thighs, feet, and ordinary skin exposure are acceptable. The opaque
sailor skirt and pose must naturally cover the underwear/pelvic section.
Reject visible underwear, under-skirt crotch view, low-angle intimate framing,
transparent/parted skirt exposure, wardrobe-malfunction silhouette, or focal
framing of the covered intimate area. Do not fix a breach with crop, paint-over,
blur, or downstream concealment; preserve the rejected raw and use the one
authorized replacement.

## Call V3-HH-01 — Heaven registered master

Create one complete full-body Heaven Lucy as the sole registered body and scene
source for both Heaven and Hell. Match non-anatomy authority: shoulder-length
silver-white hair flowing upward, dark Japanese sailor uniform with opaque
pleated skirt, prismatic chest ribbon, naturally bare feet, exactly one real
steel authority katana, both cyan-white diamond eyes open, controlled falling
motion, ordered disconnected cyan-blue glass-shard wings, saturated porcelain
skin bounce, deep navy shadows, and Heaven blue `#7CC4FF`.

Use an open, elegant falling pose with two long, normally proportioned,
separately traceable legs and feet. The skirt naturally covers the underwear
section. Keep every hair tip, shard, hand, sword, leg, and foot inside canvas.
No gold, tear, closed eye, extra weapon, extra limb, feathers, membrane, armor,
text, UI, watermark, or signature.

Request true alpha first. If unsupported, use perfectly uniform `#00FF00` with
no green subject color, reflection, bounce, shadow, glass, gradient, or texture.
Use fractional known-background matting; never binary key hair or glass.

## Deterministic Hell base

Copy accepted Heaven RGBA byte-for-layout. Preserve dimensions, coordinates,
alpha, pose, anatomy, proportions, modesty coverage, hair, uniform, ribbon,
katana, wings, shards, and crop. Unpremultiply and apply
`RGB_hell = 255 - RGB_heaven` to every foreground pixel, including skin, then
encode correctly. Invert complete opaque plates including the background.

## Call V3-HH-02 — bounded Hell eye and tear edit

Crop only the inverted face with a fixed context margin. Close both eyes
naturally and add exactly one vivid red tear from one closed eye. Composite only
through an antialiased two-eyes-plus-one-tear mask. Require zero pixel changes
outside that mask against the deterministic Hell inversion. Do not regenerate
or independently pose Hell.

## Call V3-ULTRA-01 — Ultra master

Create one complete full-body Ultra Lucy under the same anatomy, proportion,
and modesty guards. Ultra has one open gold diamond eye, the other closed with
exactly one vivid red tear, exactly two matching real-steel authority katanas,
gold-prismatic disconnected glass-shard wings, upward hair/ribbon flow, dark
opaque sailor uniform, naturally bare feet, and no inversion.

Use an open decisive falling silhouette. Two legs must be long enough and thick
enough to retain clear hip/thigh/knee/calf/ankle/foot construction without
being bulky. The skirt naturally covers the underwear section. No extra/fused
limb, short needle leg, tiny pelvis, extra weapon, glass sword, feathers,
membrane, text, UI, watermark, or signature. True alpha first with the same
uniform-green fallback and fractional-matte discipline. One replacement call
is allowed only for a hard anatomy, material proportion, or modesty failure.

## Required v3 outputs

Create the complete v2-equivalent Heaven/Hell/Ultra system under
`packages/site/src/assets/lucy/v3/` without overwriting v1 or v2:

- transparent masters and state renders;
- desktop-wide and 1440×2560 mobile heroes;
- 4:5 state panels and 1:1 portraits;
- 2560×1440 state backgrounds;
- registered Heaven/Hell wings, ribbons, shards, FX, dividers, icons, avatars,
  motifs, and assembly manifests;
- Ultra master/hero/state/panel/portrait/mobile/background/components/assembly;
- final asset manifest and validator.

## Self-review and validation

The Sol Medium worker must visually self-review each generated raw once before
promotion against every hard guard and the proportion guide. Record PASS or
REJECT with exact evidence. A rejected raw is preserved and never promoted.

Mechanical validation must additionally prove:

- every production WebP reopens;
- no production PNG is tracked;
- fractional alpha and zero strong-green exterior partial-alpha pixels;
- Heaven/Hell dimensions and alpha are byte-identical;
- zero Hell changes outside the declared face mask;
- all required output paths and receipts exist;
- v1/v2 files remain unchanged.
