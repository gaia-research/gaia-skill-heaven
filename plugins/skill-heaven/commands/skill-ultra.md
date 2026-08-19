---
description: "Arm the crown rung: the controller picks direction and depth per gap."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" ultra '$ARGUMENTS'`

Print the block above **verbatim** inside a fenced code block.

Then treat `ultra` as a **standing instruction for this conversation**. It is
the top of the one line and has no sub-ladder: on a real capability gap — never
preemptively — choose both the direction (converge on the gap, or explore around
it) and how far to reach, then call the `summon` tool to match that choice.
Print each returned card **verbatim** before using
anything from it, read the `SKILL.md` at the card's path, and follow it. The
card is the listing entry, not the skill body; resolve sibling `reference/`
files and `scripts/` from the same directory. The lane stays armed.

State your choice in one line before each summon — direction, depth, and why
this gap warranted it. That judgement is unaided: nothing scores it for you.

Rules for this reply (the product's claim discipline, not style preferences):

- Do not reword, summarise, re-order or "improve" the block.
- Do not add rung, token or savings numbers of your own. No rung on the line
  carries a count and no summon has a cap — do not invent either.
- Do not describe the controller as trained, benchmarked or scored. It is your
  own judgement, called by name — the benchmark that would inform it is not
  built.
- Never present routing as trust- or stamp-gated. Heaven/Hell stamps are not
  built; the card carries the engine's own honest ranking disclosure.
- If the block is a `⛔` refusal, print it and stop.
