---
name: skill-zero
description: "Arm the zero rung: no automatic summoning while manual summon remains available. Use when the user invokes Skill Zero or wants the product floor."
---

# Skill Zero

Arm `zero` as the standing rung for this conversation. A session sits at exactly one rung.

Print the seven-rung line, marking `zero` as armed:

```text
zero · low · med · high · xhigh · max · ultra
```

State that `zero` means no automatic summoning and manual `/summon` still works. If the user supplied the exact argument `all`, cut manual summon too and say so.

Already-loaded skills cannot be evicted mid-session. This instruction changes summoning behavior; it does not empty or restart the running session. Do not call the `summon` tool from this skill.

No rung carries a count, no summon is capped, and no rung is gated or unratified. Heaven/Hell stamps are not built.
