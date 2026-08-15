# Lucy v4 Hell full-source replacement prompts

Status: **frozen before calls 10-12**

These three prompts supersede the post-inversion face-edit prompts in
`V4_CANDIDATE_PROMPTS.md`. The old calls and files remain rejected references.
Each prompt is one independent full-master `gpt-image-2` call. No inpainting,
post-inversion generation, recoloring, or face patch is authorized.

## Shared output contract

Create one complete, premium full-body anime illustration of canonical Lucy on
a perfectly flat `#00FF00` chroma plate. The plate must contain zero gradient,
texture, checker pattern, shadow, reflection, glow, bounce, or subject-colored
detail. Do not simulate transparency. Keep the full head, shoulder-length hair,
both arms and hands, both long proportionate legs and bare feet, one real-steel
authority katana, every wing shard, and every effect comfortably inside frame.

Lucy is painted in normal Heaven-space colors before inversion: porcelain skin,
silver-white shoulder-length hair, opaque deep-navy Japanese sailor blouse and
opaque pleated skirt, prismatic chest ribbon, and disconnected saturated
cyan-blue glass-shard wings. Both eyes are naturally closed in the generation,
not painted over. Exactly one tear starts in direct contact with one closed
eyelid and runs as one uninterrupted wet trail down the entire cheek/face to a
natural endpoint near the jaw; it never stops midway, floats, forks, or appears
on the other eye. Paint this source tear vivid cyan `#00FFFF`, because the exact
full RGB inversion will make it canonical vivid red `#FF0000`. Do not paint a
red source tear.

Exactly one curved real-steel katana: navy-black handle with pale diamond wrap,
ornate antique-gold round tsuba, lacquered saya only where logically visible.
Exactly one head, one torso, two arms, two hands, two legs, and two feet. Every
limb traces continuously to the torso. Use an open airborne silhouette with
both legs and feet separately countable; believable waist, pelvis, hip, thigh,
knee, calf, ankle, and foot proportions. The opaque skirt completely covers
underwear and the pelvic section. Ordinary leg skin is fine; no under-skirt
view. No detached or anatomy-like hair, ribbon, or shards.

After generation the repository pipeline will remove only the exact flat green
plate, run the Lucy matte guard, and—only if that source passes—apply
`RGB_hell = 255 - RGB_source` to every foreground pixel. It will preserve alpha
byte-for-byte and make no local edit or recolor afterward.

Avoid: open eyes, diamond eyes, a second tear, short or interrupted tear,
mid-cheek tear endpoint, red source tear, black painted eyelids, post-inversion
look, restored skin, extra limbs, crossed or stacked knees, hidden feet,
obscured face, extra head or torso, detached hand, extra weapon, glass sword,
fantasy weapon, feathers, membrane wings, armor, jewelry additions, shoes,
environment, ground, floor shadow, text, UI, frame, signature, watermark, crop,
checkerboard, white background, purple or magenta key, green subject detail,
underwear, transparent skirt, or pelvic exposure.

## Call 10 — Hell-source A: open diagonal curl

Evolve the authority sheet's airborne curled energy into a clean diagonal fall.
Keep the torso upright enough for the complete closed-eye face and continuous
full-cheek tear to read clearly. Use one extended leg and one bent leg as two
separate long arcs with both feet visible, never a tight knee stack. Hold the
single katana in a natural counter-line. Hair, ribbon, and cyan shard wings flow
upward and away from the face. Preserve negative space around head, hands,
feet, blade tip, and outer shards.

## Call 11 — Hell-source B: controlled three-quarter rotation

Use a restrained three-quarter aerial rotation with readable shoulder-to-hip
twist, open arm spacing, and a sweeping S-curve. One leg reaches into the fall
while the other bends backward in a separate depth plane; never cross or stack
the knees. Keep the face large and unobscured so both naturally closed eyelids
and the single cyan tear running from eyelid down the full cheek are explicit.
Integrate the katana with one hand and trail the cyan shards with the rotation.

## Call 12 — Hell-source C: centered controlled plunge

Create the clearest small-card silhouette: a centered controlled plunge with
modest foreshortening and a strong vertical line of action. Keep broad negative
space between Lucy and a deliberate cyan wing fan. The katana anchors one side
without tangency. Both legs remain long, separate, and individually readable.
Keep the face unmistakable and large enough to verify natural closed eyelids
and one uninterrupted cyan tear from eyelid through the full cheek to the jaw.
