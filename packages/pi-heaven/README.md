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

Resolves the summon engine, materializes the winning skill directory, injects
its `SKILL.md` body, then uses pi's `resources_discover` + `ctx.reload()` path to
load it as a real skill while preserving sibling files. The Hell ladder rungs
remain P2-gated; this command remains a locked-door surface until policy opens.

Engine resolution order:

1. `$GAIA_HELL_BIN`
2. `gaia-hell` on `PATH`
3. `$GAIA_MCP_HOME/dist/bin/gaia-hell.js`
4. `~/gaia-mcp/dist/bin/gaia-hell.js`

## Safety and evidence

No user or project pi state is edited (P3). See [EXTENSION.md](EXTENSION.md) for
the pi 0.83.0 extension API findings and [PROBE.md](PROBE.md) for posture-route
evidence.
