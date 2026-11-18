# Terra Review — `1d24a8e`

- **Agent:** `reviewer-shared`
- **Model:** `openai-codex/gpt-6.1-terra:high` (thinking: `high`)
- **Reviewed HEAD:** `1d24a8e` (base `origin/main` at `dcc7fbd`)

## Status
issues_found (0 blocking, 1 warning, 1 suggestion)

## Findings

- `docs/evidence/site-267/README.md:16` - [warning, non-blocking]: Firefox is asserted to remain on the worker path without alpha bleed, but the committed evidence contains no Firefox captures or readback results. The new unit test checks source text, not browser behavior. Run and record a Firefox worker/readback and four-state visual check, or qualify the Firefox parity claim as unverified.

- `docs/evidence/site-267/README.md:27` - [suggestion, non-blocking]: The Heaven row claims to cover both surfaces but links only to Hero captures. Likewise, line 37 labels WebKit captures as evidence for a real-Safari symptom that the README says WebKit did not reproduce. Link the landing captures separately and mark the Safari before/after evidence as unavailable until captured.

## Verification Limits

- The targeted test passed: `npm test -- --run test/site-lucy-scene.test.ts` (23 tests). I did not run the full suite, build, or browser E2E tests.
- The inspected WebKit Hell captures support the alpha-bleed fix. The documented isolation results make dropping the Hell ring-mask change plausible, but the isolated runs and `?lucy=off` captures are not committed evidence.
- The shared `LucyRiveFigure` applies the balanced-parenthesis filter removal to both live consumers; the static fallback filters remain outside that change. Real macOS Safari's CoreAnimation clipping and the final visual result remain unverified in this review.
- No files under `packages/site/public/` or `packages/site/src/assets/` changed in the branch diff. The changes do not alter Lucy ownership or mounting, but I did not independently exercise the one-Lucy-per-session invariant at runtime.
- Chromium and Firefox runtime parity was not independently tested. The worktree already contained an unrelated modified `package-lock.json` and untracked `graft/` directory.
