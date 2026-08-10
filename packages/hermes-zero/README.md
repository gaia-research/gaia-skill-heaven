# hermes-zero

> **WORKING PROTOTYPE — actively tested for public use.** Interfaces, flags, and command surfaces may change.

The Hermes door to Skill Zero under the Skill Heaven umbrella.

```bash
hermes-zero                                  # off/product-floor (default)
hermes-zero --level native                   # Hermes untouched
hermes-zero --level low --skill /path/to/skill
hermes-zero --print
```

The ladder is the primary interface. See
[Core and Quirks](../../docs/CORE-AND-QUIRKS.md#1-the-ladder) for the canonical
rung description and policy status. `--posture` remains available for benchmark
and compatibility use.

Hermes 0.20.0 has verified live routes: off omits the skills toolset while
leaving the plugin/MCP door surface available; low uses a session-scoped
`HERMES_HOME`, copied auth, and only the selected skills. All writes stay in the
disposable session directory (P3). See [PROBE.md](PROBE.md).
