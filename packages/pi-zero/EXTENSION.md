# pi-zero extension design (#31)

Evidence below is from the installed `@earendil-works/pi-coding-agent` 0.83.0 API,
its type declarations, and its shipped extension examples. It is version-specific:
re-check these findings when pi is upgraded.

## Delivery model

`pi-zero` is both a launcher and an extension.

- The launcher owns boot-time posture composition. It writes a disposable launch
  manifest, exports its path as `PI_ZERO_PROFILE`, and adds the bundled
  extension with `--extension`. Subtractive posture changes remain boot-only.
- The extension owns in-session presentation and additive summoning. It registers
  `/skill-zero` and `/skill-hell` without editing user or project pi state.
- A user who does not use the launcher can load the extension directly. In that
  case `/skill-zero` names the exact launcher command and says it changed
  nothing; `/skill-hell` remains useful because Hell needs only the extension.

This split follows pi's native resource model instead of pretending a command can
recompose a running process. The launcher is the posture boundary; the extension
is the live-session door.

## Posture handoff

The launcher writes a versioned JSON manifest inside its `mkdtemp` session
directory. The manifest records the posture, composed argv, admitted skill count,
and the compiler's notes verbatim. It then passes only the manifest path through
`PI_ZERO_PROFILE`.

The extension validates and reads that file for `/skill-zero`. The compiler
notes are the capability disclosure: the command does not paraphrase them or
turn cwd/date/version-specific evidence into a broader claim. The session temp
directory is removed only after pi exits, so the manifest remains readable for
the life of the launched process and no shared configuration is mutated.

## Output and model context

`registerCommand` handlers receive `ExtensionCommandContext`. `ctx.ui.notify()`
can show notifications, including strings containing newlines, but it is not a
durable transcript surface. Pi's extension API also exposes:

- `pi.sendMessage(...)`: appends a displayed custom message that participates in
  subsequent model context; a registered message renderer can present multi-line
  text durably in the TUI.
- `pi.appendEntry(...)`: durable TUI-only/session state, excluded from model
  context.
- `ctx.ui.custom(...)`: temporary custom TUI components, not the right primitive
  for lasting command output.

Accordingly the commands append rendered transcript entries for durable output.
`/skill-hell` sends a non-displayed **card** containing identity, published trust
fields, paired install timing/cache state, file count, path, and inspect link.
It never pastes the full body. A persistent widget keeps the card visible across
the resource reload.

## Mid-session skill loading

Pi 0.83.0 supports additive skill discovery in a running session, although there
is no single `registerSkill()` method:

1. `resources_discover` handlers may return `skillPaths`.
2. command-only `ctx.reload()` reloads extensions, skills, prompts, themes, and
   context files.
3. `pi.appendEntry()` persists the materialized skill path across that reload.

`/skill-hell` can therefore persist the winner directory, reload, and have the
new extension instance return `<winner.path>/SKILL.md` from
`resources_discover`. Pi's own shipped `dynamic-resources` example supplies a
`SKILL.md` file this way, and `loadSkills` explicitly accepts files or
directories. Source inspection also shows extension-contributed paths are
extended after the initial `--no-skills` set is built, preserving the intended
upward-only behavior even from a floor launch.

A card-only probe (2026-08-07, visible pane `w8:p14`, model
`openai-codex/gpt-5.6-luna:low`) summoned a two-file canary, showed
`wp16-card-probe` in pi's native skill list after reload, read its sibling
`reference/proof.txt`, and returned exactly `CARD_ONLY_OK:7319`. The body was
not sent as a custom message. This licenses card-only output on pi: native
resource reload makes the skill usable while the whole directory preserves
relative references and scripts.

This is additive only. The extension offers no mid-session path for removing
ambient skills or descending to a cleaner posture.

## Difference from Claude Code

Claude Code plugins declare commands as markdown files whose shell command prints
text. Claude has no native mid-session resource reload; its card acts as a
listing entry and tells the agent to read the materialized directory. A matching
card-only probe succeeded there too (pane `w8:p13`).

Pi loads executable TypeScript extensions. They register commands directly,
render durable custom messages, inject those messages into model context, persist
extension state, contribute resource paths, and request a resource reload. That
richer surface makes native additive skill loading possible after summon. It
does not erase the launcher boundary: boot flags still determine what was
suppressed before the session started.
