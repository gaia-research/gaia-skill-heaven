---
description: "Summon one skill into context for this session. Nothing is installed."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" summon --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Show the output above.

If the output is a `⛔` refusal, show it and stop — do not call the `summon`
tool.

Otherwise, if the user named an intent, call the `summon` tool once with
that intent as `query` and `surface: "any"`. Then:

- Show the returned card before using the summoned skill. The card is the
  listing entry and carries source classification and ranking disclosure.
- Read the `SKILL.md` at the card's path and resolve sibling files from the
  same directory. Apply relevant guidance from the skill to the current task,
  subject to the user's request and existing permissions.
- If nothing could be summoned, report what the tool reported and stop.

This is one manual call and sets no ongoing routing posture. It works at every
rung, including the floor, unless the zero cut is `all`.

Observe the card's invocation disclosure. Manual `/summon` may reach both
human-led Skill Heaven and model-led Skill Hell skills because the user invoked
it explicitly. Automatic callers must use `surface: "hell"` so human-led fleet
skills marked `disable-model-invocation: true` cannot self-invoke.

Never claim a summon changed the boot posture.
