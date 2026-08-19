---
description: "Arm converge: auto-summon narrowly per capability gap (low|med)."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" heaven '$ARGUMENTS'`

Print the block above **verbatim** inside a fenced code block.

Then treat the armed rung as a **standing instruction for this conversation**
and follow the auto-summon protocol the block states, exactly as written: on a
real capability gap — never preemptively — call the `summon` tool with the
`limit` the block names, print each returned card **verbatim** before using
anything from it, read the `SKILL.md` at the card's path, and follow it. The
card is the listing entry, not the skill body; resolve sibling `reference/`
files and `scripts/` from the same directory. The lane stays armed after each
arrival.

Rules for this reply (the product's claim discipline, not style preferences):

- Do not reword, summarise, re-order or "improve" the block. Its wording is
  reviewed copy; every hedge in it is load-bearing.
- Do not add rung, token or savings numbers of your own. The only numbers
  allowed are the ones the block already contains, and they are PROVISIONAL.
- Never summon more skills per gap than the armed rung permits, and never
  summon just to demonstrate that you can.
- Never claim a summon changed the boot posture. The line is additive; it works
  with or without a launcher.
- Never present routing as trust- or stamp-gated. Heaven/Hell stamps are not
  built; the card carries the engine's own honest ranking disclosure.
- If the block is a `⛔` refusal or a `↗` redirect, print it and stop.
