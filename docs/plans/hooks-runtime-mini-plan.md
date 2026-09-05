# Mini plan — Claude Code hooks as the Skill Heaven runtime

**Status:** proposal · **Lane:** S (Steering, #119), with a receipt into E
**Depends on:** nothing in Arbor (#118) or the HH Index (`gaia-research#207`)
**Date:** 2026-09-05

## The gap this closes

Today the plugin ships four commands and one MCP. Every rung above `zero` is a
posture the *user* has to remember to act on: the ladder is real, but nothing in
a session reads it except a slash command the user types. That is why the
statusline and the zero-default launcher still live in the `claude-zero` source
checkout and not in the marketplace install — there was no in-session mechanism
to carry rung state.

Claude Code hooks are that mechanism, and they are shippable inside the plugin
package itself. A plugin may carry `hooks/hooks.json` at its root, resolved
against `${CLAUDE_PLUGIN_ROOT}`, loaded when the plugin is enabled and merged
with (never replacing) user and project hooks.

This lands **before** Arbor consumption and Heaven/Hell stamping, and does not
pre-empt either: every hook below runs on relevance ranking and rung state that
exist in the repo today, and each has an honest degraded state.

## Portability determination (this is a Claude-door capability, not a universal one)

| Surface | Hooks? |
|---|---|
| Claude Code plugin (`.claude-plugin/marketplace.json`, this repo) | **Yes** — `hooks/hooks.json` at plugin root, `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` placeholders |
| Agent Plugins spec 1.0.0 (`agent-plugins.org`, issue #77) | **No** — hooks are explicitly outside v1; they sit in a client namespace directory that a conforming client must skip unless it implements that namespace |

So this work is a **door-local capability behind a portable core**, exactly the
shape `harness-door-pattern` already describes. The logic belongs in
`packages/core` / the MCP; `hooks.json` is a thin per-harness activation shim,
and other doors get the same behavior through whatever their harness offers (or
degrade to manual `/summon`, which is the current state everywhere). Nothing in
this plan may become load-bearing for the universal package.

## Six hooks, in priority order

| # | Event | What it does | Degraded state |
|---|---|---|---|
| 1 | `SessionStart` | Emits the current rung, zero-cut posture and skill source as `additionalContext`, so the session *knows* where it sits on the line from turn one. This is the statusline's job, finally inside the marketplace install. | omit — session behaves exactly as today |
| 2 | `UserPromptSubmit` | The one that matters. At rungs above `zero`, inspects the prompt for a capability gap and injects a ranked candidate card. This is what turns `/summon` from a command the user must remember into gap-driven routing — the mechanism Lane S's controller currently lacks. | inject nothing; `/summon` stays manual |
| 3 | `PreToolUse` (`if` filter on the summon tool) | Enforces `zero_cuts` mechanically. Today `"all"` is a documented posture the model is asked to respect; exit 2 makes it an actual refusal. | posture stays advisory, as today |
| 4 | `PostToolUse` (matcher on the summon tool) | Appends a summon receipt to `${CLAUDE_PLUGIN_DATA}` — observed, not self-reported. Feeds Lane E and the existing local telemetry export (#102). | no receipts written |
| 5 | `PreCompact` | Preserves the session's summoned cards across compaction so the entropy reading survives a compact. | cards lost on compact, as today |
| 6 | `SessionEnd` | Flushes the session ledger for the cost pipeline. | nothing flushed |

Hooks 1, 3 and 4 are mechanical and independently landable. Hook 2 is the
research surface and should ship behind an off-by-default `userConfig` toggle
until the entropy curve says what it costs.

## Constraints this must respect

- **P3 — never mutate shared state.** `hooks/hooks.json` ships *inside the
  plugin*; it is merged by Claude Code at load time. Nothing writes to the
  user's `~/.claude`, settings, or skills. Writes go to `${CLAUDE_PLUGIN_DATA}`
  only.
- **#85 — prompt-injection.** Hook 2 widens the injection surface: it moves
  remote catalogue text into context *without the user asking for it*. Injected
  text must reuse the card's existing disclosure framing and must never be
  presented as authoritative instruction. #85 is a blocker for hook 2, not for
  1/3/4/5/6.
- **No stamps.** Nothing here reads or implies a Heaven/Hell stamp. Routing
  stays relevance ranking with the disclosure already shipped.
- **M0.** `hooks/hooks.json` behavior is version-sensitive; pin the Claude Code
  version probed and re-verify on upgrade, same discipline as
  `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`.

## Exit criteria

One real session in which (a) the rung is visible to the model without the user
typing anything, (b) `zero_cuts: all` actually refuses a summon, and (c) a
receipt for that session exists on disk that `skill-cost` can price. Hook 2 is
measured separately, against the entropy curve, and is not required for done.

---

## What shipped (implementation notes)

All six hooks are implemented in `plugins/skill-heaven/hooks/`, dispatched by
`hooks/hooks.json`, covered by `test/hooks.test.ts` (19 cases). Three decisions
made during implementation are worth recording because they differ from the plan
above:

1. **Hook 2 injects no catalogue content at all.** The plan said "inject a ranked
   candidate card"; #85 makes that the wrong first step. The shipped hook emits
   only plugin-authored text naming the armed rung and the tool. The card stays
   behind an explicit tool call the model makes and shows, where its disclosure
   travels with it. Ranked-card injection is deferred until #85 is resolved, and
   automatic summoning is off unless `auto_summon` is set to `on`.
2. **`PreCompact` carries no `additionalContext`**, so hook 5 writes a durable
   snapshot and the next `UserPromptSubmit` re-injects it exactly once.
3. **Rung arming had to be built.** The rung commands render text; nothing
   persisted where a session sat, so no other hook could resolve a rung.
   `UserPromptSubmit` now records a rung command into session state. This is the
   most version-sensitive part of the change — it depends on the hook seeing the
   raw prompt — and resolution falls back to the launcher manifest and then the
   floor when it does not fire.

**Not done, deliberately:** no probe against a pinned Claude Code version yet.
Until that runs, this is code with unit coverage, not an M0 finding — the exit
criteria above are not met.
