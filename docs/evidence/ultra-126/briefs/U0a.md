# U0a — pure campaign engine (tier: heavy)

Owning team: **B (Pi)**. Lead: `openai/gpt-6.1-sol` xhigh. Read `COMMON.md` first.

Worktree: `~/skill-heaven-wt/u0a` (branch `feat/ws6-ultra-u0a`, already created
from `origin/integration/skill-ultra-126`). Run `npm ci` there first.

## Read (only these)

- Plan §2 (design), §4 PR-3/PR-4/PR-10, §5.2 (state model + trace fields),
  §5.3 (channels table), §6 (security), Appendix A "U0a".
- `packages/core/src/steering.ts` — the model to copy: pure, no I/O, no clock,
  runtime-adapter brand for capabilities. Also its tests.
- `packages/status/src/adapters.ts` around line 429 (proposed
  `skill-heaven/controller-status@0` shape — U0a's `toControllerStatus` must
  produce that shape; U0b renames the constant to `/v1`).

## Deliver

Create `packages/core/src/campaign/`:

- `vocabulary.ts` — the ONLY module spelling campaign state names, controller
  decision names, operator verbs (`decide`, `amend`, `answer`, `checkpoint`,
  `stop`) and agent ops. FD-6: "decisions" is the step name; "ratify" nowhere.
- `types.ts` — campaign states `UNARMED → RECON → DECISIONS → EXECUTING ⇄
  CONVERGENCE`, terminal `COMPLETED | STOPPED_BY_USER | STOPPED_BY_POLICY |
  BLOCKED | FAILED_SAFE | ENDED_WITH_SESSION`; decisions `HOLD EXPLORE RECOVER
  REOPEN CHECKPOINT CLOSE STOP RECON DECISIONS CONVERGENCE`; trace entry with
  every §5.2 field (`seq, from, to, trigger, signal, charterRevision,
  charterClause, skills, phase, workUnit, personRequired`); charter revision
  number; amendment returns to DECISIONS at revision n+1 and keeps the queue.
- `schema.ts` — schema id constants (`skill-heaven/campaign-trace/v1`,
  `campaign-charter/v1`, `campaign-recon/v1`, `campaign-manifest/v1`,
  `convergence-incident/v1`, `controller-status/v1`) and strict hand-written
  parsers: unknown key → `null`, wrong type → `null`. No zod, no deps.
- `engine.ts` — `initialCampaignState()`, `stepCampaign(state, event)`,
  `replayCampaign(events)`, `verifyCampaignRecord(record)`. Pure. `HOLD` is the
  default; absent or malformed input holds and changes nothing.
  **Operator events require a capability value that only an I/O shell can mint**
  (branded like steering's runtime adapter). An agent-channel event can never
  produce a transition reserved to the operator (approve/amend/decline a
  charter, answer, stop-by-user) — model this as a type AND a runtime check.
- `explain.ts` — human-readable one-line explanation per transition kind.
- `status.ts` — `toControllerStatus(state)` producing the controller-status
  shape (states RECON, DECISIONS, CONVERGENCE included, per PR-3).
- `index.ts`; export from `packages/core/src/index.ts`.

## Tests

`packages/core/test/campaign-engine.test.ts`: every campaign-level transition in
§5.2; malformed/absent input holds; every agent-channel event × every
operator-reserved transition is refused (exhaustive table, not a sample);
`replayCampaign(events)` equals left-fold of `stepCampaign`; `verifyCampaignRecord`
detects tampering (reordered seq, edited entry, dropped entry, forged operator
entry without capability); a property-style test with a seeded deterministic
generator (no `Math.random`) over ≥ 1000 random event sequences: state never
reaches an operator-only state via agent events.

## Out of scope

Work-unit transitions (U4), any file I/O (U0b), the MCP tool (U1).

## Team shape (directive)

Lead decomposes and quality-controls; workers implement. Start with
`worker-luna` for bounded pieces (vocabulary, schema parsers, explain);
escalate to `worker-terra` / `worker-sol` for the engine and capability brand
only if Luna's output fails verification. Run the pi-subagent `action:"plan"`
preflight before the first spawn and record what it resolved (model, provider,
effort) in the handoff. If a requested profile/effort cannot be honored, say so;
do not downgrade silently.
