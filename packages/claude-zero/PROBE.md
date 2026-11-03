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

## P2 — Issue #144: configured permission policy at claude-zero launch

**Harness:** `claude` **2.1.288** (macOS arm64). **Probed:** 2026-10-03.
**Route probed:** the product-floor shape — `--setting-sources ''`,
`--strict-mcp-config --mcp-config '{"mcpServers":{}}'`, `--print`, a session
`--settings` file — i.e. exactly what claude-zero composes.

### The question

`--setting-sources ''` is an allowlist with an empty value, so it evicts every
ambient setting source. Does that eviction also delete the user's *permission
mode* (the thing issue #144 reports as "silently reverts to auto-mode"), and if
so, which channel can carry that intent back without reopening the clean room?

### Method

Six cells. Each asked the agent to write one short file into the probe's temp
directory; the **only** signal used was whether the file appeared on disk. A
model's report about its own permission state is not evidence, so none was used.
The synthetic ambient settings carried a `permissions.allow` rule and a `statusLine`
alongside the permission key, so a leak of anything else would have been visible.

| Cell | Composition (all with `--setting-sources ''`) | File written | Reads as |
|---|---|---|---|
| A | session `--settings` `{permissions:{defaultMode:"acceptEdits"}}` | **yes** | the settings channel carries a mode correctly under full isolation |
| B | session `--settings` with **no** permission key | no | no key ⇒ claude's own default; the door must inject nothing |
| C | A **plus** explicit `--permission-mode default` | no | an explicit CLI mode **beats** the settings mode |
| D | session `--settings` `{defaultMode:"bypassPermissions"}`, no CLI flag | **yes** | **the fix's mechanism** — an inherited bypass is honored through that same channel |
| E | explicit `--dangerously-skip-permissions`, no settings permission key | **yes** | the real bypass flag reaches claude and works |
| F | `--allow-dangerously-skip-permissions` **alone** | no | capability enablement is not entering bypass mode |

### String evidence from the same binary

Supporting, not decisive; used to read the code's intent and to scope what this
door is allowed to assume on this version.

- `permissions.defaultMode` is the canonical key the harness itself reads and
  writes (`set permissions.defaultMode=<mode> in <source>`).
- An internal `permissionModeSuppliedOnInvocation` flag gates the settings-derived
  mode, which is the mechanism behind cell C.
- `"auto"` is *source-restricted*: a project/local `permissions.defaultMode` set to
  `auto` is ignored, while other modes are honored. User-scope `auto` is honored —
  which is why this door reads the **user** settings only, never project/local
  permissions, as a way to grant bypass.
- A settings bypass can be ignored by the host on its own terms — e.g. for an
  IDE-owned session without the allow-bypass setting, and mode restrictions exist
  for remote sessions. Those are **not** argv-drop defects and stay visible.
- The `default` mode is accepted by the settings schema but is **not** one of the
  six `--permission-mode` choices, so the door validates user-supplied *flag values*
  against nothing (claude owns its enum) and inherited *settings modes* against the
  probed settings set.

### What the implementation does with this

- Canonical `permissions.defaultMode` → re-applied as `permissions.defaultMode` in
  the **session** settings file (cell D). No duplicate argv signal.
- Compatibility `permissionMode` → same channel, disclosed as a launcher-side
  alias, not claimed as claude schema.
- Compatibility `dangerouslySkipPermissions: true` → the real
  `--dangerously-skip-permissions` flag (cell E), disclosed as settings-derived.
  `--allow-dangerously-skip-permissions` is never promoted to it (cell F).
- Explicit permission flags win over inheritance, including a **safer** mode over an
  inherited bypass (cell C), and skip the settings read entirely — so an
  uninterpretable settings file cannot block a launch that already answered the
  question.

### Review-hardened edges (no extra harness runs needed)

Three fixes came out of an adversarial review of the implementation rather than
out of new probe cells, and each is pinned by a test in `test/permissions.test.ts`:

- A config path that exists but is not a directory (`ENOTDIR`) is a **broken**
  configuration, not an absent one. Reading it as "unconfigured" would have
  reproduced the original defect on a second code path.
- Permission keys are read as **own** properties only, so a polluted
  `Object.prototype` elsewhere in the process cannot invent a mode — and therefore
  cannot invent a bypass.
- `--print` is a boolean option (`claude --help`), so a real `--permission-mode`
  behind it is still seen. Treating it as value-taking would have let an inherited
  mode quietly override the user's own flag.

### Not proven here, and deliberately not worked around

- **Managed/organization policy precedence.** This probe ran unmanaged. A managed
  `bypassPermissions` restriction still wins in claude, and the door does not touch
  it.
- **The interactive bypass acknowledgment.** Cells ran under `--print`. In an
  interactive session claude may still prompt to confirm bypass. The door never sets
  `skipDangerousModePermissionPrompt` to skip that prompt — auto-acknowledging a
  safeguard is not preserving a decision.
- **Version pinning.** `--permission-mode` choices, the settings mode set, and the
  `permissionModeSuppliedOnInvocation` gate are all properties of 2.1.288.
  **Re-verify on every Claude Code upgrade.**
- **Cost of the campaign** is deliberately not quoted: no canonical cost receipt
  was taken for these six cells, and a self-reported figure would be worse than none.

### Fixture hygiene

Probe directory created under the OS temp dir and deleted after the campaign. The
synthetic settings file never touched the operator's real `~/.claude`, and no test
in this package reads it either — every case runs against a throwaway
`CLAUDE_CONFIG_DIR`/`HOME` fixture.
