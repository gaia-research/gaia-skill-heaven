# Experiment: probabilistic semantic decision layer for skill summon

## Summary

Test whether an optional probabilistic semantic decision layer can improve "skill-summon" over the current deterministic retrieval path while reducing the amount of hand-tuned routing logic.

This is an experiment first, not a commitment to replace the existing engine.

The current shipping path is roughly:

intent
  → BM25F retrieval
  → deterministic decide()
       - surface filter
       - calibrated floor
       - relevance band
       - ambiguity margin
       - no-match refusal
  → summon
  → Arbor disclosure / observation

The proposal is to evaluate a Jev-like decision model as an optional semantic discriminator over a small candidate set produced by the existing retrieval engine:

intent
  → BM25F candidate recall
  → probabilistic semantic decision
       P(skill A fits intent)
       P(skill B fits intent)
       P(none fits)
  → deterministic policy / installability gates
  → summon
  → Arbor disclosure / observation

The key architectural constraint is:

«Probabilistic inference must not become policy authority.»

Installability, surface rules, provenance, trust, security, and materialization remain deterministic.

---

## Why test this

The deterministic engine is valuable because it is cheap, auditable, offline-first, reproducible, and predictable.

However, semantic relevance currently comes from a combination of:

- BM25F retrieval scores
- relevance floor
- relevance band
- ambiguity margin
- special-case handling

This works, but it means Skill Heaven infers semantic confidence from retrieval-score geometry.

A calibrated semantic decision model may answer the actual question more directly:

«Given this capability gap and these candidate skills, which candidate actually fits, or should we refuse all of them?»

The experiment should test two hypotheses.

1. Quality hypothesis

Probabilistic semantic routing is at least as reliable as the deterministic engine, and ideally materially better for:

- paraphrases
- low lexical-overlap requests
- ambiguous capability gaps
- no-match decisions
- composition decisions

2. Simplicity hypothesis

A semantic decision layer can replace enough relevance-specific heuristics that the resulting system becomes easier to reason about and maintain.

This matters.

A model that gives us +2% routing quality while adding an expensive, fragile subsystem is not automatically an upgrade.

The interesting outcome is:

better routing
and/or
meaningfully simpler routing machinery

---

## Product hypothesis: tiered routing

If this works, it does not need to replace the free/local engine.

Base / local

Keep the deterministic path:

BM25F
  → deterministic decide()
  → deterministic policy
  → summon

Properties:

- offline-first
- zero inference cost
- reproducible
- OSS-friendly
- local
- fallback when remote inference is unavailable

Semantic / premium

Subscribers may optionally receive:

BM25F
  → probabilistic semantic decision
  → deterministic policy
  → summon

Potential advantages:

- stronger intent understanding
- better paraphrase matching
- calibrated no-match decisions
- better ambiguity handling
- probabilistic composition
- less dependence on hand-tuned thresholds

This tier only makes sense if the empirical gains justify the inference cost.

---

## Non-goals

- Do not replace BM25F candidate generation in V1.
- Do not make Arbor a hidden ranking oracle.
- Do not let a probabilistic model override policy.
- Do not remove the deterministic path.
- Do not assume Jev must become the permanent provider.
- Do not turn summon into a remote-only feature.
- Do not pay inference cost for trivial exact-name matches.

Treat Jev as the first candidate implementation of a more general decision interface.

---

## Proposed architecture

Introduce a narrow semantic decision abstraction after candidate generation.

interface DecisionBackend {
  decide(input: {
    query: string;
    candidates: Candidate[];
  }): Promise<SemanticDecision>;
}

Initial implementations:

classic
  current deterministic behavior

jev
  experimental probabilistic decision backend

compare
  classic remains authoritative
  Jev runs in shadow mode

Possible CLI shape:

summon --decision=classic
summon --decision=jev
summon --decision=compare

"compare" should be the preferred experimental mode.

Nothing behavioral changes initially.

---

## Candidate pipeline

Do not ask the probabilistic model to search the entire Tree.

Use deterministic retrieval to cheaply narrow the universe first:

                     Gaia Skill Tree
                           │
                           ↓
                     BM25F recall
                      top ~10–30
                           ↓
                 semantic decision
                           │
                ┌──────────┴──────────┐
                ↓                     ↓
            best match             none
                │
                ↓
          deterministic policy
                │
                ↓
              summon

Example semantic output:

frontend-design       0.94
impeccable            0.77
playwright             0.31
none-of-the-above      0.04

This is much closer to the question summon actually cares about than interpreting BM25 score margins.

---

## Deterministic authority remains

The probabilistic backend may estimate:

Does this skill semantically fit the task?

It does not determine:

May this skill run?

Skill Heaven continues to deterministically enforce:

- registry state
- installability
- materializability
- provenance
- source restrictions
- trust requirements
- Heaven/Hell surface rules
- suite behavior
- filesystem behavior
- security restrictions

Conceptually:

probability answers SHOULD
policy answers MAY

That boundary should stay extremely boring.

---

## Benchmark

Reuse and extend the existing retrieval benchmark harness.

At minimum compare:

Variant| Retrieval| Semantic decision| Policy
A| BM25F| None| Current "decide()"
B| BM25F| Jev| Existing deterministic gates
C| BM25F| Jev| Simplified relevance layer + deterministic gates

Possible later experiment:

Variant| Retrieval| Semantic decision
D| Semantic/vector retrieval| Jev

Variant D should not happen unless B/C show compelling results first.

---

## Evaluation corpus

Do not benchmark only obvious skill names.

Include:

Easy controls

- exact skill name
- exact repo name
- catalog references
- highly lexical capability matches

These establish regressions and should likely bypass paid inference entirely.

Semantic cases

- paraphrased requests
- little lexical overlap
- colloquial capability descriptions
- capability described indirectly
- user describes desired outcome rather than tool

Example:

"make sure this UI feels polished and doesn't have weird visual states"

versus explicit:

"summon impeccable"

Ambiguous cases

Create requests where several skills are plausible.

Measure whether the model:

- selects correctly
- reports uncertainty
- refuses when appropriate

No-match cases

Include tasks for which the right answer is:

summon nothing

This is critical.

Adversarial similarity

Include skills with:

- similar descriptions
- overlapping terminology
- neighboring capabilities
- different invocation surfaces

Composition

Include tasks that legitimately need multiple skills.

---

## Metrics

Decision quality

Track:

- top-1 accuracy
- top-k recall
- MRR where appropriate
- no-match precision
- no-match recall
- false-positive summon rate
- ambiguity detection
- semantic paraphrase accuracy
- exact-name regression rate

The false-positive summon rate matters disproportionately.

Confidently summoning a plausible-but-wrong skill can be more damaging than refusing.

---

Probability calibration

If Jev exposes probabilities, evaluate whether they mean anything.

Track:

- Brier score
- Expected Calibration Error
- reliability plots
- confidence vs empirical correctness

For example:

decisions around 0.9 confidence

should actually be correct roughly at the rate expected from that calibration.

Do not treat an arbitrary model score as probability merely because it is between "0" and "1".

---

System simplicity

This experiment should explicitly measure complexity.

Track:

- number of relevance thresholds
- number of tuning constants
- decision branches
- special cases
- amount of ranking-specific code
- tuning effort when Tree grows
- maintenance burden

The goal is not minimizing LOC.

The question is:

«Can semantic inference replace brittle relevance heuristics while leaving deterministic policy untouched?»

A good result might let us reduce concepts such as:

floor
band
margin
semantic special cases

into something much closer to:

semantic probability
+
deterministic policy

---

## Economics

Because the semantic path may become a subscriber feature, economics belong directly in the benchmark.

Measure:

- cost per decision
- cost per 1,000 summons
- cost per successful correction over classic
- median latency
- p95 latency
- timeout rate
- provider failure rate
- batching opportunities
- caching opportunities

Also measure avoided inference.

Examples:

exact-name match
→ no Jev call

single overwhelmingly obvious candidate
→ possibly no Jev call

semantic ambiguity
→ Jev

The premium layer does not need to run on every invocation.

---

## Shadow mode

Before changing behavior:

--decision=compare

Classic remains authoritative.

Jev observes the same candidate set and records its decision.

Example:

{
  "query": "audit this dashboard and improve the interaction polish",
  "classic": {
    "chosen": "frontend-design",
    "margin": 0.21
  },
  "semantic": {
    "chosen": "impeccable",
    "confidence": 0.92,
    "none": 0.02
  },
  "agreement": false
}

The highest-value artifact from this experiment is:

the disagreement corpus

For each disagreement, determine:

- which system was correct?
- was BM25 misled by lexical overlap?
- was the semantic model confidently wrong?
- did one correctly refuse?
- was the candidate set itself bad?
- would the probabilistic result have passed deterministic policy?

This becomes our empirical basis for deciding whether probabilistic routing actually helps.

---

## Arbor boundary

For the first experiment preserve the current architecture:

decision happens
      ↓
summon happens
      ↓
Arbor observes

Do not feed Arbor evidence back into routing yet.

This keeps the experiment interpretable.

Otherwise we would simultaneously be testing:

new decision model
+
new behavioral evidence
+
new routing policy

and would not know which change caused the result.

---

## Future Arbor experiment

Only after semantic routing proves itself should we evaluate:

intent
+
candidate metadata
+
bounded Arbor evidence
→ semantic decision

Potential questions:

Does adding this skill materially improve task coverage?

Is this skill redundant with skills already summoned?

Does this historical composition provide evidence that these skills work well together?

That should be a separate issue because it intentionally changes Arbor's current observer boundary.

---

## Multi-skill composition follow-up

This may ultimately be even more valuable than top-1 routing.

Example:

Task:
"build this dashboard and visually verify the implementation"

frontend-design       0.96  SUMMON
playwright             0.91  SUMMON
impeccable             0.84  SUMMON
data-analysis          0.12  SKIP
pdf                    0.03  SKIP

Instead of:

summon N skills

Skill Heaven could eventually reason about each incremental capability:

«Does adding this skill materially increase coverage of the task?»

That fits the existing philosophy that summon depth should follow the capability gap rather than an arbitrary fixed ceiling.

---

## Success criteria

The semantic path earns further productization only if evidence supports it.

- [ ] no meaningful regression on exact / deterministic lookups
- [ ] equal or better overall top-1 routing
- [ ] materially better low lexical-overlap routing
- [ ] equal or better no-match behavior
- [ ] lower false-positive summon rate, or demonstrably better tradeoff
- [ ] confidence values are acceptably calibrated
- [ ] probabilistic output cannot bypass deterministic policy
- [ ] latency remains acceptable for interactive summon
- [ ] economics plausibly support a subscriber tier
- [ ] relevance logic becomes simpler or substantially more capable
- [ ] shadow-mode disagreement report is manually reviewed
- [ ] fallback to deterministic routing is reliable

A probabilistic backend should not ship because it sounds more sophisticated.

---

## Kill criteria

Park the experiment if:

- semantic quality is not measurably better
- improvements occur only on cases BM25 already solves cheaply
- calibration is poor
- no-match performance becomes worse
- confident false positives become common
- latency harms interactive summon
- economics do not support the paid tier
- remote availability materially reduces reliability
- the semantic route introduces more special-case logic than it removes

In every failure case:

classic remains the product baseline

---

## Phases

Phase 0: provider spike

- [ ] verify Jev API capabilities
- [ ] verify probability semantics / calibration claims
- [ ] document pricing
- [ ] document expected latency
- [ ] build tiny adapter
- [ ] manually run ~25 difficult queries

Deliverable:

PROCEED / PARK

with examples.

Phase 1: benchmark backend

- [ ] introduce "DecisionBackend"
- [ ] wrap existing deterministic engine as "classic"
- [ ] implement experimental Jev backend
- [ ] extend benchmark corpus
- [ ] benchmark accuracy
- [ ] benchmark no-match behavior
- [ ] benchmark calibration
- [ ] benchmark latency
- [ ] benchmark cost

Deliverable:

classic-vs-semantic-report.md

Phase 2: shadow mode

- [ ] implement "compare"
- [ ] keep classic authoritative
- [ ] log disagreements
- [ ] build disagreement corpus
- [ ] manually adjudicate representative disagreements

Phase 3: gated preview

Only if the previous phases justify it:

- [ ] opt-in semantic routing
- [ ] deterministic fallback
- [ ] timeout fallback
- [ ] expose backend in summon disclosure
- [ ] expose useful confidence signal
- [ ] validate subscriber-tier economics

Phase 4: product decision

Choose based on evidence:

A. classic only

B. classic free/local
   semantic optional premium

C. semantic preferred when available
   classic deterministic fallback

D. continue research

---

## North Star

The architecture should remain straightforward:

Tree
  provides capabilities

BM25F
  retrieves plausible candidates

Decision backend
  estimates semantic fit

Skill Heaven
  enforces deterministic policy

Arbor
  records empirical reality

The probabilistic layer earns its place only if it makes the middle of that pipeline:

«more accurate, meaningfully simpler, or both.»
