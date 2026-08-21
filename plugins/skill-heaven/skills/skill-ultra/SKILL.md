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

On a capability gap, choose whether to converge or explore and how far to reach, then call the `summon` tool at the depth appropriate to the gap. Pass `surface: "heaven"` for the human-led path and `surface: "hell"` for the model-led path. Ultra's controller heuristics are unaided today. No rung carries a count and no summon is capped.

Honor source invocation metadata. Fleet skills with `disable-model-invocation: true` are human-led Skill Heaven skills; they require explicit human invocation and must not leak into the model-led Skill Hell path. Fleet skills without that flag are model-led and may self-invoke through Hell.

For each summon, show each returned card before using the skill. Read the `SKILL.md` at the card's path and apply relevant guidance to the current task. Resolve sibling files from that materialized directory. The card is the listing entry, not the skill body.

Never claim this changed the boot posture. The returned card discloses whether the source classified the skill as human-led, model-led, or unclassified.
