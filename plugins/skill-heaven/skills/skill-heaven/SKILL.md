---
name: skill-heaven
description: Arm the human-led converge band at low or med. User-invoked orchestrator for explicit Skill Heaven routing.
disable-model-invocation: true
---

# Skill Heaven

Arm the `low` rung by default, or `med` when the user explicitly requests it, as the standing rung for this conversation. Reject neither rung. A session sits at exactly one rung.

Print the seven-rung line and mark the selected rung as armed:

```text
zero · low · med · high · xhigh · max · ultra
```

Treat this user invocation as standing authorization: on a real capability gap—never preemptively—converge narrowly and call the `summon` tool with `surface: "heaven"` and a depth you judge the gap needs. No rung carries a count and no summon is capped.

Skill Heaven is the human-led surface. A fleet skill marked `disable-model-invocation: true` belongs here and must never be reached by an unprompted model-led summon. The user's invocation of this orchestrator is explicit authorization; it does not make that skill globally self-invokable.

For every summon, print each returned card **verbatim** before using anything from it, read the `SKILL.md` at the card's path, and follow it. Resolve sibling files from that materialized directory. The card is the listing entry, not the skill body. The lane stays armed.

Never claim this changed the boot posture. The returned card must disclose whether the source classified the skill as human-led, model-led, or unclassified.
