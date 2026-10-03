# Lucy Alive — Rive direction

Tracker: [gaia-skill-heaven#153](https://github.com/gaia-research/gaia-skill-heaven/issues/153)

Lucy is moving from static state swapping to a live Rive character system.

The model is intentionally borrowed from the successful Milim reboot:

- character source belongs in a dedicated character repository
- Rive owns rigging, deformation, animation, state machines, and view-model behavior
- Skill Heaven owns only a small semantic adapter plus page lifecycle, responsive placement, reduced motion, and fallbacks
- the web app consumes a content-hashed `.riv` and a static poster
- the official Rive runtime is lazy-loaded and pinned
- no custom player/rendering engine unless a real second-consumer need appears

Lucy should **not** copy Milim's personality contract. The shared architecture is Rive + thin adapter. Lucy's behavior follows Skill Heaven's four-state product language.

## Current web baseline

The production site currently imports four static v5 delivery WebPs in:

- `packages/site/src/surfaces/Hero.tsx`
- `packages/site/src/surfaces/Landing.tsx`

The active state is already product-owned: `zero | heaven | hell | ultra`.

The Rive implementation should replace the live hero's static state swap while preserving deliberate static fallbacks for reduced motion and load failure.

## Current Lucy authority

The current owner-approved source masters are the four PNGs under:

`packages/site/src/assets/lucy/v5/masters/`

The v5 delivery receipt states that these sources own Lucy's identity, pose, composition, silhouette, and alpha.

Zero, Heaven, and Hell should be treated as gold masters for the first Rive build.

Ultra gets an explicit suitability review before rigging. Its current delivery has known, owner-accepted alpha/fringe exceptions and distinct source geometry. That is not permission to replace it casually. A new Ultra gold master is justified only if the existing authority cannot support convincing motion without damaging identity or quality.

## Lucy motion language

Lucy is more atmospheric than Milim.

Primary craft priorities:

1. hair deformation and secondary motion
2. ribbon motion
3. Zero / Heaven / Hell / Ultra transitions
4. subtle facial and eye expression
5. aura / refraction / shard / filament effects
6. wings and weapon integration
7. runtime polish

Hair must preserve locks, volume, silhouette, and state-specific gravity. Avoid one-sheet rubber deformation.

### Zero

Quiet, grounded, low-energy. Closed-eye identity stays readable. Breathing and hair settling should be visible only when watched.

### Heaven

Controlled lift/fall language. Hair and ribbon carry the state. Cyan/prismatic aura and ordered shards move coherently rather than behaving as generic particles.

### Hell

Preserve the canonical inversion relationship and red-tear identity. Motion can feel less stable without turning Lucy into a generic villain performance.

### Ultra

The crown state. Most decisive animation, richest gold interference/refraction, strongest transition treatment, and dual-weapon language. Keep the visual hierarchy clean.

## Proven Milim implementation lessons

The landed Milim website integration uses:

- `@rive-app/webgl2` pinned and imported dynamically
- `RuntimeLoader.setWasmUrl(...)` with a self-hosted WASM
- one semantic adapter over a bound Rive view model
- content-hashed `.riv` + poster promotion
- generated asset metadata with source repository + commit
- reduced motion that never loads the Rive runtime
- `IntersectionObserver` and document visibility to pause the character
- `ResizeObserver` for canvas resizing
- a static poster for fallback
- browser verification for responsive layout, reduced motion, and offscreen lifecycle

The most important process lesson was visual: Milim's first live version was reverted after identity/pose problems. The successful version returned only after a dedicated candidate viewer, gold-master overlays, and identity-first fixes.

Lucy should start with that viewer loop instead of waiting until the site is integrated.

## Planned repository boundary

The intended character-source repository is:

`gaia-research/lucy`

It should own Rive/RML source, gold-master authority records, separation/reconstruction tooling, rig assets, viewer/evidence, and the shipping brief.

Skill Heaven remains the consumer.

A proposed repository bootstrap is staged under:

`docs/lucy/repo-bootstrap/`

Move those files into the dedicated repository when it is created.

## Lucy Player decision

Do **not** create a separate `lucy-player` initially.

Rive is the player. Start with a small Vite/React-side adapter in Skill Heaven, likely shaped around:

- `packages/site/src/lib/lucy-rive/character.ts`
- `packages/site/src/lib/lucy-rive/asset.ts`
- `scripts/lucy/sync-rive.mjs`
- one live Lucy component

A standalone player becomes justified only if multiple consumers or substantial independent runtime logic appear.
