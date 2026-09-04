# Phases 0–1 — what was built, what was measured, what changed the spec

**Status:** implementation record for [`PLAN.md`](PLAN.md) Phases 0 and 1,
against [`SPEC.md`](SPEC.md). Branch `claude/skill-heaven-phases-0-1-474exr`,
PR #114, based on the docs branch. Umbrella issues #108 (Phase 0) and #109
(Phase 1).

This document exists because five things were measured that the spec had
guessed, and two of those guesses were wrong in ways that would have shipped a
regression. The numbers live in `packages/core/bench/results/ledger.json`; this
is the narrative around them.

---

## The gates

| Gate | Requirement | Result |
|---|---|---|
| **G1** | Δ MRR CI excludes zero | **PASS** — `+0.3433, 95% CI [+0.2593, +0.4313], n = 100` |
| **G2** | ≥90% of 20 unanswerable queries return `noMatch` | **PASS at 95%**, admitting 91% of the gold set |
| **G3** | Gold set runs green with egress blocked | **PASS**, asserted by the harness rather than promised |

## The systems

    system              MRR    R@5   refuse(neg)  false-refuse   reachable
    baseline-shipped  0.0392  0.06      0.00          0.00          67
    baseline-raw      0.0501  0.06      0.00          0.00         100
    bm25f             0.4658  0.58      0.00          0.02         100
    bm25f-no-expansion 0.2800 0.38      0.00          0.02         100
    bm25f-decide      0.3825  0.47      0.95          0.17          81

`bm25f-decide` is what the product ships. `baseline-shipped` is what it shipped
before this work: it put the right skill first for **four queries in a hundred**
and returned a confident card for **all twenty** queries that have no answer.

---

## Five findings

### 1. The baseline is 0.039, not 0.85

PLAN's kill criterion for the entire programme was *"if today's baseline MRR is
already above ~0.85, retrieval is not the bottleneck."* Measured: **0.0392**.
The diagnosis in `INTENT.md` §1 was, if anything, understated.

### 2. Partial expansion coverage is a regression, not a partial win

SPEC §2.3 prescribed stamping 5★ → 4★ → 3★ → the rest, on the reasoning that
*"a partial index is useful from the first batch."* Expanding 101 of 274 skills
raised aggregate MRR to 0.466 — and dropped the gold queries whose target had
**no** expansions from **0.263 to 0.045**.

An expanded document has a field to match in that an unexpanded one does not.
A half-expanded index does not help half the corpus; it demotes the other half.
Tiered order is still the right order to *generate* in and is not a valid order
to *ship* in. `stats.expandedDocs` and the benchmark's `coverageSplit` exist so
this cannot hide inside an average again.

### 3. The round-trip filter deletes the expansions worth having

SPEC §2.3's guardrail: keep an expansion only if the source skill comes back
top-1 when the expansion is used as a query against the current index.

    cutoff      bm25f MRR   shipped MRR   vs no-expansion
    1  (SPEC)      0.2846        0.2597   +0.005  ns
    3               0.3513        0.3176   +0.071  sig
    5               0.3517        0.3102   +0.072  ns
    10              0.3657        0.3212   +0.086  sig
    none            0.4658        0.3825   +0.186  sig

The filter asks whether the *current* index can already retrieve a skill from
its expansion — and an expansion that surfaces a skill the current index cannot
surface is precisely the one worth having. On a corpus whose pre-expansion MRR
is 0.28, the guardrail removes the signal it was meant to protect. The index
ships unfiltered; the filter stays available and reportable for when the corpus
moves.

### 4. Two classes of candidate were vanishing silently

Both were bugs in the shipped ranker, both found by building the index:

- **Suite roots.** A suite carries no `links.github` of its own — its
  components do — but ranking gated on `isInstallable`, which requires one. All
  20 suites in the corpus were filtered out of every summon, including four
  skills the gold set names as correct answers.
- **Registry-only skills.** The guard lives at the top level of a skill while
  `isInstallable` reads `links.installable`, so a registry-only skill ranked,
  won the summon, and was refused only inside `installSingle` — after a wasted
  network round trip.

Neither was reported by a user, because neither produced an error. They
produced a slightly worse answer, silently, which is the failure mode this
whole plan is aimed at.

### 5. Reachability is worse than the spec's estimate, and it caps the score

SPEC §1 put uninstallable skills at 34 by counting missing `links.github`.
Measured: **80 of 274 are unreachable by summon** — 26 publish no link, and 72
publish one that does not resolve to a `SKILL.md`. Nineteen of the 100 gold
targets are among them, which puts a hard ceiling on MRR that no ranker can
lift. That is a curation problem, and the benchmark reports `mrrOnReachable`
so it is not misread as a retrieval one.

Adjacent, from the expansion pass: a substantial number of `links.github` URLs
**404 when fetched**. The registry's link health is worse than link *shape*
suggests.

---

## What shipped

**Phase 0 — `packages/core/bench/`**: 100 gold queries, 20 unanswerable, a
zero-dependency runner (MRR, recall@5, refusal rates, seeded paired bootstrap,
floor sweep, coverage split), the committed corpus snapshot, and the run
ledger. G3 is asserted in-band: the runner replaces `globalThis.fetch` with a
throw before it does anything else.

**Phase 1**:

| PLAN | What landed |
|---|---|
| 1.1 | Index builder → committed `plugins/skill-heaven/data/skill-index.json`, CI drift-checked |
| 1.2 | Offline-first resolution — ranking touches no network; only materialising a payload does |
| 1.3 | BM25F replacing `scoreMatch` for summon ranking |
| 1.4 | Exact-name fast path |
| 1.5 | `source` argument — per-call override, echoed on the card, hard error when unresolvable |
| 1.6 | Absolute floor + `noMatch` with `topCandidates` and `filtered` reasons |
| 1.7 | Retrieval expansion — generated, committed, diffable; kill criterion cleared (+0.186 MRR, CI excludes zero) |
| 1.8 | `preview` argument |
| 1.9 | `structuredContent` + `outputSchema` + `resource_link` on the `skill://` convention |
| 1.10 | Card gains source, match/score/margin, index freshness, and the name-mismatch line |
| 1.11 | Security invariants in the summon skill and the server instructions |
| 1.12 | `summon-log.jsonl` in the session root — local only, never transmitted |

---

## Open, and honest about it

1. **Expansion coverage is 101 of 274.** Finding 2 says what that costs. The
   remaining 173 are generated but not yet landed; until they are, the shipped
   index helps expanded skills and hurts the rest. **This is the single most
   important thing to finish before Phase 1 is called done.**
2. **Gold-set provenance is weaker than SPEC §7.1 asks for** — LLM-authored
   from the corpus, not human-authored from transcripts. Mitigations are in
   `packages/core/bench/README.md` and the caveat is now in SPEC §7.1. There is
   a further, unquantified risk: expansions and gold queries were written by the
   same model family from the same source text, so their vocabularies may be
   correlated in a way that flatters the expansion delta. The diagnostic that
   would settle it is a human-written query set; the partial check available
   today — lift on metadata-only vs body-fetched expansions (+0.462 vs +0.389)
   — is consistent with real signal but does not rule correlation out.
3. **BM25F field weights are untuned.** Deliberate: tuning eight weights against
   100 queries would overfit before it helped.
4. **`invocation` is absent on all 274 skills**, so `surface` routing is a no-op
   today. Consistent with "stamps are not built"; it is Phase 4's problem.
5. **Phases 2–5 are untouched.** Phase 2 (semantic recall) is conditional and
   its precondition — a measured Phase 1 — now exists; its 2.1 failure analysis
   should be the next thing run, since finding 5 suggests a meaningful share of
   the residual misses are absent or unreachable skills rather than vocabulary
   mismatch, which is the case where vectors change nothing.

## Reproducing any of it

```bash
npx tsx packages/core/scripts/snapshot-corpus.ts      # the only networked step
npx tsx packages/core/scripts/filter-expansions.ts --in packages/core/bench/corpus/expansions.raw.jsonl --rank-cutoff none
npx tsx packages/core/scripts/build-skill-index.ts
npx tsx packages/core/scripts/calibrate-floor.ts && npx tsx packages/core/scripts/build-skill-index.ts
npx tsx packages/core/bench/run.ts --calibrate
```
