# Lucia Refractions — coordination contract

The draft PR for this folder is the **public-safe design ledger**. Its description holds the
current state, and its comments carry every request, response and verdict. No image, private
reference, lore content or unapproved art is ever posted to it — only IDs, hashes, statuses and
links to the private staging location.

## Roles

| Role | Owns | Does not own |
|---|---|---|
| **Cloud design lead** | The design system, the page, every design verdict, retake briefs, and integration | Pixels |
| **Pi Hydrogen** | Preflight: proves the generation and deterministic pipeline end to end on a dry run, and confirms the staging location | Art direction, verdicts |
| **Pi Sol (asset lead)** | Producing the issued candidates exactly as briefed, receipts, and the founder gallery | Art direction, the design system, promotion into the site |
| **Founder** | Asset approval (gate 2), every open decision `D-xx`, merge | — |

## Message formats (copy exactly; one line, pipe-separated)

**Request (design lead → Pi):**

```
ASSET-ID | revision | brief SHA | expected inputs | desired output | review criteria | requested action
```

Example:

```
LR-G01-A | r1 | 77bbf6ab | wing-left.png@<sha8>, wing-right.png@<sha8>, lucy-canon.json@<sha8> | 8 shards, WebP+alpha, 768px long edge, shards.json | ASSET-MANIFEST.json#LR-G01 acceptance 1–6 | ISSUE
```

`requested action` is one of `ISSUE` · `RETAKE` (always a new candidate id) · `HOLD` · `CANCEL`.

**Response (Pi → design lead):**

```
ASSET-ID | revision | model receipt | asset hash | preview location | validation | status
```

Example:

```
LR-G01-A | r1 | gpt-image-2.6 @ <timestamp>, 1 call | sha256:<raw>/<webp> | staging/landing-refractions/LR-G01-A/r1/ | matte-guard PASS, 8/8 extracted, budget PASS | READY FOR REVIEW
```

`status` is one of `READY FOR REVIEW` · `BLOCKED (<reason>)` · `FAILED GATE (<criterion>)`.

## Verdicts (design lead, one comment per candidate)

`ACCEPT FOR PROTOTYPE` · `RETAKE` · `REJECT` · `HOLD`, each with the visual reasons and the
acceptance criteria it passed or failed. A `RETAKE` names the new job id (for example `LR-G01-C`)
and attaches its bounded delta brief. **Never an unrecorded retry.**

`ACCEPT FOR PROTOTYPE` is **gate 1 only**. Promotion into `packages/site/src/assets/` also needs
**gate 2: founder approval** from the gallery, recorded verbatim on the PR (`FOUNDER APPROVED:
<ASSET-ID> <date>`). The promotion commit cites both.

## Staging (D-08, ruled by the founder 2026-11-18)

- **Ruled:** the private repository `gaia-research/lucy`, on a branch
  `staging/landing-refractions` that is never merged. Paths are
  `staging/landing-refractions/<ASSET-ID>/<revision>/`, holding raw PNGs, intermediates, WebPs,
  receipts and the gallery page source. It is Lucy-scoped, private, already in use for Lucy
  production, and can be cleaned up by deleting the branch.
- **Not used:** the private lore repository. It is a writers' room, not an asset warehouse.
- **Never:** this public repository, until gate 2.
- Hydrogen confirms in preflight that the branch accepts the binary sizes (LFS or not) and that
  every agent involved can read it. The founder approved this scope extension of that repository (D-08).

## Hydrogen preflight — what "pass" means

1. The `gpt-image-2.6` endpoint is reachable and identifies itself as such in the receipt. A
   one-call **dry run on a non-Lucy test prompt** that produces no project asset is allowed and
   counted separately from the job budget.
2. The flat `#00FF00` chroma path runs end to end on the dry-run output:
   `scripts/assets/lucy-matte-guard.py` → audits → lossless-alpha WebP → re-open → alpha
   verified.
3. Deterministic derivation runs once on an **existing approved file** (LR-D03 for one state,
   using no paid calls), producing a receipt and a pixel-diff.
4. The staging branch exists, is private, accepts the files and is readable by Sol and by the
   design lead.
5. A preflight report is posted on the PR in the response format, using the id `LR-PREFLIGHT`.

No `LR-G*` job is issued before `LR-PREFLIGHT | … | PASS`.

## Monitoring

The design lead watches the PR and responds while a session is active. **No continuous
background monitoring is claimed** once a session ends; the next session resumes from this log
and the PR thread.

## Decision log

The live log lives in `DESIGN-BRIEF.md` §10 and in the PR description. Every founder ruling is
quoted verbatim on the PR before anyone acts on it.
