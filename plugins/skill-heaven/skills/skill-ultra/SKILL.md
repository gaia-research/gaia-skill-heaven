---
name: skill-ultra
description: Arm the ultra crown rung, choosing human-led convergence or model-led exploration and depth per capability gap.
disable-model-invocation: true
---

# Skill Ultra

Set the routing posture to `ultra`. Ultra is the crown rung, not a separate ladder. A session sits at exactly one rung.

```text
zero · low · med · high · xhigh · max · ultra
```

## How Ultra decides

Ultra reads **one number** — `margin`, returned on every summon result as
`(score_top1 − score_top2) / score_top1`. A high margin means the index knows
exactly which skill this is: converge, one skill is enough. A low margin means
several skills are plausible and the index cannot separate them: explore, put
more experts in context.

On each capability gap:

1. Call `summon` with `preview: true` to read the margin without materializing
   anything.
2. Smooth it: `m̄ = 0.3·m + 0.7·m̄`. One noisy gap must not move the rung.
3. Hold if fewer than **3** gaps have passed at the current rung.
4. Otherwise: `m̄ > 0.274` → step one rung toward Heaven. `m̄ < 0.123` → step one
   rung toward Hell. Between them is a dead band: hold.
5. Move **one rung at a time**, never `low` straight to `max`, and never to
   `zero` — Ultra clamps to `[low, max]`.
6. Then call `summon` for real at the rung you are on, `surface: "heaven"` for
   the human-led path and `surface: "hell"` for the model-led path.

**A `noMatch` says nothing about depth.** Reaching wider cannot summon a skill
that is not in the corpus, so a refused gap holds the rung — it never counts as
a reason to explore. Reading it as one is how a controller walks itself to
`max` on a curation gap.

**Announce every rung change in one line**, naming the smoothed margin, the
threshold it crossed, and the new rung. A controller nobody can interrogate is
one nobody will leave switched on.

The thresholds above are calibrated against the margins this index actually
produces, not guessed — but calibrated from the benchmark's gold set rather
than from real sessions, which skews them slightly toward confidence. No rung
carries a count and no summon is capped.

Honor source invocation metadata. Fleet skills with `disable-model-invocation: true` are human-led Skill Heaven skills; they require explicit human invocation and must not leak into the model-led Skill Hell path. Fleet skills without that flag are model-led and may self-invoke through Hell.

For each summon, show each returned card before using the skill. Read the `SKILL.md` at the card's path and apply relevant guidance to the current task. Resolve sibling files from that materialized directory. The card is the listing entry, not the skill body.

Never claim this changed the boot posture. The returned card discloses whether the source classified the skill as human-led, model-led, or unclassified.
