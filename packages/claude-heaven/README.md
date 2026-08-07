# claude-heaven

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The Claude Code door to Skill Heaven. The marketplace plugin requires the
external `@gaia-research/mcp >= 0.2.0` summon engine for `/skill-hell`.

## Install

```bash
claude plugin marketplace add gaia-research/skill-heaven
claude plugin install claude-heaven@skill-heaven
npm install -g @gaia-research/mcp@^0.2.0
```

The marketplace install contains the two commands, not the launcher or a Claude
Code harness. Use the source-checkout path in the root README for the launcher.

## Launch

```bash
claude-heaven                                  # off/product-floor (default)
claude-heaven --level native                   # Claude untouched
claude-heaven --level low --skill ./my-skill  # curated clean room
claude-heaven --print                          # inspect; do not spawn
claude-heaven -- --model sonnet                # pass through after --
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the single
canonical rung description and policy status. `--posture` remains supported for
benchmark and compatibility use. The doorless benchmark `floor` is still
refused by this door because slash commands do not exist there (F6).

Every write is session-scoped: the launcher materializes core's plan, profile
manifest, and statusline settings in a disposable temp directory. It never
edits `~/.claude`, project skills, or source skill directories (P3).

## `/skill-heaven`: the ladder chooser

`/skill-heaven` now shows `off · low · med · high · xhigh · max · ultra`, marks
the current/default rung, and makes permitted upward choices actionable.
Downward choices remain visibly locked by D12 and include the exact relaunch
command. `med…max` remain locked by P2; `ultra` is separately labeled
unratified.

Claude cannot natively load a skill into a running session. This was checked
against Claude Code 2.1.224's exposed command surface in visible probe pane
`w8:p0` (2026-08-07): `--help` exposes boot-time skill/plugin/settings controls
and resume, but no load/reload skill command. Therefore the chooser emits exact
`claude-heaven --level …` launch commands and says they start a new session; it
does not fake an in-session move. `/skill-hell`'s Claude hand-off remains body
injection into context, not native resource discovery.

The renderer is zero-dependency `.mjs`, because a marketplace-installed plugin
has no adjacent `node_modules`. Its ladder and gate lists are generated from
core into `plugin/data/p2-gate.json` and freshness-tested.

## Standing-dose disclosure

The statusline and chooser read the launcher manifest. Native census coverage is
user + project skills and explicitly excludes bundled/plugin skills. Session
scope explicitly discloses the bundled `doctor` residual. Standing and
invocation doses remain separate.

## Policy boundaries

- `med|high|xhigh|max`: hard refusal, P2 policy gate.
- `ultra`: hard refusal because it has no ratified product mapping, not because
  of P2.
- `floor`: benchmark-only, doorless posture.
- `native`: always available explicitly with `--level native`.

Evidence for the pinned compositions remains in core compiler notes and the
probe material referenced from [Core and Quirks](../../docs/CORE-AND-QUIRKS.md).
