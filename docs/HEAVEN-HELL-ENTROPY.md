# Heaven, Hell, and what "inconclusive" is allowed to mean

An ADR-style record of a founder ruling that changed how this program is
evaluated. Written 2026-09-29. Sits with the S-later work in
`feat/arbor-band-judgment`.

## Status

Accepted. Binding on S-later. #119 stays open.

## The mistake this records

S-later was being held to this bar:

> one runtime path demonstrably changes composition because of accepted Arbor
> evidence

with an unstated second requirement: that the change be a **single attributable
behavioral delta**. Under that reading, the Lane E v4 result
(`pairedDiscordance = 0`, one discordant pair each way, three ties, n=5) failed
the bar, and the plan under review was to declare Heaven and Hell "breadth
directions" and say so plainly.

That second requirement is the **master behavioral score** — the one thing this
program explicitly forbids. The code was being audited against a spec that had
been invented in the same breath as being ruled out. When the code declined to
produce a scalar, the code was declared deficient.

## What was already committed in the code

`packages/core/src/compile.ts`, on `main`, before this ruling:

> Heaven (`low·med`) is the lower-entropy, converging direction; Hell
> (`high·xhigh·max`) is the higher-entropy, exploring direction — two directions
> along one quantity, **which is what makes them one line and not two products.**

and:

> **THERE ARE NO PER-RUNG NUMBERS.** … Skill entropy is a product concept, not an
> information-theoretic one: **no formula, no unit, no threshold, no number** is
> computed anywhere in this file or downstream of it, **and nothing should
> start.**

The model was already correct and already committed. Breadth is not a degraded
stand-in for behavior that Heaven/Hell failed to grow out of. **Breadth is the
observable in which the one quantity manifests.**

## The ruling

- It is **natural** that Heaven and Hell differ by breadth. That is the
  mechanism, not a shortfall.
- Heaven is `low` and precise. Hell can be `xhigh` or `max`. The breadth **is**
  the difference in entropy.
- **Inconclusive is embraced.** It is the answer, not a failure.
- The behavioral difference is highly **stochastic**. That is why it is called
  **entropy**.
- The single ladder, `off` → `max`, is a **product decision**: it is what
  humans understand. Not a reduction of a hidden multidimensional truth.
- Therefore honesty is available: breadth occurring naturally in a high-entropy
  "hell" is not a defect to disclose, it is the expected observation.
- The behavioral *meaning* of each rung is **empirical**. It is learned by use,
  not designed up front. "The more you use it, the more you will understand the
  actual meaning of the behavior."

## Consequences accepted

1. **The single ladder is a rendering decision, not a claim about a scalar.**
   No surface may present it as though a number were behind it. `compile.ts`
   already forbids one existing; nothing downstream may start one.

2. **The next useful experiment is not "did this skill help this one task."** It
   is distributional: *what does rung `xhigh` actually mean in practice, across
   enough observations to say?* Lane E's n=5 single-case design is the wrong
   instrument for that question, which is a design lesson, not a program failure.

3. **S-later's unit changes from "score" to "band judgment."** Not a number to
   shift. A disclosed direction — converge or explore — with abstention, from
   accepted evidence.

## The one guardrail, narrowly drawn

The ruling is accepted as stated. It is extended by exactly one rule, because
the ruling itself does not close this:

> **Inconclusive is embraced at the interpretation layer and remains binding at
> the consumption layer.** A curator may say "I don't know" freely and often; a
> runtime may never read "I don't know" as "yes."

The model disclaims rigor — that is the design. So the thing preventing
"embraced" from decaying into "doesn't matter" cannot be the model's own
strictness. It has to be the record.

This is why `evidence-inconclusive` is a first-class state in
`packages/core/src/arbor/band.ts` and is **pinned by test to be incapable of
producing a direction**, even when a `resolveDirection` is supplied that would
return one. Tested twice: on synthetic fixtures, and on the real published
record from `gaia-skill-tree` PR #2028.

## What the real record does

The one governed record in the Tree today
(`obra/receiving-code-review`, interpretation `93578bb7`):

- content-pinned join: yes
- governed: yes — `interpretationSource` is non-null
- conditions matched by a caller-declared matcher: yes
- the curator's governed answer: **`inconclusive`**

So the band abstains at `evidence-inconclusive`, and says why. That is not a
placeholder and not a missing feature. It is the honest output of the honest
record, and it is exactly the case the whole gate structure was built for.

A second, independent reason the band does not move today: the Hell-Heaven lens
projects `absent-no-accepted-record`, because the HH payload contract is
research-owned and unpublished. So there is currently **no legal source of a
direction** in the runtime at all, and `direction-unavailable` is reported
separately from `evidence-inconclusive` precisely so those two very different
reasons do not collapse into one another.

## What is explicitly NOT claimed

- No demonstrated behavioral effect.
- No behavioral delta attributable to the band.
- No positive Lane E result. `pairedDiscordance = 0`, n=5, and inconclusive is
  what the preregistered rule selects.
- S is not marked done. #119 stays open. The infrastructure is real and the gates
  are proven against a real record; the record's answer is that the question is
  unanswered.

## Revisions

If the HH publisher ships its payload contract, `resolveDirection` gains a real
implementation and the `direction-unavailable` gate stops firing. That is a
seam, not a rewrite: it is a parameter for exactly that reason.

If entropy is ever given a number, this ADR is void and `compile.ts`'s ruling
needs revisiting first, in the same commit, with the same scrutiny.
