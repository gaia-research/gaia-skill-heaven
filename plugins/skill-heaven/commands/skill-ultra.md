---
description: "Arm ultra: the top of the line, picks direction and depth per gap."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" ultra --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Show the output above.

This session's routing posture is Skill Ultra. Ultra sits at the top of the
line: on a capability gap, choose the direction (converge via heaven, or
explore via hell) and depth appropriate to the gap, then call the `summon`
tool with `surface: "heaven"` for human-led routing or `surface: "hell"` for
model-led routing. Show each returned card before using the skill. Read the
SKILL.md at the card's path and resolve sibling files from the same directory.
Apply relevant guidance from summoned skills to the current task.

State your choice concisely before each summon — direction, depth, and rationale.

Honor source invocation metadata: fleet skills marked
`disable-model-invocation: true` are human-led and excluded from the
automatic model-led path. The card carries the classification.

If the output is a `⛔` refusal, show it and stop.
