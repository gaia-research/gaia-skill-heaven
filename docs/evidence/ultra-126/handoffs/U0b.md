# U0b handoff — persistence, isolated tests and bounded session discovery

## Publication and acceptance

- Unit: **U0b**; owning team: **Pi lane**.
- Branch: `feat/ws6-ultra-u0b`; draft PR: [#265](https://github.com/gaia-research/gaia-skill-heaven/pull/265), base `integration/skill-ultra-126`.
- Repaired source/test HEAD: **`3fa0286a5abc9ce9d995e5ac7648605469f5aeea`**, on top of integration merge **`d073a02f7d9bf0de4fcea50d17cf01442d0131a3`** (merging `origin/integration/skill-ultra-126` at `4aa3ced0c2d3d452749f3f4230dc87f0182b10e0`, which carries `main` through `13ddcf2` / #270 and the updated D-018 roster).
- Independent Terra review of `3fa0286a5abc9ce9d995e5ac7648605469f5aeea`: **PASS, no blocking findings**, recorded verbatim at [`../reviews/U0b-3fa0286.md`](../reviews/U0b-3fa0286.md). Both blocking test-proof gaps from `U0b-5d6b1b2.md` are closed, the integration merge is verified clean, and the full 3-mode suite (`2,716 passed, 1 skipped` across `115 passed, 1 skipped` files), typechecks, and bundle builds (`build:mcp`, `build:status`, `build:console`) are green with zero tracked drift.
- Supersedes the original `0188bba` closeout, the inherited-environment `72f6277` closeout, and earlier intermediate performance reviews (`U0b-b03f64c.md`, `U0b-c3f1f73.md`, `U0b-c0d2376.md`, `U0b-1f93f9e.md`, `U0b-49b3a6b.md`, `U0b-ff80d89.md`, `U0b-5d6b1b2.md`).
- No screenshots are committed to git (founder rule D-018). No merge, deployment, or draft-to-ready conversion is performed by the lane; the owner/orchestrator integrates after checking review clearance and CI.

## Team, roster and worker receipts

- **Active lead (resumed under D-018 roster):** **Gemini 4 Argon High** (`antigravity/gemini-4-argon:high`, Pi 1.5.2). Replaced the paused earlier lead (`openai/gpt-6.1-sol` / `openai/gpt-6.2-sol`, `xhigh`, Pi 1.5.2) when the `openai` provider became unavailable. The lead decomposed, inspected, merged `origin/integration/skill-ultra-126`, dispatched the residual proof repair, ran full 3-mode verification and Terra review, and maintained Git/PR/evidence without implementing worker source.
- **Roster (`docs/evidence/ultra-126/briefs/COMMON.md`, D-018):** Providers `openai-codex` and `antigravity` only (`fallback_models: []`, no max-turn cap, timeout ≥ 7,200 s). L1 `worker-luna-shared` (`openai-codex/gpt-6-luna:medium`, mechanical only), L2 `worker-hydrogen` (`antigravity/gemini-4-hydrogen`, default), L3 `worker-argon` (`antigravity/gemini-4-argon:medium`), L4 `worker-opus` (`antigravity/claude-opus-5-5:medium`). Every dispatch was dry-run preflighted via `subagent action:"plan"`. No model-tier escalation beyond L2 `worker-hydrogen` was needed because `worker-hydrogen` closed the residual findings cleanly.
- **Reviewer:** Independent **Terra High** via `reviewer-shared` (`openai-codex/gpt-6.1-terra:high`, high effort, Pi shell `pi-reviewer --agent reviewer-shared --cwd <worktree> --timeout 10800 --json --prompt-file <brief>`), read/bash verification only, no fallback or extensions.

| Repair / work item | Commit(s) | Model / effort / harness | Verification & receipt |
|---|---|---|---|
| Original persistence, CLI, status v1, Console, fork/reattach/retention repairs | `0188bba` history | `antigravity/gemini-4-hydrogen` / medium & high / Pi | Store, trace format, resume/reaper, CLI, status v1, Console; 2,643 passed / 1 skipped; typecheck passed. |
| Reopened inherited-env hermeticity, live-server isolation, offline decision fixture, bounded runner | `34fef99`, `77fd372`, `1cb0535`, `8f03589` | `antigravity/gemini-4-hydrogen` / high & medium / Pi | Sessions `01a1e288-adec`, `01a1e288-adff`, `01a1e29d-e531`, `01a1e29d-e545`, `01a1e2ab-6e1e`; 112 files / 2,664 passed / 1 skipped unset & fixed; Terra PASS (`U0b-1cb0535.md`). |
| Bounded advisory lookup & FS-op regressions; worker-only temp isolation; remove request-path reaper scan | `5716af1`, `f36ad1f`, `aa97bff`, `df95323` | `antigravity/gemini-4-hydrogen` / high / Pi | Isolated temp namespaces before module evaluation; O(1) discovery in foreign-root count. |
| One-time founder-directed design consultation | `3fabedf` | `openai/gpt-6-astra` / xhigh / Pi (`advisor-astra`) | Zero tools, no fallback; verbatim advice at `docs/evidence/ultra-126/advice/U0b-advisor-astra.md`. |
| Optional-index availability & private-directory repair | `5a425cd` | `antigravity/gemini-4-hydrogen` / high / Pi | Repaired findings from `U0b-b03f64c.md`. |
| Per-root ownership exclusion, actual read cap (65,537 B), shutdown discoverability | `d978d0f` | `antigravity/gemini-4-hydrogen` / high / Pi | Session `01a1e306`; persisted route/effort verified. |
| Atomic/serialized manifest publication, fresh-create fencing, conservative explicit close | `3d2d63f` | `antigravity/gemini-4-hydrogen` / high / Pi | Session `01a1e317`; persisted route/effort verified. |
| Single owner-generation commit, stale pause invalidation & transient-metadata race repair | `2edd573` | `antigravity/gemini-4-hydrogen` / high / Pi | Session `01a1ea51-1731-72c9-89a0-1b07a657d950`; repaired `U0b-c3f1f73.md`. |
| Preserve corrupt/unverifiable campaign roots rather than applying ordinary TTL | `1f93f9e` | `antigravity/gemini-4-hydrogen` / high / Pi | Targeted 9 files / 99 passed unset & fixed; repaired `U0b-c0d2376.md`. |
| Cross-instance/process append exclusion & callback-only evidence-history refusal | `4d48ded`, `49b3a6b` | `antigravity/gemini-4-hydrogen` / high / Pi | Targeted 5 files / 74 passed unset & fixed; repaired B1/B2 from `U0b-1f93f9e.md`. |
| Coordinated load/projection, stable write-free snapshots, opaque active-claim borrowing & standalone sidecar evidence | `9005413`, `ff80d89` | `antigravity/gemini-4-hydrogen` / high / Pi | Targeted 6 files / 85 passed + 3 files / 22 passed unset & fixed; repaired `U0b-49b3a6b.md`. |
| E/F test-proof strengthening (post-final-claim barrier, expired pause GC proof, physical borrow, Linux fixture allowance) | `5d6b1b2` | `antigravity/gemini-4-hydrogen` / high / Pi | Session `01a1eac3-a78e-7143-ab8a-bd24836c7cbd`; 3 files / 53 passed unset & fixed; full 2,712 passed / 1 skipped; Linux CI `44150296595` green. |
| Integration merge of `origin/integration/skill-ultra-126` (`4aa3ced`) | `d073a02` | `antigravity/gemini-4-argon` / high / Pi (Lead) | Clean ort merge onto `0c64224`; `campaign.json` validated. |
| **Residual post-barrier FS/FileHandle read & physical borrow replacement preservation test proofs** | **`3fa0286`** | **`antigravity/gemini-4-hydrogen` / high / Pi** | Session `01a1ee37-41f5-70d3-9ace-0e6594eb3545`; targeted 2 files / 37 passed unset & fixed; both typechecks & `git diff --check` passed; Terra PASS (`U0b-3fa0286.md`). |

## Implementation summary

### Product persistence and consumers

- `CampaignStore` (`packages/skill-summon/src/campaign/store.ts`) persists confined append-only `campaign/trace.jsonl`, separately event/record-bound `campaign/evidence.jsonl`, and derived `campaign/status.json` using U0a replay/verification and `toControllerStatus`. Invalid or missing required history loads `FAILED_SAFE`, refuses append, and is never silently repaired. Read-only fold (`refreshStatus: false`) is independent of status-projection I/O.
- Independent store instances and processes share a nonblocking root-local append fence across disk comparison, transition, trace/evidence/status writes, and memory commit; busy/stale losers cannot corrupt or overwrite a winner. The fence coordinates GC/close/creation and reattachment. Nonempty callback-authorized or agent-only histories lacking independently valid complete sidecar evidence remain readable, but `append` refuses before any disk mutation unless every prefix commitment stands alone without the callback.
- Default loads serialize verification plus status publication with appends, avoiding torn failed-state reads or stale projections. Read-only loads use claim-presence checks and two identical physical/byte snapshots without creating any claim or writing. Internal adoption and real GC borrow validated opaque active-claim capabilities (`WeakMap` membership, canonical root identity, physical claim `dev`/`ino`, regular non-symlink type, and active lifetime checks). Absent-campaign loads remain write-free.
- Shared trace/evidence helpers (`packages/core/src/campaign/trace-format.ts`) serve standalone `--campaign-verify <trace>` and `--campaign-explain <trace>` (`packages/core/src/cli.ts`); invalid/tampered/un-evidenced privileged histories return nonzero. Explain covers every transition kind.
- Controller status schema is `skill-heaven/controller-status/v1` (`packages/status/src/adapters.ts`); Console (`packages/console/src/reader.ts`) reads `campaign/status.json` even before a summon log. Reported progress never fabricates an observed Ultra selection. Ultra copy stays **provisioned**.

### O(1) discovery in unrelated-root count and ownership exclusion

- Per-UID private temp metadata (`packages/skill-summon/src/summon/session-ownership.ts`, `session.ts`) maps a domain-separated hash of stable harness ID (`HARNESS_SESSION_ID_ENV_VARS`, including `CLAUDE_CODE_SESSION_ID`) to at most **16 root references / 64 KiB**, with actual reads bounded at **65,537 bytes** and no directory-enumeration fallback.
- Index candidates remain hints: disposable direct-child/prefix validation, confined non-symlink manifest, exact harness ID, and `ESRCH`-only proven-dead recorded PID remain mandatory. Both the startup root scan and request-path reap scan are removed; only explicit maintenance enumerates roots.
- External exclusive per-root claim files and root-local `.session.claim` coordinate creation, adoption, append, explicit close, and GC. Normal manifest updates are serialized per instance and published via confined sibling `wx` temp plus atomic rename. GC and explicit `SummonSession.close()` atomically quarantine-rename claimed roots before recursive removal; `server.close()` and `SIGINT`/`SIGTERM` leave roots, campaigns, and locator entries intact.
- Resume validates paths/pause shape and folds/verifies before committing a single atomic manifest update (new PID + fresh `ownerGeneration`). Pause markers (`campaign/pause.json`) are bound to `ownerGeneration`, PID, and verified record digest; retention comes strictly from the verified approved charter's `sessionRetention` with no compiled default. Corrupt or uncertain histories are conservatively preserved; dry-run GC is completely read-only.

### Residual test-proof repairs (`3fa0286`)

- **Post-barrier filesystem and `FileHandle` read proof (`packages/skill-summon/test/campaign-store.test.ts`):** Wrapped `node:fs/promises` pass-through (including `access`, `glob`, `lstat`, `open`, `opendir` + `dir.read`, `readFile`, `readdir`, `readlink`, `realpath`, `stat`, `statfs`, `watch`, and mutating calls) and instrumented every `FileHandle` returned by `open()` (`read`, `readFile`, `readv`, `stat`, `createReadStream`, `readLines`, `readableWebStream`, and mutating handle methods). Fenced preview operations with `AsyncLocalStorage` (`createPreviewOpRecorder`) so concurrent writer/fixture reads never pollute preview counts, proved zero post-barrier reads/opens/handle-reads and zero mutations in both 3b (committed append) and 3c (torn append), and added an independent owned-fixture negative-control test exercising real handle reads/streams on an already-open handle.
- **Physical borrow replacement preservation (`packages/skill-summon/test/session-ownership.test.ts`):** Kept `pinnedOldHandle` open across both stale borrow rejection and `claimA.release()`, asserting that the different-inode regular replacement's `dev`, `ino` (`!== oldStat.ino`), regular-file type, and exact `replacementPayload` bytes remain intact at `claimA.claimPath` both after rejection and after `claimA.release()` before fixture cleanup removes it. Acquired a fresh live claim/token (`claimSymlink` / `borrowSymlink`) for the symlink replacement case and verified symlink `dev`/`ino`, `readlink` target, and `outsideSentinel` payload across both rejection and release.

## Verification

Environment: Node **22.23.1**, npm **10.9.8**, Vitest **5.0.3**, macOS. **Zero runtime or package dependency changes.**

On repaired source/test HEAD `3fa0286a5abc9ce9d995e5ac7648605469f5aeea`:

| Command / runner | Environment | Actual result |
|---|---|---|
| `npx vitest run packages/skill-summon/test/campaign-store.test.ts packages/skill-summon/test/session-ownership.test.ts` (Hydrogen + Terra) | `SKILL_SUMMON_SESSION` & `CLAUDE_CODE_SESSION_ID` unset | **2 files passed, 37 tests passed** |
| `npx vitest run packages/skill-summon/test/campaign-store.test.ts packages/skill-summon/test/session-ownership.test.ts` (Hydrogen + Terra) | `SKILL_SUMMON_SESSION` unset, `CLAUDE_CODE_SESSION_ID=test-fixed` | **2 files passed, 37 tests passed** |
| `npm test -- --maxWorkers=2` (Lead) | `SKILL_SUMMON_SESSION` & `CLAUDE_CODE_SESSION_ID` unset | **115 files passed, 1 skipped (116); 2,716 tests passed, 1 skipped (2,717)** (77.29s) |
| `npm test -- --maxWorkers=2` (Lead + Terra) | `SKILL_SUMMON_SESSION` unset, `CLAUDE_CODE_SESSION_ID=test-fixed` | **115 files passed, 1 skipped (116); 2,716 tests passed, 1 skipped (2,717)** (78.85s lead) |
| `npm test -- --maxWorkers=2` (Lead) | Inherited shell environment | **115 files passed, 1 skipped (116); 2,716 tests passed, 1 skipped (2,717)** (78.15s) |
| `npm run typecheck` (Lead + Terra) | Unset and `CLAUDE_CODE_SESSION_ID=test-fixed` | **Exit 0 in both modes** |
| `npm run build:mcp && npm run build:status && npm run build:console` (Lead + Terra) | Standard | **All exit 0; all 7 committed `.mjs` bundles byte-identical (`git diff --exit-code` exit 0)** |
| `git diff --check` (Lead + Terra) | Working tree | **Exit 0** |

The single skipped test file is the pre-existing `test/windows-installer.test.ts` on macOS.

## Files changed (against `origin/integration/skill-ultra-126`)

- **Persistence & CLI:** `packages/skill-summon/src/campaign/store.ts`, `packages/core/src/campaign/{trace-format,index}.ts`, `packages/core/src/cli.ts`, `packages/core/test/{campaign-cli,campaign-engine}.test.ts`.
- **Session discovery, re-attach & ownership:** `packages/skill-summon/src/summon/{session,session-ownership,summon}.ts`.
- **Session & store test suites:** `packages/skill-summon/test/{campaign-store,session-ownership,campaign-session-lookup,campaign-session-reattach,campaign-live-server-isolation,hermetic-session-env,mcp-link-enrichment,mcp-protocol,stdio,summon-arbor,summon-decision,summon-session}.test.ts`.
- **Hermetic test setup & temp-root isolation:** `vitest.config.ts`, `test/{hermetic-session-env,vitest-setup,session-temp-root-isolation.test}.ts`.
- **Status v1 & Console:** `packages/status/src/{adapters,console-view,render}.ts`, `packages/status/test/status.test.ts`, `packages/console/src/reader.ts`, `packages/console/test/adapters.test.ts`.
- **Rebuilt bundles:** `plugins/skill-heaven/mcp/skill-summon.mjs`, `plugins/skill-heaven-console/hooks/status-model.mjs`, `plugins/skill-heaven-console-{agy,codex,grok,hermes}/scripts/heaven.mjs`, `plugins/skill-heaven-console-pi/extensions/console.mjs`.
- **Evidence & ledger:** `docs/evidence/ultra-126/handoffs/U0b.md`, `docs/evidence/ultra-126/advice/U0b-advisor-astra.md`, `docs/evidence/ultra-126/reviews/U0b-{e798f2d,0cce72f,0ccdc71,e19b1a8,a72d5a6,c26d9b5,1cb0535,b03f64c,c3f1f73,c0d2376,1f93f9e,49b3a6b,ff80d89,5d6b1b2,3fa0286}.md`, and the 1-line D-013 problem clarification in `docs/evidence/ultra-126/{campaign.json,DECISION-LOG.html}`.

## Security considerations, known limitations and review history

- **Security:** Every campaign, manifest, and index path is validated through `assertConfinedPath` / no-follow physical confinement inside disposable session or private per-UID temp directories. No writes occur outside disposable temp directories (`~/.claude`, user settings, and skills are untouched). Tampered or incomplete evidence loads `FAILED_SAFE` and refuses append.
- **Known limitations:** Advisory locator updates are best-effort hints (capped at 16 roots / 64 KiB) and can lose references on eviction or concurrent updates without deleting session data; legacy unindexed roots require explicit attachment or maintenance discovery. Filesystem claims coordinate cooperating processes, not hostile same-UID tampering or OS PID reuse. Crash-left claims, unsafe coordination metadata, and interrupted quarantine directories require manual cleanup rather than automatic stale-lock breaking. Sibling campaign evidence is not independent human-origin authentication (owned by U3).
- **Review history and final verdict:**
  - `U0b-e798f2d.md`, `U0b-0cce72f.md`, `U0b-0ccdc71.md`, `U0b-e19b1a8.md`, `U0b-a72d5a6.md`, `U0b-c26d9b5.md`, `U0b-1cb0535.md`: initial and reopened hermetic-env review history.
  - `U0b-b03f64c.md`, `U0b-c3f1f73.md`, `U0b-c0d2376.md`, `U0b-1f93f9e.md`, `U0b-49b3a6b.md`, `U0b-ff80d89.md`, `U0b-5d6b1b2.md`: performance and ownership-fence review progression, narrowing at `5d6b1b2` to zero product defects and two test-proof gaps.
  - **`U0b-3fa0286.md` (final source/test review on `3fa0286a5abc9ce9d995e5ac7648605469f5aeea`):** **PASS; Blocking findings: no.** Both residual test-proof gaps from `U0b-5d6b1b2.md` are closed and the integration merge is clean.
- **Outstanding issues:** None.
- **Next recommended action:** Ready for orchestrator review and integration of draft PR #265 into `integration/skill-ultra-126` so U1 can build on the verified persisted fold.
