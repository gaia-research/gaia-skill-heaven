# claude-zero

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The Claude Code door to Skill Zero under the Skill Heaven umbrella. `/skill-hell`
(and the other four in-session commands) are supplied by the `skill-heaven`
Claude plugin at `plugins/skill-heaven`, whose summon engine ships bundled
inside it — no external package, no `npx`. See
[`docs/AGENT-PLUGIN.md`](../../docs/AGENT-PLUGIN.md).

## Install

The repository's one-command installer delivers this launcher, all four sibling
doors, and the Claude plugin (its summon engine bundled inside):

```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

It uses the user's own Claude Code binary and never installs a harness. When
`claude` is already on `PATH`, the same run registers the marketplace plugin and
makes `/skill-zero` and `/skill-hell` available; otherwise it prints the exact
deferred registration commands. The launcher doors remain source-built rather
than npm-published. See the root README for PATH, update, and uninstall details.

## Launch

```bash
claude-zero                                  # zero/product-floor (default)
claude-zero --level med                      # Claude untouched (= native)
claude-zero --level low --skill ./my-skill  # curated clean room
claude-zero --print                          # inspect; do not spawn
claude-zero -- --model sonnet                # pass through after --
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the single
canonical rung description and policy status. `--posture` remains supported for
benchmark and compatibility use. The doorless benchmark `floor` is still
refused by this door because slash commands do not exist there (F6).

Every write is session-scoped: the launcher materializes core's plan, profile
manifest, and statusline settings in a disposable temp directory. It never
edits `~/.claude`, project skills, or source skill directories (P3).

## `/skill-zero`: the boot-time half

`/skill-zero` shows only `zero · low · med`; `med` is native and unlocked.
Downward choices remain visibly locked by D12 and include exact relaunch
commands. Without a launcher manifest it gives the exact `claude-zero`
command and explicitly says it changed nothing.

## `/skill-hell`: usable additive prototype

The plugin moved out of this package: it is `plugins/skill-heaven` at the repo
root now, and it ships all five surfaces (`/summon`, `/skill-zero`,
`/skill-heaven`, `/skill-hell`, `/skill-ultra`) plus the summon MCP. See
`docs/AGENT-PLUGIN.md`.

`/skill-hell` opens on `high` and covers `high · xhigh · max`; `ultra` is the
crown rung and is reached with `/skill-ultra`. **Nothing on the line refuses**
(N13). No rung carries a count and no summon is capped — what each rung
reaches for is worked out in use until the benchmark lands; the engine
publishes no score bands, HH scoring, or routing-eligibility contract.

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

- Heaven: `zero|low|med`, boot-time launcher choices.
- Hell: `high|xhigh|max`, `high` is the default. `ultra` is the crown rung,
  reached with `/skill-ultra`. Nothing on the line refuses (N13).
- The plugin's MCP exposes exactly one tool, `summon`.
- Hell/Heaven scoring, routing eligibility, and content-hash admission or
  verification are not shipped.
- `floor`: benchmark-only, doorless posture.
- `native`: `med`; `--level native` remains a compatibility spelling.

Evidence for the pinned compositions remains in core compiler notes and the
probe material referenced from [Core and Quirks](../../docs/CORE-AND-QUIRKS.md).
