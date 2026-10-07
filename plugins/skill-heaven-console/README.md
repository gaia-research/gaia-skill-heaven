# Skill Heaven console (preview)

An optional console for [Skill Heaven](https://github.com/gaia-research/gaia-skill-heaven) in Claude Code. It
shows what a summon returned, whether the skill body actually entered context, and what you are
trusting. It **observes**; it never changes a summon, refuses a tool call, or runs one on its own.
Skill Heaven works exactly the same without it.

> **Status: preview.** It is built on Claude Code's early-access Mods API (function hooks, first
> available in 2.1.293), which may change between releases. It has passed `claude plugin validate`
> and the engine's own test kit on both the terminal and desktop surfaces. **How it paints in a
> logged-in desktop session has not been probed yet** — treat the desktop look as unconfirmed.

## What it adds

| Surface | What you see |
|---|---|
| **Status entry** | `◇ entropy ‹‹ [NATIVE] ›› · 2 skills` beside your own status line. It is appended; your `statusLine` setting is never touched. |
| **Lens band** | Empty by default. After a summon it shows the result in two lines and whether the skill body was read (`card returned · body not read` or `in context · body read by main agent`). `Inspect` opens the pane, `Dismiss` hides it. It also hides on your next prompt. |
| **`/lens <intent>`** | Previews which skill would be summoned, with `preview: true`. Nothing is materialized; the summon engine still logs the query in its own session directory. The preview and its detail appear in the band, not in the conversation. For a single candidate the band offers `Summon`, which only **fills your prompt** with `/summon <name>` — you press Enter. If a summon tool ignores `preview` and materializes a skill, the band shows that real summon and the count includes it. |
| **`/heaven`** | A pane with four sections: **Session** (receipts, each field labelled observed, reported, inferred or unknown), **Scope** (what Skill Heaven can see, what is active, rung controls that pre-fill commands), **Flow** (agents the host reported and what each summoned) and **Trust** (what this plugin reads and writes). |

Selecting a rung (`/skill-heaven low`, `/skill-hell high`, `/skill-ultra`, `/skill-zero`) changes the
bracketed reading in the status entry. That reading is a preference you expressed and the console
saw; Skill Heaven does not enforce it. `/skill-ultra` reads `[ULTRA]`; the Ultra controller is provisioned, not built. The compact status entry shows only `[ULTRA]` and the skill count — *controller unavailable* is spelled out in `full` mode, in the Scope section and in the pane.

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
- **Writes:** nothing of its own to disk and nothing to your settings. State lives in the session only and is gone when it ends. (The summon engine keeps its own session directory, including for a `/lens` preview.)
- **Network:** none of its own. `/lens` calls the bundled summon tool, which fetches the skill source.
- **What the model can read:** the one-line result of `/lens` and `/heaven` is a row the model can see. It is fixed text and carries nothing a skill source, a tool error or a refusal supplied; all detail stays in the band and the pane.
- **Never:** rewrites or refuses a tool call, submits a prompt, or edits `~/.claude`. Buttons pre-fill a
  command for you to submit. All text that came from a skill source or a model is sanitized before it is drawn.

## Options

`status` (Settings, or `pluginConfigs` in `settings.json`): `off`, `compact` (default) or `full`.
`off` removes the status entry; the band and pane stay available.

## Disable or remove

```
/plugin disable skill-heaven-console
/plugin uninstall skill-heaven-console@gaia-skill-heaven
```

The status entry, band and pane disappear. Skill Heaven is unchanged.

## What is unconfirmed (needs a local probe)

- How the status entry, band and pane paint in a logged-in desktop session.
- Where the host puts an MCP tool's structured result on a `tool.call` result. The console reads
  `structuredContent` where the declarations allow it and falls back to the JSON text block the summon
  server also sends.
- Whether the host reports agent ids on every subagent tool call. Flow says so when it does not.
- Whether `/lens` can reach the summon tool by the marketplace name
  (`mcp__plugin_skill-heaven_skill-summon__summon`) or the launcher name (`mcp__skill-summon__summon`) in your install. Only those two exact names are treated as the summon tool; a tool is called absent only when the session's tool list does not name it.
- Whether `$.tool.list()` names tools the host defers behind tool search.

## Develop

```
node scripts/build-status.mjs                 # regenerate hooks/status-model.mjs from packages/status
claude plugin validate plugins/skill-heaven-console
claude plugin test plugins/skill-heaven-console
```

`hooks/status-model.mjs` is generated and committed; CI checks it against a fresh build. Do not edit it.
