# Lucy v4 — Set C downstream receipt

Status: **owner-approved visual downstream; alpha status remains explicitly
uncertified.**

Set C uses `heaven-C`, `hell-C`, and `ultra-C` under the recorded owner
approval. Hell is sourced from the complete, exact-inverted Hell C lineage;
there is no post-inversion eyelid, skin, or tear correction. Its tear reaches
from the eyelid through the face in the approved source lineage.

## Deliverables

- P0: four full-state WebPs; Ultra primary and Heaven alternate 2560×1440
  desktop heroes; two independently placed 1080×1920 mobile heroes.
- Standard live source paths: `masters/lucy-heaven.webp`,
  `masters/lucy-hell.webp`, `masters/lucy-ultra.webp`,
  `heroes/lucy-ultra-primary-desktop.webp`, and
  `heroes/lucy-heaven-alternate-desktop.webp`.
- P1: four matching 1024×1280 state panels and five 1024×1024 state/neutral
  bust portraits.
- P2: references—not copies—to the approved backgrounds, authority katana,
  eyes, ribbons, wings, shards, FX, and state icon libraries.
- P3: 1200×630 OG, 1080×1080 square, 1080×1350 portrait, and 1080×1920 story.

The exact file list and all transform/source relationships are in
`packages/site/src/assets/lucy/v4-approved/set-c/PROVENANCE_AND_ASSEMBLY_MANIFEST.json`.

## Matte disclosure

The upstream v4 candidate RGB files are baked-checker previews. A recoverable,
local ISNet Anime segmentation proposal is used only to make owner-authorized
opaque hero/panel/social compositions and Alpha-bearing state files. It did not
convert the candidate matte report into a pass. No file in this set claims
pristine/native alpha; each relevant source records
`OWNER_OVERRIDE_UNCERTIFIED_ISNET_ANIME_PROPOSAL` in the assembly manifest.

## Worker checks

- Re-open every final WebP and confirm exact required dimensions.
- Confirm no production PNG exists in `v4-approved/set-c`.
- Inspect all final surfaces once in the ignored workbench normal/dark review sheets.
- Back up all workbench PNGs as-is using `scripts/assets/backup-lucy-pngs.sh`.

The review was performed. Opaque desktop/mobile/panel/social surfaces remain
copy-readable. The light-composite sheet exposes the expected model-assisted
smoke/halo around alpha-bearing Heaven, Hell, and Ultra cutouts—most visible
around Hell shards and hair. This is an existing alpha-gap finding preserved by
the owner override, not a failed check silently waived or repaired.
