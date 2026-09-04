# SPEC — the Gaia runtime capability layer

**Status:** Derived from [`INTENT.md`](INTENT.md) (founder direction, 2026-09-04).
**Supersedes:** the 2026-09-03 "Summon Stack" SPEC, which specified a retrieval
pipeline and treated Arbor as one field on a retrieval document.
**Scope:** the Gaia ecosystem — three repositories, one capability universe.

Upstream conceptual authority, in order:

1. `gaia-skill-tree/founder/ENDGAME.md` — the capability-graph model
2. `gaia-skill-tree/registry/arbor/contracts/` — the ratified Arbor contracts
3. `gaia-research/founder/RATIFICATION.md` — decisions
4. [`INTENT.md`](INTENT.md) — what this layer is for

This document specifies **contracts and boundaries**. It does not specify an
implementation, and it deliberately carries almost no numbers.

---

## 0. How to maintain this document

This section exists because the previous SPEC had to be declared stale five days
after it was written. It went stale for two reasons that are both preventable:
it fused decisions with measurements, and it made retrieval's shape the shape of
the whole system.

**The maintenance rule:**

| Layer | Lives | Changes when |
|---|---|---|
| **Contracts & invariants** | this document | a decision changes — a founder ruling, an upstream contract revision |
| **Measurements** | `packages/core/bench/results/`, `docs/EVIDENCE.md` | any run. Never quoted here as a normative value |
| **Corpus facts** | the registry, upstream | continuously, and this document must not notice |
| **Parameters** | code, with the measurement that set them | recalibration |

**Three rules follow.**

**0.1 — A number in this document is a citation, not a threshold.** Where a
figure appears it carries a date and a pointer to the artifact that produced it.
Normative statements are about *shape*: which fields exist, what refuses, what
must be disclosed. If you find yourself editing this file because a metric
moved, the metric did not belong here.

**0.2 — Upstream contracts are referenced, never restated.** Arbor's schemas
live in `gaia-skill-tree/registry/arbor/contracts/`. This document names them
and specifies how they are *consumed*. Copying a field list here creates a fork
that drifts silently — which is exactly the debt the previous SPEC created.

**0.3 — A section may only specify one Tree.** Relevance, Yggdrasil and Arbor
answer different questions (§2). A section that reaches across them is the
failure mode this document is structured to prevent.

### Why this is not theoretical

The largest meta shift in months — Yggdrasil III, `gaia-skill-tree#1688`,
1,098 files — landed while this document was being written. Measured against it
on 2026-09-04 (`origin/main...dev/integration-ygg3-playbooks-2026-09-02`; full
method, caveats and script in [`EVIDENCE.md`](EVIDENCE.md)):

| Named skills | Count |
|---|---|
| Modified | 291 of 326 |
| …of those, **prestige fields only** (`trustMagnitude`, `overallTrustGrade`, `level`) | **287** |
| …changed a field the retrieval index ranks on | **1** (`genericSkillRef`) |
| …changed a reachability field | **3** (`suiteRef`) |
| …changed body text, invalidating generated expansions | **0** |
| Newly added | 13 |

A full Trust Magnitude recalibration of the entire catalogue cost the runtime
layer **13 new documents and four field touches**. Nothing regenerated.

That result is a *consequence of the separation in §2*, not luck. Had Arbor
stamping or ranking been sequenced by star rank — as the superseded SPEC
specified — this one PR would have invalidated 76 changed `level` values and
154 changed `trustMagnitude` values, and required re-stamping most of the
catalogue. The measurement is the argument for the invariant in §3.2.

---

## 1. Scope and ownership

Per INTENT §9. Three repositories, one capability universe, no shared schema
ownership.

```
gaia-skill-tree            gaia-research            gaia-skill-heaven
canonical record           research & evidence      runtime consumer

skill identity             HH Index methodology     Reach / summon
Yggdrasil                  behavioral hypotheses    Heaven runtime
Arbor contracts            focused benchmarks       Hell runtime
Arbor sources              interpretation method    Ultra control
governed interpretations   reproducible artifacts   Skill Zero integration
generated profiles                                  disclosure & fallback
published projections                               local opt-in telemetry
        │                          │                        │
        └────── published ─────────┴──── consumed ──────────┘
                projections              read-only
```

**The boundary rule.** This repository may cache or project upstream records for
performance. It must not fork their meaning. A field this repository invents to
stand in for an upstream concept is a defect, regardless of how convenient it is.

**What this document specifies:** the runtime layer's contracts, and the shape
of what it consumes across the boundary.

**What it does not specify:** Arbor's contracts (upstream, ratified), the HH
Index's formula (research, undetermined by design), Yggdrasil's grading
(upstream), or any harness's internals.

---

## 2. Three questions, three Trees

The load-bearing invariant of the whole system.

| | Question | Owner | Example inputs |
|---|---|---|---|
| **Relevance** | Could this capability help with *this* gap? | this repo | task language, description, expansions, aliases |
| **Yggdrasil** | How strongly should Gaia trust its standing? | `gaia-skill-tree` | stars, rank, Trust Magnitude, grade, evidence |
| **Arbor** | What does it do to the agent, and to other capabilities? | `gaia-skill-tree` | facets, conditions, interaction edges, HH evidence |

**INV-1 — No master score.** These three are never collapsed into one number,
one ordering, or one field. A capability may be highly relevant and untrusted;
highly trusted and irrelevant; behaviorally hostile and both.

**INV-2 — Yggdrasil never enters Arbor's ontology.** Stars, ranks, Trust
Magnitude, grades and prestige fields are rejected recursively by the Arbor
sidecar. This repository must not reintroduce them by projection, by naming, or
by sequencing work in rank order.

**INV-3 — Relevance is not evidence of behavior.** A retrieval score says a
capability matched a query. It says nothing about what happens when it runs.
Nothing in the steering layer (§6, §7) may read a retrieval score as a
behavioral signal.

**INV-4 — Unknown is a valid state, and is distinct from negative.** Absent
Arbor evidence means *we have not observed this*, never *this is safe* and never
*this is unsafe*. Every surface that could imply otherwise must disclose.

---

## 3. Reach — finding a capability

Reach answers exactly one question: **could this capability help with the
current gap?** It is the front door, not the house.

### 3.1 What Reach owns

capability retrieval · build-time retrieval expansion · exact and directed
lookup · ranking · refusal (`noMatch`) · offline operation · index freshness ·
retrieval explanation · standards-compatible discovery surfaces (§10)

### 3.2 The ranked-field invariant

**INV-5 — The retrieval index ranks only on capability-descriptive fields.**

A field may be ranked on if it describes *what the capability does*. Prestige
fields, behavioral fields, and evidence fields may be **carried** in the index
for display and policy, and must not be **scored**.

| Ranked | Carried, never scored |
|---|---|
| name, id, title, tags, generic capability ref, generated expansions, generated terms, description | Yggdrasil level / grade / Trust Magnitude, Arbor profile, reachability flags, freshness |

This is what made the Yggdrasil III recalibration free (§0). It is also what
keeps relevance honest: a highly-starred skill does not outrank a better-matched
one because of its standing.

### 3.3 Index-time intelligence

**The architectural bet, restated from INTENT §3 and unchanged:** move retrieval
intelligence to index time where practical. The corpus is small enough to
enrich offline; the runtime stays fast, deterministic, inspectable and
dependency-light.

Contract obligations for the index artifact:

- **Committed and versioned.** One artifact is the only thing a summon reads to
  rank. It carries a schema identifier and a builder version, so a bad
  generation run is revertible.
- **Offline by construction.** A summon never blocks on the network. Refresh is
  a separate, explicit step.
- **Incrementally refreshable.** Generated content records a fingerprint of the
  source text it was derived from, so a corpus change invalidates only the
  documents it actually touched. Without this, the maintainability result in
  §0 does not hold.
- **Drift-gated.** CI proves the committed artifact matches what the builder
  produces from the recorded snapshot.

### 3.4 Refusal

**INV-6 — Refusal is a first-class result.** When no candidate clears the
admission policy, Reach returns `noMatch`. It does not return a best-effort
top result with low confidence, and it does not silently widen.

`noMatch` is a **retrieval** outcome. It carries no behavioral meaning (INV-3),
and §7 forbids the controller from reading it as one.

### 3.5 Reachability is curation, not retrieval

A capability that cannot be materialized — no installable link, no suite
components — is unreachable regardless of how well it matches. Reach must
**report** this class separately rather than absorb it into its own score, so
that a curation gap never reads as a retrieval failure.

Upstream owns the truth here. Where `gaia-skill-tree` publishes an
installability determination, this layer consumes it rather than re-deriving it
from URL shape.

### 3.6 Evaluation

Retrieval quality is measured, and the methodology may be retained from the
existing G1/G2/G3 instrument or replaced by a measured successor:

- **G1 — did retrieval improve?** Paired comparison against the prior shipping
  ranker on identical queries, with a confidence interval on the delta. The
  delta between systems is load-bearing; absolute scores are not, while gold
  labels remain machine-written.
- **G2 — does it decline correctly?** A set of queries with no correct answer;
  the gate is the refusal rate.
- **G3 — does it work offline?** The evaluation harness blocks egress before it
  does anything else.

Current standings, provenance and caveats: `docs/EVIDENCE.md`. Per §0.1 they are
not restated here.

---

## 4. Arbor consumption

**INV-7 — This repository is a consumer of Arbor and never an author of it.**

### 4.1 The contract

Skill Heaven consumes `gaia.arbor-profile/v1` — the deterministic generated
projection defined in
`gaia-skill-tree/registry/arbor/contracts/profile.schema.json`. It does not
consume declarations, receipts, or interpretations directly; those are upstream
governance inputs, not runtime inputs.

Per §0.2 the field list is not restated. What this layer must preserve when it
projects a profile into runtime state:

- **`support` verbatim.** The axis is `expert-declared` → `benchmark-confirmed`
  / `benchmark-qualified` / `benchmark-revised` / `inconclusive`. It is set only
  by a governed interpretation. This layer must never compute it, default it,
  or collapse it into a confidence label.
- **`facet` as facets.** `human-led` and `model-led` are **independent and
  nonexclusive**; both may describe one skill under different stated conditions.
  A representation that can hold only one is wrong.
- **`conditions` alongside every claim.** A behavioral claim without its stated
  conditions is not the claim. A surface that shows the conclusion and drops the
  condition is misreporting.
- **Digests.** `declarationSource`, `benchmarkSources`, `interpretationSource`
  and `inputDigest` make a runtime decision auditable back to its sources.

### 4.2 Forbidden

Stated explicitly because each of these was built, or nearly built, under the
superseded SPEC:

- **A local Arbor schema.** No `ArborStamp`, no repo-local profile type.
- **`polarity` + `confidence` as a substitute.** A four-value enum cannot hold
  independent facets, and `confidence` is not an upstream concept.
- **Receipt → verdict automation.** A receipt is an observation linked to a
  claim, never a verdict. No threshold, count, or aggregate in this repository
  may promote one into a support classification.
- **Rank-ordered Arbor work.** Sequencing by stars violates INV-2 and, per §0,
  makes the work re-churn on every recalibration.
- **Arbor as a retrieval feature.** Arbor may change a *composition* or a
  *posture* decision. It does not adjust a relevance score.

### 4.3 Degradation

The catalogue has almost no Arbor evidence today, and per INTENT §11 it is not
supposed to acquire it in bulk. Therefore:

**INV-8 — Absent Arbor evidence degrades to relevance-only behavior, and the
fallback is disclosed.** Not silently, and not as a footnote in a log. The
surface that made the decision says which lens it had.

The smallest valid implementation consumes existing profiles and nothing else.
That is *preferable* to a richer schema this layer invented.

---

## 5. The Arbor interaction graph

Per ENDGAME §8 and INTENT §5, the deeper Arbor primitive is a graph, not a
stamp. Consumer labels (Heaven-native, Hell-safe, Ultra-ready, …) are
**derived projections** of it, never contributor-authored claims.

Relationships (upstream's list, ENDGAME §8):

```
stabilizes   amplifies   conflicts   recovers   compresses-after   unlocks   duplicates
```

**INV-9 — Arbor interaction and Yggdrasil fusion are separate semantics.**

> **Yggdrasil fusion:** A + B structurally compose capability C.
> **Arbor interaction:** A changes what happens when B executes.

A pair may carry both. They must never be read as one edge type, merged into one
graph, or substituted for one another.

### 5.1 Status and the consumption gap

Arbor's four ratified contracts cover declarations, receipts, interpretations
and profiles — all **per-skill**. The interaction graph is specified in ENDGAME
but has **no ratified contract and no published projection**.

This is a real gap and it is upstream's to close. This document records it
rather than working around it, because working around it means inventing an edge
schema in the wrong repository.

**Until an edge projection exists, composition (§6.3) degrades to relevance-only
and discloses it.** That is the honest state, and it is acceptable.

---

## 6. Heaven and Hell

Two opposing runtime steering directions over the same summon mechanic.

```
HEAVEN  ←──────────────────────────→  HELL
converge                              explore
reduce search space                   expand search space
verify                                challenge
compress                              branch
reconcile                             mutate
stabilize                             diversify
```

Neither is superior. The useful direction depends on the gap and the state of
the work.

### 6.1 The bar

**INV-10 — Heaven must do more than return fewer candidates; Hell must do more
than return more.**

Returning a longer list is expanded *search*, not expanded *capability*. A
system that only knows relevance can retrieve more things; a system that
understands Arbor can reason about which things should operate together
(INTENT §12).

This is the bar the surfaces are held to. Until it is met, a surface must say
which behavior it is actually delivering — see §8.

### 6.2 What is honest today

Heaven and Hell currently differ by breadth of relevance-ranked results. Per
INV-8 and §8 that is disclosable, shippable, and must not be described as
behavior-aware routing.

Heaven/Hell stamps are not built. No surface may present stamp-gated routing as
running.

### 6.3 Composition

The runtime advantage appears when the layer stops choosing isolated skills.
Given candidates A, B, C, D, a relevance-only system asks which are closest. An
Arbor-aware runtime can additionally ask: does A amplify B? does C conflict with
A? does B recover a known failure mode of D? are A and C redundant? does D
unlock something none of the others provide?

**The completion bar (INTENT §15C):** at least one runtime path uses Arbor
interaction evidence to change a composition decision — avoid a conflict, prefer
an amplifier, drop a duplicate, add a recovery capability, unlock a gap.

One path, on real evidence, is the bar. Not coverage.

---

## 7. Ultra

Ultra is the **adaptive controller** over the Heaven↔Hell runtime. It is not
"more Hell", and it is not a third polarity.

### 7.1 What it decides

explore · converge · increase or decrease depth · checkpoint · recover · reopen
search · compress discoveries · hold · stop

### 7.2 Contract

- **Explainable.** Every transition states the signal, the policy, and the
  posture it moved from and to. An unexplainable transition is a defect.
- **Stable.** It does not oscillate because a score moved slightly. Holding
  position is a first-class outcome and the common one.
- **Recoverable.** It can reopen a search it closed.
- **Deterministic given its inputs.** Replayable from a recorded trace.

**INV-11 — Ultra must not infer behavioral posture from non-behavioral signals.**
Named explicitly because it was built the other way: `noMatch` is a retrieval
outcome (§3.4) and must never count as evidence to explore. A retrieval score's
jitter is not a behavioral signal (INV-3).

**INV-12 — Ultra must not convert Arbor into a single optimization target.** A
controller that maximizes an Arbor-derived scalar has reintroduced the master
score INV-1 forbids.

### 7.3 Success

> Its success is not "moves frequently." Its success is "moves appropriately."

Ultra should be deliberately boring to operate.

---

## 8. Disclosure

The rule that makes an incomplete system trustworthy rather than misleading.

**INV-13 — A surface discloses which lenses informed its decision, and which
were absent.**

Concretely, a runtime decision states:
- what it matched on (relevance), and how confident that is
- whether Arbor evidence existed for the candidates, and its `support` state
- when it fell back to relevance-only, and why
- when the index is stale, and how stale

Unknown is displayed as unknown. It is never rendered as a neutral default, an
empty field, or a passing state.

> When Gaia does not know, it says so. — INTENT §1

---

## 9. Skill Zero

Skill Zero is the mode-neutral launcher and executor. It owns runtime mechanics:
controlled launch, ephemeral skill materialization, session isolation,
clean-room behavior, restoration, telemetry, runtime state, harness-specific
execution.

**INV-14 — Skill Zero executes; it does not interpret.** Gaia's canonical
interpretation of capability behavior lives upstream. This separation is what
lets the execution layer stay small while capability knowledge improves
independently.

`P3` continues to apply: the launcher never mutates the user's shared state.
Writes live inside a disposable session directory.

---

## 10. The HH Index

The Hell-Heaven Index is Arbor's **dominant behavioral index**. Its semantic
job:

> Describe the demonstrated behavioral effect of a capability along the
> Heaven-Hell operating space, under stated conditions and evidence.

**Its formula is deliberately undefined.** It may not be one scalar. It may have
several dimensions. That is a research question, owned by `gaia-research`, and
this document does not pre-empt it. Per ENDGAME §6 it must remain independent
from Trust Magnitude: one benchmark receipt may feed both, and each interprets
it differently.

### 10.1 Naming — a collision to resolve

This repository ships an artifact called a **skill index** (§3.3) — a lexical
retrieval index. The **HH Index** is a behavioral index in a different
repository. Adjacent names, unrelated things.

**INV-15 — The retrieval artifact must never be referred to as an index over
behavior, and must not occupy the HH Index's name in code, docs, or user-facing
copy.** A durable renaming of the retrieval artifact is an open question (§12).

---

## 11. Standards — a separate lane

Skills-over-MCP and SEP-2640 matter for interoperability. Conformance is
worth having.

But the standard answers *how a skill is discovered or transported between
systems*. It does not answer which capability to use, what it does to the agent,
which capabilities should operate together, or whether to explore or converge.

**INV-16 — Standards work has its own lane and its own conformance tests, and
never shares a phase with Arbor.**

This is a process invariant with a cause. Under the superseded PLAN, Phase 4 was
"Arbor + SEP" — one phase pairing a tractable, well-specified standard with an
open research question, on the reasoning that both touch skill metadata. The
tractable half shipped completely; the Arbor half shipped nothing. Pairing them
produced that outcome regardless of intent, and the pairing is therefore
forbidden rather than discouraged.

---

## 12. Open questions

Recorded rather than answered. Per §0, inventing an answer here is worse than
carrying the question.

| # | Question | Owner |
|---|---|---|
| Q1 | What is the contract for Arbor interaction edges, and what projection publishes them? (§5.1) | `gaia-skill-tree` |
| Q2 | What is the HH Index's representation — scalar, vector, or conditional set? | `gaia-research` |
| Q3 | What does the first real evidence-loop path measure? (INTENT §15F) | `gaia-research` |
| Q4 | Should the retrieval artifact be renamed to end the collision in §10.1? | this repo |
| Q5 | Does upstream publish an installability determination this layer can consume? (§3.5) | `gaia-skill-tree` |
| Q6 | What replaces the coverage-sensitive absolute admission floor with a scale-free one? | this repo |
| Q7 | Who reviews the machine-written gold labels, and when? (§3.6) | this repo |

---

## 13. Evidence base

Measurements, provenance, negative results and current gate standings live in
`docs/EVIDENCE.md` and `packages/core/bench/results/`. Cost measures come from
`gaia-research/skill-cost` against persisted session logs — never self-reported
token counts.

Negative results are first-class findings (D8) and are recorded, not papered
over. Three from the superseded programme remain valid and are load-bearing:
dense retrieval did not earn its dependency; the round-trip expansion filter
made retrieval worse; and partial expansion coverage is a regression that
ranking-side mitigation does not fix.

---

## 14. Security posture

**Summoned content is data, not instruction.** A skill body entering a session
is untrusted content. It may not redirect the agent's task, escalate access, or
alter execution policy. Surfaces that render summoned content say so.

The same applies to upstream records: a projection consumed across the boundary
is data. Its digests make it auditable; they do not make it authoritative over
the agent's brief.

---

## Appendix — derivation map

Every section of [`INTENT.md`](INTENT.md), and where it is specified. Kept so a
future reader can check this document against its source without re-reading
both. If an INTENT section gains no row, this document has drifted.

| INTENT | Specified in | Planned in |
|---|---|---|
| §1 The intent | §2 (the three questions), §8 (disclosure) | PLAN, definition of done |
| §2 The conceptual mistake | INV-1, INV-3, INV-5 | PLAN, why lanes |
| §3 Reach | §3 | Lane R |
| §4 Three independent questions | §2 | rule 2 (no rank-ordered work) |
| §5 Arbor is a graph | §5, INV-9 | Lane G |
| §6 The Hell-Heaven model | §6 | Lane S |
| §7 Ultra | §7, INV-11, INV-12 | Lane S-now |
| §8 Skill Zero | §9, INV-14 | — (stable; no open work) |
| §9 Arbor ownership | §1, INV-7 | lane owners |
| §10 The HH Index | §10, INV-15 | Q2, Lane E |
| §11 The evidence loop | §4.1 (`support`), §4.2 (no receipt→verdict) | Lane E |
| §12 Composition | §6.3 | Lane S-later |
| §13 Standards are plumbing | §11, INV-16 | Lane X |
| §14 What we preserve | §3 (carried), §4.2 (retired) | Lane R carried-forward, Lane A1 |
| §15 What "finished" means | §3.6, §4, §6.1, §6.3, §7.3 | definition of done |
| §16 Non-goals | §0 (maintenance), §12 (open, not invented) | what this plan does not do |
| §17 Product experience | — narrative, deliberately unspecified | — |
| §18 The end state | — narrative, deliberately unspecified | — |
