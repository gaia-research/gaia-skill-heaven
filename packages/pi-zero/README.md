# pi-zero

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The pi door to Skill Zero under the Skill Heaven umbrella: a boot-time launcher plus live-session extension.

> **Superseded.** This extension is scheduled to be replaced by a forthcoming
> `pi-heaven` extension that consumes `plugins/skill-heaven` directly — Agent
> Plugin is a universal standard, so other harnesses are expected to install
> or pick up that plugin rather than each re-implementing their own summon
> path (see [`docs/AGENT-PLUGIN.md`](../../docs/AGENT-PLUGIN.md)). Until
> `pi-heaven` ships, `/skill-hell` here can render the chooser and arm a rung,
> but it cannot summon a skill by intent (see below).

## Launch

```bash
pi-zero                                  # zero/product-floor (default)
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

Owns only `zero · low · med`. Without a launcher manifest it gives an exact
`pi-zero` command and says it changed nothing. Heaven is a boot-time choice.

### `/skill-hell`

Owns `high · xhigh · max`, works without a launcher, and defaults to `high`.
No rung carries a count and no summon is capped — what each rung reaches for
is worked out in use until the benchmark lands. `ultra` is the crown rung and
does not refuse (N13) — pi-zero has simply not built the controller surface
yet, and says exactly that.

**Summon by intent is not wired here.** `/skill-hell <intent>` used to shell
out to a `skill-hell` binary from the external `@gaia-research/mcp` package,
hunted for across `$SKILL_HELL_BIN`, `$PATH`, `$GAIA_MCP_HOME`, and
`~/gaia-mcp/dist/bin/skill-hell.js`. That package is deprecated; this
extension has not been rewired to the in-repo summon engine
(`packages/skill-summon`), and `/skill-hell <intent>` now reports that gap
honestly instead of pretending a summon ran. The chooser (bare `/skill-hell`)
and rung-arming (`/skill-hell high|xhigh|max`) still work, since neither
needs an engine. See the header comment in
[`extension/pi-zero.ts`](extension/pi-zero.ts).

Arrivals are cards, not pasted bodies — this contract is unchanged from
before, and still applies once a harness (pi-zero today, `pi-heaven` going
forward) actually performs a summon. The extension persists each materialized
directory, returns its `SKILL.md` through `resources_discover`, and calls
`ctx.reload()`, preserving sibling references and scripts. A card-only probe on
pi with `openai-codex/gpt-5.6-luna:low` in visible pane `w8:p14` showed
`wp16-card-probe` in the native skill list after reload, read a sibling
reference, and returned exactly `CARD_ONLY_OK:7319`.

## Safety and evidence

No user or project pi state is edited (P3).

From a source checkout, the launcher loads the extension automatically. It can
also be inspected directly in pi's package manifest at
`packages/pi-zero/extension/pi-zero.ts`. The npm-ready package is not yet
published, and it never bundles the pi harness. Without a launcher manifest, `/skill-zero`
points to the launcher without claiming a change; `/skill-hell`'s chooser and
rung-arming remain available because neither depends on posture handoff or an
engine.

See [EXTENSION.md](EXTENSION.md) for the pi 0.83.0 API findings and #31 design
reasoning, and [PROBE.md](PROBE.md) for the posture-route evidence.
