---
name: skill-ultra
description: Arm the ultra crown rung, choosing human-led convergence or model-led exploration and depth per capability gap.
disable-model-invocation: true
---

# Skill Ultra

Arm `ultra` as the standing rung for this conversation. Ultra is the crown rung, not a separate ladder, and it never refuses. A session sits at exactly one rung.

Print the seven-rung line, marking `ultra` as armed:

```text
zero · low · med · high · xhigh · max · ultra
```

Treat this as a standing instruction: on a real capability gap—never preemptively—choose whether to converge or explore and how far to reach, then call the `summon` tool at the depth you judge the gap needs. Pass `surface: "heaven"` for the human-led path and `surface: "hell"` for the model-led path. Ultra's controller heuristics are unaided today. No rung carries a count and no summon is capped.

Honor source invocation metadata. Fleet skills with `disable-model-invocation: true` are human-led Skill Heaven skills; they require the user's explicit authorization and must not leak into the model-led Skill Hell path. Fleet skills without that flag are model-led and may self-invoke through Hell.

For every summon, print each returned card **verbatim** before using anything from it, read the `SKILL.md` at the card's path, and follow it. Resolve sibling files from that materialized directory. The card is the listing entry, not the skill body. The lane stays armed.

Never claim this changed the boot posture. The returned card must disclose whether the source classified the skill as human-led, model-led, or unclassified.
