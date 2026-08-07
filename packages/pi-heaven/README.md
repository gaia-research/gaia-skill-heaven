# pi-heaven

The pi door to Skill Heaven: a boot-time launcher plus live-session extension.

## Launch

```bash
pi-heaven                                  # off/product-floor (default)
pi-heaven --level native                   # pi untouched
pi-heaven --level low --skill /path/to/skill
pi-heaven --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains supported for benchmark
and compatibility use. `floor` stays the doorless benchmark placebo; every
other launch loads the bundled extension and writes its profile only inside the
disposable session directory.

## Session commands

### `/skill-heaven`

Reports the launched profile, exact argv, and current loaded-skill count. It
does not remove resources from a running conversation.

### `/skill-hell <intent>`

Resolves the `skill-hell` engine, summons the best matching skill, displays its
identity and install cost (timing always paired with cold/warm cache state), and
injects the materialized `SKILL.md` body into the current model context. It then
uses pi's `resources_discover` + `ctx.reload()` surface to add that skill natively
to the running session. The winner path is a directory; the extension loads
`SKILL.md` from inside it, preserving sibling `reference/` and `scripts/` files.

The Hell ladder rungs (`med` and above) remain P2-gated; this command stays a
locked-door surface until policy opens.

Engine resolution order:

1. `$SKILL_HELL_BIN`
2. `skill-hell` on `PATH`
3. `$GAIA_MCP_HOME/dist/bin/skill-hell.js`
4. `~/gaia-mcp/dist/bin/skill-hell.js`

## Safety and evidence

No user or project pi state is edited (P3).

From this repository:

```bash
pi --extension packages/pi-heaven/extension/pi-heaven.ts
```

Or install the package through pi's package channel and let its `pi.extensions`
manifest load the same file. Without a launcher manifest, `/skill-heaven`
honestly reports a vanilla pi session; `/skill-hell` remains available because
it does not depend on posture handoff. When no `SKILL_HELL_SESSION` is supplied,
the extension creates one for the life of the pi process so materialized skill
directories survive resource reloads, then closes it when pi quits.

See [EXTENSION.md](EXTENSION.md) for the pi 0.83.0 API findings and #31 design
reasoning, and [PROBE.md](PROBE.md) for the posture-route evidence.
