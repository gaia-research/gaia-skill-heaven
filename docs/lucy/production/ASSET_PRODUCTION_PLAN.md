# Lucy Asset Production Plan

Status: WIP production authority. All paid-generation briefs are frozen here
before dispatch. Each `GEN-*` permits one `gpt-image-2` call and no variation.
Self-review may trigger deterministic processing, never regeneration.

## Shared image brief

Lucy is the exact same young adult woman in every image: shoulder-length
silver-white hair, dark Japanese sailor uniform, prismatic ribbon at the chest,
bare feet, real-steel katana construction, saturated reflected skin light, deep
navy shadow structure, brilliant whites, controlled cyan/electric-blue and
pink/violet refraction. Her anatomy and clothing do not transform. Wing effects
are floating faceted glass shards—never feathers, membranes, bird anatomy, or
opaque fantasy armor. Premium full-body anime character illustration with
clean anatomy, legible hands/feet/weapons, high-frequency glass detail, crisp
silhouette, no text, no labels, no watermark, no signature, no border, and no
UI. Match the approved sheet and original render authority exactly.

For any isolated asset, request real transparency. If transparency cannot be
guaranteed, the generation background must be perfectly flat `#00FF00`, evenly
lit, with no green bounce or green transparent glass; the pipeline will remove
it deterministically from the same one-shot result.

## Frozen generation jobs

### GEN-01 — Ultra primary homepage master

One isolated, complete full-body Ultra Lucy for a cinematic desktop homepage.
She falls decisively downward on a strong diagonal while hair and ribbon stream
upward. Preserve generous clear space to her left when composed. One eye is an
open luminous gold diamond; the other is closed with exactly one vivid red tear.
Two matching real-steel katanas are fully visible and anatomically held. A
powerful but ordered gold prismatic shard-wing system frames the silhouette;
gold is exclusive to Ultra. She is never inverted. No environment or ground.
Nothing—including hair, toes, swords, or shards—is cropped.

### GEN-02 — Heaven alternate homepage master

One isolated, complete full-body Heaven Lucy in a unique falling/floating pose
that cannot be mistaken for Ultra. Body moves downward while hair and ribbon
flow strongly upward. Both eyes are open luminous blue diamond apertures.
Exactly one real-steel katana is fully visible. Ordered symmetric-to-near-
symmetric wing clusters consist only of saturated blue/cyan prismatic glass
shards with brilliant white highlights. Preserve composition space to her
right. No gold, red tear, environment, ground, or crop.

### GEN-03 — Zero canonical master

One isolated, complete Zero Lucy seated in a quiet zen pose, front three-quarter
view. Normal gravity: shoulder-length hair hangs naturally. Both eyes closed.
Bare feet clearly constructed. Exactly one real-steel katana rests horizontally
across her lap or immediately before her hands. Subtle cyan/prismatic ribbon
accent only. Absolutely no wings, shards, halo, feathers, floating debris, or
gold. A soft removable ground shadow may be separate in the workbench result;
the production subject must retain alpha.

### GEN-04 — Hell canonical master and white plate

One complete full-body Hell Lucy in a distinct unstable falling pose, different
from Heaven and Ultra. Body descends while inverted hair/ribbon flow upward.
Both eyes closed; exactly one vivid red tear. Exactly one real-steel katana.
Fragmented, asymmetric glass-shard wings are visibly less controlled. Apply
full-scene chromatic inversion to hair, skin lighting, uniform, ribbon, steel,
and shards. Canonical presentation is a pure white field. Keep every body part,
weapon, and shard inside frame. This single generation will yield both the
white-background plate and a deterministic isolated-alpha derivative.

### GEN-05 — Neutral reusable model master

One isolated full-body neutral Lucy standing naturally in a front three-quarter
model pose. Normal gravity, shoulder-length silver-white hair hanging naturally,
closed neutral eyes, dark sailor uniform, prismatic chest ribbon, bare feet, and
one properly scaled sheathed or low-resting real-steel katana. No wings, shards,
tear, inversion, state aura, dramatic fall, or environmental light. Complete
silhouette, clean anatomy, quiet premium reference rendering.

### GEN-06 — Face, eye, and expression atlas

One clean 3×3 production atlas containing nine equal head-and-shoulders Lucy busts
with identical face, hair construction, uniform collar, scale, and camera angle.
No printed labels; cells are read left-to-right: (1) Zero closed neutral, (2)
blank Zero eyes open, (3) Heaven both blue diamond eyes, (4) Hell both closed
with one red tear and inverted rendering, (5) Ultra one gold diamond eye plus
one closed tear eye, (6) curious, (7) focused, (8) restrained soft smile, (9)
distant/contemplative. Generous
spacing permits deterministic cell extraction. No wings, hands, weapons, text,
or overlapping cells. Transparent or flat chroma background.

### GEN-07 — Wing and shard component atlas

One modular component atlas with generous non-overlapping spacing: Heaven left
and right ordered cyan-blue glass-shard wings; Hell left and right fragmented
inverted glass-shard wings; Ultra left and right decisive gold glass-shard
wings; plus at least twenty individual faceted shards in large/medium/small
sizes. No Lucy body, anatomy, feathers, membrane, text, border, or drop shadow.
Every component fully visible. Transparent or flat chroma background.

### GEN-08 — Ribbon and optical-effects atlas

One modular transparent/chroma atlas with separated production elements: eight
distinct flowing prismatic chest ribbons (calm Zero, upward Heaven, inverted
Hell, gold-lit Ultra, plus four alternate airflow/arc silhouettes);
cyan/blue/gold particle fields; white/cyan/gold caustic
streaks; three katana slash arcs; subtle cyan, inverted, and gold aura glows;
fine glass dust; and sparse falling shard trails. No character, sword, wing,
text, UI, opaque background, or overlapping elements.

## Production output ledger

All paths are below `packages/site/src/assets/lucy/` and are final WebP unless
explicitly marked as the one permitted PNG authority. Desktop work completes
before the deferred mobile derivative.

### P0 — Homepage core

| Output | Source | Target |
|---|---|---|
| Approved character sheet PNG | supplied authority | `authority/lucy-character-sheet-master.png` |
| Original rendering reference | supplied authority | `authority/lucy-original-reference.jpg` |
| Primary Ultra isolated master | GEN-01 | `hero/lucy-ultra-primary.webp` |
| Primary desktop wide composite, 2560×1080 | GEN-01 + deterministic plate | `hero/lucy-ultra-desktop-wide.webp` |
| Alternate Heaven isolated master | GEN-02 | `hero/lucy-heaven-alternate.webp` |
| Alternate desktop wide composite, 2560×1080 | GEN-02 + deterministic plate | `hero/lucy-heaven-desktop-wide.webp` |
| Zero canonical state | GEN-03 | `states/lucy-zero.webp` |
| Heaven canonical state | GEN-02 | `states/lucy-heaven.webp` |
| Hell canonical alpha + white plate | GEN-04 | `states/lucy-hell.webp`, `states/lucy-hell-white.webp` |
| Ultra canonical state | GEN-01 | `states/lucy-ultra.webp` |
| Four matched state panels | GEN-01..04 | `states/panels/lucy-{zero,heaven,hell,ultra}-panel.webp` |

### P1 — Reusable character and component kit

| Group | Outputs |
|---|---|
| Neutral model | `models/lucy-neutral.webp` |
| Portraits | `portraits/lucy-{neutral,zero,heaven,hell,ultra}.webp` |
| Expression cells | `components/expressions/lucy-expression-{01..09}.webp` |
| Eye cells | `components/eyes/lucy-eyes-{zero-closed,zero-blank,heaven,hell,ultra}.webp` |
| Hair derivatives | `components/hair/lucy-hair-{neutral,upward,inverted,ultra}.webp` |
| Ribbon cells | `components/ribbons/lucy-ribbon-{zero,heaven,hell,ultra,airflow-01..04}.webp` |
| Wing pairs | `components/wings/lucy-wing-{heaven,hell,ultra}-{left,right}.webp` |
| Shards | `components/shards/lucy-shard-{01..20}.webp` plus clustered fields |
| Katana kit | `components/katana/lucy-katana-{neutral-steel,sheathed,saya,handle,left,right,dual}.webp` and `lucy-katana-slash-{01..03}.webp` |

### P2 — Background, optical, and identity kit

| Group | Outputs |
|---|---|
| State backgrounds | `backgrounds/lucy-bg-{zero,heaven,hell,ultra}-desktop.webp` at 2560×1440 |
| Optical overlays | `fx/lucy-{particles,caustics,aura,glass-dust,shard-trail}-{cyan,inverted,gold}.webp` where applicable |
| Dividers | `identity/lucy-divider-{zero,heaven,hell,ultra}.webp` |
| State icons | `identity/lucy-state-icon-{zero,heaven,hell,ultra}.{svg,webp}` |
| Motifs | `identity/lucy-{diamond-eye,red-tear,wing-heaven,wing-hell,wing-ultra}.{svg,webp}` |
| Avatars | `identity/lucy-avatar-{zero,heaven}.webp` |
| Header art | `identity/lucy-horizontal-header.webp` |

### P3 — Campaign and deferred mobile derivatives

| Group | Outputs |
|---|---|
| Social | `social/lucy-og-1200x630.webp`, `lucy-square-1080.webp`, `lucy-portrait-1080x1350.webp`, `lucy-story-1080x1920.webp` |
| Mobile, last | `mobile/lucy-ultra-hero-1440x2560.webp`, `mobile/lucy-heaven-hero-1440x2560.webp`; re-authored from isolated layers with portrait-safe face/weapon/wing/headline placement, never a blind crop |

## Completion rules

- A job is complete only when its receipt and final WebPs are tracked, alpha and
  dimensions are verified, and its raw PNG exists in both workbench and backup.
- If the one-shot result violates canon, record the exact failure and leave its
  downstream boxes blocked; do not spend a second generation.
- No workbench PNG, reference crop, or iteration PNG is committed.
- No deployment or homepage code integration is part of this production pass.
- Layer-equivalent component exports and per-state assembly manifests must cover
  body/skin, uniform, front/rear hair, eyes, ribbon, left/right wing, shards,
  katana(s), tear, lighting, and shadow. Heavy editable workbench sources remain
  local; their compact manifests and production WebPs are tracked.
