# PLAN — six lanes, no master phase

**Status:** Derived from [`INTENT.md`](INTENT.md) and [`SPEC.md`](SPEC.md), 2026-09-04.
**Supersedes:** the 2026-09-03 five-phase plan.
**Scope:** the Gaia ecosystem — work is assigned to the repository that owns it.

---

## Why lanes instead of phases

The superseded plan was a sequence: Phase 0 → 1 → 2 → 3 → 4 → 5. Two things
went wrong with that shape, and both are structural rather than accidental.

**A phase pairing unequal work gets eaten by its tractable half.** Phase 4 was
"Arbor + SEP". SEP-2640 is a written standard with a conformance surface; Arbor
was an open research question. The SEP half shipped completely and the Arbor
half shipped nothing. SPEC INV-16 now forbids that pairing.

**A sequence makes independent work falsely dependent.** Retrieval quality,
Arbor consumption, and standards conformance share almost no surface. Ordering
them meant the slowest question gated the fastest one.

So: **six lanes, each with its own owner, entry condition and kill criterion.**
Lanes run concurrently unless a dependency is stated explicitly. A blocked lane
blocks itself and nothing else.

```
  R  REACH          retrieval quality, refusal, freshness      gaia-skill-heaven
  A  ARBOR          consume canonical profiles honestly        gaia-skill-heaven ← gaia-skill-tree
  G  GRAPH          the interaction-edge contract              gaia-skill-tree
  S  STEER          Heaven / Hell / Ultra as behavior          gaia-skill-heaven
  E  EVIDENCE       one closed loop, demand-driven             gaia-research
  X  STANDARDS      SEP / MCP conformance, isolated            gaia-skill-heaven

     R ────────────────────────────────────────────────►  independent
     A ──────────► needs a published profile
     G ──────────► upstream contract work
     S ──────────► degraded now; behavior-aware after A+G
     E ──────────► needs one real uncertainty, not a campaign
     X ──────────► independent, never joins A or G
```

---

## The three rules this plan is built to satisfy

**1. No benchmaxxing.** No lane requires stamping the catalogue, pre-labelling
skills, exhaustive benchmarking, or a coverage percentage. Every Arbor-side
exit criterion is *one real path*, not a fraction of the corpus. INTENT §11 is
explicit that the evidence loop is deliberately slower than computing a score,
and that this is a feature.

**2. No rank-ordered work.** No lane sequences by stars, Trust Magnitude or
grade (SPEC INV-2). Beyond violating the Tree separation, it re-churns on every
recalibration — Yggdrasil III moved `level` on 76 skills and `trustMagnitude` on
154 in a single PR.

**3. Unknown is shippable.** Every lane has a defined degraded state that is
honest and disclosable (SPEC INV-8, INV-13). No lane is allowed to block on
evidence that does not exist yet; it falls back and says so.

---

## Lane R — Reach

**Owner:** `gaia-skill-heaven` · **Entry:** open · **Status:** substantially built

Retrieval was the one thing the superseded programme got right, and INTENT §14
says to preserve it. This lane finishes it and then stops growing.

### Carried forward

The improved offline index · build-time expansion · BM25F or a measured
successor · explicit refusal and `noMatch` · reproducible evaluation ·
offline-by-construction · freshness and coverage tooling · the negative findings ·
the registry and installability fixes the index build uncovered.

### Work

| # | Item | Note |
|---|---|---|
| R1 | Consume an upstream installability determination instead of URL-shape heuristics | SPEC §3.5, Q5. Largest single miss class in the current evaluation |
| R2 | Replace the coverage-sensitive absolute admission floor with a scale-free criterion | SPEC Q6. The present floor moves when corpus coverage moves, which makes its calibration perishable |
| R3 | Human review of the gold labels | SPEC Q7. Until then, only the *delta between systems* is load-bearing |
| R4 | Rebuild against the Yggdrasil III corpus when `gaia-skill-tree#1688` lands | 13 new documents; expansion regeneration for those alone |
| R5 | Decide the retrieval artifact's name | SPEC Q4 / INV-15 — it currently collides with the HH Index |

### Kill criterion

If R1 and R2 land and the paired delta against the prior ranker no longer
excludes zero, retrieval is done improving and further work on this lane stops.
Reach is a front door. It is not the product.

### Explicitly not in this lane

Dense retrieval (measured, rejected — reopening needs a new argument, not a new
attempt) · a leaderboard · per-contributor breakdowns · cross-validation ·
any ranking signal drawn from Yggdrasil or Arbor (SPEC INV-5).

---

## Lane A — Arbor consumption

**Owner:** `gaia-skill-heaven`, consuming `gaia-skill-tree`
**Entry:** at least one published `gaia.arbor-profile/v1`

The smallest honest implementation, and nothing more.

### Work

| # | Item |
|---|---|
| A1 | Remove the repo-local Arbor type introduced under the superseded SPEC. It forks `gaia.arbor-profile/v1` and must not set precedent |
| A2 | Consume `gaia.arbor-profile/v1` verbatim — `support` preserved, `facet` as independent facets, `conditions` carried with every claim, digests retained |
| A3 | Disclosure: state which lenses informed a decision and which were absent (SPEC INV-13) |
| A4 | Distinguish unknown from negative at every surface (SPEC INV-4) |

### Exit

Skill Heaven consumes canonical Arbor profiles, invents no fields, preserves
upstream support state, derives no behavioral truth from receipts, exposes no
Yggdrasil prestige as Arbor behavior, and discloses absence.

**If zero profiles are published, this lane's correct output is A1, A3, A4 and a
consumption path with nothing to consume.** That is a complete and honest
result, not a blocked one.

### Kill criterion

If implementing A2 requires inventing a field, stop and raise it upstream. The
missing field is upstream's to define. Adding it here is the exact debt this
plan exists to avoid.

---

## Lane G — The interaction graph

**Owner:** `gaia-skill-tree` · **Entry:** open · **Blocks:** the behavior-aware
half of Lane S

Arbor's four ratified contracts are all per-skill. The interaction graph —
`stabilizes`, `amplifies`, `conflicts`, `recovers`, `compresses-after`,
`unlocks`, `duplicates` — is specified in ENDGAME §8 and has **no contract and
no published projection**. It is the dominant Arbor structure and the thing
Skill Hell needs to mean more than a longer list.

### Work

| # | Item |
|---|---|
| G1 | An edge contract, alongside the existing four, rejecting prestige recursively as they do |
| G2 | Edge provenance on the same declaration → observation → governed interpretation axis. An edge is a claim under conditions, not a fact |
| G3 | Separation from Yggdrasil fusion enforced structurally, not by convention (SPEC INV-9) |
| G4 | A published projection consumers can read |

### Why it is not in this repository

Writing an edge schema in `gaia-skill-heaven` would fork Arbor's ontology in the
consumer — the precise mistake this replan corrects. Recorded as SPEC Q1.

### Degraded state

Until G4 exists, composition is relevance-only and discloses it (SPEC §5.1).
Acceptable, indefinitely.

---

## Lane S — Steering

**Owner:** `gaia-skill-heaven` · **Entry:** open for correctness work; the
behavior-aware half needs A + G

Two halves, and only the first can start now.

### S-now — correctness of what exists

| # | Item |
|---|---|
| S1 | Ultra must not read `noMatch` as a reason to explore (SPEC INV-11). A retrieval refusal is not a behavioral signal |
| S2 | Ultra must not read retrieval-score jitter as posture evidence (SPEC INV-3) |
| S3 | Every transition explains itself: signal, policy, from-posture, to-posture |
| S4 | Holding position is a first-class outcome, and the common one |
| S5 | Recover and reopen are real transitions, not absences |
| S6 | Heaven and Hell state honestly that they currently differ by breadth of relevance results (SPEC §6.2). No surface presents stamp-gated routing as running |

The deterministic controller work survives a corrected intent where it remains
valid after semantic review. Its calibrated parameters are code-side and dated;
per SPEC §0.1 they are not normative here.

### S-later — behavior-aware, needs Lane A and Lane G

**The completion bar: one runtime path uses Arbor interaction evidence to change
a composition decision** — avoid a conflict, prefer an amplifier, drop a
duplicate, add a recovery capability, or unlock a missing capability.

One path. On real evidence. Not coverage, and not every gap.

### Kill criterion

If S-later cannot demonstrate one such path once A and G land, Heaven and Hell
remain breadth directions and the plan says so plainly rather than dressing
relevance up as behavior.

---

## Lane E — The evidence loop

**Owner:** `gaia-research` · **Entry:** one concrete runtime uncertainty

The lane most at risk of becoming a treadmill, so its scope is fixed at **one
closed path**:

```
runtime observation → concrete uncertainty → focused benchmark → receipt
  → governed interpretation → updated Arbor projection → changed runtime knowledge
```

### Work

| # | Item |
|---|---|
| E1 | Identify one real uncertainty from runtime observation. Not a survey — one question worth answering |
| E2 | A focused benchmark targeting one declaration claim: control and treatment arms, same closed environment, pinned artifacts |
| E3 | A receipt: conclusion-free, per the ratified contract |
| E4 | A governed interpretation — a curator record, the only thing that may set `support` |
| E5 | Show the updated projection changing a runtime decision |

### The rule that keeps it honest

> **Observation is not interpretation.**

A receipt may support an interpretation. It does not become one. No threshold in
any repository may silently convert telemetry into behavioral truth.

### Exit

One path demonstrated end to end. **Not** *n* skills covered, not a coverage
percentage, not a benchmark suite. The proof is that the loop closes at all.

### Kill criterion

If the loop cannot close on one skill, more skills will not help. Report that
as a finding (D8) and stop rather than widening.

---

## Lane X — Standards

**Owner:** `gaia-skill-heaven` · **Entry:** open · **Isolation: mandatory**

SEP-2640 and skills-over-MCP conformance, with its own conformance tests.

**This lane may never merge with Lane A or Lane G** (SPEC INV-16). Not for one
sprint, not for one PR, not because both touch skill metadata. That pairing is
what produced the Arbor gap this replan corrects.

Standards compatibility is infrastructure. It is not a conceptual pillar, and it
does not compete with Arbor for a phase.

Carried forward: the SEP-compatible resource surfaces that remain conformant as
the standard settles. When the standard moves, this lane moves. Nothing else does.

---

## What this plan does not do

Stated so the boundary is checkable, per INTENT §16:

no rewrite of Skill Heaven · no new ladder · no new prestige system ·
no Yggdrasil III work in this repository (it is upstream's, and it is landing) ·
no global capability score · no exhaustive benchmarking · no pre-stamping the
catalogue · no runtime embedding dependency · no model-decided loadouts by
default · no repository merge · no HH Index formula defined ahead of evidence ·
no retrieval improvement held back waiting for Arbor

---

## Definition of done

Per INTENT §15, six independent capabilities. Not one metric.

| | Capability | Lane | Degraded state |
|---|---|---|---|
| **A** | Reach works — the right capability, or an honest refusal, offline | R | — |
| **B** | Arbor consumption is honest — no invented fields, unknown ≠ negative | A | consume nothing, disclose it |
| **C** | Composition is behavior-aware on at least one path | S-later + G | relevance-only, disclosed |
| **D** | Heaven and Hell mean behavior, not list length | S + G | breadth directions, disclosed |
| **E** | Ultra governs rather than guesses | S-now | hold position |
| **F** | The evidence loop closes once, end to end | E | recorded as not yet closed |

**A, B, E and the disclosure obligations are reachable now.** C, D and F depend
on evidence and contracts that do not exist yet, and the plan's job is to keep
them honest until they do — not to manufacture them.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Arbor stays empty and the layer never becomes behavior-aware | Lane A's degraded state is a complete result; Lane G names what is actually missing rather than substituting for it |
| Retrieval work expands to fill the space Arbor left | Lane R has a kill criterion and an explicit not-in-scope list |
| A tractable lane eats an open one again | INV-16 forbids the pairing; lanes carry separate owners and gates |
| Upstream contracts change under us | SPEC §0.2 references upstream rather than restating it; a change lands in one place |
| The meta churns and the layer churns with it | SPEC INV-5 keeps prestige out of ranked fields — measured against Yggdrasil III at 287 of 291 modified skills costing nothing |
| The evidence loop becomes a coverage campaign | Lane E's exit is one path, and its kill criterion forbids widening |
