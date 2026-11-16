# U0b handoff — campaign persistence, hermetic tests and bounded startup

## Performance round 2 — founder-directed one-time design advice

**This new performance round supersedes the 72f6277 closeout below; it is not yet accepted.** The orchestrator reported 522 historical temp roots, an O(number of roots) resolver scan, and an Arbor timeout under full-suite load. Source inspection also found a full reaper scan awaited on every `summon`/preview request. Hydrogen had implemented an initial bounded sidecar lookup, removed request-path reaping, and isolated test temp namespaces before the founder directed a design pause.

Exactly **one** `advisor-astra` subagent was then spawned, with `fallback_models: []`, no tools and no further delegation. Actual persisted route/effort were `openai/gpt-6-astra`, `xhigh` (Pi); zero tool calls. No `/advisor` command or other advisor was launched. Full advice is preserved verbatim at [`../advice/U0b-advisor-astra.md`](../advice/U0b-advisor-astra.md). It is reasoning from the supplied packet, not a code review or test result.

### Advice adopted before continuing implementation

- Keep validated random `mkdtemp` roots and the private hashed temporary sidecar as an **advisory locator**, never ownership/authority. Retain bounded metadata (16 candidate references / 64 KiB), no scan fallback, exact ID/dead-PID/disposable-root/confinement checks, optional index updates only after authoritative success, and explicit recovery for legacy/unindexed roots. Eviction removes references, never session data.
- Keep **all** automatic enumeration/reaping off startup and request paths. Only explicit maintenance may scan. The existing 1000-foreign-root first/cached real-MCP operation-count tests and isolated test namespaces remain acceptance gates; timings are measurements, not thresholds.
- Distinguish tolerable lost **index** references from unacceptable double **owner adoption**. Add a nonblocking exclusive per-root filesystem claim, re-read/revalidate authoritative state after acquiring it, and coordinate real GC with the same exclusion. Hold it through campaign verification/owner commit or deletion. Crash-left claims conservatively block adoption/deletion until explicit recovery; do not invent stale-lock breaking.
- Preserve locator references on `server.close()`/SIGINT. Current shutdown already leaves the root and locator intact; `SummonSession.close()` is explicit root deletion and may prune only after actual removal. Add close-then-resume discoverability coverage rather than conflating these APIs.
- Keep verified charter pause retention independent of discovery. Mutable real-GC bookkeeping must respect ownership exclusion; failed adoption must preserve prior PID/pause expiry. Dry-run must remain entirely read-only, including no claim acquisition, index initialization/pruning or repair.
- Bound the **actual** index read, not only the pre-read stat size. Retain no-follow/private/ownership checks and all root/campaign validation. Add focused simultaneous-adoption, adoption-versus-GC, crash-left-claim and bounded-read tests.

These are recorded design decisions; the new ownership fence/bounded-read changes are **pending Hydrogen implementation and Terra review**, not claimed complete. No new implementation task was dispatched after the founder's directive until this advice and adoption record were saved. Earlier tests/edits and an already-running three-mode verification predated that directive. No advisor rerun is planned.

## Previous round publication and acceptance (historical)

- Unit: **U0b**; owning team: **Pi lane**.
- Branch: `feat/ws6-ultra-u0b`; draft PR: [#265](https://github.com/gaia-research/gaia-skill-heaven/pull/265), base `integration/skill-ultra-126`.
- This handoff **supersedes the original 0188bba closeout**. The orchestrator rejected that closeout because tests failed under inherited `CLAUDE_CODE_SESSION_ID`; its earlier Terra confirmations are historical, not acceptance of the reopened repair.
- Reopened test implementation: `34fef99fcbaac07f0178dc5edf0bd593b008a11d`; deterministic offline fixture: `77fd372`; bounded regression runner: `1cb0535f38daa6ae37840fce2a0c4cbb03acd6a0`.
- Terra reviewed `1cb0535f38daa6ae37840fce2a0c4cbb03acd6a0`: **PASS, no blocking findings**. Its one nonblocking causal-description warning was corrected in D-013 and the rendered decision log by `8f035896498c42b1cf8f53372f3c4f5b2e1caba6`.
- Final published evidence HEAD and its independent exact-HEAD Terra confirmation are posted verbatim on PR #265 after this handoff is committed. A commit cannot contain its own SHA or retrospective confirmation; no source change follows that confirmation. The lane obtains it before reporting READY FOR REVIEW.
- No merge or deployment is performed by this lane. The PR remains draft for owner/orchestrator action.

## Team, routes and worker receipts

Lead: **`openai/gpt-6.1-sol`, xhigh, Pi 1.5.2**; persisted route/effort checked. The lead decomposed, inspected, integrated, ran verification, maintained Git/PR/evidence, and did not implement or rewrite worker source.

All workers used native Pi, explicit `worker-hydrogen` / `antigravity/gemini-4-hydrogen`, `general` RW profile, `fallback_models: []`, timeout `7200000`, and no max-turn cap. Each fan-out was dry-run preflighted. Parallel writers used separate isolated worktrees; later bounded single-writer repairs ran sequentially in the assigned lane checkout. Isolated results were inspected with `action:"diff"` and applied with `action:"apply"`; shared repairs were inspected through their Git diffs. Every worker's actual persisted assistant provider/model/effort was checked. No worker delegated further, no model substitution or model-tier escalation occurred, and configured `nova-gaia` author identity was preserved.

| Task | Actual model / effort / harness | Work and verification |
|---|---|---|
| Original persistence + CLI | Hydrogen / medium / Pi | Store, trace format, resume/reaper and CLI; 70 files / 1812 tests passed; typecheck passed. |
| Original status + Console | Hydrogen / medium / Pi | v1 status and consumer; 6 files / 216 tests passed; typecheck passed. |
| Original fork/store repair | Hydrogen / medium / Pi | Env-root fork isolation, manifests, stale/concurrent/partial appends, projection refresh; targeted 7 files / 803 passed; typecheck passed. |
| Original early Console repair | Hydrogen / medium / Pi | Campaign before summon log; 1 file / 37 passed; typecheck passed. |
| Original Terra persistence repairs | Hydrogen / medium / Pi | Missing trace, pause boundary, actual resume fold, callback failures; targeted 4 files / 728 passed; worker full 2643 passed / 1 skipped. |
| Original Terra provenance repair | Hydrogen / medium / Pi | Reported progress without invented rung selection; 5 files / 218 passed. |
| Original conservative retention/dry-run repair | Hydrogen / medium / Pi | Invalid boundary preservation and read-only dry-run; 3 files / 39 passed. |
| Original projection-I/O isolation | Hydrogen / high / Pi | Read-only retention independent of derived status; 41 files / 1415 passed; skill-summon 30 files / 378 passed. |
| Original failed-reattach ordering | Hydrogen / high / Pi | Preserve original pause expiry until owner commit; 8 files / 84 passed. |
| **Reopened environment hermeticity** | **Hydrogen / high / Pi** | Global worker-only setup, fixture hooks, actual fixed-ID subprocess regression; targeted fixed and unset 7 files / 70 passed each; worker full fixed and unset 2657 passed / 1 skipped each before sibling test integration. |
| **Reopened live-server isolation** | **Hydrogen / high / Pi** | Four real MCP lifecycle tests; 4/4 in each env; existing session suites 2 files / 31 passed in each. |
| **Reopened deterministic decision fixture** | **Hydrogen / high / Pi** | Real offline installability adapter/projection and zero remote-git assertions; targeted 17/17 each env; worker full 2661 passed / 1 skipped in each before runner lifecycle additions. |
| **Reopened bounded runner lifecycle** | **Hydrogen / high / Pi** | Direct local Node/Vitest CLI, bounded process/output/pipe cleanup and three short lifecycle tests; 6/6 fixed and unset, including FORCE_COLOR=1. |
| D-013 evidence correction | Hydrogen / medium / Pi | JSON problem text corrected, existing renderer rerun; JSON parse and rendered-match checks passed, only two intended lines changed. |

Reopened child sessions: `01a1e288-adec-7242-92b1-6c7016e8eb32`, `01a1e288-adff-73cb-9dc5-56b5e0689153`, `01a1e29d-e531-77ca-a62f-fd94b836bb2f`, `01a1e29d-e545-7423-a474-9587796de7c5` (all Hydrogen/high), and `01a1e2ab-6e1e-772d-84db-86fe24fc6432` (Hydrogen/medium). The original nine-worker detail and receipts remain in this file's history at `0188bbac295564de8288945015e8dd483a8e2df8`.

Reviewer: independent **`reviewer`, `openai-codex/gpt-6.1-terra`, high, Pi**, read/bash verification, no fallback. Native reviewer sessions' persisted actual route and thinking were checked externally; the reopened source review session is `01a1e2a8-5001-74db-a28c-1bf99d440094`. All reviewer test invocations use explicit `npx vitest run` or the finite root `npm test`, with bounded per-command timeouts; no watch mode, dev server or harness reprobe.

## Original product implementation

- `CampaignStore.load(sessionRoot, options?)` / `append(event)` persist append-only `campaign/trace.jsonl`, separately position/event/record-bound `campaign/evidence.jsonl`, and `campaign/status.json` through U0a replay/verification and `toControllerStatus`. Invalid history loads `FAILED_SAFE`, is never silently repaired and refuses append. Absent campaigns remain write-free; normal load refreshes verified or failed-safe status. `refreshStatus: false` permits read-only verification.
- Shared strict trace/evidence helpers serve store and standalone `--campaign-verify <trace>` / `--campaign-explain <trace>`. Verify returns nonzero on malformed/tampered/un-evidenced privileged histories; explain covers every transition kind.
- One `HARNESS_SESSION_ID_ENV_VARS` constant includes `CLAUDE_CODE_SESSION_ID`; manifests record the ID. Automatic resume adopts only a physically disposable direct-child root with matching ID and proven-dead PID. Fork/unmatched IDs create fresh roots without campaign state; materialized paths survive valid resume. Legacy explicit-root reuse without a stable ID remains intentional.
- Reattachment folds/verifies before exposing the root, refreshes status, commits the new owner manifest before clearing the pause boundary, and preserves prior expiry through failures. Manifest paths and writes are confined.
- Reaper retention comes from the approved folded charter's `sessionRetention`, not status or a compiled pause default. A PID/verified-record-bound `campaign/pause.json` anchors first dead-PID observation, is not renewed by repeated reaps, and resets on successful resume. Invalid regular boundaries are conservatively established once; unsafe/nonregular boundaries or uncertain verification/I/O preserve the root. Both dry and real retention decisions fold read-only, independently of derived status; dry-run writes nothing. Genuinely absent/unapproved/terminal/known-invalid-trace campaigns retain legacy reaping rules.
- Status schema is `skill-heaven/controller-status/v1`; new phases and reported progress render, including before the first summon. A reported status never fabricates an observed Ultra command or replaces the actual entropy reading/selection.
- MCP, status and affected Console bundles were rebuilt. Existing SIGINT/SIGTERM handling already calls `server.close()` without deleting the root; no server-entry change or harness reprobe was needed. Ultra stays **provisioned**; no live campaign tool registration.

## Reopened defect: facts, repair and production isolation

### Confirmed reproduction and cause

The lead reproduced the enrichment suite on pre-repair U0b: with `CLAUDE_CODE_SESSION_ID=test-fixed`, **3 failed / 2 passed**; unset, **5/5 passed**. The orchestrator reports pre-U0b base `5ffac74` passes 5/5 with the ID set; that baseline is human-reported, not independently rerun here.

The confirmed failure was **live-root non-adoption**, not proven sharing between live servers. Fixture `openSession()` inherited the ID and recorded the current live PID; the MCP server correctly refused that already-owned fixture root and started a fresh empty root, losing the primed fixture skill. D-013 now distinguishes its original sharing suspicion from this verified cause. Production reattachment behavior was not weakened or changed in the reopened repair.

All test workers scrub inherited harness-ID/session-root variables before test module evaluation and before/after tests. Explicit per-test ID setup still exercises the real production environment lookup and resume behavior. A sync assertion follows the production env-key list without importing mock-sensitive filesystem modules in setup. The nonrecursive subprocess regression receives `test-fixed` and an inherited root at child startup and executes the actual enrichment and session suites.

### Production conclusion and tested scope

**No unintended adoption of a recorded-live root occurs in the tested real MCP lifecycle.** Two distinct live server instances under the same stable ID have distinct roots, including concurrent fresh resolution and an explicit pointer to the other live root. Resident skills/campaigns do not cross. Instance-local `sessionPromise` keeps repeated calls pinned despite ambient env changes. Deliberate same-ID/dead-PID resume still reuses the old root, updates PID, and then protects it from a third live instance.

These tests use real MCP servers/clients and `InMemoryTransport` in one Node process, so recorded live PIDs equal the test PID. They do **not** prove cross-process race-free adoption or an OS lock. Legacy no-ID explicit-root sharing is intentional compatibility behavior. Tests use isolated temp/cache namespaces, offline local git fixtures, and complete client/server/temp/env cleanup; no external harness process is killed.

### Verification hardening uncovered by full runs

Two integrated unset full runs hit a 20s timeout in an existing synthetic suite-component test (2660 passed / 1 failed / 1 skipped), while the fixed run passed. Its inline installability claim was replaced with unknown by `GaiaService` because no trusted adapter was configured, so the fake GitHub component reached live `git ls-remote`; even fast passes relied on incidental network failure. The repaired fixture uses a real offline `GaiaInstallabilityAdapter` / `StaticInstallabilitySource` projection with matching route/content evidence, asserts the exact not-materializable refusal and proves zero remote resolution/clone calls via pass-through spies. No timeout, assertion or gate was weakened.

The nested regression runner uses the installed local Vitest CLI through `process.execPath`, not an npm/.cmd wrapper. Output, deadlines and pipe-close waits are bounded; POSIX process groups are terminated/reaped, with short timeout/pipe-holder/output regressions. Windows tree handling is statically/type checked, not executed on Windows; an already-reparented Windows descendant or escaped POSIX `setsid` descendant is not claimed reaped, though pipe-close bounds prevent the parent runner hanging.

## Final verification results

Environment: Node **22.23.1**, npm **10.9.8**, Vitest **5.0.3**. Initial `npm ci` succeeded (205 added, 217 audited); existing 6 audit vulnerabilities were not automatically fixed. **No dependency changes.**

On reopened source/test HEAD `1cb0535f38daa6ae37840fce2a0c4cbb03acd6a0`, the lead ran the complete, unchanged suite in both environments:

| Command | Actual result |
|---|---|
| `env -u CLAUDE_CODE_SESSION_ID -u SKILL_SUMMON_SESSION npm test -- --maxWorkers=2` | **112 files passed, 1 skipped; 2664 tests passed, 1 skipped** (67.63s) |
| `CLAUDE_CODE_SESSION_ID=test-fixed npm test -- --maxWorkers=2` (session-root variable scrubbed) | **112 files passed, 1 skipped; 2664 tests passed, 1 skipped** (68.29s) |
| `npm run typecheck`, ID unset | exit 0 |
| `npm run typecheck`, ID fixed | exit 0 |
| `npm run build:mcp`, `npm run build:status`, `npm run build:console` | all exit 0; no tracked generated drift |
| Working-tree `git diff --check` / `git diff --exit-code` | exit 0 |

Terra independently ran the targeted enrichment/session/hermeticity/live-server files with explicit `npx vitest run` in both environments: **5 files / 46 tests passed each**. It independently ran one full fixed-ID `npm test -- --maxWorkers=2`: **112 files passed, 1 skipped; 2664 tests passed, 1 skipped**, both typechecks and all builds, no tracked drift. Per the requested one-full-run limit, the reviewer did not independently repeat the entire unset suite; the lead's complete unset result is recorded above. The pre-existing one skipped test remains; no new skip was introduced. Reduced concurrency runs the whole suite, not a subset; no test-timeout constant was changed.

## Security, known limitations and review evidence

All original confinement/fork/tamper/authority boundaries remain unchanged by the test-only reopening. Sibling evidence is not authentication against arbitrary coordinated writes to all artifacts; external authorization/commitment seams require independently retained trust. Human-origin authentication belongs to U3. No OS multi-writer lock is claimed. PID reuse remains an OS limitation. First-dead-observation pause timing can conservatively retain longer than exact exit; repeated reaps do not renew the decided window. Uncertain I/O is preserved rather than treated as permission to delete.

No user-global settings, skills or configuration writes; no new runtime dependency, hooks, daemon, upload, live-controller claim or deployment. Native tools/tests are not claimed as Skill Heaven plugin dogfooding validation, and no plugin-scope actionable friction arose.

Verbatim reviews under `docs/evidence/ultra-126/reviews/`:

- `U0b-e798f2d.md`: original shell attempt BLOCKED on self-identification; source not assessed.
- `U0b-0cce72f.md`, `U0b-0ccdc71.md`, `U0b-e19b1a8.md`, `U0b-a72d5a6.md`: original findings and repair history.
- `U0b-c26d9b5.md`: original source/bundle PASS, historical; did not catch the inherited-env test defect.
- **`U0b-1cb0535.md`: reopened repair PASS, no blockers; D-013 wording warning corrected by `8f03589`.**

Actual Terra/high identity was checked for every accepted native report. Original hard-break whitespace in verbatim reports is intentionally preserved; base-to-HEAD whitespace checks flag it, but Terra classifies it as evidence formatting, not a product-source defect. Pre-existing `.pi/` contains local tool operational state only and is not committed.

## Files, outstanding work and next action

Original product files/bundles remain those recorded by the original handoff at `0188bba`. The reopened repair changes `vitest.config.ts`, `test/{hermetic-session-env,vitest-setup}.ts`, new `packages/skill-summon/test/{hermetic-session-env,campaign-live-server-isolation}.test.ts`, and fixture hooks/assertions in campaign-session-reattach, mcp-link-enrichment, mcp-protocol, stdio, summon-arbor, summon-decision and summon-session tests. D-013's `problem` text and its rendered HTML counterpart were corrected without changing orchestrator statuses or unrelated history. This handoff and the reopened verbatim review complete the evidence delta. **No reopened production source, dependency or bundle changes.**

No known reopened U0b blocker remains after Terra's source/test PASS. Before reporting READY, the lane obtains exact-published-HEAD Terra confirmation with the same bounded targeted/full-run discipline and publishes it verbatim on PR #265, without another commit afterward. The orchestrator should verify that confirmation and required CI, then integrate the draft PR; U1 can build on the persisted fold. This lane does not merge its own PR. The external final confirmation convention avoids an impossible commit-containing-its-own-retrospective-review loop.
