# INTENT — what Skill Heaven is for, and what "finished" means

**Status:** Founder direction, draft 2026-09-04.
**Supersedes:** the 2026-09-03 retrieval-centered "INTENT.md".

This document defines the purpose and architectural direction of Skill Heaven, the Gaia runtime capability layer.

`SPEC.md` and `PLAN.md` must be re-derived from this document.

The existing retrieval work remains valuable and should be preserved where it serves this intent. The purpose of this rewrite is not to discard that work. It is to put it back into the architecture it was originally meant to support.

Long-term conceptual authority remains:

- `gaia-skill-tree/founder/ENDGAME.md`
- the ratified Arbor contracts under `gaia-skill-tree/registry/arbor/`
- founder rulings governing Skill Heaven, Skill Zero, Arbor, and the global effort ladder

---

## 1. The intent

> When an agent encounters a capability gap, Skill Heaven deliberately changes the agent's active capabilities and search behavior.
>
> It finds the right capability, composes it with behaviorally compatible capabilities when useful, chooses whether the agent should converge or explore, and adapts that posture as evidence changes.
>
> When Gaia does not know, it says so.

Skill Heaven is therefore not primarily a search engine, registry, launcher, benchmark, or protocol implementation.

It is Gaia's runtime capability steering layer.

Its job is to answer a sequence of increasingly powerful questions:

```
What capability could help?
        │
        ▼
Which capability should enter the session?
        │
        ▼
What will that capability do to this agent?
        │
        ▼
What happens if it interacts with other capabilities?
        │
        ▼
Should the agent converge or explore?
        │
        ▼
Should that posture change as the work unfolds?
```

The product becomes more useful as it can answer more of this sequence honestly.

Retrieval solves the first part.

Arbor makes the later parts possible.

Ultra closes the loop.

---

## 2. The conceptual mistake this document prevents

Skill Heaven must not collapse into:

```
query
  │
  ▼
retrieval index
  │
  ▼
rank skills
  │
  ▼
summon top result
```

That is a useful summoner.

It is not the Skill Heaven endgame.

The intended shape is:

```
                     CAPABILITY GAP
                           │
                           ▼
                     ┌───────────┐
                     │   REACH   │
                     │ find /    │
                     │ refuse    │
                     └─────┬─────┘
                           │
                           ▼
                  candidate capabilities
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
          YGGDRASIL                ARBOR
        trust / standing      behavior / interaction
                │                     │
                └──────────┬──────────┘
                           ▼
                       COMPOSE
                           │
                           ▼
                  HEAVEN ↔ HELL
                 converge   explore
                           │
                           ▼
                         ULTRA
                adaptive runtime control
                           │
                           ▼
                      SKILL ZERO
                 materialize / execute
                           │
                           ▼
                         AGENT
                           │
                           ▼
                     OBSERVATIONS
                           │
                           ▼
                  Arbor evidence loop
```

The distinction is load-bearing:

> **Arbor is not a ranking feature for `/summon`; `/summon` is one consumer of Arbor.**

---

## 3. Reach: finding a capability

The retrieval work already underway solves a real problem.

Before this work, `/summon` could confidently choose the wrong skill because its matching system was too weak and had no meaningful refusal behavior.

That must be fixed.

Skill Heaven should be excellent at finding capabilities from natural-language descriptions of a capability gap.

The architectural bet remains sound:

> **Move retrieval intelligence to index time where practical.**

The corpus is small enough to enrich offline. Runtime should remain fast, deterministic, inspectable, and dependency-light.

Reach therefore owns:

- capability retrieval
- build-time retrieval expansion
- exact and directed lookup
- ranking
- refusal / "noMatch"
- offline operation
- index freshness
- retrieval explanation
- standards-compatible discovery surfaces where useful

Reach answers:

> **Could this capability help with the current gap?**

It does not answer:

> **Is this capability prestigious?**

It does not answer:

> **What effect will it have on the agent?**

It does not answer:

> **Should it be combined with another capability?**

Those belong to other Gaia dimensions.

Retrieval is the front door, not the whole house.

---

## 4. Three independent questions

Gaia must resist the temptation to create one master capability score.

At runtime, three different questions may matter.

### 4.1 Relevance

> **Could this capability help with this particular gap?**

Owned primarily by Skill Heaven's retrieval layer.

Typical inputs:

- task language
- capability description
- retrieval expansion
- aliases
- repository targeting
- availability

Relevance is contextual.

A highly relevant capability may have little evidence.

A highly trusted capability may be irrelevant to the current problem.

---

### 4.2 Yggdrasil

> **How strongly should Gaia trust this capability's demonstrated standing?**

Owned by Gaia Skill Tree's Yggdrasil Tree.

Typical concepts include:

- stars
- rank
- TrustMagnitude
- Trust Grades
- evidence
- fusion
- suites
- promotion governance

Yggdrasil is Gaia's prestige and trust lens.

Its information may inform a runtime policy, but it must never leak into Arbor's ontology.

---

### 4.3 Arbor

> **What does this capability do to an agent, and what happens when it interacts with other capabilities?**

Owned canonically by Gaia Skill Tree's Arbor Tree.

Typical concepts include:

- convergence
- exploration
- trajectory spread
- stability
- recovery
- endurance
- behavioral compatibility
- human-led behavior
- model-led behavior
- capability interaction edges
- Hell-Heaven behavioral evidence
- HH Index interpretations

Arbor is behavioral.

It is deliberately rank-agnostic.

```
RELEVANCE                 YGGDRASIL                 ARBOR

Could it help?            Can we trust              What will it
                          its standing?              do at runtime?

     │                         │                         │
     └─────────────────────────┼─────────────────────────┘
                               ▼
                         RUNTIME POLICY
```

No one number replaces these questions.

---

## 5. Arbor is a graph before it is a stamp

Consumer-facing labels such as:

- Heaven-native
- Hell-native
- Heaven-safe
- Hell-safe
- Dual-safe
- Ultra-ready

may be useful.

But they are projections.

They are not Arbor itself.

The deeper Arbor primitive is a behavioral capability graph.

A skill can interact with another skill through relationships such as:

```
stabilizes
amplifies
conflicts
recovers
compresses-after
unlocks
duplicates
```

These edges mean:

> **Using these capabilities together empirically changes runtime behavior.**

They are distinct from Yggdrasil fusion.

**YGGDRASIL FUSION**

> A + B structurally compose capability C.

**ARBOR INTERACTION**

> A changes what happens when B executes.

A pair of capabilities may possess both relationships.

They must remain separate semantics.

This distinction is fundamental to Skill Hell.

Hell is intended to explore capability space using multiple skills or agents.

A system that knows only relevance can retrieve more things.

A system that understands Arbor can reason about which things should operate together.

That is the transition from expanded search to capability composition.

---

## 6. The Hell-Heaven model

Heaven and Hell are opposing runtime steering directions.

```
HEAVEN  ←────────────────────────────→  HELL

converge                              explore
reduce search space                   expand search space
verify                                challenge
compress                              branch
reconcile                             mutate
stabilize                             diversify
```

Neither direction is inherently superior.

The useful direction depends on the capability gap and the current state of work.

A design review may benefit from convergence.

An unknown failure may benefit from exploration.

A mature branch may need compression.

A failed approach may need the search space reopened.

Skill Heaven should ultimately know the difference.

---

## 7. Ultra

Ultra is not simply "more Hell."

Ultra is not a third behavioral polarity.

Ultra is the adaptive controller over the Heaven-Hell runtime.

Conceptually:

```
gap appears
    │
    ▼
 explore
    │
    ▼
promising path
    │
    ▼
 converge
    │
    ▼
checkpoint
    │
    ├──── insufficient ────► reopen
    │
    ▼
canonize
```

Ultra decides when the runtime should:

- explore
- converge
- increase or decrease depth
- checkpoint
- recover
- reopen search
- compress discoveries
- hold its current posture
- stop

Ultra should be deliberately boring to operate.

Its value is not dramatic movement.

Its value is appropriate movement.

It should be explainable.

It should not oscillate merely because a retrieval score moved slightly.

It should not infer behavioral posture from unrelated signals such as "noMatch".

And it should never secretly convert Arbor into a single optimization target.

---

## 8. Skill Zero

Skill Zero remains the mode-neutral launcher and executor.

It owns runtime mechanics such as:

- controlled launch
- ephemeral skill materialization
- session isolation
- clean-room behavior
- restoration
- telemetry
- runtime state
- harness-specific execution

Skill Zero executes.

It does not own Gaia's canonical interpretation of capability behavior.

```
GAIA KNOWLEDGE
      │
      ▼
SKILL HEAVEN
runtime decision
      │
      ▼
 SKILL ZERO
   execution
      │
      ▼
    AGENT
      │
      ▼
 observations
```

This separation allows the execution system to stay relatively small while Gaia's capability knowledge improves independently.

---

## 9. Arbor ownership

Skill Heaven is a consumer of Arbor.

It must not invent a parallel Arbor schema for convenience.

The ownership boundary is:

### `gaia-skill-tree`

Canonical record of the capability world.

Owns:

- canonical Skill identity
- Yggdrasil
- Arbor contracts
- Arbor sources
- governed Arbor interpretations
- generated Arbor profiles
- behavioral interaction graph contracts
- published projections for consumers

Existing `gaia.arbor-*` contracts are upstream authority.

---

### `gaia-research`

Research and evidence generation.

Owns or develops:

- HH Index methodology
- behavioral hypotheses
- targeted uncertainty detection
- focused benchmark harnesses
- runtime-effect research
- interpretation methodology
- reproducible experimental artifacts

The HH Index remains research-led while its representation is still being discovered.

The flow across the three repositories is one-directional (§10.1):

```
gaia-research          gaia-skill-tree          gaia-skill-heaven
   publishes      ──►      records         ──►      consumes
   the result           the accepted result
```

The Tree never calculates it. Skill Heaven never produces it.

---

### `gaia-skill-heaven`

Runtime consumer.

Owns:

- Reach
- `/summon`
- Heaven runtime behavior
- Hell runtime behavior
- Ultra control
- Skill Zero integration
- local opt-in behavioral telemetry
- runtime disclosure and fallbacks
- consumption of published Gaia knowledge

Skill Heaven may cache or project upstream records for performance.

It must not fork their meaning.

---

## 10. The HH Index

The Hell-Heaven Index is Arbor's dominant behavioral index.

Its semantic job is:

> **Describe the demonstrated behavioral effect of a capability along the Heaven-Hell operating space, under stated conditions and evidence.**

`INTENT.md` intentionally does not define its formula.

But the formula is the only part that is open.

### 10.1 What is already decided

*Alignment pass, 2026-09-04. A scout of the founder docs found the HH Index considerably more specified than the first draft of this section implied. Recording it here so that `SPEC.md` and `PLAN.md`, which are re-derived from this document, cannot drift from decisions that already exist.*

| | Decided | Where |
|---|---|---|
| The name, and the schema key `hellHeaven` | ratified, **CURRENT** | `gaia-research` RATIFICATION **N6** |
| **A result is a profile, not merely a scalar** — polarity, behavior dimensions, per-regime effectiveness and safety, coverage — with a worked example | specified | `gaia-skill-tree/founder/ENDGAME - SCHEMA.md` §9 |
| **Index independence.** `HH ↛ TM ↛ HH` is forbidden. Both derive from raw observation; projections may freely join their outputs | specified | `ENDGAME - SCHEMA.md` §14 |
| **Recomputability.** Delete every generated HH artifact, recompute from receipts, reproduce the same Arbor projection | stated as the core invariant | `ENDGAME - SCHEMA.md` §16 |
| Stamps are **earned by trial** — rubric-first predictions, validated against a paired benchmark, then shipped. Values `heaven-native`, `auto@tier`, `hell-safe@tier` | specified | `gaia-research/content/reports/hh-benchmark/methodology.md` §5 |
| `hh-ledger/v1` frozen; the validator is the hard gate; no seeds, N repeats and confidence intervals | specified | methodology §6 |
| **The flow is one-directional.** Research publishes the result. The Tree records the accepted result. Skill Heaven consumes it. The Tree never calculates it | specified | ROADMAP Program 3 |

So the answer to *"may it be several dimensions?"* is already yes.

The open question is narrower, and it is asked in `gaia-research`'s own methodology §7:

> **Does a continuous score survive, or do the discrete stamps make it redundant?**

That remains a research question, and this document does not pre-empt it.

### 10.2 The question the consumer needs answered

One thing is genuinely undecided, and it is not the formula.

ENDGAME calls the HH Index **Arbor's dominant index**.

But the ratified `gaia.arbor-profile/v1` has no field for it. Its claims carry `facet`, `conditions` and `support`, and index-shaped fields are not among them.

So:

```
        does HH land INSIDE the Arbor profile
                       │
                       ├──► the contract needs a field
                       │
        or does it sit BESIDE it
                       │
                       └──► a consumer joins two artifacts,
                            and needs to know on what key
```

Until that is answered, Skill Heaven consumes the Arbor profile and treats HH as absent.

That is honest, and it is shippable.

It is also the ceiling on §6 and §12: without it, Heaven and Hell can only differ by how many candidates they return.

**This is the single decision that unblocks the most product surface.**

### 10.3 Independence

The HH Index must remain independent from TrustMagnitude.

```
                     OBSERVATION
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
           HH INDEX                 TM INDEX
          behavior                  trust
```

A capability can therefore simultaneously be:

```
Yggdrasil:
  high standing

Arbor:
  strongly convergent under condition A
  exploratory under condition B
  safe with capability X
  conflicting with capability Y
```

No contradiction exists.

They describe different things.

---

## 11. The evidence loop

Arbor should not become a bulk benchmark treadmill.

The smallest useful loop is:

```
DECLARATION
     │
     ▼
RUNTIME OBSERVATION
     │
     ▼
CONCRETE UNCERTAINTY
     │
     ▼
FOCUSED BENCHMARK
     │
     ▼
RECEIPT
     │
     ▼
GOVERNED INTERPRETATION
     │
     ▼
UPDATED ARBOR PROFILE
```

Important rule:

> **Observation is not interpretation.**

A benchmark receipt may support an interpretation.

It does not automatically become one.

No arbitrary threshold should silently transform runtime telemetry into a behavioral truth.

This is intentionally slower than computing a score.

That is a feature.

Arbor is supposed to describe behavior honestly, not maximize coverage.

---

## 12. Composition

The long-term runtime advantage of Arbor appears when Skill Heaven moves beyond choosing isolated skills.

Suppose retrieval returns:

```
A
B
C
D
```

A relevance-only system asks:

> **Which are closest to the query?**

An Arbor-aware runtime can additionally ask:

```
Does A amplify B?
Does C conflict with A?
Does B recover a known failure mode of D?
Are A and C redundant?
Does D unlock a capability none of the others provide?
```

This enables behavior-aware loadouts.

Conceptually:

```
        retrieval candidates
        A   B   C   D
         \ / \ / \ /
          Arbor graph
              │
              ▼
       compatible subset
              │
              ▼
       runtime composition
```

This is especially important to Skill Hell, where "explore" must eventually mean more than returning a longer list.

At early stages, absence of sufficient Arbor evidence must degrade gracefully to relevance-only behavior.

The fallback must be disclosed.

Unknown must remain a valid state.

---

## 13. Standards are plumbing

Skills-over-MCP and SEP-2640 matter.

Skill Heaven should be conformant wherever doing so improves interoperability.

But the standard answers:

> **How is a skill discovered or transported between systems?**

It does not answer:

> **Which capability should I use?**

It does not answer:

> **What does it do to the agent?**

It does not answer:

> **Which capabilities should operate together?**

It does not answer:

> **Should the runtime explore or converge?**

Therefore:

```
SEP / MCP
interoperability boundary

        │
        ▼

SKILL HEAVEN
runtime capability intelligence
```

Standards compatibility is infrastructure.

It must not become a conceptual pillar competing with Arbor.

It should have its own implementation lane and its own conformance tests.

It should never again share an architectural phase with Arbor merely because both touch skill metadata.

---

## 14. What we preserve from the current work

The current retrieval program uncovered real problems and produced valuable machinery.

Preserve, subject to normal code review:

- the improved offline retrieval index
- build-time retrieval expansion
- BM25F or its measured successor
- explicit refusal
- "noMatch"
- reproducible retrieval evaluation
- offline behavior
- index freshness / coverage tooling
- negative findings from attempted dense retrieval
- deterministic Ultra controller work that remains valid after semantic review
- SEP-compatible resource surfaces that remain conformant
- discovered registry/installability fixes

Do not preserve merely because already implemented:

- a Skill Heaven-local Arbor schema
- "polarity + confidence" as a substitute for canonical Arbor
- Arbor sequencing based on Yggdrasil rank
- any assumption that Arbor is a scalar feature of retrieval
- receipt → behavioral verdict automation
- phase structures that pair Arbor with unrelated standards work

Good implementation survives a corrected intent.

Accidental ontology does not.

---

## 15. What "finished" means

Skill Heaven does not become "finished" merely because retrieval reaches a target metric.

A useful completion shape has several independent capabilities.

### A. Reach works

The agent can describe a capability gap naturally and usually reach the correct capability.

When Gaia lacks a credible candidate, Skill Heaven refuses.

The index works offline.

These are measured retrieval properties and may retain the existing G1/G2/G3 methodology or a later measured successor.

---

### B. Arbor consumption is honest

Skill Heaven consumes canonical Arbor projections.

It:

- does not invent Arbor fields
- preserves upstream support state
- distinguishes unknown from negative
- does not derive behavioral truth directly from receipts
- does not expose Yggdrasil prestige as Arbor behavior
- discloses when behavioral evidence is absent

The smallest valid implementation may initially consume only existing profiles.

That is preferable to fabricating a richer schema.

---

### C. Composition becomes behavior-aware

At least one runtime path can use Arbor interaction evidence to change a capability composition decision.

Examples:

- avoid a known conflict
- prefer an amplifier
- remove a duplicate
- add a recovery capability
- unlock a missing capability

Until sufficient evidence exists, relevance-only fallback remains valid.

---

### D. Heaven and Hell mean behavior

Heaven must do more than retrieve fewer candidates.

Hell must do more than retrieve more candidates.

Their runtime behavior should increasingly reflect the behavioral semantics defined by Arbor:

```
Heaven → convergence
Hell   → exploration
```

The exact implementation may vary by harness.

The semantic outcome should remain recognizable.

---

### E. Ultra governs rather than guesses

Ultra selects and changes runtime posture based on explicit runtime evidence and policy.

It must be:

- explainable
- stable
- recoverable
- capable of holding position
- capable of reopening search
- independent from arbitrary retrieval-score jitter

Its success is not "moves frequently."

Its success is "moves appropriately."

---

### F. The evidence loop closes

At least one real path demonstrates:

```
runtime observation
→ uncertainty
→ focused benchmark
→ receipt
→ governed interpretation
→ updated Arbor projection
→ changed future runtime knowledge
```

This is the proof that Gaia can learn about capability behavior without turning Arbor into a bulk scoring program.

---

## 16. Non-goals

This direction does not require:

- a rewrite of Skill Heaven
- a new ladder
- a new prestige system
- Yggdrasil III
- one global capability score
- exhaustive benchmarking of every skill
- pre-stamping the entire catalogue
- runtime embedding dependencies
- model-decided loadouts by default
- merging the three Gaia repositories
- fully defining the HH Index's **formula** before evidence exists — its name, shape, independence rule, recomputability constraint and governance are already decided (§10.1) and are not reopened by this line
- delaying useful retrieval improvements until Arbor is complete

The architecture should allow incomplete knowledge.

That is critical.

Gaia becomes more trustworthy when:

```
UNKNOWN
```

is an acceptable answer.

---

## 17. Product experience

The founder should eventually feel:

**`/summon`**

> I need a capability. Gaia finds the right one, or tells me it cannot.

**Heaven**

> I need this work to converge. Gaia introduces capabilities that help reduce uncertainty and stabilize the trajectory.

**Hell**

> I do not yet know the path. Gaia deliberately expands capability and search space without blindly composing conflicting tools.

**Ultra**

> I have a long-running heterogeneous problem. Gaia changes posture as each gap changes instead of forcing the entire task through one reasoning mode.

**Skill Zero**

> I can always return to a controlled floor and know what capability state the agent actually has.

The product story is therefore:

```
summon
  ↓
reach capability
  ↓
understand behavior
  ↓
compose
  ↓
converge ↔ explore
  ↓
adapt
  ↓
observe
  ↓
learn
```

---

## 18. The end state

Skill Heaven becomes Gaia's runtime expression of the multidimensional capability graph.

```
                    GAIA CAPABILITY WORLD

                           Identity
                              │
          ┌───────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
      Relevance           Yggdrasil              Arbor
      task fit          trust/prestige       runtime behavior
          │                   │                    │
          └───────────────────┼────────────────────┘
                              ▼
                         Skill Heaven
                    runtime capability policy
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
             Reach          Compose         Steer
                                             │
                                     Heaven ↔ Hell
                                             │
                                           Ultra
                                             │
                                             ▼
                                         Skill Zero
                                             │
                                             ▼
                                            Agent
```

Gaia's advantage is not having the largest skill catalogue.

It is not merely having better skill search.

It is understanding:

> **what capability the agent needs, how strongly its claims should be trusted, what effect it will have on runtime behavior, what other capabilities alter that effect, and when the system should introduce, remove, combine, explore, converge, recover, or stop.**

Retrieval gets the capability through the door.

Arbor tells us what happens when it enters.

Skill Heaven decides what to do about it.
