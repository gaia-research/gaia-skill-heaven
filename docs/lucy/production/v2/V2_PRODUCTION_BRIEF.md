# Lucy Heaven / Hell v2 Frozen Production Brief

Production uses `gpt-image-2` only. Exactly three calls are permitted: the
owner-accepted new Heaven master, one fresh Ultra master, and one cropped Hell
face edit. There are no alternative generations or retries. All other outputs
are deterministic derivatives.

## Contaminated v1 raster authority

The owner identified a three-leg defect in the supplied sheet and every v1
Heaven, Hell, and Ultra full-body variant. Those rasters remain authority for
face, shoulder-length hair, sailor uniform, ribbon, eye/state language, katana,
glass shards, colors, and materials. They are disqualified as pose, limb, hip,
knee, ankle, or foot anatomy references. Written anatomy below wins. The owner
directly reviewed the new V2-HH-01 master and accepted its limb count.

## Modesty gate

Skin, bare legs, and thigh exposure are allowed. The underwear/pelvic section
must remain naturally covered by the opaque sailor skirt and pose. Reject any
visible underwear, under-skirt crotch view, low-angle intimate framing,
transparent or parted skirt exposure, wardrobe-malfunction silhouette, or
composition that makes the covered intimate area a focal point. Never crop or
paint over a breach. Preserve the rejected raw and permit one replacement call
for a modesty or two-leg anatomy failure; no unrelated alternatives are allowed.

## Anatomy proportion guide

This is a style guide, not a numeric guard. The owner accepts the new Heaven v2
leg proportions as the target read. Lucy is slender but her lower body should
not look short, needle-thin, or disconnected: preserve clear hip-to-thigh
volume, a readable knee transition, calf taper, and slim ankle/foot. Her narrow
waist must connect structurally to both ribcage and pelvis. Avoid an overlong
torso, tiny pelvis, wasp-waist pinching, or a skirt concealing an implausibly
short hip-to-knee span. Prefer balanced anime fashion proportions with the
standing-equivalent lower body around half or slightly more of total height,
allowing natural perspective and pose variation.

## Call V2-HH-01 — registered Heaven master

Create one complete full-body Heaven Lucy as the single registered source for
both Heaven and Hell. Match the approved character sheet and original rendering
authority exactly: one young adult Lucy, shoulder-length silver-white hair
expanding upward through active-state optical flow, dark Japanese sailor
uniform, prismatic chest ribbon, naturally bare feet, one correctly constructed
real-steel katana, saturated porcelain skin bounce, both open cyan-white diamond
irises, graceful controlled falling body, hair and ribbon upward, and ordered
disconnected cyan-blue glass-shard wings.

Anatomy is a hard gate: exactly one head and torso, two arms, two hands, two
legs, and two feet. Both legs and feet must be individually traceable and
countable; avoid a compact crossed-leg silhouette that can read as a third leg.
Exactly one katana originates in the intended hand. Hair, ribbon, and shards
must not resemble flesh or detached anatomy.

Preserve every hair filament, shard, sword tip, hand, finger, foot, and toe
inside the canvas with generous padding. No gold, red tear, closed eye, text,
UI, feathers, membrane, armor, extra character, extra limb, or extra weapon.
The modesty gate above is mandatory.

Request real transparent background. If unsupported, use one perfectly uniform
`#00FF00` field with no green subject pixels, bounce, reflection, glass tint,
shadow, gradient, texture, or floor. This exact pose, anatomy, silhouette,
spatial composition, shard map, and crop becomes Hell.

## Fractional Heaven matte

- Detect whether native alpha is genuine before keying.
- For chroma fallback, solve a fractional foreground matte from the known green;
  never binary-threshold hair or translucent glass.
- Unpremultiply before recovering boundary foreground RGB.
- Despill only an exterior-connected boundary band; preserve cyan interiors.
- Require zero strongly green pixels in the exterior-connected partial-alpha
  band and retain antialiased partial-alpha pixels.
- Audit on white, black, checkerboard, and inverted-checker backgrounds.

## Deterministic Hell base

1. Copy the accepted Heaven RGBA master byte-for-layout.
2. Preserve dimensions, coordinates, alpha, pose, anatomy, hair, uniform,
   ribbon, katana, wings, shards, and crop exactly.
3. Unpremultiply RGB and apply `RGB_hell = 255 - RGB_heaven` to every foreground
   pixel, including skin; re-premultiply only for encoding.
4. Invert complete opaque Heaven plates, including their background.
5. Do not preserve normal skin color or add a separate pink/red grade.

## Call V2-HH-02 — bounded Hell eye / tear edit

Crop the inverted face with a small fixed context margin. Edit only that crop:
close both eyes naturally in the existing inverted face and add exactly one
vivid red tear from one closed eye. No other facial structure, hair, lighting,
skin, pose, or palette change is permitted.

Composite returned pixels only through an antialiased mask covering both
iris/sclera/eyelid regions and one narrow tear corridor. Assert a zero-pixel
diff outside that declared mask against the deterministic Hell base. The red
tear is the only semantic color restoration.

## Call V2-ULTRA-01 — clean Ultra master

Create one new complete full-body Ultra Lucy using the written anatomy contract
and non-anatomy design authority. Exactly one head/torso, two arms, two hands,
two independently traceable legs, and two feet; each leg reads continuously
from hip through knee and ankle to its own foot. Use an open, unambiguous
falling silhouette with no compact limb crossing. Ultra has one open gold
diamond eye, the other closed with exactly one vivid red tear, two matching
real-steel katanas, gold-prismatic disconnected glass-shard wings, upward hair
and ribbon, and no inversion. No extra limb, fused foot, phantom knee, detached
flesh shape, extra weapon, text, feathers, or membrane. Request true alpha with
the same uniform-green fallback and fractional-matte rules as Heaven. One call;
one replacement is allowed only if the anatomy or modesty gate fails.
Use accepted Heaven v2 as the proportional reference; do not solve apparent
shortness by warping or stretching a rendered body.

## Required v2 output families

All final production files are WebP/SVG/JSON/text below
`packages/site/src/assets/lucy/v2/`. V1 remains untouched.

- `masters/lucy-{heaven,hell}.webp`
- `hero/lucy-{heaven,hell}-desktop-wide.webp` at 2560×1080
- `states/lucy-{heaven,hell}.webp`
- `states/lucy-hell-white.webp`
- `states/panels/lucy-{heaven,hell}-panel.webp` at 4:5
- `portraits/lucy-{heaven,hell}.webp` at 1:1
- `mobile/lucy-{heaven,hell}-hero-1440x2560.webp`
- `backgrounds/lucy-bg-{heaven,hell}-desktop.webp` at 2560×1440
- `components/wings/lucy-wing-{heaven,hell}-{left,right,pair}.webp`
- `components/ribbons/lucy-ribbon-{heaven,hell}.webp`
- paired shard clusters and individual reusable shards
- paired particle, caustic, aura, dust, trail, fragment, streak, reflection,
  flare, spectral, and refraction FX
- `identity/lucy-divider-{heaven,hell}.webp`
- paired state icons, wing emblems, Heaven diamond eye, and Hell red tear
- `identity/lucy-avatar-{heaven,hell}.webp`
- paired state assembly manifests and a v2 asset manifest
- `masters/lucy-ultra.webp`
- `hero/lucy-ultra-desktop-wide.webp` at 2560×1080
- `states/lucy-ultra.webp` and `states/panels/lucy-ultra-panel.webp` at 4:5
- `portraits/lucy-ultra.webp` at 1:1
- `mobile/lucy-ultra-hero-1440x2560.webp`
- `backgrounds/lucy-bg-ultra-desktop.webp` at 2560×1440
- an Ultra assembly manifest using the clean v2 body and defensible gold
  component/FX vocabulary

Every Heaven/Hell pair must share dimensions, alpha bounds, and composition
matrix. Except inside the declared eye/tear mask, Hell must pixel-diff exactly
against the registered inversion of Heaven.
