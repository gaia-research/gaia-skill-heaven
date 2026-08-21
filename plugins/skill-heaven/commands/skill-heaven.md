---
description: "Arm converge: auto-summon narrowly per capability gap (low|med)."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" heaven --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Show the output above.

This session's routing posture is Skill Heaven at the indicated rung. On a
capability gap, call the `summon` tool with `surface: "heaven"` and a depth
appropriate to the gap. Show each returned card before using the skill. Read the
SKILL.md at the card's path and resolve sibling files from the same directory.
Apply relevant guidance from summoned skills to the current task.

This is the human-led surface. Fleet skills marked
`disable-model-invocation: true` belong here and are excluded from automatic
model-led routing. The card carries the source classification.

If the output is a `⛔` refusal or a `↗` redirect, show it and stop.
