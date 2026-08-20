# Lucy v5 Overkill delivery — issue 73

Production receipt for [issue 73](https://github.com/gaia-research/gaia-skill-heaven/issues/73).

## Authority and scope

- Source authority: the four owner-approved PNGs in
  `packages/site/src/assets/lucy/v5/masters/`.
- The source owns Lucy's identity, pose, composition, silhouette, and alpha.
- No image-generation call was made. This run reconstructs detail from the
  approved pixels and does not invent a new character or pose.
- Source PNG deletion and Git history rewriting are intentionally out of scope.
  The masters remain tracked as production inputs but are no longer imported by
  the frontend.
- `/`, `/landing`, and `/instrument` use the same four v5 WebP deliveries on
  desktop and mobile.

## Reproduction

Prerequisites: Python 3.11 and `cwebp` from libwebp. The pinned Python packages
are isolated inside the ignored workbench; the exporter downloads the
checksum-pinned model there and verifies it before execution.

```bash
python3.11 -m venv packages/site/assets/workbench/lucy/ISSUE-73-OVERKILL/.venv
packages/site/assets/workbench/lucy/ISSUE-73-OVERKILL/.venv/bin/pip install -r scripts/assets/requirements-lucy-overkill.txt
packages/site/assets/workbench/lucy/ISSUE-73-OVERKILL/.venv/bin/python scripts/assets/lucy-v5-overkill-export.py --provider coreml --force --quality 88
python3 scripts/assets/validate-lucy-v5-delivery.py
```

Use `--provider cpu` on a non-Apple host. Provider choice is recorded and may
change the RGB byte hashes. The pipeline invariants and exact decoded-alpha
check are provider-independent.

**Known gap in this reproduction path:** the `--force --quality 88` run that
produced the shipped delivery ran to completion for all four states but did
not exit cleanly — it crashed inside the Ultra prism-safe encode loop (see
"Ultra: known, accepted gate failures" below) before it reached the code path
that writes `DELIVERY_MANIFEST.json`. The manifest shipped here was rebuilt
after the fact directly from the delivered WebPs and their pre-encode masters
via `--reencode-existing` for Zero/Heaven/Hell (which re-converged
byte-identically) plus a direct, independent measurement pass for Ultra. A
future clean run may not reproduce this exact crash-and-rebuild path, but
should reproduce the same byte-identical Zero/Heaven/Hell outputs and the same
Ultra convergence failure, since the pipeline is deterministic given the same
provider.

## Pipeline

The exporter separates BT.709 luma, Cb/Cr, and source alpha. A conservative
Lanczos 2x result owns structure. ArtCNN R16F96 contributes only a clipped
luma residual (`gain=0.68`, `clip=8/255`, `face_enhance=false`). Chroma and
alpha never pass through the model. A tiled numerical 16x workspace is staged
through 4x to the 2x delivery with Lanczos; a full 16x frame is never
materialized or committed.

The final RGBA delivery master is encoded with cwebp quality 88, alpha quality
100, method 6, ten passes, and sharp YUV. The exporter reopens every WebP and
requires its decoded alpha bytes to equal the final pre-encode alpha bytes.
This byte-for-byte assertion applies only to the final alpha mask: RGB is
intentionally higher-resolution and sharpened. Separately, an iterative
prism-safe pass (up to 7 attempts) corrects decoded pixels that cross a
strong-green/strong-magenta fringe threshold introduced by lossy WebP chroma
quantization; see Ultra below for the one case where this did not converge.

Model provenance:

- repository: `Artoriuz/ArtCNN`
- pinned commit: `c619fc3292d8867378e072f08bb0500c086440d5`
- model: `ONNX/ArtCNN_R16F96.onnx`
- SHA-256: `498f1295c43f5799ef5bdea14a8f5b7a68d1f99ae67fee8a8f77ec9b25ca3e8d`
- license: MIT

Recorded runtime: Python 3.11.15, onnxruntime 1.29.0, NumPy 2.4.6,
Pillow 12.3.0, SciPy 1.17.1, Core ML provider, cwebp 1.6.0.

## Delivery

| State | Source | Delivery | Source bytes | WebP bytes | Reduction | SHA-256 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Zero | 1024×1536 | 2048×3072 | 1,899,846 | 573,548 | 69.81% | `5fcdf741d33280ec6881575c26fd89bc732cb4712e8f2be5c940194f53f8036e` |
| Heaven | 1024×1536 | 2048×3072 | 1,671,983 | 574,092 | 65.66% | `29b6b5344acc1fea2e5b64ebfb3921207ed8e9b418f1126b97f25594a3698edc` |
| Hell | 1024×1536 | 2048×3072 | 1,846,763 | 660,968 | 64.21% | `1fc4987b9d122732d683e5092814edd6a2602f39f2aa274fdfa6419ad2df2dc5` |
| Ultra | 1095×1437 | 2190×2874 | 2,430,523 | 1,623,554 | 33.20% | `feb320f164d0849ef79aa741bcf539018c95f67b5ac9b5a92b0b437608e438b3` |

Aggregate: 7,849,115 source bytes to 3,432,162 delivery bytes, a 56.27%
reduction. Ultra's reduction is deliberately the smallest of the four:
quality 88 preserves the very dense glass, hair, and gold edge detail while
still shipping smaller than its source PNG.

The complete source/output hashes, raw alpha hashes and counts, runtime, model,
and pipeline settings live in
`packages/site/src/assets/lucy/v5/delivery/DELIVERY_MANIFEST.json`, including
its `known_issues` block for Ultra.

## Zero, Heaven, Hell: pass every automated gate

All three pass `validate-lucy-v5-delivery.py` (provenance, dimensions, alpha
support, delivery-smaller-than-source) and `validate-lucy-v5-matte.py` (the
real `lucy-matte-guard.py` gate: transparency, opaque foreground, fractional
alpha, canvas-border safety, hidden-RGB clearing, zero green/magenta fringe,
semantic-region occupancy) cleanly, with zero prism-correction iterations
needed.

## Ultra: known, accepted gate failures

Ultra's WebP was independently re-verified (decoded and re-measured directly
from the shipped file, not read from a stale manifest) and fails three checks
that Zero/Heaven/Hell pass cleanly:

- **`has_opaque_foreground`** — 860 fully-opaque (alpha=255) pixels, under the
  gate's 1,000-pixel floor. Ultra's glass/edge-heavy design is mostly
  fractional alpha rather than flat opaque fill; this may be a real
  characteristic of the approved source rather than a pipeline defect.
- **`zero_strong_green_exterior_fringe`** — 5 of 6,294,060 decoded pixels
  (0.00008%) remain past the strong-green threshold after 7 prism-safe
  correction attempts (`green=5, magenta=0`; the loop's hard cap is 7).
- **`zero_strong_green_interior_boundary_spill`** — fails alongside the
  exterior check; not independently re-measured at the pixel level.

**Disposition:** the owner opened the delivered `lucy-ultra.webp` directly and
reviewed it visually, and made the explicit call to ship it as-is — the defect
is not visible at normal viewing sizes. This is recorded as a known, accepted
exception rather than treated as a passing gate. **Consequence:** the new
`ci.yml` steps that would run `validate-lucy-v5-delivery.py` /
`validate-lucy-v5-matte.py` on every build are deliberately **not** added in
this PR, because doing so would put a known-failing, already-accepted
exception in the way of unrelated future CI runs. Wiring these gates into CI
is left for a follow-up that also teaches the gate about this kind of
recorded, owner-approved exception (the semantic-region checks already have
an `ALLOWED_EXCEPTIONS` mechanism; the fringe/opacity checks currently do not).

## Alpha and matte verification

Every output has real transparency and fractional edge coverage; Zero, Heaven,
and Hell additionally clear the opaque-foreground floor. Zero, Heaven, Hell,
and Ultra passed the v5 semantic-region check. Zero explicitly declares wings
absent. The approved Heaven source has no separable wings region, so that
source-level exception is explicit rather than backfilled with unrelated
foreground.

The approved sources include canvas-edge contact and intentional native
prismatic magenta/green edge color. The run uses the narrow
`--allow-canvas-contact --source-native-prism` policy: measured counts remain in
the ignored reports, while hidden RGB is still cleared and all other alpha,
fringe, and semantic checks remain active.

## Gates

- `python3 scripts/assets/validate-lucy-v5-delivery.py` — **passes for
  Zero/Heaven/Hell; fails for Ultra** on the recorded, accepted exception above.
- `python3 scripts/assets/test-lucy-matte-guard.py` — unit tests, pass.
- `npm run typecheck` — pass.
- `npm -w @gaia-skill-heaven/site run build` — pass.

Because the delivery-level gate does not currently pass end-to-end (Ultra),
it is not wired into `ci.yml` in this PR. See "Ultra: known, accepted gate
failures" above.

## Source backup

After all PNG workbench audits landed, `scripts/assets/backup-lucy-pngs.sh` ran
exactly as tracked and exited 0: 81 PNG files were copied as-is under the
ignored `lucy-masters-backup/` directory. No source PNG was removed or changed.
