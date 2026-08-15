# Lucy v4 Independent Review

Review date: 2026-08-14
Reviewer: Sol High, independent of generation and export
Decision: **STOP — zero active candidates are pristine or promotable.**

## Executive verdict

The final manifest is mechanically coherent at 18 `gpt-image-2` calls: nine
active candidates, nine superseded Hell references, nine replacement calls,
zero active alpha deliverables, and nine opaque preview-only WebPs. Every
manifest path resolves.

All nine active candidates hard-fail at least one frozen guard. The only useful
owner selection available is **pose/art preference among rejected visual
references**. There is no production-alpha selection and no candidate may be
described as pristine, approved, a master, or a downstream input.

The active STOP is not caused by a single shared issue:

- Heaven and Ultra A/B/C are opaque RGB images with a painted checker, so the
  matte guard correctly rejects them before semantic alpha approval.
- Active Hell A3/B3/C3 use the correct full-source, exact-inversion strategy in
  principle, but all three source plates fail the permitted exact-flat-green
  fallback, all three fail the canonical cyan-to-red tear gate, and all three
  fail their explicit safe-frame padding.
- Heaven A additionally fails arm continuity and its open-A silhouette.
- Ultra A additionally fails the open-A leg guard.

## Call accounting and evidence boundary

| Calls | Role | Final disposition |
| --- | --- | --- |
| 1-3 | Heaven A/B/C | Active; all hard fail |
| 4-6 | Registered post-inversion Hell face edits | Superseded rejected references |
| 7-9 | Ultra A/B/C | Active; all hard fail |
| 10-12 | First full-source Hell A/B/C | Superseded rejected references |
| 13-15 | Full-source Hell A2/B2/C2 | Superseded rejected references |
| 16-18 | Full-source Hell B3/C3/A3 | Active; all hard fail |

The final counters are `generated_call_count=18`,
`replacement_call_count=9`, `active_candidate_count=9`,
`superseded_candidate_count=9`, `alpha_deliverable_count=0`, and
`preview_only_count=9`. The worker's final as-is backup receipt reports 400 PNG
files copied without transforms under `lucy-masters-backup`.

I opened every active raw and preview, the superseded Hell raws relevant to the
strategy changes, the old registered finals and face-edit raws, the available
alpha and white/black/gray/checker/inverted audit views, the Hell masks, the
contact sheet, and both matte-model probes. Machine reports were checked
against the visible result rather than accepted as a substitute for it.

## Exact active candidate verdicts

`Art` combines identity, anatomy, modesty, state, weapon, and pose/framing.
`Alpha` includes a lawful source, matte, semantic occupancy, and edge evidence.

| Candidate | Anatomy / limbs | Modesty | State / weapon | Pose / frame | Alpha / edge | Art | Overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Heaven A | **FAIL** — visible left hand cannot be traced continuously to torso | PASS | PASS — two cyan diamond eyes, one katana | **FAIL** — dense crossing defeats open A silhouette | **FAIL** — opaque painted checker; no alpha | **FAIL** | **FAIL** |
| Heaven B | PASS — one head/torso, two arms/hands, two legs/feet | PASS | PASS — Heaven state, one katana | PASS — distinct three-quarter rotation | **FAIL** — opaque painted checker; no alpha | PASS | **FAIL** |
| Heaven C | PASS — complete count and traceability | PASS | PASS — Heaven state, one katana | PASS — clear centered plunge | **FAIL** — opaque painted checker; no alpha | PASS | **FAIL** |
| Hell A / A3 call 18 | PASS — complete count and traceability | PASS | **FAIL** — tear gate is 2 cyan/red pixels and 0.0084 vertical span; one katana passes | **FAIL** — required 12% empty padding is breached | **FAIL** — near-green plate rejected at 0.0000 key fraction; no alpha | **FAIL** | **FAIL** |
| Hell B / B3 call 16 | PASS — complete count and traceability | PASS | **FAIL** — 0 vivid-cyan source and 0 vivid-red final pixels; one complete katana passes | **FAIL** — required 12% padding is breached | **FAIL** — near-green plate rejected at 0.0000 key fraction; no alpha | **FAIL** | **FAIL** |
| Hell C / C3 call 17 | PASS — complete count and traceability | PASS | **FAIL** — 0 vivid-cyan source and 0 vivid-red final pixels; one complete katana passes | **FAIL** — required 15% padding is breached | **FAIL** — near-green plate rejected at 0.0000 key fraction; no alpha | **FAIL** | **FAIL** |
| Ultra A | PASS — exact limb count and traceability | PASS | PASS — one gold eye, opposite closed tear eye, two held katanas | **FAIL** — legs cross and stack against A guard | **FAIL** — opaque painted checker; no alpha | **FAIL** | **FAIL** |
| Ultra B | PASS — complete count and traceability | PASS | PASS — Ultra state and two held katanas | PASS — distinct three-quarter rotation | **FAIL** — opaque painted checker; no alpha | PASS | **FAIL** |
| Ultra C | PASS — complete count and traceability | PASS | PASS — Ultra state and two held katanas | PASS — centered controlled plunge | **FAIL** — opaque painted checker; no alpha | PASS | **FAIL** |

All nine pass the visible modesty requirement: the pelvic section is covered,
no underwear is exposed or emphasized, and ordinary leg skin is not treated as
a failure.

Heaven A/B/C and Ultra A/B/C are compositionally distinct as sets, although
their A candidates fail the open-leg/open-silhouette guard. Active Hell A3 is
diagonal, but B3 and C3 converge on nearly the same upright, front-readable,
open-leg composition; therefore the active Hell set also fails strict
three-pose distinctness.

## Hell strategy and registration review

The old calls 4-6 post-inversion face-edit strategy is superseded and must
remain reference-only. Its registration mechanics were internally exact for
the failed opaque sources: alpha was byte-identical, RGB drift outside each
tracked face mask was zero, and changed pixels inside the masks were 14,157,
11,947, and 11,906 for A/B/C. That does not make the results valid because the
registered bases were opaque checker reconstructions and the strategy is no
longer authorized.

The replacement full-source strategy is correct in principle: generate a
Heaven-palette source with naturally closed lids and one source-cyan tear, make
a lawful alpha matte, then apply `RGB_hell = 255 - RGB_source` to the entire
foreground while preserving alpha byte-for-byte and applying no local edit.
The active A3/B3/C3 inversion reports prove exact `255 - source` RGB with no
post-inversion recolor, but only over rejected opaque preview sources. None
passes the plate + tear + framing + edge + anatomy contract simultaneously, so
none establishes a production Hell master.

The most important regression was superseded A2. Its automated matte initially
passed, but independent white/black/checker review exposed a visible pink rim
and an orange/gold rather than vivid-red tear. A paired two-pixel interior-ring
calibration found 630 broad source-green pixels mapping exactly to 630 final
pink/magenta pixels, all fully opaque. Its tear ROI contained zero strict vivid
cyan source pixels and zero strict vivid-red final pixels. The strengthened
paired contour and tear gates now preserve that failure as a regression case.

## Transparency, checker, and matte disposition

- Every active Heaven/Ultra raw and preview has alpha extrema 255/255, zero
  transparent pixels, and zero partial-alpha pixels. White, black, mid-gray,
  light-checker, and dark-checker audits are pixel-identical to the source
  because the painted checker occludes every audit background.
- Active Hell A3/B3/C3 are also opaque RGB near-green sources, not verified
  `#00FF00` plates. Their retained WebPs are exact whole-canvas inversions with
  magenta plates and are explicitly preview-only.
- Edge/fringe cannot receive a PASS when there is no accepted alpha. A clean
  opaque preview is not evidence of a clean production matte.
- The BiRefNet Heaven-A probe removes required wing/effect structure; the
  ISNet-Anime probe retains large smoky/checker contamination. Neither is a
  candidate or a lawful recovery path.

The frozen v4 process would have blocked the reported v3 failures: head/face
occupancy is required before export, and the multi-background plus paired
interior-boundary checks catch chroma-derived contour contamination. In this
run, occupancy cannot be claimed for rejected opaque Heaven/Ultra sources and
no failed source is allowed to become a production WebP.

## Owner-selection boundary

- **Pose/art preference only:** Heaven B, Heaven C, Ultra B, and Ultra C may be
  compared as rejected visual references because their visible art guards
  pass. This does not authorize promotion or derivation.
- **Hell visual reference only:** A3/B3/C3 may be compared for direction, but
  none passes its full art/state/frame contract.
- **Production-alpha selection:** unavailable for every candidate.
- **Pristine candidates:** none.
- **Downstream action:** STOP. Do not promote v4, replace v3, rebuild
  derivatives, update frontend imports, or label any candidate approved.

## Evidence integrity notes

All paths referenced by the final manifest resolve. Two historical bookkeeping
artifacts remain non-authoritative: some early call receipts spell workbench
candidate directories with lowercase set letters, and legacy
`review-webp-report.json` files name outputs later moved to an obsolete path.
The final manifest and active preview paths are the source of truth.
