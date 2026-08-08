# claude-heaven

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The Claude Code door to Skill Heaven. The marketplace plugin uses the published
`@gaia-research/mcp@0.3.0` summon engine for `/skill-hell`.

## Install

The repository's one-command installer delivers this launcher, all four sibling
doors, the working summon engine, and the Claude plugin:

```bash
curl -fsSL https://gaia-research.github.io/skill-heaven/install.sh | sh
```

It uses the user's own Claude Code binary and never installs a harness. When
`claude` is already on `PATH`, the same run registers the marketplace plugin and
makes `/skill-heaven` and `/skill-hell` available; otherwise it prints the exact
deferred registration commands. The launcher doors remain source-built rather
than npm-published. See the root README for PATH, update, and uninstall details.

## Launch

```bash
claude-heaven                                  # off/product-floor (default)
claude-heaven --level med                      # Claude untouched (= native)
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

## `/skill-heaven`: the boot-time half

`/skill-heaven` shows only `off · low · med`; `med` is native and unlocked.
Downward choices remain visibly locked by D12 and include exact relaunch
commands. Without a launcher manifest it gives the exact `claude-heaven`
command and explicitly says it changed nothing.

## `/skill-hell`: the live additive half

`/skill-hell` works anywhere the plugin is installed. Bare invocation shows
`high · xhigh · max · ultra` with `high` as default. `high`, `xhigh`, and `max`
arm bounded per-gap summon budgets; `ultra` alone refuses because it is
unratified, never gated. `/skill-hell <intent>` remains the advanced manual
path.

Arrivals are cards, not pasted bodies: identity, tree-published trust fields,
paired install timing/cache state, file count, path, and inspect link. Claude
cannot register a native skill after boot, so the card is its listing entry and
the agent reads the materialized directory from disk. A card-only probe on
Claude Code 2.1.224 in visible pane `w8:p13` read `SKILL.md` plus a sibling
reference and returned exactly `CARD_ONLY_OK:7319`; the body is therefore no
longer pasted.

The renderers are zero-dependency `.mjs`, because a marketplace-installed
plugin has no adjacent `node_modules`. Ladder policy is generated from core into
`plugin/data/ladder.json` and freshness-tested.

## Standing-dose disclosure

The statusline and chooser read the launcher manifest. Native census coverage is
user + project skills and explicitly excludes bundled/plugin skills. Session
scope explicitly discloses the bundled `doctor` residual. Standing and
invocation doses remain separate.

## Boundaries

- Heaven: `off|low|med`, boot-time launcher choices.
- Hell: `high|xhigh|max`, live and additive; not P2-gated.
- `ultra`: hard refusal because it has no ratified product mapping.
- `floor`: benchmark-only, doorless posture.
- `native`: `med`; `--level native` remains a compatibility spelling.

Evidence for the pinned compositions remains in core compiler notes and the
probe material referenced from [Core and Quirks](../../docs/CORE-AND-QUIRKS.md).
