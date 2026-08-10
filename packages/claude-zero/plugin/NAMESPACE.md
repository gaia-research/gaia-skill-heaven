# Namespace observations for #30

Issue #30 asks whether `/skill-heaven:*` and `/skill-hell:*` can be two
separate plugin namespaces. Facts observed while building the `/skill-hell`
command surface (WP3), no recommendation.

## What is confirmed

- **The namespace prefix is the plugin's `name`, not the command's.** A
  command file `commands/<x>.md` inside a plugin is exposed as both bare
  `/<x>` and prefixed `/<plugin-name>:<x>`. This was probed directly on
  Claude Code 2.1.216 (F1, `packages/claude-heaven/README.md`: "plugin
  command admitted via `--plugin-dir`, invoked headlessly — ✅ works,
  namespaced `/<plugin>:<command>`"), and is pinned by a test in this repo
  (`plugin-command.test.ts`, gate (c)) that prices the SAME command under
  both `skill-heaven` and `claude-heaven:skill-heaven`.
- **Right now this repo ships one plugin, `claude-heaven`, with two command
  files** (`commands/skill-heaven.md`, `commands/skill-hell.md`). Both are
  namespaced under the one plugin name: `claude-heaven:skill-heaven` and
  `claude-heaven:skill-hell` — not `skill-heaven:*` / `skill-hell:*`.
  Nothing in the command-file format lets one command declare a different
  namespace than its sibling commands in the same plugin.
- **`.claude-plugin/marketplace.json`'s schema is an array of plugin
  entries** (`{ "plugins": [ { "name", "source", ... }, ... ] }`), each with
  its own `name` and its own `source` directory. This repo's marketplace.json
  already has that array shape; it currently holds one entry.

## What follows structurally, not yet verified live

- To get `/skill-heaven:*` and `/skill-hell:*` as **two distinct namespaces**,
  the prefix has to come from **two distinct plugin.json `name` fields** — one
  plugin literally named `skill-heaven`, one literally named `skill-hell`,
  each with its own `commands/` directory — registered as **two entries** in
  `marketplace.json`'s `plugins[]` array. Splitting commands within the
  current single `claude-heaven` plugin does not produce that split; only
  splitting the plugin itself does.
- **Not tested this session:** an actual two-plugin marketplace (two
  `plugin.json`s + two source directories registered together, installed and
  invoked). The fact above is inferred from the schema shape and the F1
  single-plugin probe, not from a live multi-plugin install. Whether a second
  plugin entry in the same marketplace installs and resolves commands
  cleanly alongside the first is an open cell, not a probed one.
