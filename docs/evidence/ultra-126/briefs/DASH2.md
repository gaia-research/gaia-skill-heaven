# Lane DASH2: harness availability panel with reset countdown (Team C, Antigravity)

Worktree `~/skill-heaven-wt/dash2`, branch `feat/ws6-ultra-dash2`. Read
`docs/evidence/ultra-126/briefs/COMMON.md` (Visibility, Who runs the review). Touch only
`docs/evidence/ultra-126/render.mjs` and the generated `DECISION-LOG.html`.

## Deliver

1. `render.mjs` renders the top-level `quota` object of `campaign.json` as a
   **"Harness availability"** section placed directly under the header and above the
   units table. Show `asOf`, then one row per `quota.pools[]` entry: pool, covers,
   state, resetAt. Keep the rendering generic so new pools appear without code changes,
   and HTML-escape every string.
2. For a pool with a non-null `resetAt`, the static HTML shows the absolute time
   (as written). A **tiny inline script** (progressive enhancement, under 40 lines, no
   external resources) upgrades it to a live countdown ("resets in 47 min") and, once the
   time has passed, to "reset time passed: verify availability". The page must still read
   correctly with JS disabled.
3. Determinism is unchanged: running `node docs/evidence/ultra-126/render.mjs` twice
   produces byte-identical output (verify with `cmp`). Do not emit the current time.
4. Light and dark themes and the 375px-wide layout still hold.

## Review and finish

Run your own Terra review with `~/.pi/agent/bin/pi-reviewer` in a pane inside your tab
(brief: verify escaping, determinism, no external resources, no-JS fallback). Loop until
there are no blocking findings, and save the review to `docs/evidence/ultra-126/reviews/DASH2-<sha>.md`.
Commit with `Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>`, push, then run
`gh pr create --base integration/skill-ultra-126 --draft --title "docs(ultra-126): availability panel"`.
Final reply: the four lines from COMMON.md.
