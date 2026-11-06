# Probe — claude-zero reduced tools (issue #147)

Harness: **Claude Code 2.1.318** (`claude --version`). Date 2026-11-06.
Method: real authenticated `-p` sessions (the cloud sandbox supplies auth through its
proxy; no credentials were handled) reading the **`init` event's `tools` array** from
`--output-format stream-json --verbose`. Every probe used a throwaway
`HOME`/`CLAUDE_CONFIG_DIR`, `--max-turns 1`, prompt `hi`.

Evidence levels: **(1) structural** = `claude --help` text; **(3) real session** =
init-event tool list from a live authenticated session. No row relies on model
self-report. Claude itself has no level-2 dry run for its tool set; the door's own
`--print` is a dry run of the *composed argv* and is covered by the tests.

The init `tools` list is the hard signal: it is the tool set sent to the model. The sandbox
account also exposes ~70 account-level MCP servers in native sessions, which makes the
built-in vs MCP separation easy to see.

## Part A — raw `claude` flags (level 3)

| # | Flags | Built-ins in init | MCP summon tool | Verdict |
|---|-------|-------------------|-----------------|---------|
| A0 | (none) | ~41-42 incl. Bash, Edit, Write | present | baseline |
| A1 | `--tools Read,Grep` | **2** (Grep, Read) | present; every other MCP tool also still present | `--tools` restricts **built-ins only** |
| A2 | `--tools ""` | **0** | present | removes all built-ins, MCP untouched |
| A3 | `--tools default` | 41 | present | restores default set |
| A4 | `--disallowedTools Bash,WebFetch` | 41; Bash, Monitor, WebFetch gone | present | removes named built-ins |
| A5 | `--disallowedTools mcp__plugin_small-business_shopify` (server prefix) | unchanged | present; MCP tool count 182 -> 140 | removes a whole MCP **server's** tools |
| A6 | `--disallowedTools mcp__plugin_skill-heaven_skill-summon__summon` | unchanged | **absent** | removes one named MCP tool |
| A7 | `--allowedTools Read` | **41, unchanged** (Bash still listed) | present | **does NOT restrict**: a permission allow-rule only. **Never used.** |
| A8 | `--strict-mcp-config` alone | 38 | **absent**, 0 MCP servers | MCP allowlist; drops summon unless `--mcp-config` supplies it (the door does) |

Findings:
- `--tools` is a built-in allowlist. `--disallowedTools` is a denylist for built-in **and** `mcp__` names (a server prefix works).
- `--allowedTools` is not a suppression flag despite the name. Not shipped.
- Incidental: the default built-in count wobbles by 1-2 between runs (WebFetch, Glob and Grep come and go with Bash/Monitor and with the run); the cuts below are judged on the named tools, not on totals. `--tools minimal` names Glob and Grep and both appear (B1).

## Part B — through the door (level 3)

`claude-zero <flags> -- -p hi --output-format stream-json --verbose --max-turns 1`. The door's
default (`product-floor`) already composes `--strict-mcp-config --mcp-config $SESSION/door-mcp.json`,
so its only MCP server is `skill-summon`.

| # | claude-zero flags | Built-ins in init | MCP tools in init | Verdict |
|---|-------------------|-------------------|-------------------|---------|
| B0 | (none) | 42 | 1: `mcp__skill-summon__summon` (1 server) | baseline |
| B1 | `--tools minimal` | **4: Glob, Grep, Read, Skill** | summon present | built-ins cut, summon kept |
| B2 | `--tools none` | **0** | summon present | summon kept |
| B3 | `--remove-tools Bash,WebSearch` | 40; Bash, Monitor, WebSearch gone | summon present | named built-ins removed |
| B4 | `--remove-tools mcp__skill-summon__summon` | 41 | **0** (summon gone; server still connected) | explicit removal works; the door warns |
| B5 | `--level native --tools minimal` | 4 | 83 MCP tools incl. `mcp__plugin_skill-heaven_skill-summon__summon` | at native, `--tools` leaves ambient MCP alone |

All sessions returned a normal reply (`is_error=false`).

## What shipped, and what did not

Shipped (each verified at level 3 above): `--tools <preset|default|list>` -> claude `--tools`;
`--remove-tools <list>` -> claude `--disallowedTools` (built-in and `mcp__` names, repeatable).
Presets: `minimal` = Read,Grep,Glob,Skill; `none` = no built-ins. MCP names inside `--tools` are
refused (claude's `--tools` does not govern MCP, A1). Removing the summon MCP tool is allowed only
explicitly and prints a warning.

Not shipped: `--allowedTools` (A7, not a restriction). No MCP allowlist beyond what the posture already composes.

## Part C — a real summon turn under `--tools minimal` (level 3, coordinator re-run)

`claude-zero --tools minimal -- -p "Use the summon tool once with the query 'code review checklist', then reply with only the name of the skill it returned." --output-format stream-json --verbose --max-turns 4 --model haiku [--allowedTools mcp__skill-summon__summon]`.
Each run used a throwaway `HOME`/`CLAUDE_CONFIG_DIR`. The signals are the `tool_use` and `tool_result` events in the stream.

| # | Extra flag | init tools | `tool_use` | `tool_result` | Result |
|---|---|---|---|---|---|
| C1 | (none) | Glob, Grep, Read, Skill + `mcp__skill-summon__summon` | `mcp__skill-summon__summon {"query":"code review checklist","limit":1}` | `is_error: true`, "Claude requested permissions to use mcp__skill-summon__summon, but you haven't granted it yet." | headless `-p` permission gate, not a tool-surface cut |
| C2 | `--allowedTools mcp__skill-summon__summon` (session-only permission rule) | same | `mcp__skill-summon__summon {"query":"code review checklist"}` | `is_error: false`, a 6.1 kB card | the server answered with an honest no-match ("no match above its relevance floor"); 2 turns; `success` |

So under `--tools minimal` the summon tool stays listed, is callable, and round-trips through the
bundled server. C1 shows why `--allowedTools` is **not** a restriction (A7): it is the permission
grant that headless `-p` needs, and an interactive session asks the user instead. The C2 result is a
no-match, which tests the round trip and nothing about retrieval quality.

Not verified: behaviour on any claude version other than 2.1.318. Re-probe on upgrade (the same M0
rule as for the bundled-skills knob).

## Reproduce

```
HOME=$(mktemp -d) CLAUDE_CONFIG_DIR=$HOME/.claude claude -p hi --output-format stream-json \
  --verbose --max-turns 1 --tools Read,Grep </dev/null | python3 -c '
import sys, json
for l in sys.stdin:
    d = json.loads(l)
    if d.get("subtype") == "init": print(d["tools"])'
npx tsx packages/claude-zero/src/cli.ts --tools minimal -- -p hi --output-format stream-json --verbose --max-turns 1
```
