# Lucy Heaven / Hell / Ultra v4 Candidate Brief

Status: **active candidate gate; no production promotion is authorized.**

This pass replaces the rejected v3 character masters only. V3 and every earlier
version remain intact as recoverable references. Existing background plates,
atmosphere, vectors, and authority-katana pack remain frozen until the owner
selects a v4 character set.

## Deliverable and call budget

Produce exactly three candidate sets, `A`, `B`, and `C`:

- three independently generated Heaven masters;
- three independently generated, Heaven-palette Hell-source masters with both
  eyes naturally closed and one continuous complementary-cyan tear, each
  converted to its final Hell candidate by one exact full foreground RGB
  inversion and no subsequent edit or recolor;
- three independently generated Ultra masters.

The original nine-call batch is retained as evidence, but its three bounded
post-inversion Hell face edits are owner-rejected references. Calls 10-12 were
the first full Hell-source round; all three failed at least one hard guard.
The owner's standing instruction requires another candidate when a guard is
breached, so exactly one frozen replacement call for each failed set was made
as calls 13-15. Replacement B2 then hard-failed because its katana was cropped
at the canvas edge, while C2 returned a non-key plate and touched the top edge;
one B-only framing replacement and one C-only plate/framing replacement are
therefore authorized as calls 16-17. A2 subsequently failed the independent
human edge review and the paired tear-color gate: its inverted tear was
orange/gold with zero vivid-red pixels. One A-only tear/edge replacement is
therefore authorized as call 18. The recorded batch has eighteen
`gpt-image-2` calls total: three Heaven,
three rejected post-inversion Hell edits, three Ultra, three rejected
first-round full Hell sources, three second-round full Hell sources, and one
B-only, one C-only, plus one A-only replacement. Do not make any other unbriefed
replacement or variation. Preserve every result and record failures honestly.

Raw and intermediate PNGs go only under
`packages/site/assets/workbench/lucy/V4-CANDIDATES/`. Run
`scripts/assets/backup-lucy-pngs.sh` after every PNG batch. Review WebPs may be
materialized under `packages/site/src/assets/lucy/v4-candidates/`; they are not
approved masters and must be labeled `candidate`.

## Authority hierarchy

1. This brief and the owner corrections recorded here.
2. `packages/site/src/assets/lucy/authority/lucy-character-sheet-master.png`
   for face, hair, uniform, ribbon, eyes, materials, and state language.
3. `docs/lucy/authority/LUCY_CANONICAL_CHARACTER_SHEET.md`.
4. `docs/lucy/authority/lucy-canon.json`.
5. `packages/site/src/assets/lucy/authority/lucy-original-reference.jpg` for
   rendering energy only.
6. `packages/site/src/assets/lucy/frontpage/katana-authority-v2/` for katana
   construction.

V1, v2, and v3 full bodies are rejected anatomy and matte authority. Never use
their body geometry, leg pose, skirt exposure, or extracted alpha as a source.
The approved character sheet remains pose-direction authority for each state's
energy: Heaven's compact airborne curl and cyan wing burst, Hell's falling
fragmentation, and Ultra's decisive gold-wing focus. Improve those ideas into
cleaner, more expressive silhouettes; do not trace the sheet's contaminated
lower-body anatomy or duplicate its exact pose.

## Shared identity and anatomy guards

- One original character: Lucy. Exactly one head, one torso, two arms, two
  hands, two legs, and two feet.
- Every limb must trace continuously to the torso. No duplicated, fused,
  detached, phantom, or anatomy-like hair/ribbon/shard shapes.
- Use an open silhouette. Avoid dense crossed-leg arrangements. Both legs and
  feet must remain countable at full size and card size.
- Slender, balanced anime-fashion anatomy: structural ribcage-to-waist-to-pelvis
  connection; believable hip and thigh volume; readable knees and calves;
  normal ankles and feet. No abbreviated, needle-thin, or childlike lower body.
- Shoulder-length silver-white hair with upward airflow; do not turn the hair
  into floor-length flame or an opaque wing mass.
- Dark opaque Japanese sailor uniform, opaque pleated skirt, prismatic chest
  ribbon, bare legs and naturally constructed bare feet.
- Ordinary skin exposure is allowed. The pose and opaque skirt must fully cover
  underwear and the pelvic section. No under-skirt view, transparent cloth,
  intimate low angle, or underwear focal point.
- Authority katana: curved real steel, navy-black pale-diamond wrap, ornate
  antique-gold round tsuba, lacquered saya where visible. Heaven/Hell: exactly
  one. Ultra: exactly two matching katanas.
- No text, UI, frame, signature, watermark, feathers, membrane wings, armor,
  jewelry additions, shoes, or fantasy/glass swords.

## Transparency and matte contract

The previous pass failed because a baked checker was treated as transparency.
The generator prompt must say all of the following:

- return a real PNG alpha channel;
- background pixels must have alpha `0`, not painted white or checkerboard;
- never draw, simulate, or bake a checkerboard transparency pattern;
- never use purple or magenta as a background/key color;
- keep RGB color in translucent hair and glass edges without a matte.

If real alpha is not returned, the only permitted opaque fallback is a perfectly
flat `#00FF00` plate with zero gradient, texture, shadow, bounce, reflection, or
green subject detail. Do not use near-white checker reconstruction or purple
despill. Extract with the repository matte tool and retain the original raw.

A candidate fails the presentation gate unless:

- alpha is materially opaque in a tight face-core region (at least 70 percent
  of its pixels at alpha 192 or higher and median nonzero alpha at least 224),
  and alpha density—not merely nonzero ghost pixels—preserves the head and hair;
- alpha is nonzero in the torso, both arms/hands, both
  legs/feet, required wings, and required weapon regions;
- there are no foreground-colored pixels hidden under alpha `0` in those
  regions;
- no strong green or magenta key pixels remain in the exterior partial-alpha
  band;
- normal, white, black, mid-gray, and inverted checker composites all show a
  complete head, complete hair, clean skin, clean glass, clean steel, and no
  colored fringe;
- the alpha silhouette contains no border-connected plate and no internal
  checker-grid periodicity.

Do not judge completeness from RGB alone. The alpha channel is the authority.

## Pose-quality gate

The three sets must be compositionally distinct at thumbnail scale—not the same
pose with a camera nudge. Each pose must communicate controlled airborne motion,
carry a clear line of action from hair through torso and legs, integrate the
katana rather than leaving it as a floating prop, and give the wings deliberate
visual rhythm. Preserve useful negative space around the face, hands, feet,
blade tips, and outermost shards. Prefer elegant asymmetry over a stiff model
sheet stance. Pose improvement never overrides anatomy, modesty, state, or alpha
guards.

## Candidate A — authority-evolved open diagonal curl

Evolve the authority sheet's airborne curled energy into a clean diagonal fall:
the torso stays upright enough for face and skirt coverage to read immediately;
the bent and extended legs form two separate long arcs with both feet visible,
never a tight knee stack. Heaven carries one katana in a natural counter-line.
Ultra uses a more decisive mirrored blade rhythm without crossing either blade
through her body. Hair and shards flow upward and away from the face.

## Candidate B — controlled three-quarter rotation

Use a restrained three-quarter aerial rotation with a visible shoulder-to-hip
twist, open arm spacing, and a sweeping S-curve line of action. One leg reaches
into the fall while the other bends backward in a clearly separate depth plane;
do not cross or stack the knees. Heaven's wing shards trail the rotation. Ultra's
two katanas form a purposeful open V or parallel counterflow. Keep the face
large enough for eye-state review.

## Candidate C — centered ascension / plunge

Create the clearest small-card silhouette: a centered ascension or controlled
plunge with modest foreshortening, a strong vertical line of action, broad
negative space between body and wing fan, and an unmistakable face. Heaven's
single sword anchors one side of the composition. Ultra's paired swords frame
the body without tangencies. Keep both legs long and individually readable; do
not shorten the lower body.

## Heaven state

- Both saturated cyan-white diamond eyes open; no tear.
- Ordered, disconnected, saturated cyan-blue glass-shard wings.
- Heaven blue `#7CC4FF`, porcelain skin bounce, deep navy shadows.
- Exactly one authority katana.
- No gold, red tear, closed eye, inversion, feathers, or extra weapon.

## Full-source Hell state

Do not edit the face after inversion. For each set, generate an independent
complete Heaven-palette Hell-source master. It must already contain both eyes
naturally closed and exactly one continuous tear beginning at one closed eyelid
and running down the full cheek/face to its natural lower endpoint. The tear
must not stop midway, float away from the eyelid, split, or appear on both sides.

Final Hell requires a vivid red tear while also forbidding post-inversion
recoloring. Therefore the source tear must use the exact complementary cyan
needed to become vivid red under `RGB_hell = 255 - RGB_source`; for example,
source `#00FFFF` becomes final `#FF0000`. This is a production transform, not a
change to canon: the owner-facing final tear remains red.

After a source passes its anatomy, modesty, state, alpha, edge, and semantic
region gates, unpremultiply if required and apply that exact RGB inversion to
every foreground pixel, including the closed eyelids, tear, skin, hair,
uniform, ribbon, steel, wings, and glass. Preserve dimensions, coordinates, and
alpha byte-for-byte. Make no post-inversion generation, face patch, mask,
repaint, skin restoration, tear recolor, or local correction. The active Hell
master and every Hell-related derivative must descend only from this untouched
inverted source. The rejected bounded-edit Hell files remain reference-only and
must never feed the derived pipeline.

## Ultra state

- One gold diamond eye open; the other closed with exactly one vivid red tear.
- Gold-prismatic disconnected glass-shard wings; no inversion.
- Exactly two matching authority katanas, both readable and physically held or
  intentionally aligned with her hands.
- Same anatomy, outfit, hair, ribbon, modesty, transparency, and edge guards.
- No purple/magenta fringe anywhere in hair, wings, skin, skirt, or steel.

## Review order and hard stop

1. The production worker performs one explicit self-review of each active
   candidate and records a checklist per candidate. The three superseded Hell
   edits retain their historical rejected verdicts.
2. A separate reviewer opens every raw, alpha matte, five composite audits, and
   candidate WebP. The reviewer records anatomy, state, modesty, weapon, alpha,
   head/hair occupancy, and fringe verdicts independently.
3. Build a static candidate gallery showing Heaven/Hell registration and the
   audit composites.
4. Stop and present all three sets to the owner. Do not choose, promote,
   overwrite `v3/`, rebuild derivatives, or change live frontend imports before
   owner selection.
