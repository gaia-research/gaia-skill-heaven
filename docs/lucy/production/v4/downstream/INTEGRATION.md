# Lucy v4 collective integration

The v4 front-page export keeps the owner-approved A, B, and C character-art
sets distinct from the Hero A and Hero B **layout** variations.

## Live review routes

- `/#/hero-a` and `/#/hero-b` use character Set A by default.
- `/#/hero-a/b`, `/#/hero-a/c`, `/#/hero-b/b`, and `/#/hero-b/c` select an
  owner-approved character-art set without changing the layout direction.
- Unknown set segments normalize to Set A.

The typed registry is `packages/site/src/variations/hero/heroAssets.ts`. It
uses each set's standard `masters/lucy-{heaven,hell,ultra}.webp` and keeps the
approved authority katana and slash assets shared.

## Evidence and alpha boundary

`APPROVED_V4_ASSET_MANIFEST.json` and `LUCY_V4_APPROVED_SHOWCASE.html` expose
owner authorization separately from the retained candidate matte and
independent-review records. Some exported WebPs have an alpha channel from a
recorded local segmentation proposal; that is not a pristine-alpha pass. The
owner override authorizes their visual use but does not alter the original
guard verdicts.

## Rebuild and validate

```bash
python3 scripts/assets/build-lucy-v4-approved-manifest.py
python3 scripts/assets/validate-lucy-v4-approved.py
npm -w @gaia-skill-heaven/site run build
```

The builder only scans tracked production WebPs and recorded manifests. It
does not depend on ignored workbench PNGs. The validator reopens every
registered WebP, compares dimensions and alpha-channel declarations, rejects
production PNGs, verifies reusable P2 exact references, and checks that the
static showcase contains every portable asset URL.
