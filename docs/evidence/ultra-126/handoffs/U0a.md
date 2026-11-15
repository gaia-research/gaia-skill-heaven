# U0a handoff — pure campaign engine

## Ownership, branch and PR

- Unit: U0a; owning team: B (Pi).
- Branch: `feat/ws6-ultra-u0a`; PR: [#260](https://github.com/gaia-research/gaia-skill-heaven/pull/260), base `integration/skill-ultra-126` (kept draft for owner action).
- Implementation commit: `191f6cc691207b5d1a801e3b8d3a51f8a0046e81`.
- Repaired source/integration-sync HEAD before evidence closeout: `dc9efcabbe65468a8740722070cb66a39b14286f` (repairs in `16d98fcee32b7461c6ea14cbcaae67e0c928462f` and `e4f5c45`, with the current integration directives merged).
- Final published HEAD and its exact-HEAD Terra confirmation are recorded on PR #260 after this handoff is committed. A commit cannot contain its own SHA or a retrospective review of itself; no product/source change follows the final confirmation.
- Visible resumed lane: Herdr `w31:pM`, tab `w31:t8` (`u0a-lead`). Native Pi subagents are the permitted in-pane fan-out. The orchestrator's pane was not controlled.

## Workers, models and preflight

Lead: `openai/gpt-6.1-sol`, xhigh, Pi 1.5.2; coordination, source QC, tests, Git/PR and evidence only. Workers wrote implementation.

| Task | Named agent | Plan resolution / requested effort | Access and isolation | Result / runtime evidence |
|---|---|---|---|---|
| Bounded foundation modules | `worker-luna` | provider `openai`, model `gpt-6-luna`, medium | `general`, RW, shared lane checkout, Pi | Draft failed lead QC: invalid status rung and unknown trace signal accepted; duplicated vocabulary literals; incomplete record/capability contract. Runtime metadata confirms Luna/medium. |
| Engine/capability integration + complete tests | `worker-sol` | provider `openai`, model `gpt-6.1-sol`, medium | `general`, RW, shared lane checkout, Pi | Escalated only after the Luna failures were reproduced. Repaired foundations, implemented engine/public API and 697 initial tests. Actual assistant metadata confirms Sol. |
| Lead-requested trace/sparse-array repairs (resumed worker) | `worker-sol` requested | `openai/gpt-6.1-sol`, medium requested | `general`, RW, shared lane checkout, Pi | Post-run runtime inspection found the resumed segment actually executed `antigravity/gemini-3.8-flash` (medium in assistant metadata), despite the requested Sol agent. This route mismatch was not requested and is disclosed, not represented as Sol work. Added person-required trace semantics and positional sparse replay; 699 campaign tests passed. Lead independently checked the source and reran the full suite; Terra assesses the final code. |
| First Terra repair, recon citation | `worker-luna` | `openai/gpt-6-luna`, medium | `general`, RW, isolated worktree, Pi | Rejected empty-queue proposals; 702 targeted tests passed in isolation. Actual runtime confirmed Luna/medium. |
| First Terra repair, mechanical endings | `worker-luna` | `openai/gpt-6-luna`, medium | `general`, RW, separate isolated worktree, Pi | Safety/session endings no longer charter-vetoed; 721 targeted tests passed in isolation. Actual runtime confirmed Luna/medium. |
| Terminal acceptance assurance | `worker-hydrogen` | `antigravity/gemini-4-hydrogen`, medium | `general`, RW, lane checkout, Pi | Exact terminal mappings, raw/copied/agent refusal and complete/verify gating; 750 combined campaign tests passed. Actual Hydrogen/medium runtime confirmed. |
| Second Terra repair, resumed charter invariant | `worker-hydrogen` | `antigravity/gemini-4-hydrogen`, medium | `general`, RW, isolated worktree, Pi | Shared proposal/amendment/state validation and resume regressions; 753 tests passed in isolation. Actual Hydrogen/medium runtime confirmed. |
| Second Terra repair, runtime provenance | `worker-hydrogen` | `antigravity/gemini-4-hydrogen`, medium | `general`, RW, separate isolated worktree, Pi | Mechanical terminal charterClause always null, including matched reasons; 766 tests passed in isolation. Actual Hydrogen/medium runtime confirmed. |
| Independent reviews | `reviewer` | explicit provider `openai-codex`, model `gpt-6.1-terra`, high | `review`, RO, shared checkout; tools `read,grep,find,ls`, Pi | Each completed review's persisted runtime metadata was checked for Terra/high. No fallback reviewer is accepted. See review ledger below. |

Before the first spawn, Pi `subagent(action:"plan")` resolved the Luna identity, provider/model/effort, general/RW profile, shared isolation and inherited tool access exactly as listed. Separate preflights resolved Sol/general/RW, Terra/review/RO and the explicit Hydrogen route/general/RW. Later independent repairs used native two-task parallel dispatches with isolated worktrees; the lead inspected each `action:"diff"` and integrated with `action:"apply"`, without rewriting worker code. Every spawn used `timeout_ms: 7200000` (7200 seconds) and **no `max_turns` or turn cap**. No worker delegated further.

### Founder routing corrections and escalation evidence

The initial brief permitted Sol after a reproduced Luna verification failure; that escalation and the unexpected resumed Flash segment predate the later roster correction. A further Sol repair was planned but **not spawned** after the founder corrected the ladder. The two first-round repairs then started on Luna as requested. All spawns after that correction explicitly set `fallback_models: []`. The founder subsequently changed the default to **L2 Hydrogen**, with Luna reserved for mechanical work; the assurance and second repair fan-out followed that newer direction. No L3/L4 escalation occurred after the correction. Switching the default was founder-directed availability routing, not an invented verification failure.

### Separate founder-authorized agent-profile maintenance

Two mechanical Luna tasks updated installed generic `scout`/`worker` to Hydrogen, created `worker-hydrogen`, installed Hydrogen low/medium/high counterparts and deleted all installed `worker-flash*` counterparts. This was an explicit user-authorized global agent-file action, not a campaign source feature. The latest `pi-config` `origin/master` was fetched and checked at `8be37c41bf2e8a08a3859aa58b56cdafc2e8920c`; it already lists Hydrogen counterparts and no Flash counterparts. Dirty local pi-config clones and unrelated settings/auth/provider configuration were not changed. Explicit frontmatter efforts, empty fallbacks and role permissions were retained. A six-role `action:"plan"` check resolved generic worker/Hydrogen-medium, scout/Hydrogen-minimal, and Hydrogen low/medium/high correctly. Hydrogen availability was then confirmed by the real U0a task's persisted `antigravity/gemini-4-hydrogen`, medium metadata.

## Files changed

- `packages/core/src/campaign/vocabulary.ts`
- `packages/core/src/campaign/types.ts`
- `packages/core/src/campaign/schema.ts`
- `packages/core/src/campaign/engine.ts`
- `packages/core/src/campaign/explain.ts`
- `packages/core/src/campaign/status.ts`
- `packages/core/src/campaign/index.ts`
- `packages/core/src/index.ts`
- `packages/core/test/campaign-engine.test.ts`
- `packages/core/test/campaign-charter-validation.test.ts`
- `packages/core/test/campaign-terminals.test.ts`
- `plugins/skill-heaven/mcp/skill-summon.mjs` (rebuilt)
- This handoff and the verbatim review files listed below.

Integration-branch dashboard/brief/decision-log updates were merged unchanged, not authored by this lane.

## Implementation

A pure, dependency-free campaign-level fold with all campaign states and six absorbing terminals; HOLD on absent/malformed input; nonempty recon-cited charter proposals with the same invariant enforced at the parsed/resumed-state boundary; revision-bound approve/decline; n+1 amendments preserving queue and progress while requiring fresh approval; convergence/human-answer gates; explicit operator checkpoint/stop; and trusted engine termination/steering signals. Mechanical safety/session endings are never charter-vetoed and never falsely claim charter-clause authority. Work-unit transitions are intentionally not implemented.

The only spelling site for campaign state/decision/operator-verb/agent-op values is `vocabulary.ts`. Strict hand-written parsers cover all artifacts, complete state, every event variant, trace/record and controller status. They reject unknown own string/symbol/non-enumerable keys, accessors, missing/wrong types, unsafe integers and sparse/extended nested arrays, returning frozen snapshots.

Operator/runtime adapters and events use private WeakSet identities rather than copyable symbol properties. Parsing never mints authority. Replay records one dense trace entry per input position, including rejected/missing values. Verification recomputes every transition, compares full entries/final state and optionally checks an independently retained canonical record commitment. The engine owns the existing steering runtime adapter; only explicit verification reports create behavioral steering signals. Retrieval scores/margins/no-match are not input events.

`toControllerStatus` produces the unchanged proposed shape with `/v1` schema: `schema,state,effective?,progress?,transition?`. U0b still owns the status consumer constant change and I/O integration. Ultra remains provisioned; this PR registers no live campaign tool and claims no live controller availability.

## Verification and results

- Environment: Node 22.23.1; npm 10.9.8; Pi 1.5.2.
- `npm ci`: exit 0; 205 packages added, 217 audited. The existing lockfile reported 6 vulnerabilities (3 moderate, 3 high). No dependency changes or automated audit fixes were made.
- Worker main campaign suite: **699 passed** after lead-requested fixes; final combined source has **769 campaign tests** (699 main, 6 charter, 64 terminal).
- Lead `npm run typecheck`: exit 0.
- Lead `npm run build:mcp`: exit 0; committed the rebuilt MCP bundle.
- Lead `npm run build:status`: exit 0, output unchanged.
- Lead `npm run build:console`: exit 0, all five host outputs unchanged.
- Initial lead full suite: exit 0; **105 files passed, 1 skipped; 2,539 tests passed, 1 skipped**. First integrated repair run: **107 files passed, 1 skipped; 2,564 tests passed, 1 skipped**.
- Lead final-source targeted campaign + authority-regression + core-plugin-no-hooks checks: **5 files, 849 tests passed**.
- Lead final-source `npm test`: exit 0; **107 files passed, 1 skipped; 2,609 tests passed, 1 skipped**. Typecheck and all three builds passed in the same run.
- Exact published evidence-HEAD checks are repeated after closeout; their result is retained with final PR confirmation.
- `git diff --check`: exit 0; tracked code and bundle output matched HEAD after verification.
- Tests include **616 exhaustive agent-op × operator-reserved action × campaign-state cases**, structural/JSON/reflection capability attacks, strict nested parser mutations, every campaign transition, tampered sequence/entry/drop/forged-operator checks, and **2,000 deterministic seeded sequences** (1,000 adversarial agent sequences, 1,000 replay/fold sequences). No `Math.random`.

## Security and known limitations

- The exported host mint seam is **not human authentication** against arbitrary host execution. U3 must establish human-origin provenance; untrusted JSON and agent events cannot mint live authority.
- Serialized privileged records require a trusted `authorize(event,index)` callback consulting independent evidence. It must never approve merely because the record says operator/engine. U0b owns safe persistence/reattachment and evidence storage.
- Self-contained logs cannot detect deletion of both a no-op event and its entry, or replacement by a self-consistent alternate history. `expectedRecord` supplies the independent commitment; canonical serialization is neither a hash nor a signature.
- Work-unit transitions/progress receipts and recover/reopen-limit enforcement are U4. Bounds are explicit charter data, with no compiled defaults. U0a does not execute verification commands, summon skills, install hooks, write user configuration or perform runtime file I/O.
- No new dependency/runtime dependency, upload, daemon, user-global write or telemetry surface was added. The unrelated existing dependency-audit findings were not changed.
- No Skill Heaven plugin capability validation is claimed from native tools or the unit test suite.

## Reviews and disposition

- `docs/evidence/ultra-126/reviews/U0a-191f6cc.md`: verbatim first Terra attempt, BLOCKED on self-identification; no engineering assessment. Lead later verified actual persisted metadata was `openai-codex/gpt-6.1-terra`, high, and supplied route evidence for a new independent review.
- `docs/evidence/ultra-126/reviews/U0a-8d0511f.md`: CHANGES REQUIRED, two blockers (uncited empty proposal and charter-vetoed mechanical endings); repaired by the two Luna tasks.
- `docs/evidence/ultra-126/reviews/U0a-16d98fc.md`: CHANGES REQUIRED, two further blockers (resumed charter validation and matched-clause mechanical provenance); repaired by the two Hydrogen tasks.
- `docs/evidence/ultra-126/reviews/U0a-dc9efca.md`: **PASS, no blocking findings** on the repaired source HEAD. Lead confirmed persisted `openai-codex/gpt-6.1-terra`, high metadata and verified the captured diff exactly matched `git diff origin/integration/skill-ultra-126...HEAD` at that SHA (SHA-256 `d3de48c58193f4afb39701994291c2132726c625ee56300c210b7038067dfc02`; integration base `d72ea9acff628c128764cd12772d0d3cf340e2ae`). Thus the report's route/diff conditions were met.
- **Final publication gate:** after this evidence-only commit, the lane obtains a fresh Terra confirmation of the exact published HEAD and publishes it verbatim on PR #260, without changing HEAD afterward. That external confirmation is the final verdict and identifies the exact final SHA. A retrospective report containing a commit's own SHA cannot be committed inside that same commit; substantive source reviews above remain committed verbatim.

## Outstanding issues and next action

No known U0a source blocker remains after the source PASS. The exact-HEAD publication gate above and CI must still be checked at integration time; the PR remains draft for the owner. No deployment or live controller availability is authorized or claimed. Recommended next action: orchestrator verifies the final Terra confirmation and required CI, then integrates PR #260. This lane does not merge its PR. U0b/U1 may build on the exported pure contract after integration; U3 owns operator authentication and U4 owns work-unit semantics.
