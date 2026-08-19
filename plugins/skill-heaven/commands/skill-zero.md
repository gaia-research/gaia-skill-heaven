---
description: "Cut automatic summoning to the floor; `all` cuts manual /summon too."
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" zero --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Print the block above **verbatim** inside a fenced code block, then stop.

Treat the armed rung in the block as a **standing instruction for this
conversation**: at `zero` you do not summon automatically. Manual `/summon` still
works unless the block says the cut is `all`, in which case do not call the
`summon` tool at all for the rest of this session.

Rules for this reply (they are the product's claim discipline, not style
preferences):

- Do not reword, summarise, re-order, translate or "improve" the block. Its
  wording is reviewed copy; every hedge in it is load-bearing.
- Do not add posture, token or savings numbers of your own. The only numbers
  allowed here are the ones the block already contains.
- Do not offer to run any of the `→` commands, and do not run them. Nothing can
  restart Claude Code from inside a session — the user runs them.
- Do not claim the cut emptied the session. Already-loaded skills cannot be
  evicted mid-session (D12); this ladder rung governs what gets summoned in.
- If the block is a `⛔` refusal, print the refusal and nothing else. Do not
  route around a refusal.
- Answer follow-up questions from the block plus what you can verify. If the
  answer is not in it, say so rather than filling the gap.
