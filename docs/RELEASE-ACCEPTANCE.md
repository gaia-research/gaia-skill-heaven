# Release acceptance — fresh install of `main`

Skill Heaven is a live tool whose research claims stay provisional. This document is
the receipt for the first half of that sentence: **a clean install of what is on GitHub
`main` behaves like the product the merged code describes.** It is reproducible —
`node scripts/release-acceptance.mjs` runs every check below and prints the receipt.

It is deliberately *not* a claim about behaviour-aware composition (SPEC INV-10 stands,
unmet), about what a rung means in behaviour, or about any harness other than the ones
named. It makes the product's own claims checkable.

## How it is run

The script installs through the **public installer** (`install.sh`, which downloads the
GitHub archive and registers the Claude marketplace plugin) into a throwaway `HOME` and
`CLAUDE_CONFIG_DIR`, so no developer cache is involved, then checks the installed
artifacts — never the working tree:

| phase | what is checked |
| --- | --- |
| 1 · install | the installer exits 0 and registers `skill-heaven@gaia-skill-heaven` |
| 2 · inventory | plugin listed and enabled; five commands; exactly one MCP server; installed bytes equal the repository at the tested commit; the MCP bundle is current (two rebuilds, no diff) |
| 3 · launcher plan | the *installed* `claude-zero --print`: strict MCP allowlist admits exactly one `skill-summon`; explicit permission flags win; a configured `defaultMode` is the only thing inherited; malformed settings fail |
| 4 · bundled MCP | over stdio, no model: exactly one tool; neutral server/tool/command text; a real summon returns a reference card; the shipped Arbor cache is the governed **inconclusive** record; ranking and refusal are identical with and without it |
| 5 · live sessions | real Claude Code sessions through the installed launcher: one MCP tool, synthetic ambient MCP / skill / hook absent, user plugins absent, one real summon, permission modes behave as designed |
| 6 · no mutation | installed plugin tree, the operator's `settings.json` and plugin registries are unchanged |

**Why phase 5 uses the operator's login.** A throwaway `CLAUDE_CONFIG_DIR` is logged out
(macOS keys the credential to the config directory), so model calls cannot run there. Phase
5 therefore runs under the operator's real home, **reading settings read-only**, against the
*freshly installed* plugin. The operator's `settings.json` and plugin registries are hashed
before and after to prove that. Pass `--no-live` to skip it.

**Why `sonnet`, not `haiku`.** Claude's `auto` permission mode is model-gated: with a small
model it silently falls back to `default`. A smaller model would make an inherited `auto`
look lost when Claude simply declined it, so the live phase defaults to `--model sonnet`.

## Findings recorded while building the receipt

- **Built-in plugins are not leaks.** Claude's own `cc-plugin-*@builtin` plugins appear in a
  clean-room session; they are not user or project settings. The check is that the only
  *non-builtin* plugin is the door, mounted from the fresh install, and that none of the
  operator's user-enabled plugins loaded.
- **The tool name is `mcp__skill-summon__summon`.** The door admits its bundled server
  through `--mcp-config` under its own name, so it is not the `plugin:…` namespace a
  marketplace install uses. Both are one bundled server with one tool.
- **"verbatim" in Arbor provenance lines.** The authority tripwire list bans `verbatim`
  (for "repeat this verbatim" instructions). Arbor's disclosure says a governed claim was
  "carried verbatim with their stated conditions" — a statement about how the data was
  handled. The scan therefore applies the full list to every line of a card except the
  `Arbor:` provenance lines, and the list minus that one word to JSON dumps.
- **Standing dose is historical.** The −28.9% figure was measured on Claude Code 2.1.216
  *before* the bundled summon MCP was admitted to the product floor (#143). The shipped
  floor adds that one server; its dose is not re-priced, and no surface may present the old
  figure as the current floor's.

## Receipt — 2026-10-04, GitHub `main` @ `e0f2e98`

| | |
| --- | --- |
| Result | **76 / 76 checks passed** |
| Installed commit | `e0f2e986eafca00ac69fd9df023ba12db6ad9d95` (GitHub `main`) |
| Claude Code | 2.1.288 (pinned) |
| Plugin | `skill-heaven` 0.1.2 · MCP bundle sha256 `2a58fbd7…` |
| Live model | `claude-sonnet-5-5` |
| Node · platform | v22.23.1 · macOS (darwin arm64) |
| Negotiated MCP protocol | `2025-11-25` (`2026-07-28` is **not** negotiated by the pinned SDK) |

Not re-run in this pass: Codex 0.146.0, Grok 1.0.5, Hermes 0.20.0, Pi 0.84.2 and
Antigravity — they stay pinned at their earlier probes
([`plugins/skill-heaven/PROBE.md`](../plugins/skill-heaven/PROBE.md)). No claim here depends on
them.

### Checks

```text
✔ repo checkout is clean
✔ the checkout's shipped paths are identical to GitHub main
✔ install.sh exits 0
✔ installer registered the Claude plugin
✔ claude-zero launcher linked
✔ plugin is listed and enabled
✔ exactly one MCP server, skill-summon
✔ plugin installed into the throwaway config dir
✔ the five expected commands are present
✔ the five skills are present
✔ installed plugin bytes equal the repo at the tested commit
✔ MCP bundle is current: a rebuild from source changes nothing
✔ a second rebuild also produces no diff
✔ product-floor plan composes
✔ strict MCP allowlist stays on
✔ exactly one --mcp-config, session-local
✔ the door MCP file declares exactly one server: skill-summon
✔ …and it points at the INSTALLED bundle
✔ the clean room mounts the installed door plugin
✔ project/user setting sources stay evicted
✔ inherited permissions.defaultMode is carried on the session settings
✔ …and is the ONLY permissions key
✔ …and the session settings hold nothing else but the statusline
✔ allow/deny rules, hooks, env, MCP, plugins and directories do not leak
✔ the plan discloses what was inherited
✔ an explicit --permission-mode is forwarded verbatim
✔ …and wins: the configured mode is not injected
✔ an explicit --dangerously-skip-permissions is forwarded and wins
✔ no configured mode ⇒ nothing is injected
✔ malformed settings fail clearly (exit 2, named reason) instead of degrading
✔ …and no plan is emitted
✔ native reads no user file and injects nothing
✔ exactly one tool is exposed: summon
✔ server instructions state the reference-data boundary
✔ server instructions decide per use and authorize nothing
✔ server instructions carry no authority phrase
✔ tool description is a lane filter, not authorization
✔ a harmless summon call returns structured content
✔ the preview result carries no authority phrase (provenance wording excepted)
✔ composition is relevance-only and selection is unchanged
✔ Arbor publication cache loaded with the governed record
✔ the candidate joins the governed record content-pinned
✔ …and the record's support is `inconclusive`
✔ …set by the human-curated interpretation c8d6b2cb
✔ band judgment is reported, not applied: no direction, relevance untouched
✔ inconclusive evidence fails closed (no direction from it)
✔ a real summon materializes one skill and returns a card
✔ …the card states it is a listing entry, not a grant
✔ …the card carries no authority phrase (full tripwire list, Arbor provenance lines excepted)
✔ …and it ranked by relevance only
✔ …the full result JSON carries no authority phrase (provenance wording excepted)
✔ control: the empty publication really has no governed record
✔ ranking is IDENTICAL with and without the Arbor record
✔ refusal is IDENTICAL with and without the Arbor record
✔ a nonsense query is an honest refusal, not a forced match
✔ no installed command, skill or rendering asks to be treated as standing authority
✔ live: the session started
✔ live: exactly ONE MCP tool, and it is the bundled summon
✔ live: exactly one MCP server, connected
✔ live: the synthetic ambient MCP server is absent
✔ live: the synthetic ambient project skill is absent
✔ live: the five plugin commands are present
✔ live: the only non-builtin plugin is the door, mounted from the FRESH install
✔ live: none of the operator's 3 user-enabled plugins leaked into the clean room
✔ live: the project SessionStart hook did not fire
✔ live: the user's configured defaultMode (auto) is inherited
✔ live: the project's permissions.defaultMode (plan) did not leak
✔ live: one summon call was made and returned a card
✔ live: the card names its reference-data nature
✔ live: the tool result carries no authority phrase (provenance wording excepted)
✔ live: an explicit --permission-mode plan wins over the inherited mode
✔ live: an explicit --dangerously-skip-permissions wins over the inherited mode
✔ the installed plugin tree is byte-identical after every run
✔ the operator's real settings.json is unchanged (read-only)
✔ the operator's real plugin registries never reference the throwaway install
✔ the repository checkout is untouched
```
