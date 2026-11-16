# U0b independent review — 0cce72f

Reviewed SHA: `0cce72f803164f2f0fa8936eb9ead2a8a4f75bf8`
Reviewer: native `reviewer`; actual persisted assistant metadata `openai-codex/gpt-6.1-terra`, thinking high verified by lead.
Verdict: CHANGES REQUIRED; blocking findings: yes.

## Verbatim reviewer output

## Status

**issues_found — CHANGES REQUIRED**  
Blocking findings: **yes**

Reviewed HEAD: `0cce72f803164f2f0fa8936eb9ead2a8a4f75bf8`  
Reviewer: dispatched independent reviewer; `openai-codex/gpt-6.1-terra`, high requested. Runtime effort attestation remains the lead’s responsibility.

## Findings

- `packages/skill-summon/src/campaign/store.ts:351` — **critical**: Deleting only `trace.jsonl` makes `load()` report a fresh, uncorrupted `UNARMED` store even when the sibling evidence and status remain. Reproduction: append an event, remove `trace.jsonl` alone, then load the store. This bypasses the stated trace-only tamper detection and leaves the old status visible. Treat a missing trace with surviving campaign evidence or status as `FAILED_SAFE`; preserve the write-free genuinely absent case.

- `packages/skill-summon/src/summon/session.ts:662` — **critical**: Retention is measured from session creation, not the beginning of the pause. A campaign created 49 hours ago with a 48-hour pause window can be reaped immediately after its process exits, rather than surviving its decided pause window. Record and verify an appropriate pause/last-live boundary and measure retention from that boundary.

- `packages/skill-summon/src/summon/session.ts:494` — **critical**: Reattachment returns the session without loading or verifying its campaign. The MCP’s session path likewise only calls `resolveSession()`. Reproduction: persist a campaign, corrupt its trace or leave its status stale, then resume the same dead-PID session: no fold or status refresh occurs, and Console continues reading the old projection. Load and verify on reattachment and project `FAILED_SAFE` or the verified fold before exposing the session.

- `packages/core/src/campaign/trace-format.ts:99` — **warning**: A throwing trusted authorization callback escapes during the preliminary replay, before `verifyCampaignRecord` can convert callback failure into a verification error. I reproduced `THREW: evidence unavailable` using a serialized operator event. Catch callback failures across replay as well and return a failed verification so the store loads `FAILED_SAFE`.

- `packages/console/src/reader.ts:125` — **warning**: Any parseable campaign status forcibly replaces the session’s reading with an **observed-command** selection of `ultra`. A reported status file—even a terminal or stale one—is not evidence that an Ultra command was observed, and can override a different existing reading. Preserve the actual reading and render reported campaign progress without inventing command provenance.

## Verification Limits

- `npm test -- --maxWorkers=2`: **110 files passed, 1 skipped; 2,636 tests passed, 1 skipped**.
- `npm run typecheck`, `npm run build:mcp`, `npm run build:status`, and `npm run build:console`: **passed**.
- `git diff --check` and base-to-HEAD diff check: **passed**. Builds produced **no tracked drift**. Pre-existing untracked `.pi/` remained present.
- Reviewed the base-to-HEAD diff and relevant source and tests; no harness behavior was re-probed. Sibling evidence protects against trace-only tampering, not an arbitrary writer of the entire campaign directory. No human-authentication claim is made.
