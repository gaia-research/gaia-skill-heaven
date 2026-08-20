# Namespace observations for #30 and Agent Plugins 1.0.0

Agent Plugins extension namespaces are a different concept from slash-command
prefixes. The portable manifest uses `dev.skill-heaven.pi` for the Pi delivery
adapter: the namespace is owned by `skill-heaven.dev`, its top-level directory
has the exact same name, and other clients can ignore it. We do **not** claim an
official Pi-owned namespace; Pi 0.84.2 has not published Agent Plugin extension
semantics and is not listed as a conformant client. Claude compatibility stays
in its legacy locations until the client documents or proves an official
reverse-DNS namespace — issue #77 explicitly forbids guessing it.

Issue #30 asks whether `/skill-zero:*` and `/skill-hell:*` can be two
separate plugin namespaces. Facts observed while building the `/skill-hell`
command surface (WP3), no recommendation.

## What is confirmed

- **The namespace prefix is the plugin's `name`, not the command's.** A
  command file `commands/<x>.md` inside a plugin is exposed as both bare
  `/<x>` and prefixed `/<plugin-name>:<x>`. This was probed directly on
  Claude Code 2.1.216 (F1, `packages/claude-zero/README.md`: "plugin
  command admitted via `--plugin-dir`, invoked headlessly — ✅ works,
  namespaced `/<plugin>:<command>`"), and is pinned by a test in this repo
  (`test/plugin-command.test.ts`, gate (c)) that prices the SAME command under
  both `skill-zero` and `skill-heaven:skill-zero`.
- **This repo ships one plugin, `skill-heaven`.** Every command file in it is
  namespaced under that one plugin name — `skill-heaven:skill-zero`,
  `skill-heaven:skill-hell`, and so on — not `skill-zero:*` / `skill-hell:*`.
  Nothing in the command-file format lets one command declare a different
  namespace than its sibling commands in the same plugin.
- **`.claude-plugin/marketplace.json`'s schema is an array of plugin
  entries** (`{ "plugins": [ { "name", "source", ... }, ... ] }`), each with
  its own `name` and its own `source` directory. This repo's marketplace.json
  already has that array shape; it currently holds one entry.

## What follows structurally, not yet verified live

- To get `/skill-zero:*` and `/skill-hell:*` as **two distinct namespaces**,
  the prefix has to come from **two distinct plugin.json `name` fields** — one
  plugin literally named `skill-zero`, one literally named `skill-hell`,
  each with its own `commands/` directory — registered as **two entries** in
  `marketplace.json`'s `plugins[]` array. Splitting commands within the
  current single `skill-heaven` plugin does not produce that split; only
  splitting the plugin itself does.
- **Not tested this session:** an actual two-plugin marketplace (two
  `plugin.json`s + two source directories registered together, installed and
  invoked). The fact above is inferred from the schema shape and the F1
  single-plugin probe, not from a live multi-plugin install. Whether a second
  plugin entry in the same marketplace installs and resolves commands
  cleanly alongside the first is an open cell, not a probed one.

## Outcome: #30 is retired, not answered

Consolidating to **one** plugin named `skill-heaven` (`docs/AGENT-PLUGIN.md`)
settles the question by removing it. The product is one mechanic on one line,
so a split namespace would have been splitting a thing that is not split.

That means the open cell above — *does a second plugin entry in the same
marketplace install and resolve commands cleanly alongside the first?* —
**stays untested, and is now untested on purpose.** Nothing in this repo
depends on the answer. Recorded here rather than quietly dropped, so a future
reader does not mistake "we never checked" for "we checked and it works."
