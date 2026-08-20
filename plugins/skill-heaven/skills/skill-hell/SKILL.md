---
name: skill-hell
description: Arm the model-led explore band at high, xhigh, or max. User-invoked orchestrator for automatic Skill Hell routing.
disable-model-invocation: true
---

# Skill Hell

Arm `high` by default, or `xhigh`/`max` when the user explicitly requests one, as the standing rung for this conversation. Reject no rung. A session sits at exactly one rung.

Print the seven-rung line and mark the selected rung as armed:

```text
zero · low · med · high · xhigh · max · ultra
```

Treat this as a standing instruction: on a real capability gap—never preemptively—explore widely and call the `summon` tool with `surface: "hell"` and a depth you judge the gap needs. No rung carries a count and no summon is capped.

Skill Hell is the model-led surface. Only model-invokable or unclassified tree skills may be reached automatically. A fleet skill marked `disable-model-invocation: true` is human-led and must be excluded even when it scores highest.

For every summon, print each returned card **verbatim** before using anything from it, read the `SKILL.md` at the card's path, and follow it. Resolve sibling files from that materialized directory. The card is the listing entry, not the skill body. The lane stays armed.

Never claim this changed the boot posture. The returned card must disclose whether the source classified the skill as human-led, model-led, or unclassified.
