# Lane DASH — campaign dashboard and decision log (Team C, Antigravity)

Worktree: `~/skill-heaven-wt/dashboard`, branch `feat/ws6-ultra-dashboard`
(based on `origin/integration/skill-ultra-126`). Never touch `/Users/marcotiongson/skill-heaven`.
Never commit to `main`. Never force-push.

## Deliver

1. `docs/evidence/ultra-126/render.mjs`: a zero-dependency Node ESM script.
   `node docs/evidence/ultra-126/render.mjs` reads `docs/evidence/ultra-126/campaign.json`
   (same directory as the script, resolved via `import.meta.url`) and writes
   `docs/evidence/ultra-126/DECISION-LOG.html`. It is deterministic: the same JSON
   always produces byte-identical HTML. Do not put a generation timestamp in the
   output. Show `campaign.updatedAt` if present.
2. `DECISION-LOG.html` (generated, committed). One self-contained page: inline CSS,
   no JS required, no external fonts, scripts or CDNs. Opens from `file://`.
   - Header: campaign status, integration branch, integration PR link, base main SHA.
   - **Dashboard**: a units table, U0a–U9, with columns scope, after, tier,
     team, worker, branch, PR (link), head (short SHA), Terra review status
     and status. Status shows as a coloured pill that also carries its text label.
   - Probes table P1–P6 (id, unit, question, status, and an evidence path if present).
   - Preflight block: harness versions, node, baseline, reviewer, hydrogen, quota, github.
   - Blockers and "Awaiting founder" lists (render "None" when empty).
   - **Decision log**: two clearly separated groups, "Founder decisions (binding)"
     (`kind:"founder"`) and "Delegated implementation decisions" (`kind:"delegated"`).
     Each delegated decision is a card with every field present in the JSON
     (id, date, team, unit, problem, options, selected, reason, authority, reversible,
     terra, outcome, risk). Render unknown or extra fields generically so
     new fields show up without a code change.
   - Light and dark theme via `prefers-color-scheme`. Readable at 375px width, with no
     horizontal page scroll; tables scroll inside their own wrapper.
   - HTML-escape every string from the JSON.
3. `packages/core/test/ultra-126-dashboard.test.ts`? **No.** Do not add tests to
   the product packages. Instead, verify by running the script twice and confirming
   with `cmp` that the outputs are identical.

## Do not

- Do not edit `campaign.json` except to add `"updatedAt"` if you need a sample. Prefer not to edit it at all.
- Do not touch any file outside `docs/evidence/ultra-126/`.
- Do not add npm dependencies.

## Finish

Commit (message ends with `Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>`),
push the branch, open a PR with `gh pr create --base integration/skill-ultra-126 --draft`.
Final reply, exactly four lines:

```
PR: <number and URL>
Commit: <HEAD SHA>
Handoff: docs/evidence/ultra-126/briefs/DASHBOARD.md
Status: READY FOR REVIEW | BLOCKED: <one line>
```
