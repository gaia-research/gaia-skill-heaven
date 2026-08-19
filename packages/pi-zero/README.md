# pi-zero

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The pi door to Skill Zero under the Skill Heaven umbrella: a boot-time launcher plus live-session extension.

## Launch

```bash
pi-zero                                  # off/product-floor (default)
pi-zero --level med                      # pi untouched (= native)
pi-zero --level low --skill /path/to/skill
pi-zero --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains supported for benchmark
and compatibility use. `floor` stays the doorless benchmark placebo; every
other launch loads the bundled extension and writes its profile only inside the
disposable session directory.

## Session commands

### `/skill-zero`

Owns only `off · low · med`. Without a launcher manifest it gives an exact
`pi-zero` command and says it changed nothing. Heaven is a boot-time choice.

### `/skill-hell`

Owns `high · xhigh · max`, works without a launcher, and defaults to `high`.
Each rung arms a bounded per-gap summon budget, taken from core's `RUNG_SLOTS`
(PROVISIONAL until the benchmark lands). `ultra` is the crown rung and does not
refuse (N13) — pi-zero has simply not built the controller surface yet, and says
exactly that. `/skill-hell <intent>` remains the manual path.

Arrivals are cards, not pasted bodies. The extension persists each materialized
directory, returns its `SKILL.md` through `resources_discover`, and calls
`ctx.reload()`, preserving sibling references and scripts. A card-only probe on
pi with `openai-codex/gpt-5.6-luna:low` in visible pane `w8:p14` showed
`wp16-card-probe` in the native skill list after reload, read a sibling
reference, and returned exactly `CARD_ONLY_OK:7319`.

Engine resolution order:

1. `$SKILL_HELL_BIN`
2. `skill-hell` on `PATH`
3. `$GAIA_MCP_HOME/dist/bin/skill-hell.js`
4. `~/gaia-mcp/dist/bin/skill-hell.js`

## Safety and evidence

No user or project pi state is edited (P3).

From a source checkout, the launcher loads the extension automatically. It can
also be inspected directly in pi's package manifest at
`packages/pi-zero/extension/pi-zero.ts`. The npm-ready package is not yet
published, and it never bundles the pi harness. Without a launcher manifest, `/skill-zero`
points to the launcher without claiming a change; `/skill-hell` remains available because
it does not depend on posture handoff. When no `SKILL_HELL_SESSION` is supplied,
the extension creates one for the life of the pi process so materialized skill
directories survive resource reloads, then closes it when pi quits.

See [EXTENSION.md](EXTENSION.md) for the pi 0.83.0 API findings and #31 design
reasoning, and [PROBE.md](PROBE.md) for the posture-route evidence.
