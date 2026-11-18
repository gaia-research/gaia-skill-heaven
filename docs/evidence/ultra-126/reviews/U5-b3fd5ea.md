# Review U5-b3fd5ea

- **Reviewed SHA:** `b3fd5ead5a97a48980fe7151b2c0cd05a9784322`
- **Reviewer agent + model:** `reviewer-shared` (`openai-codex/gpt-6.1-terra:high`, thinking `high`)
- **Exit code:** 0

## Status

issues_found

## Findings

- `packages/skill-summon/src/mcp/server.ts:472` - **critical**: The gate treats the caller-controlled `surface: "any"` argument as proof of a person-requested summon. An automatic MCP caller can therefore select `any` to bypass the human-led, publish deny-list, execution-state, and needs-human restrictions. The tool description does not authenticate who requested the call. Derive the request path from trusted per-request human provenance, not the lane-filter argument; default to automatic when provenance is unavailable.

- `packages/skill-summon/src/campaign/gate.ts:259` - **critical**: The T8 classifier relies on narrow description regexes and misses committed skills that publish externally. For example, `favorchurch/triage-conference` says it can “draft/send replies,” and `wheresryan22/anatomy` says it publishes to a community gallery; neither wording matches the external-publish regex. Both have `invocation: "any"` and no explicit deny-list class in the committed index, so they can pass the automatic gate. Use a reviewed classification covering the committed catalog, with a fail-safe treatment for unknown external sources, and add regression cases for these skills.

- `packages/skill-summon/src/mcp/server.ts:443` - **critical**: The campaign and unit state are loaded once, before asynchronous retrieval and materialization, and every later gate check uses that stale snapshot. A concurrent stop, exclusion amendment, or transition to needs-human can complete while retrieval is in progress, yet the pending summon can still materialize under the former grant. The subsequent trace append occurs only after materialization and cannot undo it. Serialize campaign transitions with the final gate-and-materialize operation, or revalidate current state under a shared exclusion mechanism immediately before materialization.

- `packages/skill-summon/src/mcp/server.ts:580` - **warning**: All unplanned skills materialized by one call are grouped into one `A.summon` entry, including multi-result or suite calls. That does not satisfy the requested **one trace entry per unplanned materialization** and loses the individual event boundary. Append one accepted entry for each materialized unplanned skill, and test multiple results and suite components through replay and checkpoint.

## Verification Limits

Reviewed commit `b3fd5ead5a97a48980fe7151b2c0cd05a9784322` against `origin/integration/skill-ultra-126`. The worktree status showed only the pre-existing `?? graft/`; no tracked changes were made. Node was `v22.23.1`.

Commands run and results:

- `npm run typecheck` — passed.
- `npx vitest run packages/core/test/campaign-u5.test.ts packages/skill-summon/test/campaign-u5.test.ts packages/skill-summon/test/campaign-session-lookup.test.ts packages/skill-summon/test/campaign-u1.test.ts packages/skill-summon/test/campaign-u3.test.ts packages/skill-summon/test/campaign-u4.test.ts packages/skill-summon/test/campaign-live-server-isolation.test.ts test/authority-regression.test.ts test/core-plugin-no-hooks.test.ts` — 9 files, 207 tests passed.
- `env -u CLAUDE_CODE_SESSION_ID -u SKILL_SUMMON_SESSION npm test -- --maxWorkers=2` — 124 files and 2,972 tests passed; one file and one test skipped.
- `CLAUDE_CODE_SESSION_ID=test-fixed env -u SKILL_SUMMON_SESSION npm test -- --maxWorkers=2` — same result.

The classifier and concurrency findings are based on source inspection and committed index data; I did not run separate end-to-end reproductions for them. I did not rebuild the MCP bundle or independently verify its reproducibility.

Blocking findings: yes
