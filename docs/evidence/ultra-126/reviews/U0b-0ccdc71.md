# U0b independent review — 0ccdc71

Reviewed SHA: `0ccdc71ef561de664efb4568cc7d09b76c022c89`
Reviewer: native `reviewer`; persisted assistant provider/model `openai-codex/gpt-6.1-terra`, thinking high independently checked.
Verdict: CHANGES REQUIRED; blocking findings: yes.

## Verbatim reviewer output

## Status

**issues_found — CHANGES REQUIRED**  
Blocking findings: **yes**

Reviewed HEAD: `0ccdc71ef561de664efb4568cc7d09b76c022c89`  
Model: `openai-codex/gpt-6.1-terra`; high requested. Persisted effort attestation remains the lead’s responsibility.

The five prior findings are repaired on their tested paths. The adjacent retention and dry-run issues below remain.

## Findings

- `packages/skill-summon/src/summon/session.ts:679` — **critical**: An invalid pause boundary causes an approved paused campaign to fall back to the session-creation TTL, potentially deleting it immediately rather than retaining it for the decided window. Reproduce with a 48-hour campaign in a session older than four hours and a malformed or future-dated `campaign/pause.json`; the next reaper run selects it for deletion. The test at `campaign-session-reattach.test.ts:504` explicitly expects this behavior. Preserve the campaign conservatively when its boundary cannot be trusted, or establish a new observation boundary; do not fall back to creation age.

- `packages/skill-summon/src/summon/session.ts:719` — **warning**: Reaper dry runs can write `campaign/status.json`. `loadPausedCampaignRetention()` calls `CampaignStore.load()`, which regenerates a missing or stale status or projects `FAILED_SAFE` even when `reapSessions({ dryRun: true })` was requested. Reproduce with a dead session whose campaign status is stale or missing, then run a dry reap and inspect the status file. Provide a read-only verification path for dry runs and test that campaign artifacts remain unchanged.

## Verification Limits

- `npm test -- --maxWorkers=2`: **110 files passed, 1 skipped; 2,645 tests passed, 1 skipped**.
- `npm run typecheck`, `npm run build:mcp`, `npm run build:status`, and `npm run build:console`: **passed**. No tracked generated drift; pre-existing untracked `.pi/` remains.
- Working-tree `git diff --check`: passed. **Base-to-HEAD** diff check failed on trailing whitespace in the verbatim review at `docs/evidence/ultra-126/reviews/U0b-0cce72f.md:11,14`.
- No harness reprobe was performed. Sibling evidence protects against trace-only tampering, not an arbitrary writer of the entire campaign directory; human authentication and an OS writer lock are not established.
