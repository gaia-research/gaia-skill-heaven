# Gaia Security integration handoff
Date: 2026-11-08. Review proposal only; no merge or deployment authorized.

## 1. Architecture and implementation
[gaia-research/gaia-security](https://github.com/gaia-research/gaia-security) is the canonical security governance/profile/triage reference. Skill Heaven retains local execution, GitHub-native integrations, host permission boundaries, deterministic bundles and review gates. No circular import/runtime dependency was added.

Zero declared external runtime dependencies does **not** mean third-party code is absent: the committed MCP bundle includes SDK/zod code selected from development dependencies. Bundled and build-time exposure require investigation.

## 2. Existing infrastructure discovered
CodeQL **default setup** is configured (default query suite, remote model, weekly; Python, JavaScript/TypeScript, Actions). Main analyses on `c7bcee5045711306f6d602ae92437d54448e15ca` were inspected; **2121179597 is an analysis ID, not a setup ID**. Historical inventory: 43 alerts, 2 fixed and 41 open. Dependabot inventory: 146 total, 140 fixed, 4 auto-dismissed and 2 open; automatic security updates enabled. Native secret scanning/PVR enabled, push protection disabled.

Existing SECURITY.md trust/installer/MCP/display invariants, SDK URI-template build patch, bundle freshness tests, harness/installer checks and linear-history/PR rules are preserved. No scanner configs or Dependabot YAML existed before this mission. No settings or ruleset changes were made.

## 3. Changes made
- SECURITY.md retains existing principles while linking central governance and the enabled repository-local private disclosure channel. Central PVR is explicitly pending approval.
- Slug normalization uses bounded input and deterministic trimming; regression tests exercise long inputs, fallback, bounds and public URI compatibility. This defensive refactor does not claim demonstrated exploitation of the old code.
- Slug is exposed only from its implementation module for focused tests, not newly re-exported through the package index.
- MCP bundle regenerated twice from local worktree source, retaining the SDK build-boundary patch. It is byte-identical to the base: the modified compatibility `skillUri`/slug helper is tree-shaken from this entry point, which imports `skillUriForSkill`. No generated artifact diff is necessary.
- This handoff. No workflow, dependency version, alert suppression, default CodeQL setup or host authorization rule changed.

## 4. Validation evidence
- `npm run typecheck`: passed.
- `npx vitest run packages/skill-summon/test/mcp-skills.test.ts`: **16 passed** on Node 24.17.0/Termux.
- `npm run build:mcp` run twice; second output passed SHA-256 equality against first build. Existing SDK patch check ran successfully. Bundle Git blob remained `fa1560e98edd0ec0823bf83e56192789e117f3cb`, identical to base because the changed helper is not included in that entry point.
- Full `npm test` was attempted. It showed failures in file-open/projection/environment tests before the harness interrupted the process; no full-suite pass is claimed. A focused reproduction on both this branch and a detached unchanged `origin/main` (`c7bcee5045711306f6d602ae92437d54448e15ca`) produced the **same 5 failures / 7 passes** in `arbor-file.test.ts` and `configured-service.test.ts`. One reports secure file opening unavailable on this platform; four cannot find the expected local projection fixture. These are demonstrated baseline/environment failures, not fixed or hidden by this PR. Supported-platform CI remains a merge gate.
- Central baseline native scan: Gitleaks working tree **0 candidates**, OSV 2.7.0 **5 advisory records**, Trivy 0.76.2 filesystem misconfiguration **0 candidates**, GitHub API ingestion **41 CodeQL** and **2 Dependabot** open observations. Native scan/API execution completed; baseline normalization yielded **40 candidates**, all **pending validation**, not accepted risks or false positives.
- Hosted [CI run 42485153000](https://github.com/gaia-research/gaia-skill-heaven/actions/runs/42485153000) passed on implementation commit `c300e40431235976bd8179d5b3b7775db7a7915b`: **104 test files and 1,840 tests passed; one file/test skipped**, build/plugin/console checks and Windows installers passed. Harness compatibility and native CodeQL checks also passed. This supersedes the supported-platform verification gap, not the documented Android limitations.
- Founder-directed final `reviewer-shared` (`openai-codex/gpt-6.1-terra`, high, read-only) marked this integration **READY FOR REVIEW**, with no blockers in inspected source/tests/policy/handoff. Review did not independently rerun tests or inspect all references (search tools unavailable). No approval to merge or deploy is implied.
- Full restricted reports remained owner-only outside Git. No sensitive findings, secrets, alert payloads or exploit instructions are published in this handoff.

## 5. Scanner coverage
|Tool|Actually observed|Limitation|
|---|---|---|
|CodeQL|Default setup and recent successful main analyses inspected; open API alerts ingested|No local CodeQL scan or claim alerts already closed on unmerged code|
|Dependabot|Paginated open-alert API ingestion|Detection does not establish runtime exposure|
|Gitleaks|Native working-tree scan, local binary version unreported|No history/credential-validity claim|
|OSV-Scanner 2.7.0|Native dependency scan|Build/bundled code must be reviewed, not dismissed because “devDependency”|
|Trivy 0.76.2|Native misconfiguration scan|Not a claim of zero production vulnerabilities or image/OS coverage|
|Semgrep CE|Central profile provided; host CE CLI unavailable|No Semgrep CLI scan claimed|

## 6. Security limitations
Existing SAST and dependency findings remain **unvalidated** where no specific reviewed evidence exists. Parity-locked source, fixture paths and CLI-only use are not safety proofs. SDK/zod may be bundled; build tools may process attacker-controlled inputs. Static analysis does not establish natural-language prompt safety, cross-harness permissions, authorization correctness or deployment exposure.

## 7. Costs and execution requirements
No paid feature, subscription or cloud infrastructure enabled. No new automatic workflow added. Local scans/tests consume existing CPU/network. Existing CodeQL and CI remain repository-owned. Future private/larger runners and storage need budget approval. Native Termux is not identical to Ubuntu/Windows CI.

## 8. Outstanding issues
Android file-opening/projection limitations were reproduced on unchanged main; supported-platform hosted CI passed as recorded above. Preserve full-suite and existing review/merge gates on subsequent commits. Re-evaluate existing findings privately; no blanket fixture exclusions or advanced-setup migration to hide noise is proposed. Track upstream SDK changes through the existing version-pinned bundle patch. Compatible authorized repairs should remain batched into one integration PR/run.

## 9. GitHub configuration changes awaiting approval
**NOT executed**; founder consideration only:
```bash
printf '%s\n' '{"security_and_analysis":{"secret_scanning_push_protection":{"status":"enabled"}}}' | gh api --method PATCH repos/gaia-research/gaia-skill-heaven --input -
```
Effect: block recognized secret pushes while preserving native scanning. Recheck public-repository eligibility/policy. Reversal requires separate approval. No branch rules, billing or other security settings changed.
