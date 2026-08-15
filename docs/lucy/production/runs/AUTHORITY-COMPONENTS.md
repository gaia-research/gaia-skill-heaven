# Authority component recovery — feasibility receipt

## Scope

This is a zero-cost deterministic recovery pass only. No model call, raster
generation, inpainting, color repaint, or inferred mask was used. The supplied
final authority inputs were reviewed once with `view_image`:

- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Model_Turnaround_reference.png`
- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_Katana_reference.png`
- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_ZERO_reference_panel.png`
- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_HEAVEN_reference_panel.png`
- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_HELL_reference_panel.png`
- `packages/site/assets/workbench/lucy-authority/reference_crops/Lucy_ULTRA_reference_panel.png`

`scripts/assets/lucy-authority-components-export.mjs` writes the reproducible
feasibility record at
`packages/site/assets/workbench/lucy/AUTHORITY-COMPONENTS/audit/authority-components-feasibility.json`.

## One-pass self-review and rejected alpha trials

The initial deterministic crop/background-removal trials were inspected once in
both normal and RGB-inverted checkerboard audits:

- `packages/site/assets/workbench/lucy/AUTHORITY-COMPONENTS/audit/authority-hair-normal-checker.png`
- `packages/site/assets/workbench/lucy/AUTHORITY-COMPONENTS/audit/authority-hair-inverted-checker.png`

They were rejected and removed from production: the neutral crop retained sailor
uniform/adjacent-model pixels; the Heaven and Ultra crops retained shard-wing
pixels and hit component edges; the Hell crop combined hair with face/forehead
and shard pixels. Keeping any of them would be a matte/geometry error, not a
real isolated component. No candidate therefore reached the WebP reopen/alpha
acceptance stage, and no production output was retained from those trials.

## Blocked / deliberately not invented

- `components/hair/lucy-hair-neutral.webp` — the model-turnaround back hair is flattened with the sailor collar and adjacent models. A clean alpha mask would cut garment pixels or retain presentation pixels.
- `components/hair/lucy-hair-upward.webp` — Heaven hair overlaps cyan shard-wing geometry, so a standalone hair silhouette is absent.
- `components/hair/lucy-hair-inverted.webp` — Hell hair is flattened into forehead/face and fragmented shard pixels, so a complete isolated component is absent.
- `components/hair/lucy-hair-ultra.webp` — Ultra hair is flattened into face and gold shard-wing geometry, so a complete isolated component is absent.
- `components/katana/lucy-katana-sheathed.webp` — the approved katana reference shows two unsheathed blades and a handle close-up, not a complete isolated sheathed katana. The GEN-05 pose also occludes its sheathed weapon.
- `components/katana/lucy-katana-saya.webp` — no complete saya occurs in the supplied final authority panels; the only candidate in GEN-05 is occluded by Lucy's legs.

## Backup

The authority-crop inspection and rejected preview PNGs remain under ignored
workbench storage. `scripts/assets/backup-lucy-pngs.sh` was run after the audit
PNGs landed; its latest pass reported 65 PNGs backed up as-is.
