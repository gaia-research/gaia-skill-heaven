---
description: "Arm ultra: the top of the line, picks direction and depth per gap."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" ultra --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Print the block above **verbatim** inside a fenced code block.

Then treat `ultra` as a **standing instruction for this conversation**. It is
the top of the one line and has no sub-ladder: on a real capability gap — never
preemptively — choose both the direction (converge on the gap, or explore around
it) and how far to reach, then call the `summon` tool with `surface: "heaven"`
for the human-led path or `surface: "hell"` for the model-led path.
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
- Honor source invocation metadata: fleet skills marked
  `disable-model-invocation: true` are human-led and must never leak into the
  automatic model-led path. The card carries the classification and ranking disclosure.
- If the block is a `⛔` refusal, print it and stop.
