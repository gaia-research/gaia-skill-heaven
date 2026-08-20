---
name: skill-zero
description: "Arm the zero rung: cut temporary automatic skills while manual summon remains available, or cut all skills."
disable-model-invocation: true
---

# Skill Zero

Arm `zero` as the standing rung for this conversation. A session sits at exactly one rung.

Print the seven-rung line, marking `zero` as armed:

```text
zero · low · med · high · xhigh · max · ultra
```

State that the default `temporary` cut means no temporary automatic summoning and manual `/summon` still works. If the user supplied the exact argument `all`, cut all skill summons, including manual `/summon`, and say so.

Already-loaded skills cannot be evicted mid-session. This instruction changes summoning behavior; it does not empty or restart the running session. Do not call the `summon` tool from this skill.

No rung carries a count and no summon is capped. Invocation metadata still distinguishes human-led Skill Heaven skills from model-led Skill Hell skills; zero changes whether either surface may summon, not the source classification.
