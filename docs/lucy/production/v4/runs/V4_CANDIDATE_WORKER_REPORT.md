# Lucy v4 Candidate Worker Report

Status: **STOP — all nine active candidates hard-fail at least one frozen guard.**

## Generation accounting

- Model: `gpt-image-2` through the built-in image generation tool.
- Generated calls: **18 exactly**.
  - Calls 1-3: Heaven A/B/C full candidates.
  - Calls 4-6: superseded bounded Hell face edits A/B/C.
  - Calls 7-9: Ultra A/B/C full candidates.
  - Calls 10-12: superseded first-round full Hell sources A/B/C.
  - Calls 13-15: superseded A2/B2/C2 full Hell sources.
  - Calls 16-18: active preview-only B3/C3/A3 Hell sources.
- Active candidates: **9**, all hard fail.
- Superseded generated Hell references: **9** — calls 4-6, 10-12, and 13-15.
- Active alpha review WebPs: **0**.
- Active preview-only WebPs: **9**.
- Final as-is PNG backup: exit 0; **400 PNG files** copied without transforms under `lucy-masters-backup`.

No model call occurred after call 18.

## Active hard-gate results

| Candidate | Matte / edge result | Art and state result | Verdict |
| --- | --- | --- | --- |
| Heaven A | opaque painted checker; no accepted alpha | missing arm continuity | HARD FAIL |
| Heaven B | opaque painted checker; no accepted alpha | visual art guards otherwise pass | HARD FAIL |
| Heaven C | opaque painted checker; no accepted alpha | visual art guards otherwise pass | HARD FAIL |
| Hell A / A3 call 18 | opaque near-green plate rejected at 0.0000 exact-key fraction | anatomy/modesty/weapon pass; canonical tear is 2 pixels with 0.0084 span; 12% frame fails | HARD FAIL |
| Hell B / B3 call 16 | opaque near-green plate rejected at 0.0000 exact-key fraction | anatomy/modesty/weapon pass; tear is 0/0 vivid pixels; 12% frame fails | HARD FAIL |
| Hell C / C3 call 17 | opaque near-green plate rejected at 0.0000 exact-key fraction | anatomy/modesty/weapon pass; tear is 0/0 vivid pixels; 15% frame fails | HARD FAIL |
| Ultra A | opaque painted checker; no accepted alpha | legs cross/stack | HARD FAIL |
| Ultra B | opaque painted checker; no accepted alpha | visual art guards otherwise pass | HARD FAIL |
| Ultra C | opaque painted checker; no accepted alpha | visual art guards otherwise pass | HARD FAIL |

The active Hell previews are exact whole-opaque RGB inversions. They are useful
for visual comparison only and are not alpha deliverables, pristine masters,
approved art, or production inputs.

## Superseded Hell evidence

- Calls 4-6: rejected post-inversion generated face edits.
- Call 10: rejected plate, missing arm/hand, crossed knees, short tear.
- Call 11: missing arm/hand, crossed knees, short tear.
- Call 12: crossed/overlapping legs and final edge failure.
- Call 13 / A2: automated matte path passed, but human composite review found a
  pink/magenta contour and orange/gold tear; paired gate confirms 0 source-cyan
  and 0 final-red pixels. Its old alpha export is preserved as rejected evidence.
- Call 14 / B2: katana tip cropped; plate rejected.
- Call 15 / C2: hair touches top edge; plate rejected.

Every superseded raw, intermediate, audit, preview/reference, and call receipt is
retained. No failed source feeds production derivatives.

## Guard and handoff evidence

- Machine-readable source of truth:
  `packages/site/src/assets/lucy/v4-candidates/CANDIDATE_MANIFEST.json`.
- Frozen calls 1-9:
  `docs/lucy/production/v4/runs/V4_CANDIDATE_PROMPTS.md`.
- Frozen calls 10-12:
  `docs/lucy/production/v4/runs/V4_HELL_SOURCE_PROMPTS.md`.
- Frozen calls 13-18:
  `docs/lucy/production/v4/runs/V4_HELL_SOURCE_REPLACEMENT_PROMPTS.md`.
- Deterministic matte guard:
  `scripts/assets/lucy-matte-guard.py`.
- Deterministic exact-inversion and paired tear harness:
  `scripts/assets/lucy-v4-candidate-pipeline.py`.

No v3 asset, downstream derivative, frontend import, owner gallery, or promoted
v4 master was changed by this worker.
