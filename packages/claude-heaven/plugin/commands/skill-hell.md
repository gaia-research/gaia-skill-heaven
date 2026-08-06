---
description: "Summon a skill from the live Gaia registry into this session — the Skill Hell prototype adds context on demand instead of subtracting it."
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-hell.mjs" '$ARGUMENTS'`

Print the block above **verbatim** inside a fenced code block. If it starts
with `  summoned`, the fenced block ends with a full `SKILL.md` body — treat
that skill as now loaded for the rest of this conversation: read it and
follow it like any other skill, exactly as written, with no summary or
rewording.

Rules for this reply:

- Do not reword, summarise, truncate or "improve" the summoned SKILL.md body.
  It is the skill's real content, not a description of it — that is what
  makes it genuinely in context.
- If the block reports no match, a missing engine, or a fetch failure, print
  that message and stop. Do not invent a skill, guess at what might have
  matched, or retry with a different query on your own.
- Do not claim the summoned skill is "installed" or persists beyond this
  session. It is materialized into a session-locked temp directory and
  disappears when the session ends (see gaia-mcp's docs/SKILL-HELL.md).
- Do not offer to run this command again or chain further summons unless the
  user asks.
