# codex-heaven

The Codex door to Skill Heaven.

```bash
codex-heaven --print                              # off/product-floor default
codex-heaven --level native --print               # explicit native recipe
codex-heaven --level low --skill /path/to/skill --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains available for benchmark
and compatibility use.

Codex remains recipe-only. The 0.146.0 negative probe found no portable way to
suppress all independent skill roots, and no verified composition approaches a
product floor while preserving a door. The default therefore selects
`off`/`product-floor` but does **not** claim it can launch one: `--print` labels
the recipe explicitly unverified, and a real invocation refuses rather than
silently falling back to native. See [PROBE.md](PROBE.md).
