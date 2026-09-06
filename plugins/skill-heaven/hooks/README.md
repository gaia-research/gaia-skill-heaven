# `hooks/` — the Claude Code runtime shim

Six hooks that make a rung *behave*. Plan:
[`docs/plans/hooks-runtime-mini-plan.md`](../../../docs/plans/hooks-runtime-mini-plan.md).
Tracking issue: #123.

| Event | File | Job | Degraded state |
|---|---|---|---|
| `SessionStart` | `session-start.mjs` | rung, zero cut and skill source as `additionalContext` | emit nothing |
| `UserPromptSubmit` | `user-prompt-submit.mjs` | arm the rung from a rung command · re-inject the compaction carry-over · (opt-in) remind the session to summon on a gap | manual `/summon` only |
| `PreToolUse` | `pre-tool-use.mjs` | `zero_cuts: all` becomes an actual refusal (exit 2) | posture stays advisory |
| `PostToolUse` | `post-tool-use.mjs` | observed summon receipt for `skill-cost` | no receipts |
| `PreCompact` | `pre-compact.mjs` | snapshot the entropy reading before it is discarded | cards lost on compact |
| `SessionEnd` | `session-end.mjs` | session roll-up, drop per-session state | nothing flushed |

All six are matched and dispatched by `hooks.json`, which Claude Code loads when
the plugin is enabled and **merges** with user and project hooks rather than
replacing them.

## Four things not to break

**This is a Claude-door capability, not a portable one.** Hooks are outside
[Agent Plugins spec 1.0.0](https://agent-plugins.org/specification) — a
conforming client skips the namespace it does not implement. `hooks/` therefore
rides along inertly in the portable package and **nothing here may become
load-bearing for it**. The logic that matters belongs in `packages/core` and the
summon MCP; this directory is an activation shim.

**P3 — never mutate shared state.** Every write goes under
`${CLAUDE_PLUGIN_DATA}` (or a temp dir when the harness exports none). Nothing
here writes `~/.claude`, the user's settings, the user's skills, or the project
tree. A write that cannot land is silently skipped: no hook may break a session
because a disk write failed.

**#85 — the injection boundary.** `user-prompt-submit.mjs` emits
**plugin-authored text only**. It does not inject a ranked candidate card, a
skill body, or any other remote catalogue content, because that would move
untrusted text into context without the user asking. The card stays behind an
explicit tool call the model makes and shows, where its disclosure travels with
it. Automatic summoning is off unless `auto_summon` is turned on.

**M0 — this is version-sensitive.** Rung arming depends on `UserPromptSubmit`
seeing the raw prompt, and `PreCompact` carries no `additionalContext` (hence
the on-disk carry-over). Re-probe on every Claude Code upgrade, the same
discipline as `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`.

## Rung resolution

Most specific source wins: `SKILL_HEAVEN_RUNG` → persisted session state (armed
by a rung command) → the `claude-zero` launch manifest posture → the floor.
Every step degrades to the floor rather than guessing.

## Receipts

`${CLAUDE_PLUGIN_DATA}/receipts.jsonl`, one JSON object per line. A receipt
records shape and provenance — rung, surface, resolved skill, query **length and
truncated digest**, never the query text. `routing: "relevance"` is written into
every record so no reader can mistake a receipt for evidence of stamped routing.
These are observed by the harness, not self-reported by the model, which is what
makes them admissible; pricing is still `gaia-research/skill-cost`'s job.
