# PROBE — claude-zero door, pinned Claude Code

Sanitized evidence receipt for the compositions this door composes. Probed on
the version named below and **only** on it: claude-code behaviour here is
version-pinned, so re-probe on every CLI upgrade before quoting a number.

What is deliberately NOT in this file: transcripts, prompts, credentials, token
paths, personal or private paths, and cost figures (a token/dollar total would
have to come from `gaia-research/skill-cost`, so none is reported).

## P1 — Issue #143: the door's own summon MCP server was never admitted

**Harness:** claude-code 2.1.288. **Probed:** 2026-10-03.
**Route:** `product-floor` — the door's default composition, as emitted by
`claude-zero --print` and materialized the way a real launch materializes it.

Fixture: a disposable cwd carrying a synthetic ambient project `.mcp.json`
(dummy stdio server), a synthetic ambient project-scope skill, and a
project `.claude/settings.json`; plus the repo's own door plugin mounted with
`--plugin-dir`.

Hard signals only — the session's `system:init` event (`mcp_servers`, `tools`,
`slash_commands`, `skills`), which is the harness's own inventory, never a
model's self-report.

| # | Composition | `mcp_servers` | summon tool | ambient server | plugin commands |
|---|---|---|---|---|---|
| 1 | product-floor **before** the fix (inline empty config) | `[]` | absent | absent | 5 present |
| 2 | raw plugin `.mcp.json` passed straight to `--mcp-config` | `skill-summon` **failed** | absent | absent | 5 present |
| 3 | product-floor **after** the fix (session `door-mcp.json`) | `skill-summon` **connected** (1) | `mcp__skill-summon__summon` (**exactly 1**) | absent | 5 present |
| 4 | one harmless tool call on route 3 | — | executed, structured card returned | absent | 5 present |

Findings:

1. **`--strict-mcp-config` is an ALLOWLIST and it eats plugin MCP too.** The
   pre-fix product floor — `--strict-mcp-config --mcp-config '{"mcpServers":{}}'
   --setting-sources '' --plugin-dir <door>` — started **no server at all** and
   carried **no** summon tool, while all five plugin slash commands (including
   `/summon`) still resolved. That is #143 exactly: a command whose tool does
   not exist.
2. **Claude does NOT interpolate plugin placeholders in an external
   `--mcp-config` file.** Passing the plugin's own `.mcp.json` through
   `--mcp-config` produced `status: "failed"` with the literal
   `${CLAUDE_PLUGIN_ROOT}` handed to node. The fix therefore RESOLVES
   `${CLAUDE_PLUGIN_ROOT}` → absolute bundle path and
   `${user_config.skill_url}` → a concrete source before the file is written
   (`packages/claude-zero/src/mcp.ts`). Passing the raw path is not sufficient.
3. **The door-only admission composes with strict isolation, it does not trade
   against it.** On route 3, with strict MCP and the empty setting-sources
   allowlist both still on: exactly one MCP server, connected; exactly one
   `mcp__skill-summon__summon` entry in the tool inventory (no duplicate from
   the mounted plugin's own declaration); the synthetic ambient project MCP
   server absent; the synthetic ambient project skill absent from the listing;
   all five plugin slash commands intact.
4. **The tool is callable, not merely registered.** One harmless `summon` call
   on route 3 executed against the bundled server and returned the structured
   result payload (query, surface, source, and the ranked candidates below the
   admission floor). Direct MCP `tools/list` alone would not have proved this.
5. **Honest residuals, unchanged by this work.** The session skill listing still
   contains bundled skills that survive `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`
   (`doctor`, and in 2.1.288 `design`, `plugin-authoring`). That is the
   pre-existing, already-disclosed residual — see `README.md` "Standing-dose
   disclosure" — and it is NOT a product-floor regression.

### What this does not prove

- A future claude-code may rename the server namespace, refuse a `--mcp-config`
  file under `--strict-mcp-config`, or start plugin MCP even in strict mode.
  Re-run rows 1–4 on every CLI upgrade; the composition is version-pinned.
- **No token or cost number is claimed for the MCP-enabled route.** F7's locked
  +515 tok door figure (core compiler notes, claude 2.1.216, 2026-07-24) was
  measured WITHOUT any server admitted and is historical history only — it does
  not price route 3. An MCP control surface is not a summoned skill, so the
  profile's selected-skill accounting stays at zero and two-number dose
  reporting is unchanged.
- Source-precedence behaviour (`SKILL_SOURCE` override vs the plugin manifest
  default) is covered by unit tests in `test/mcp.test.ts`, not by a live probe.