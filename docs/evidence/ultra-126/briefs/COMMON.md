# Common rules for every #126 unit brief

Read this file and your unit brief. Do not load the whole plan unless your brief
sends you to a section; the plan is `docs/plans/2026-11-15-skill-ultra-campaign-126.md`.

## Repo rules (from CLAUDE.md, binding)

- TypeScript ESM, Node ≥ 22, **no runtime dependencies**.
- `npm test` (vitest), `npm run typecheck`. Both must be green on your final HEAD.
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

- Work only in the worktree you were given. Never touch `/Users/marcotiongson/skill-heaven`
  (the founder's checkout) and never commit to `main`.
- Your branch: `feat/ws6-ultra-<unit>`, based on `origin/integration/skill-ultra-126`.
- Open your PR with `--base integration/skill-ultra-126` (draft is fine until review passes).
- Never force-push, never delete branches, never merge your own PR. The orchestrator
  integrates after review.
- Before the PR is final: `git fetch origin && git merge origin/integration/skill-ultra-126`
  if the integration branch moved, and re-run tests.

## Independent review gate (mandatory)

- Reviewer: Terra High, independent context. Either the Pi native `reviewer`
  subagent (`openai-codex/gpt-6.1-terra:high`) or the centralized command
  `~/.pi/agent/bin/pi-reviewer --cwd <worktree> --prompt-file <brief>`.
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
- Any harness you invoke yourself (`claude`, `pi`, `agy`, `codex`, `hermes`, `grok`,
  and `~/.pi/agent/bin/pi-reviewer`, which runs Pi) goes in a visible pane too:
  split one probe pane next to yours with `herdr pane split <your pane> --direction down --cwd <worktree>`
  (find your pane with `herdr pane current`), run it there, and `herdr pane read` the
  result. Record the pane id beside any result you rely on. Never take over pane `w31:p1`,
  which belongs to the orchestrator.
- Pi `subagent` fan-out inside your own pane is visible and allowed (skill §6).
- `git`, `npm`, `node`, `gh` and file inspection stay on your normal shell.
- When finished, leave your pane as it is. The orchestrator stashes it to the archive tab.

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
