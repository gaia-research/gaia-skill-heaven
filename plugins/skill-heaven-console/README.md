# Skill Heaven console (preview)

An optional console for [Skill Heaven](https://github.com/gaia-research/gaia-skill-heaven) in Claude Code. It
shows what a summon returned, whether the skill body actually entered context, and what you are
trusting. It **observes**; it never changes a summon, refuses a tool call, or runs one on its own.
Skill Heaven works exactly the same without it.

> **Status: preview.** It is built on Claude Code's early-access Mods API (function hooks, first
> available in 2.1.293), which may change between releases. It has passed `claude plugin validate`
> and the engine's own test kit on both the terminal and desktop surfaces, and a **live probe in a
> logged-in terminal session on 2.1.294** (below). **How it paints in the desktop app has not been
> probed** — treat the desktop look as unconfirmed.

## What it adds

| Surface | What you see |
|---|---|
| **Status entry** | `◇ entropy ‹‹ [NATIVE] ›› · 2 skills` beside your own status line. It is appended; your `statusLine` setting is never touched. **Dormant until you use Skill Heaven in the session**: nothing is shown, and the console observes nothing, until a summon, a rung command such as `/skill-hell high`, `/heaven` or `/lens`. `/clear` returns it to dormant. |
| **Lens band** | Empty by default. Only an explicit `/lens` opens it. Ordinary summon/read observations update compact status and receipt state, never open an unsolicited band. The requested band shows one short notice plus deliberate controls; Dismiss clears intent. |
| **`/lens <intent>`** | Previews which skill would be summoned, with `preview: true`. Nothing is materialized; the summon engine still logs the query in its own session directory. The preview and its detail appear in the band, not in the conversation. For a single candidate the band offers `Summon`, which only **fills your prompt** with `/skill-heaven:summon <name>` — you press Enter. If a summon tool ignores `preview` and materializes a skill, the band shows that real summon and the count includes it. |
| **`/heaven`** | A concise pane with Session, Scope, Flow and Trust. `Inspect section` or `/heaven inspect <section>` deliberately reveals evidence/diagnostics/controls. Section changes return to summary. Close/Escape or `/heaven dismiss` closes it; opening requests 12 rows through the supported host API. |

Selecting a rung (`/skill-heaven:skill-heaven low`, `/skill-heaven:skill-hell high`, `/skill-heaven:skill-ultra`, `/skill-heaven:skill-zero`) changes the
bracketed reading in the status entry. That reading is a preference you expressed and the console
saw; Skill Heaven does not enforce it. `/skill-ultra` reads `[ULTRA]`; the Ultra controller is provisioned, not built. The compact status entry shows only `[ULTRA]` and the skill count — *controller unavailable* is disclosed in inspected Scope and shared summaries, never an invented working controller.

## Install

Add the marketplace once, then install:

```
/plugin marketplace add gaia-research/gaia-skill-heaven
/plugin install skill-heaven-console@gaia-skill-heaven
```

It needs the `skill-heaven` plugin (or the `claude-zero` launcher) to have anything to observe; without
a summon tool the pane says `summon tool: not connected`.

A mod installed this way is a terminal action: a local session started from the desktop app loads a
user-scope install, but the install command itself is typed in a terminal session.

## What it reads and writes

- **Reads:** the results of the Skill Heaven summon tool, the `/skill-*` commands you submit, and
  `Read` and `Agent` tool calls — only to observe them.
- **Hooks:** one `SessionStart` command hook (`startup` and `clear`), visible in `claude plugin details` and `/hooks`. It runs `scripts/session-context.mjs`, which reads the one option below and prints one line. It reads no file, writes nothing and calls no network. Skill Heaven Core installs no hook at all.
- **Writes:** nothing of its own to disk and nothing to your settings. State lives in the session only and is gone when it ends. (The summon engine keeps its own session directory, including for a `/lens` preview.)
- **Network:** none of its own. `/lens` calls the bundled summon tool, which fetches the skill source.
- **What the model can read:** the one-line result of `/lens` and `/heaven` is a row the model can see. It is fixed text and carries nothing a skill source, a tool error or a refusal supplied; all detail stays in the band and the pane.
- **Never:** rewrites or refuses a tool call, submits a prompt, or edits `~/.claude`. Buttons pre-fill a
  command for you to submit. All text that came from a skill source or a model is sanitized before it is drawn.

## Options

`status` (Settings, or `pluginConfigs` in `settings.json`): `off`, `compact` (default) or `full`.
`off` removes the status entry; the band and pane stay available. Once the console is
awake, its persistent contribution is **one compact line maximum**, including when the legacy
`full` statusline option is selected; details belong in the deliberately opened pane.

`session_context`: `off` (default) or `on`. `on` adds one factual line to the model's context at the
start of a session (`startup` and `clear`; a resume or compaction already carries it), so the model
can see, with nothing typed, that the console is on and no rung is selected yet:

```
Skill Heaven console is on for this session (preview). No rung has been selected in this session yet. With the skill-heaven plugin installed, /summon adds one skill to this session; nothing is installed.
```

That is 203 characters, 50 tokens by the repo's `chars4` count, paid once per session as a *standing* dose; there is no
invocation dose. `off` pays 0: the hook still runs (it is installed) but prints nothing. The line states facts only. It
does not summon, grant permission, select a rung or keep any state, and the console still knows no rung until you
choose one. Turn it on with `claude plugin install skill-heaven-console@gaia-skill-heaven --config session_context=on` or
`/plugin configure skill-heaven-console@gaia-skill-heaven`. It is off by default because the console is dormant until used
(founder ruling, 2026-11-04) and an update must not start adding context to sessions that never summon.

Core + Console is a Skill Heaven terminal installation profile. It does not install or claim
the optional cross-product Gaia Ecosystem Desktop Mod / Living Tree B.

## Disable or remove

```
/plugin disable skill-heaven-console
/plugin uninstall skill-heaven-console@gaia-skill-heaven
```

The status entry, band, pane and the SessionStart hook disappear. Skill Heaven is unchanged. Claude Code keeps its
own uninstall residue (the marketplace entry and `plugins/cache`); no hook or `pluginConfigs` entry remains.

## What a live probe established (Claude Code 2.1.294, terminal)

PR #187, macOS, a logged-in session in a visible Herdr pane, both plugins loaded from the checkout
with `--plugin-dir` and a session-only `--settings` that supplied a user `statusLine`:

- **Status entry** renders under the prompt beside the user's own `statusLine`; neither replaces
  the other. The host draws it as `⚠ skill-heaven-console: ◇ entropy ‹‹ [NATIVE] ›› · 0 skills`;
  the `⚠ <plugin>:` prefix is the host's.
- **`/lens`** shows the band and leaves the count at `0 skills`. **`/skill-heaven:summon`** takes it
  to `1 skill`. A `Read` of the materialized `SKILL.md` moves the band from `card returned · body
  not read` to `in context · body read by main agent`.
- **Result shape:** an MCP tool's result reaches `tool.call` and `$.tool.call` as
  `{ ref, result, text }`, with `result` the server's JSON text as a **string**.
  `structuredContent` appears nowhere; the console reads the JSON text.
- **`$.tool.list()`** names deferred MCP tools (the summon tool is behind ToolSearch and is
  listed), but only once MCP has connected: at `session.start` it lists no MCP tool at all, so
  `/lens` re-checks for a few seconds before saying "not connected".
- **Agent ids** reach subagent calls: `tool.call` and `turn.complete` inside a subagent carry its
  `agentId`, and the Agent tool's result carries the same id. Flow attributes the subagent's summons
  to it.
- **Ordering:** for a typed slash command, `command.run` fires **before** `prompt.submit`, and
  `prompt.submit.text` is the raw typed text (`/skill-heaven:skill-hell high`), not the expanded
  body. A subagent's hand-back arrives as `prompt.submit` with `origin.kind: "peer"`; the console
  ignores it.
- **Bare spellings are refused:** `/skill-zero` or `/skill-hell high` resolves to the plugin's
  portable skill and the host says it "can only be invoked by Claude". Every console pre-fill uses
  `/skill-heaven:<surface>`.
- **Observe-only:** across the sessions, `~/.claude/settings.json`, `settings.local.json` and
  `installed_plugins.json` were byte-identical. `claude plugin validate` resolves the console's calls
  to `$.state`, `$.ui.*`, `$.prompt.fill`, `$.tool.list`/`call` (the `/lens` preview) and
  `$.command.register`: no file system, settings or process calls.

Still unconfirmed:

- How the status entry, band and pane paint in the **desktop app**. Probing it here would have
  meant a user-scope install, which writes the user's plugin registry, plus driving the desktop UI.
- Whether the host reports agent ids for every kind of agent (workflows and engine forks carry
  ids no list names).

## Develop

```
node scripts/build-status.mjs                 # regenerate hooks/status-model.mjs from packages/status
claude plugin validate plugins/skill-heaven-console
claude plugin test plugins/skill-heaven-console
```

`hooks/status-model.mjs` is generated and committed; CI checks it against a fresh build. Do not edit it.
