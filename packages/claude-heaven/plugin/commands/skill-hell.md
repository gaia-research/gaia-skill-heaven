---
description: "Arm additive skill summoning, or manually summon for a named capability gap."
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-hell.mjs" '$ARGUMENTS'`

Print the block above **verbatim** inside a fenced code block.

Then follow exactly one branch:

- **Chooser (`🔥 Skill Hell · …`)**: stop after the block. Do not choose a rung
  for the user.
- **Armed (`🔥 Skill Hell armed: …`)**: treat the displayed rung as a standing
  instruction for this conversation. Do not summon preemptively. When you hit a
  real capability gap, run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/render-hell.mjs" --summon-level <rung> "<gap>"`,
  print each returned card verbatim, inspect the on-disk `SKILL.md` linked by
  the card, and follow it. The lane remains armed after each arrival.
- **Card (`┌ summoned`)**: the whole skill directory is materialized at the
  card's path. Read `SKILL.md` there and follow it like any other skill; resolve
  sibling references and scripts from that directory. The card is the listing
  entry, not the skill body.
- **Refusal or failure**: print it and stop. Do not invent a skill, retry with a
  different query, or route around `UNRATIFIED`.

Never claim a card changed the boot posture. Hell is additive and works with or
without a Heaven launcher.
