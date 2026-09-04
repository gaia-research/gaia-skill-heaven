# Phases 0–4 — what was built, what was measured, what changed the spec

**Status:** implementation record for [`PLAN.md`](PLAN.md) Phases 0–4, against
[`SPEC.md`](SPEC.md). Branch `claude/skill-heaven-phases-0-1-474exr`, PR #114,
based on the docs branch. Umbrella issues #108, #109, #110, #111, #112.

| Phase | Outcome |
|---|---|
| **0 — Ground truth** (#108) | Shipped. The ruler exists and the baseline is 0.039 |
| **1 — Index, rank, refuse** (#109) | Shipped, all 12 items. G1 and G3 pass; G2 fails at 75% and is recorded rather than tuned around |
| **2 — Semantic recall** (#110) | **Does not ship.** 2.1's failure analysis killed it: zero vocabulary-gap misses. Negative result (D8) |
| **3 — Ultra** (#111) | Shipped. Controller, calibrated thresholds, stability gate. Kill criterion cleared with room |
| **4 — Arbor + SEP** (#112) | Split. 4.4/4.5/4.6 shipped — and 4.6 went further than "watch", because the SEP stabilised. 4.1–4.3 blocked on Phase 5 |

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

## Eleven findings

The first five are Phase 0–1. The rest came out of Phases 2–4 and out of asking
what happens when the corpus moves.

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

### 6. Dense retrieval solves a problem this corpus does not have

PLAN 2.1 classified all 59 misses. **Zero** share no lexical term with the
correct skill — the class vectors exist for does not occur here, because
index-time expansion already closed it. That is INTENT §3's bet resolving in
the direction it was made. The residual is 22 curation-bound and 26 ordering,
and ordering wants a better ranking signal, not a better representation.
Dropped and recorded (D8); `bench/analyze-misses.ts` re-runs in one command if
the corpus grows enough to change the first row.

### 7. The round-trip expansion filter deletes the expansions worth having

Survival at top-1 was 199/696, and MRR by cutoff was 0.285 (top-1) · 0.351
(top-3) · 0.366 (top-10) · **0.466 (unfiltered)**. The filter asks whether the
*current* index can already retrieve a skill from its expansion — and the
expansion that surfaces what the current index cannot is precisely the one
worth having. Ships unfiltered.

### 8. The absolute floor is coverage-sensitive, which is a design weakness

FLOOR moved 15.18 → 27.56 → 26.98 as coverage went 0% → 37% → 100%, and G2
flipped from failing (55%) to passing (95%) to failing (75%) — while MRR rose
monotonically 0.28 → 0.466 → 0.657. Separation barely moved (0.845 → 0.956 →
0.953). What moves is the *threshold*, because expansion raises scores for
everything, unanswerable queries included. A threshold on a raw BM25F score has
no fixed scale. G2 is one number away — FLOOR 31.13 rejects 90% and admits 79%
— and it is not moved, because the calibration policy was declared before the
run. The principled fix is a different quantity (score normalised against the
index's own distribution, or the margin), not a different threshold.

### 9. Ultra's provisional thresholds would have walked it to `max`

SPEC §6.3's 0.20 / 0.45 were set before anyone looked at what `margin` does
here. Its p50 is 0.214, so those values read **46% of gaps as "explore" against
19% "converge"**. Recalibrated to 0.123 / 0.274: the decisions split 33/34/34
and the controller is *more* stable on the same trace (5 rung changes over 80
gaps against 9).

### 10. Partial expansion coverage cannot be fixed on the ranking side

Two mitigations, both measured, both negative: field-presence normalization
moved unexpanded-target MRR from 0.046 to 0.047 and costs 0.006 at full
coverage; mirroring a document's authored text into its generated fields
reached 0.059 against a 0.290 no-expansion baseline. The demotion is not an
artefact — expansion gives a document vocabulary an unexpanded one does not
have, and that vocabulary is what the query matches. **Coverage is the only
fix**, so it is a test (≥95%) and it is made cheap by fingerprinted incremental
regeneration rather than wished for.

### 11. A fifth of the tree was unreachable for a filing reason

`awaitingClassification` holds 52 Named Skills the tree has not bucketed under
a generic node. The runtime read `buckets` only, so none of them could ever be
summoned — including 12 at 4★ and 25 at 3★, 43 of which publish a
SKILL.md-shaped link. Found by reading `gaia-skill-tree`'s
`scripts/install_parity.py`, which sweeps both collections; it had the corpus
right and we did not. They are indexed now, and the card discloses that the
tree has not classified them. The corpus is 326, which is what SPEC §1 always
said it was.

## Maintainability — what a moving corpus costs

The honest answer before this work: a refresh silently made the index worse,
because a skill landing without expansions is *demoted*, not merely un-boosted
(finding 10). A tree that added twenty skills and no expansion pass made those
twenty harder to summon than before expansion existed, and nobody would have
noticed.

What a refresh is now:

```bash
npx tsx packages/core/scripts/snapshot-corpus.ts        # the only networked step
npx tsx packages/core/scripts/expansion-plan.ts --emit-batches 6
#   -> "missing 6, stale 2, orphaned 1" — generate only those
npx tsx packages/core/scripts/filter-expansions.ts --in ... --rank-cutoff none
npx tsx packages/core/scripts/build-skill-index.ts
npx tsx packages/core/scripts/calibrate-floor.ts && npx tsx packages/core/scripts/build-skill-index.ts
npx tsx packages/core/bench/run.ts --calibrate
```

`expansionFingerprint` covers exactly the fields the generation brief reads, so
a re-graded trust level or a repaired link does not trigger regeneration. CI
fails on index drift and on coverage below 95%. Stale expansions are counted
and still rank — out of date is not wrong, and dropping them would re-create
the hole they were written to fill.

**What is still manual:** the generation pass itself is an offline LLM pass
over the changed skills. `expansion-plan.ts --emit-batches` writes the worker
inputs; running them is a human-triggered step. That is the residual cost of a
moving corpus, and it is now proportional to what moved rather than to the size
of the tree.

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

**Phases 2–4:**

| PLAN | What landed |
|---|---|
| 2.1 | Failure analysis — and it killed the phase. `bench/analyze-misses.ts` |
| 3.2 | The controller: EWMA → dead band → dwell → single step, clamped to [low, max] |
| 3.3 | An explainability line on every rung change |
| 3.4 | Thresholds calibrated from the observed margin distribution, replacing values that would have drifted Ultra to `max` |
| 3.5 | The stability gate — oscillation is a test failure, including on an adversarial alternating trace |
| 4.4 | `arbor.polarity` consumption, `invocation` fallback, and a `routing` disclosure that says "none" when nothing routed |
| 4.5 | `skill://` identifiers and `resource_link` |
| 4.6 | Re-read the SEP; it is accepted and stabilised, so the MCP resource surface is built |

One rule was added to the Ultra spec that was missing from it: **a `noMatch`
says nothing about depth.** Reaching wider cannot summon a skill the corpus
does not contain, so a refused gap holds the rung. Without it the controller
reads every curation gap as ambiguity and walks itself to `max` — and with 22
of 59 misses curation-bound, that is not hypothetical.

## Open, and honest about it

1. **G2 fails at 75%**, by policy rather than by accident (finding 8). The
   trade curve is in SPEC §4.4 so the founder can move the policy knowingly.
   The real fix is a scale-free relevance score, and that is the highest-value
   retrieval work left.
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
5. **Arbor is unstamped and Phase 5 is untouched.** Polarity needs a task
   benchmark, so 4.1–4.3 wait on Phase 5. The consumption path is built and
   discloses honestly in the meantime.
6. **Reachability is still a URL-shape heuristic.** `gaia-skill-tree`'s
   `scripts/install_parity.py` actually installs every skill and classifies the
   failure; the expansion pass hit 404s on links with perfectly correct shape,
   so the "96 unreachable" figure is wrong in both directions. The clean fix is
   to run that harness upstream, publish its report, and snapshot it beside the
   projection so the index carries measured reachability. Thin data contract,
   no cross-repo imports. **This is the single highest-value follow-up** —
   unreachability is the largest remaining miss class at 22 of 59.
7. **Ultra is specified but not wired into a driver.** The controller and its
   calibration are shipped and tested; `/skill-ultra` carries the procedure for
   the agent to follow. Nothing yet runs it as code across a session.

## Reproducing any of it

```bash
npx tsx packages/core/scripts/snapshot-corpus.ts      # the only networked step
npx tsx packages/core/scripts/filter-expansions.ts --in packages/core/bench/corpus/expansions.raw.jsonl --rank-cutoff none
npx tsx packages/core/scripts/build-skill-index.ts
npx tsx packages/core/scripts/calibrate-floor.ts && npx tsx packages/core/scripts/build-skill-index.ts
npx tsx packages/core/bench/run.ts --calibrate
```
