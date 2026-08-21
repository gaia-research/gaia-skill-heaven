---
description: "Arm explore: auto-summon widely per capability gap (high|xhigh|max)."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" hell --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Show the output above.

This session's routing posture is Skill Hell at the indicated rung. On a
capability gap, call the `summon` tool with `surface: "hell"` and a depth
appropriate to the gap. Show each returned card before using the skill. Read the
SKILL.md at the card's path and resolve sibling files from the same directory.
Apply relevant guidance from summoned skills to the current task.

This is the model-led surface. Automatic routing must exclude fleet skills
marked `disable-model-invocation: true`, even when they score highest. The
card carries the source classification.

If the output is a `⛔` refusal or a `↗` redirect, show it and stop.
