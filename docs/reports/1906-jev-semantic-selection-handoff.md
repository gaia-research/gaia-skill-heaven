# Handoff Report: Optional Jev Semantic Selection Integration

**Reference**: gaia-research/gaia-skill-tree#1906  
**Repository**: gaia-research/gaia-skill-heaven  
**Branch**: `feat/1906-jev-semantic-selection`  
**Date**: November 2026  
**Status**: READY FOR REVIEW  

---

## 1. Executive Summary

This integration introduces an optional probabilistic semantic decision layer (`jev-1.13.0`) into the Gaia Skill Heaven `/summon` pipeline, backed by TypeSafe System One. It directly addresses the research hypotheses in `gaia-research/gaia-skill-tree#1906` while rigorously enforcing the non-negotiable core constraint:

> «Probabilistic inference must not become policy authority.»

The system introduces a unified, modular `DecisionBackend` abstraction supporting three distinct modes:
1. **`classic` (Product Baseline)**: Deterministic BM25F ranking, calibrated relevance floor, relative relevance band, and deterministic policy gates (`decide()`). Offline-first, $0 cost, zero network overhead. Remained the product default.
2. **`jev` (Experimental Semantic Decision)**: BM25F candidate recall generates bounded candidate sets (top 8–10 eligible candidates). Pinned model `jev-1.13.0` evaluates $P(\text{skill fits intent})$ vs $P(\text{none fits})$. Candidates pass through strict deterministic security and surface gates before admission. Safe offline fallback ensures zero interruption on network/budget failure.
3. **`compare` (Preferred Shadow Experiment Mode)**: Classic BM25F remains **100% authoritative** for admitted and previewed skills. The probabilistic decision model observes in shadow mode on the exact same candidate set, recording semantic choices, confidence, agreement/disagreement, and discrepancy metrics into the ranking disclosure and shadow corpus.

---

## 2. Architecture & Implementation Summary

### 2.1 Core Seam & Engine (`packages/core/src/retrieval/`)
- **`jev-client.ts` (`JevClient`)**:
  - Zero runtime dependencies; pure TypeScript ESM.
  - Pinned model: `jev-1.13.0` at `https://api.typesafe.ai/v1/systemone`.
  - Pinned pricing: \$0.042 per 1,000,000 input tokens (\$0.000000042 / token); output tokens free.
  - Envelope reservation: \$0.003 conservative per-attempt reservation.
  - Limits: max 12,000 request bytes, max 131,072 response bytes (enforced with early stream reader abort to prevent unbounded memory buffering), max 3 questions per request, max 64,000 input tokens.
  - Concurrency & persistent budget ledger:
    - Atomic file locking (`openSync(lockPath, O_CREAT | O_EXCL)`) with inode tracking (`stat.ino`) and unique process/timestamp lock tokens.
    - Serialized stale recovery guard (`recovery.lock`) with live owner verification (`process.kill(pid, 0)` protects active processes).
    - Multi-month ledger schema (`Record<string, MonthBudgetEntry>`) persisting to `~/.gaia/jev/budget.json` (or `SKILL_HEAVEN_JEV_STATE_DIR`), preventing cross-month counter drift.
    - Explicit in-flight active request tracking (`active_attempts`, `active_reservations`), ensuring `resetBudget()` preserves in-flight operations while resetting idle ledgers to exact zeroes.
    - Consistent high-precision arithmetic (`.toFixed(10)`) preventing rounding degradation.
- **`decision.ts` (`DecisionBackend`)**:
  - Unified interface:
    ```ts
    export interface DecisionBackend {
      readonly mode: DecisionMode;
      decide(options: DecisionOptions): Promise<DecisionResult>;
    }
    ```
  - `ClassicDecisionBackend`: Deterministic baseline delegation to `decide()`.
  - `JevDecisionBackend`:
    - Exact-match fast path bypass: exact hits (`matchKind === "exact"`) bypass Jev entirely (\$0 spend), whether admitted or withheld.
    - Strict deterministic gate enforcement: `withholdReason(doc, surface)` and `doc.installability` are checked before and after model evaluation. Jev can never admit an uninstalled, unverified, or lane-violating skill.
    - Calibrated `noMatch`: returns `below_floor` when Jev selects `"none"` or confidence falls below threshold.
    - Safe offline fallback: all network, timeout, HTTP, or budget errors degrade gracefully to classic deterministic decision with `backend: "fallback"` and `fallbackReason`.
  - `CompareDecisionBackend`:
    - Classic decision is strictly authoritative.
    - Shadow Jev evaluation records `CompareDecisionRecord` with `agreement: boolean`, `classic.chosen`, `semantic.chosen`, and `disagreementReason`.
  - `createDecisionBackend`: Lazily returns `new ClassicDecisionBackend()` without constructing `JevClient` or touching filesystem state when `mode === "classic"`.
- **`bench/compare-eval.ts`**:
  - Offline-first evaluation harness running gold (`gold.jsonl`) and unanswerable (`unanswerable.jsonl`) queries across classic, jev, and compare modes.
  - Automatically calculates top-1 accuracy, unanswerable refusal rates, false-positive summon rates, agreement rates, token spend, and disagreement corpus.

### 2.2 Summon Engine & Door MCP (`packages/skill-summon/`)
- **`summon/summon.ts`**:
  - Extended `SummonOptions` with `decision?: "classic" | "jev" | "compare"` and `live?: boolean`.
  - Resolution precedence: explicit option → `SKILL_HEAVEN_DECISION` → `SKILL_DECISION_BACKEND` → `"classic"`. Unrecognized values safely fall back to `"classic"`.
  - Full suite component policy enforcement: recursive suite component installation verifies `withholdReason(doc, surface)` and installability assessments, preventing suites from materializing lane-violating components on Heaven or Hell surfaces.
  - Attached decision metadata (`mode`, `backend`, `semantic`, `compare`) to `RankingDisclosure`.
- **`mcp/server.ts`**:
  - Added optional `decision: z.enum(["classic", "jev", "compare"])` and `live: z.boolean().optional()` to `summon` tool input schema.
  - Extended `summonOutputSchema` to disclose structured decision information.
- **`bin/skill-summon.ts`**:
  - Added `--decision <classic|jev|compare>` CLI argument and documentation.
- **Rebuilt Bundles**:
  - Rebuilt standalone MCP server: `plugins/skill-heaven/mcp/skill-summon.mjs` (1.0MB).
  - Documented `--decision` in `plugins/skill-heaven/skills/summon/SKILL.md` and per-door skill manifests.

---

## 3. Validation Evidence

### 3.1 Live System One Verification
Tested live with authentic credentials (`TYPESAFE_API_KEY` present in environment, `SKILL_HEAVEN_JEV_LIVE=true`):
- **Live System One API call**:
  ```json
  {
    "ok": true,
    "model": "jev-1.13.0",
    "choice": "accessibility-audit",
    "confidence": 1.0,
    "input_tokens": 358,
    "costUsd": 0.000015036,
    "costStatus": "reconciled"
  }
  ```
- **Live Compare Mode Summon (`query: "audit UI accessibility and contrast"`)**:
  - `decisionMode`: `"compare"`
  - `classic.chosen`: `null` (BM25F score fell below calibrated floor)
  - `semantic.chosen`: `"nextlevelbuilder/ui-ux-pro-max"` (Jev semantically recognized capability at 0.81 confidence)
  - `agreement`: `false`
  - `admitted`: `[]` (BM25F refusal strictly preserved as authoritative!)
- **Live Jev Mode Summon (`decision: "jev"`)**:
  - Admitted: `["nextlevelbuilder/ui-ux-pro-max"]`
  - Name: `"UI/UX Pro Max"`
- **Live Classic Mode Summon (`decision: "classic"` / default)**:
  - Admitted: `[]`, `noMatch: "below_floor"` (\$0 spend, zero network calls).
- **Persistent Ledger Verification (`~/.gaia/jev/budget.json`)**:
  ```json
  {
    "2026-11": {
      "attempts": 3,
      "reserved_usd": 0.009,
      "spent_usd": 0.000212184,
      "successes": 3
    }
  }
  ```

### 3.2 Automated Test Suite
All 101 tests pass across 5 targeted test suites (100% pass rate):
- `packages/core/test/retrieval-jev-client.test.ts` (37 tests)
  - Verified TypeSafe System One contract constants, pricing math (\$0.042/M), Choice question validation, argmax check.
  - Verified streaming chunk abort on oversized payloads (>131KB) in `defaultTransport`.
  - Verified atomic locking, recovery guard serialization, dead-process eviction, and live-owner protection.
  - Verified strict ledger validation, fail-closed behavior on corrupt ledgers, and multi-month rollover integrity.
  - Verified per-invocation `live` option override without mutating client instance state.
- `packages/core/test/retrieval-decision.test.ts` (24 tests)
  - Verified classic baseline parity with `decide()`.
  - Verified exact match fast-path bypass (\$0 spend, no model calls).
  - Verified deterministic policy enforcement: surface filter (heaven excludes model-led, hell excludes human-led) and installability gates.
  - Verified safe offline fallback: dry-run, network timeout, HTTP errors cleanly degrade to classic deterministic decisions.
  - Verified compare mode: classic strictly authoritative for admitted candidates while recording shadow semantic decisions.
- `packages/skill-summon/test/summon-decision.test.ts` (17 tests)
  - Verified default summon is `classic` with classic disclosure.
  - Verified `--decision=jev` with mock transport and offline fallback.
  - Verified `--decision=compare` authoritative BM25F behavior and agreement tracking.
  - Verified recursive suite component policy enforcement on surface mismatch and unmaterializable components.
  - Verified MCP tool `summon` accepts `decision` and `live` parameters and returns structured decision content.
- `packages/core/test/bench-jev-compare.test.ts` (7 tests)
  - Verified offline benchmark suite, token counting, cost calculation, and disagreement corpus generation.
- `test/mcp-bundle.test.ts` (16 tests)
  - Verified bundled `plugins/skill-heaven/mcp/skill-summon.mjs` protocol conformance.

### 3.3 TypeScript Typecheck
- `npm run typecheck` passes with zero diagnostics across the entire repository.

---

## 4. Reviewer Assessment & Findings

Independent review was conducted by **Terra** (`openai-codex/gpt-6.1-terra:high`).
The review validated:
1. **Reservation-Scoped In-Flight Tracking**: Local `reservationAcquired` guard in `evaluate()` prevents pre-flight rejections from decrementing active counts of concurrent requests.
2. **Lazy Constructor & Non-Blocking Client Initialization**: `new JevClient()` performs zero eager file I/O or lock acquisition. `createDecisionBackend("classic")` completely avoids Jev client instantiation.
3. **Contention Sleep**: Replaced busy-spin with non-busy `Atomics.wait()` yielding CPU time.
4. **Exact-Match Fast-Path**: Bypasses Jev entirely (\$0 spend).
5. **Deterministic Baseline Preservation**: BM25F remains 100% authoritative in compare mode; classic mode remains the product default.
6. **Verdict**: **PASS** (status clean).

---

## 5. Outstanding Issues & Blockers

- **Blockers**: None. All core requirements, safety invariants, and reviewer recommendations are resolved.
- **Outstanding Research Items** (Phase 1/2 of issue #1906):
  - Live benchmark campaign against the full gold corpus to be run by human operators in a dedicated evaluation lane.
  - Adjudication of shadow-mode disagreement corpus to evaluate whether semantic routing quality justifies subscription-tier pricing.
  - Jev remains **experimental and opt-in**; classic BM25F remains the shipping default.

---

## 6. Installation & Verification Guide

1. **Verify Default Deterministic Baseline (Classic)**:
   ```bash
   npx tsx packages/skill-summon/src/bin/skill-summon.ts summon "find slow queries" --preview
   ```
   Outputs classic BM25F ranking with zero inference cost and no network calls.

2. **Verify Compare / Shadow Mode (Offline Fallback)**:
   ```bash
   npx tsx packages/skill-summon/src/bin/skill-summon.ts summon "find slow queries" --preview --decision compare
   ```
   BM25F remains authoritative; shadow Jev gracefully reports fallback when offline without affecting summon.

3. **Verify Live Semantic Selection (When API Key is Configured)**:
   ```bash
   SKILL_HEAVEN_JEV_LIVE=true npx tsx packages/skill-summon/src/bin/skill-summon.ts summon "audit UI accessibility and contrast" --preview --decision compare --json
   ```
   Exposes live comparison record in `ranking.decision.compare` with semantic choice and agreement status.

4. **Run Benchmark Suite**:
   ```bash
   npx tsx packages/core/bench/compare-eval.ts --limit 10
   ```
