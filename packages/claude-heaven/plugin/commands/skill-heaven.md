---
description: "Show Skill Heaven postures: where this session sits, what it costs, how to move it."
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-posture.mjs" '$ARGUMENTS'`

Print the block above **verbatim** inside a fenced code block, then stop.

Rules for this reply (they are the product's claim discipline, not style
preferences):

- Do not reword, summarise, re-order, translate or "improve" the block. Its
  wording is reviewed copy; every hedge in it is load-bearing.
- Do not add posture, token or savings numbers of your own. The only numbers
  allowed here are the ones the block already contains.
- Do not offer to run any of the `→` commands, and do not run them. Nothing can
  restart Claude Code from inside a session — the user runs them.
- If the block is a `⛔` refusal, print the refusal and nothing else. Do not
  explain how the gated posture might be reached anyway.
- Answer follow-up questions from the block plus what you can verify. If the
  answer is not in it, say so rather than filling the gap.
