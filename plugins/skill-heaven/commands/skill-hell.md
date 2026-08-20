---
description: "Arm explore: auto-summon widely per capability gap (high|xhigh|max)."
allowed-tools: Bash(node:*), mcp__skill-summon__summon
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" hell --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Print the block above **verbatim** inside a fenced code block.

Then treat the armed rung as a **standing instruction for this conversation**
and follow the auto-summon protocol the block states, exactly as written: on a
real capability gap — never preemptively — call the `summon` tool with
`surface: "hell"`, print each
returned card **verbatim** before using anything from it, read the `SKILL.md` at
the card's path, and follow it. The card is the listing entry, not the skill
body; resolve sibling `reference/` files and `scripts/` from the same directory.
The lane stays armed after each arrival.

Explore is the same summon as converge, pointed the other way: more experts in
context, better until it isn't. It is not a different mechanic and not a
different tool.

Rules for this reply (the product's claim discipline, not style preferences):

- Do not reword, summarise, re-order or "improve" the block. Its wording is
  reviewed copy; every hedge in it is load-bearing.
- Do not add rung, token or savings numbers of your own. No rung has a count
  and no summon has a cap — do not invent either, in copy or in a tool call.
- How far to reach on a given gap is your call within the armed direction.
  Never summon just to demonstrate that you can.
- Never claim a summon changed the boot posture. The line is additive; it works
  with or without a launcher.
- This is the model-led surface. Automatic routing must exclude fleet skills
  marked `disable-model-invocation: true`, even when they score highest. The
  card carries the source classification and ranking disclosure.
- If the block is a `⛔` refusal or a `↗` redirect, print it and stop.
