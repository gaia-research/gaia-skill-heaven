---
description: "Summon one skill into context for this session. Nothing is installed."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" summon '$ARGUMENTS'`

Print the block above **verbatim** inside a fenced code block.

If the block is a `⛔` refusal, print it and stop — do not call the `summon`
tool, and do not offer a way around the cut.

Otherwise, if the user named an intent, call the `summon` tool **once**, with
that intent as `query` and `limit: 1`. Then:

- Print the returned card **verbatim** before using anything from it. The card
  is the disclosure: it names the skill and carries the engine's own ranking
  disclosure with it.
- Read the `SKILL.md` at the card's path and follow it like any other skill.
  Resolve sibling `reference/` files and `scripts/` from that same directory.
  The card is the listing entry, not the skill body.
- If nothing could be summoned, print what the tool reported — including what it
  skipped and why — and stop. Do not invent a skill or retry with a reworded
  query.

This is one manual call and it arms nothing. It works at every rung, including
the floor. To automate the choosing instead: `/skill-heaven` (converge),
`/skill-hell` (explore), `/skill-ultra` (controller).

Never claim a summon changed the boot posture, and never present routing as
trust- or stamp-gated — Heaven/Hell stamps are not built.
