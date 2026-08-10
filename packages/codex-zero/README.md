# codex-zero

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The Codex door to Skill Zero under the Skill Heaven umbrella.

```bash
codex-zero --print                              # off/product-floor default
codex-zero --level native --print               # explicit native recipe
codex-zero --level low --skill /path/to/skill --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains available for benchmark
and compatibility use.

Codex 0.146.0 has a verified live exec route. The launcher creates a
session-scoped `CODEX_HOME`, copies only authentication material, asks the
app-server `skills/list` endpoint for exact discovered paths, and writes exact
path disables into the disposable session. Curated mode readmits only the named
skills. It then spawns `codex exec`; no shared Codex state is edited. `--print`
shows this composition without starting Codex. See [PROBE.md](PROBE.md).
