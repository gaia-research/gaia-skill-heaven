# Common rules for every #126 unit brief

Read this file and your unit brief. Do not load the whole plan unless your brief
sends you to a section; the plan is `docs/plans/2026-11-15-skill-ultra-campaign-126.md`.

## Repo rules (from CLAUDE.md, binding)

- TypeScript ESM, Node ≥ 22, **no runtime dependencies**.
- `npm test` (vitest), `npm run typecheck`. Both must be green on your final HEAD, **run twice: once with
  `CLAUDE_CODE_SESSION_ID` unset and once with it set to a fixed value** (e.g. `CLAUDE_CODE_SESSION_ID=test-fixed npm test`).
  Any test that starts a summon server or session must be hermetic about that variable. (U0b shipped a
  leak that only showed when the variable was set, as it is inside any Claude Code session.)
- Rendered text must pass `test/authority-regression.test.ts`.
- Rebuild committed bundles when their sources change: `npm run build:mcp`,
  `npm run build:status`, `npm run build:console`. Commit the rebuilt bundle.
- `test/core-plugin-no-hooks.test.ts` stays green: the Core plugin installs no hooks.
- P3: never write outside a disposable `mkdtemp` / session directory; never touch
  `~/.claude`, user settings, or skills.
- No surface may say the campaign controller is built or available before U9.
  Ultra copy stays "provisioned".
- The word "ratify" appears nowhere in shipped code or copy (FD-6). State/verb
  names are spelled only in `packages/core/src/campaign/vocabulary.ts`.
- Retrieval scores, margins and `noMatch` never become steering or campaign
  events (INV-U3, K4).
- One logical change per commit. Commit messages end with a trailer naming the
  model that wrote the change, e.g. `Co-Authored-By: <model id> <noreply@…>`.
  Git author identity: leave as configured (`nova-gaia`).

## Git

- Work only in the worktree you were given. Never touch `<founder main checkout>`
  (the founder's checkout) and never commit to `main`.
- Your branch: `feat/ws6-ultra-<unit>`, based on `origin/integration/skill-ultra-126`.
- Open your PR with `--base integration/skill-ultra-126` (draft is fine until review passes).
- Never force-push, never delete branches, never merge your own PR. The orchestrator
  integrates after review.
- Before the PR is final: `git fetch origin && git merge origin/integration/skill-ultra-126`
  if the integration branch moved, and re-run tests.

## Who runs the review (founder directive)

- **Your lane runs its own Terra review** with `~/.pi/agent/bin/pi-reviewer`
  (or the Pi native `reviewer`) from its own shell, and loops until
  no blocking findings remain. The orchestrator does not run reviews. The lane
  lead reports to the orchestrator only when Terra has cleared the exact HEAD, or
  when the lane is BLOCKED.
- **Antigravity escalation:** start on Gemini 4 Hydrogen. If Hydrogen is stuck in a
  review loop (the same blocking finding survives two repair rounds), escalate the
  repair to **Gemini 4 Argon** (`agy --model gemini-4-argon-high`, in a pane in
  your tab) and record the escalation in your handoff. Terra stays the reviewer;
  Argon never reviews.

## Reviewer invocation (founder directive, updated 2026-11-16)

- **Run the reviewer from your own shell.** No herdr split and no visible pane are needed:
  `~/.pi/agent/bin/pi-reviewer --agent reviewer-shared --cwd <worktree> --timeout 10800 --json --prompt-file <brief>`
  (or the Pi native `reviewer` subagent). The reviewer now has `bash` and verifies
  claims itself (git diff, tests, typecheck, builds). Its agent definition limits shell
  use to verification: no commits, pushes, branch changes or config edits.
- Ask the reviewer for targeted `npx vitest run <files>` plus one full `npm test`. No watch mode and no
  long-running servers: a reviewer once hung until its 3-hour timeout.
- Tell the reviewer the base (`origin/integration/skill-ultra-126`) and the exact HEAD
  SHA, and ask it to run the verification commands itself, not to trust your counts.
- Fallback only: if a reviewer reports it could not run commands, give it an evidence
  packet (`git diff --name-status`, the full diff, and the command outputs written to files
  outside the repo), then re-run it.

## Independent review gate (mandatory)

- Reviewer: Terra High, independent context. Either the Pi native `reviewer`
  subagent (`openai-codex/gpt-6.1-terra:high`) or the centralized command
  `~/.pi/agent/bin/pi-reviewer --agent reviewer-shared --cwd <worktree> --prompt-file <brief>`.
  No other model may act as final reviewer. No silent fallback: if Terra is
  unavailable, stop and report `BLOCKED: awaiting Terra`.
- The reviewer must read the actual diff (`git diff origin/integration/skill-ultra-126...HEAD`),
  run nothing destructive, and validate load-bearing claims against source.
- Save each review verbatim to `docs/evidence/ultra-126/reviews/<unit>-<shortsha>.md`
  with: reviewed SHA, reviewer agent + model, verdict, blocking findings (yes/no),
  each finding.
- Blocking findings go back to the implementing worker (not the reviewer). After a
  repair, Terra reviews the **new** HEAD. Repeat until no blocking findings remain.
- The worker that wrote the code never approves it.

## Visibility (founder directive, 2026-11-16)

- Lanes run in **visible herdr panes**, dispatched per
  `packages/core/skills/herdr-dispatch/SKILL.md`. You are probably already in one.
- Any harness you invoke yourself (`claude`, `pi`, `agy`, `codex`, `hermes`, `grok`)
  goes in a visible pane too. The exception is `pi-reviewer`, which you run from your
  own shell (see "Reviewer invocation"):
  split one probe pane next to yours with `herdr pane split <your pane> --direction down --cwd <worktree>`
  (find your pane with `herdr pane current`), run it there, and `herdr pane read` the
  result. Record the pane id beside any result you rely on. Never take over pane `w31:p1`,
  which belongs to the orchestrator.
- Pi `subagent` fan-out inside your own pane is visible and allowed (skill §6).
- `git`, `npm`, `node`, `gh` and file inspection stay on your normal shell.
- Each lane runs in **its own herdr tab**. Keep any probe panes you split inside
  that tab, and close a probe pane once you have recorded its result. When you
  finish, leave your lane pane as it is: the orchestrator archives your session
  files (Pi JSONL, agy transcripts) to `~/skill-heaven-wt/sessions/<lane>/` and
  then closes the tab.

## Pi team roster and escalation (founder rule, updated 2026-11-16)

- **Default worker: L2 Hydrogen.** Luna (L1), Terra (L3) and Sol (L4) share one
  OpenAI quota pool; Hydrogen runs on a separate pool.
- **L1 Luna only for very mechanical tasks** (renames, counting, formatting,
  fixture generation). That is a de-escalation from the default and needs that reason.
- Escalation from Hydrogen: **L3 `worker-terra` → L4 `worker-sol`**, one level at a time,
  only after a recorded verification failure. Write the reason in the handoff. Sol is the
  last resort; do not reuse Sol out of habit.
- Hydrogen in Pi: use the working route the founder set up (model
  `antigravity/gemini-4-hydrogen`, with extensions enabled), and confirm it with
  `subagent action:"plan"` before the first spawn.
- Set `fallback_models: []` on every spawn. If a requested model or effort is not
  honored, report it unavailable; never substitute another model.
- **Only one Pi lead runs at a time** across the campaign.
- **Lead like the orchestrator.** The lead decomposes into small self-contained
  briefs with exact acceptance checks, fans them out in parallel (mostly to Hydrogen),
  verifies evidence, and sends precise repair requests. The lead does not implement,
  rewrite worker code or micromanage.

## Subagent limits (founder rule)

- Pi subagent spawns: **never set max turns.** Timeouts practically unlimited:
  **≥ 7200 s (2 h)** per spawn. Same for `pi-reviewer --timeout 7200` or more.
  A worker killed mid-task by a short limit forces the expensive lead to redo
  the work; that is what this rule prevents.

## Handoff (required before reporting done)

Push `docs/evidence/ultra-126/handoffs/<unit>.md` on your branch containing:
unit; owning team and worker(s); model, effort and harness for each; branch and HEAD
SHA; PR URL; files changed; implementation summary; commands and tests run with
actual results (counts); security considerations; known limitations; outstanding
issues; dependency changes (should be none); review files and final verdict;
next recommended action.

No unpushed work counts. No unreviewed work counts.

## Final reply (keep it to these four lines)

```
PR: <number and URL>
Commit: <HEAD SHA>
Handoff: <repository path>
Status: READY FOR REVIEW | BLOCKED: <one line>
```

`READY FOR REVIEW` here means: Terra reviewed this exact HEAD and reported no
blocking findings.
