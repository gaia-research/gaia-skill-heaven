# pi-heaven

The pi door to Skill Heaven. It combines a boot-time posture launcher with a
bundled pi extension for live-session commands.

## Launch

```bash
npm -w pi-heaven run launch -- --posture native
npm -w pi-heaven run launch -- --posture product-floor
npm -w pi-heaven run launch -- --posture curated --skill /path/to/skill
```

`floor` remains the doorless benchmark placebo. The launcher deliberately does
not mount the extension there. Every other launch writes a profile manifest in
the disposable session directory, exports its path as `PI_HEAVEN_PROFILE`, and
loads `extension/pi-heaven.ts` with `--extension`. No user or project pi state is
edited.

Use `--print` to inspect the exact command, argv, environment additions, and
compiler notes without spawning pi.

## Session commands

### `/skill-heaven`

Reports the boot posture, exact composed argv, pi's current loaded-skill count,
and the compiler notes verbatim. It is report-only: it does not offer to remove
resources or descend to a cleaner posture in a running conversation.

### `/skill-hell <intent>`

Resolves the `gaia-hell` engine, summons the best matching skill, displays its
identity and install cost (timing always paired with cold/warm cache state), and
injects the materialized `SKILL.md` body into the current model context. It then
uses pi's `resources_discover` + `ctx.reload()` surface to add that skill natively
to the running session. The winner path is a directory; the extension loads
`SKILL.md` from inside it, preserving sibling `reference/` and `scripts/` files.

Engine resolution order is:

1. `$GAIA_HELL_BIN`
2. `gaia-hell` on `PATH`
3. `$GAIA_MCP_HOME/dist/bin/gaia-hell.js`
4. `~/gaia-mcp/dist/bin/gaia-hell.js`

## Load the extension without the launcher

From this repository:

```bash
pi --extension packages/pi-heaven/extension/pi-heaven.ts
```

Or install the package through pi's package channel and let its `pi.extensions`
manifest load the same file. Without a launcher manifest, `/skill-heaven`
honestly reports a vanilla pi session; `/skill-hell` remains available because
it does not depend on posture handoff. When no `GAIA_HELL_SESSION` is supplied,
the extension creates one for the life of the pi process so materialized skill
directories survive resource reloads, then closes it when pi quits.

See [EXTENSION.md](EXTENSION.md) for the pi 0.83.0 API findings and #31 design
reasoning, and [PROBE.md](PROBE.md) for the posture-route evidence.
