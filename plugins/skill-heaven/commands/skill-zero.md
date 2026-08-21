---
description: "Zero cuts temporary skills by default; `all` cuts every skill summon."
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" zero --intent-stdin <<'SKILL_HEAVEN_ARGS_EOF'
$ARGUMENTS
SKILL_HEAVEN_ARGS_EOF`

Show the output above, then stop.

This session's routing is set to the zero rung. Temporary automatic skills
are cut. Manual `/summon` remains available unless the output indicates all
skills are cut, in which case do not call the `summon` tool for the rest of
this session.

Already-loaded skills cannot be evicted mid-session (D12). A genuinely clean
start requires a boot-time decision: `claude-zero --level zero`.

If the output is a `⛔` refusal, show it and stop.
