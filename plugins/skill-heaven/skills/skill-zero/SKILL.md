---
name: skill-zero
description: "Arm the zero rung: cut temporary automatic skills while manual summon remains available, or cut all skills."
disable-model-invocation: true
---

# Skill Zero

Set the routing posture to `zero`. A session sits at exactly one rung.

```text
zero · low · med · high · xhigh · max · ultra
```

The default `temporary` cut means temporary automatic summoning is cut while manual `/summon` remains available. If the user explicitly requested the `all` cut, all skill summons, including manual `/summon`, are cut.

Already-loaded skills cannot be evicted mid-session. This setting changes summoning routing; it does not empty or restart the running session. Do not call the `summon` tool from this skill.

No rung carries a count and no summon is capped. Invocation metadata still distinguishes human-led Skill Heaven skills from model-led Skill Hell skills; zero changes whether either surface may summon, not the source classification.
