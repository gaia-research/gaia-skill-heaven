# U0b: store, session re-attach, status /v1, CLI (tier: standard)

Read `COMMON.md` first, then U0a's handoff `docs/evidence/ultra-126/handoffs/U0a.md`
(it lists the engine API you build on). Branch `feat/ws6-ultra-u0b`, worktree as
assigned, `npm ci` first.

## Measured inputs (do not re-probe)

`docs/evidence/ultra-126/PROBE-P2a.md` (Claude Code 2.1.325, n = 3 per cell):
- `/compact` keeps the same server pid.
- `--resume`, `--continue` and headless `--resume` start a new pid with the same
  `CLAUDE_CODE_SESSION_ID`.
- `--fork-session` gets a new id.
- `/exit` sends `SIGINT`. The server must not delete its session root on `SIGINT`.

## Read (only these)

- Plan §1.5 (what a resume keeps: `CLAUDE_CODE_SESSION_ID` reaches the MCP
  child; `--resume` keeps the id; `--fork-session` gets a new one), §4 PR-4,
  PR-10, §5.7 (L0–L3 and the re-attach rules), §6 (re-attach security bullet),
  Appendix A "U0b".
- `packages/skill-summon/src/summon/session.ts` (session root, manifest, reaper,
  `assertConfinedPath`), `packages/status/src/adapters.ts` (~line 429),
  `packages/console/src/reader.ts`, `packages/core/src/cli.ts` (steering flags).

## Deliver

- `packages/skill-summon/src/campaign/store.ts`: append-only
  `campaign/trace.jsonl` under the session root; fold on load with U0a's
  `replayCampaign`; write `campaign/status.json` via `toControllerStatus`. Every
  path goes through `assertConfinedPath`. A trace that fails `verifyCampaignRecord`
  loads as `FAILED_SAFE` and is never silently repaired.
- `session.ts`: record the harness session id (env `CLAUDE_CODE_SESSION_ID`;
  keep the source name in one constant so other doors can add theirs) in the
  session manifest. On start, re-attach to an existing root **only** when it passes
  the existing disposable-root check, carries the same session id, and its recorded
  pid is dead. Otherwise create a fresh root. An env id that matches nothing gets a
  fresh root. A fork's new id gets a fresh root and no campaign (PR-10). The reaper
  keeps a root that holds a paused campaign for the charter's decided pause window
  (PR-4: read it from the folded charter; **no compiled default**; if there is no
  decided window, fall back to the existing reap rule unchanged). After the window
  passes, it reaps as usual.
- `packages/status/src/adapters.ts`: schema constant →
  `skill-heaven/controller-status/v1`; the parser accepts RECON, DECISIONS and
  CONVERGENCE (PR-3). `packages/console/src/reader.ts` reads `campaign/status.json`.
- `packages/core/src/cli.ts`: standalone `--campaign-verify <trace>` and
  `--campaign-explain <trace>`, next to the steering flags. Exit non-zero when
  verify fails.
- Rebuild committed bundles touched (`build:mcp`, `build:status`, `build:console`).

## Tests

Re-attach with matching, missing and forged ids; a forged id pointing at a
directory outside the disposable root is refused; fork id → fresh root; reaper keeps
a paused campaign inside its window and reaps it after (inject the clock, never
sleep); status slot renders reported campaign progress; explain output exists for
every transition kind; verify CLI exits non-zero on a tampered trace. The whole
existing suite stays green: with no campaign, behaviour is unchanged.

## Team shape

Follow COMMON.md, "Pi team roster and escalation": Hydrogen is the default worker. Luna takes
only very mechanical pieces. Opus (the only escalation step; Argon is unavailable) comes only after a recorded verification failure. The lead
decomposes and verifies; it does not implement.
