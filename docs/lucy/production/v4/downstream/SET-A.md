# Lucy v4 Set A downstream receipt

Status: exported; owner-approved visual composition with explicit matte status.

## Scope

Set A consumes only the owner-approved v4 visual sources `heaven-A`, `hell-A`,
and `ultra-A`, alongside the established Zero, neutral, background, effect,
and katana authority assets. It does not modify frontend imports, prior
variations, or collective manifests.

## Transparency disclosure

The owner approved the v4 compositions while preserving the earlier automated
matte findings. The local `birefnet-general` segmentation pass was run only as
a deterministic extraction attempt:

- Heaven A and Ultra A pass the local semantic matte guard after extraction.
- Hell A retains a local exterior green/magenta fringe failure; it remains
  owner-approved visual source rather than a guard-certified transparent master.
- Neither local result retroactively changes the failed raw-candidate gate.

The assembly manifest records every source, local report, and owner-override
status. Opaque hero, panel, portrait, and social composites remain an intentional
fallback surface rather than an assertion that their source has production alpha.

## Intended output map

- P0: standardized state masters, full-state WebPs, Ultra desktop primary,
  Heaven desktop alternate, and separate mobile assemblies.
- P1: four feature panels and state plus neutral bust portraits.
- P2: modular katana, ribbons, wings, shards, eyes, FX, backgrounds, and icons
  are exact path references in the assembly manifest rather than copied assets.
- P3: OG, square, portrait, and story campaign WebPs.

## Self-review and mechanical receipt

- Reviewed `masters/` on normal and dark composite boards in
  `packages/site/assets/workbench/lucy/V4-SET-A/review/`.
- Reviewed desktop and genuinely separate mobile hero assemblies on the hero
  contact sheet in the same workbench folder.
- Re-opened all 25 output WebPs after export. Required hero dimensions are
  2560×1440 desktop and 1080×1920 mobile. No production PNG exists in the Set A
  directory.
- Backed up all workbench PNGs as-is with
  `scripts/assets/backup-lucy-pngs.sh`: 438 files copied, exit 0.

## Known guard record

This receipt is deliberately not an approval claim for the original candidate
raw PNGs. Their earlier guard findings remain in
`packages/site/src/assets/lucy/v4-candidates/CANDIDATE_MANIFEST.json`; owner
approval in `V4_OWNER_APPROVAL.md` authorizes downstream use while preserving
that history.
