# grok-zero

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The Grok door to Skill Zero under the Skill Heaven umbrella.

```bash
grok-zero --print                              # off/product-floor default
grok-zero --level native --print               # explicit native
grok-zero --level low --skill /path/to/skill --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains available for benchmark
and compatibility use.

Grok 0.2.118 has a verified live exec route. The launcher derives the observed
skill and plugin inventory from `grok inspect --json`, writes exact-path ignores
only inside a disposable session profile, and readmits named skills for curated
mode. Product-floor intentionally retains the observed plugin surface so the
door remains available; it is not the doorless benchmark floor. `--print` shows
the inspect-derived composition without starting Grok. See [PROBE.md](PROBE.md).
