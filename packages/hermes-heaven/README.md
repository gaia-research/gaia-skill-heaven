# hermes-heaven

The Hermes door to Skill Heaven.

```bash
hermes-heaven                                  # off/product-floor (default)
hermes-heaven --level native                   # Hermes untouched
hermes-heaven --level low --skill /path/to/skill
hermes-heaven --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains available for benchmark
and compatibility use.

Hermes 0.20.0 has verified live routes: off omits the skills toolset while
leaving the plugin/MCP door surface available; low uses a session-scoped
`HERMES_HOME`, copied auth, and only the selected skills. All writes stay in the
disposable session directory (P3). See [PROBE.md](PROBE.md).
