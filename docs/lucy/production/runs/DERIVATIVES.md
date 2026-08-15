# DERIVATIVES — deterministic P2/P3 cross-kit export

## Scope and provenance

- Generation calls: **0**. This pass only composited, positioned, resized, keyed the pre-existing Zero source for its avatar, encoded, and audited existing Lucy assets.
- Reusable exporter: `node scripts/assets/lucy-derivatives-export.mjs`.
- Pixel helper: `scripts/assets/lucy-derivatives-export.py` (Pillow/numpy compositing; `cwebp -lossless -exact` for clean-alpha WebP encoding).
- Isolated sources: `packages/site/assets/workbench/lucy/GEN-01/cutout-alpha.png` (Ultra) and `GEN-02/cutout-alpha.png` (Heaven). Zero avatar is a deterministic #00FF00 key of `states/lucy-zero.webp`.
- Workbench normal/inverted checks and machine audit: `packages/site/assets/workbench/lucy/DERIVATIVES/`.
- PNG backup rerun: `scripts/assets/backup-lucy-pngs.sh` after every workbench PNG export.

## Outputs

- Identity: `identity/lucy-avatar-zero.webp` and `identity/lucy-avatar-heaven.webp` (256×256 real alpha, intentionally face-led for 64px display); `identity/lucy-horizontal-header.webp` (2400×720 real alpha, no text).
- Social, all with no baked copy: `social/lucy-og-1200x630.webp`, `lucy-square-1080.webp`, `lucy-portrait-1080x1350.webp`, and `lucy-story-1080x1920.webp`.
- Mobile, re-authored from isolated state masters and deliberate dark plates: `mobile/lucy-ultra-hero-1440x2560.webp` and `mobile/lucy-heaven-hero-1440x2560.webp`. Both reserve the upper half for headline/UI space while retaining face, rising hair, ribbon, shard field, and weapon(s) in the lower visual field; they are not blind crops.
- Assembly manifests: `assemblies/lucy-{zero,heaven,hell,ultra}-assembly.json` under `packages/site/src/assets/lucy/`.

## Validation and self-review

- All requested output dimensions re-opened successfully. Identity outputs retain alpha; social/mobile plates are intentionally opaque.
- Header and both avatars passed normal and inverted checker review. `cwebp -lossless -exact` replaced the initial Pillow WebP encoding after it exposed invalid-looking transparent-edge RGB in preview; the final inspected WebPs are clean.
- Every final derivative was visually reviewed once: two avatars, transparent header, four social cards, and both mobile heroes. No artwork contains text, labels, watermark, signature, frame, or UI.
- All output mappings and alpha counts are in `packages/site/assets/workbench/lucy/DERIVATIVES/audit.json`.

## Honest limitations / blocked work

- `models/lucy-neutral-zero-open.webp` is blocked. The neutral model and blank-eye cell are flattened, differently framed assets with no defensible facial registration or editable eye mask; compositing would fabricate an unverified face edit.
- Body/skin, uniform, front hair, rear hair, and baked lighting/shadow are irrecoverable as separate layers from every state master. Each state assembly manifest flags this explicitly.
- The current independent wing/ribbon/FX WebPs are mapped in every relevant assembly manifest, but were not inserted into new composites: transparent-preview artifacts in the current atlas WebPs made their pixels unsuitable for promoted composition. The verified isolated state masters already carry their canonical wings, ribbon, shards, and weapons.
