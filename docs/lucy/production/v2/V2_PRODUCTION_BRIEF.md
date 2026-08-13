# Lucy Heaven / Hell v2 Frozen Production Brief

This brief is frozen before dispatch. Production uses `gpt-image-2` only. Two
paid calls are permitted: one new Heaven master and one cropped Hell face edit.
There are no alternative generations or retries. All other outputs are
deterministic derivatives.

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

Every Heaven/Hell pair must share dimensions, alpha bounds, and composition
matrix. Except inside the declared eye/tear mask, Hell must pixel-diff exactly
against the registered inversion of Heaven.
