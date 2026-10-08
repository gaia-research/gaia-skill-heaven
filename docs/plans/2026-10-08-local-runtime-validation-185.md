# Local runtime validation follow-up to #185

PR #185 established the end-user control-plane design, canonical status model, harness-first install UX, and preview console. Its cloud pass deliberately left logged-in runtime cells unclaimed.

This follow-up exists to run those cells from a local checkout where the harnesses and Herdr are already available, fix only defects that the probes actually expose, and promote compatibility claims only when M0 evidence supports them.

## Ground rules

- Read `AGENTS.md`, `CLAUDE.md`, `docs/CONTROL-PLANE.md`, and the relevant `PROBE.md` files before probing.
- Use Herdr panes for live harness work so the exact harness/model/session is visible and attributable, even though Rule 0 is otherwise lifted.
- Record the exact harness version before every empirical claim.
- Prefer hard host/runtime signals over model self-report.
- Never mutate the user's shared harness configuration to make a probe pass.
- A negative result is a first-class result.
- Do not broaden this PR into the Ultra controller, repo loadouts, or unrelated backend work.
- #126 remains open. Fixture/provisioned Ultra states are not runtime evidence.

## A. Claude console, logged-in runtime

Validate `skill-heaven-console` in a real logged-in Claude session.

Required cells:

- install/enable the local console and main Skill Heaven plugin from this checkout without replacing the user's existing status line;
- confirm the console status entry renders alongside host/user status;
- invoke one `/lens` preview and verify it does not increment summon/materialized counts;
- invoke one real `/summon`, then read the materialized `SKILL.md`, verifying the transition from card/materialized to in-context;
- capture the actual `tool.call` result shape and determine where MCP `structuredContent` appears;
- determine whether `$.tool.list()` includes deferred tools;
- determine whether host `agentId` reaches subagent calls;
- determine observable ordering between `prompt.submit` and `command.run`;
- verify the console remains observe-only and does not write settings/state outside its documented surface;
- verify `/heaven` Session / Scope / Flow / Trust views with real session data.

Update tests and docs for observed shapes. Do not make undocumented host behavior normative without a pinned probe.

## B. Pi 1.0.4+ re-probe

The cloud pass found that current Pi exposes `pi mcp`, so the existing adapter premise may be stale.

- record exact `pi --version`;
- inspect current supported MCP/plugin/extension surfaces;
- run the smallest logged-in live cells needed to establish whether the existing Agent Plugin adapter is still correct;
- verify `/summon` and the four Skill Heaven surfaces through a supported route;
- determine whether Pi can project the canonical status model through its supported status API without duplicating runtime truth;
- if the old adapter is obsolete, simplify it rather than layering another compatibility shim;
- update `packages/pi-zero/PROBE.md` and compatibility labels only from hard evidence.

## C. Antigravity / Agy 1.3.1+ re-probe

The cloud pass observed that `agy plugin validate` saw the five commands but no summon MCP server.

- record exact `agy --version`;
- reproduce that result first;
- inspect the current public plugin/MCP registration surface;
- determine why the commands load while the summon server does not;
- if there is a small supported fix, implement it without reintroducing the HOME/keychain regression fixed by #160;
- preserve the invariant that default `agy-zero` uses the real HOME and vanilla login;
- live-probe `/summon`, `/skill-zero`, `/skill-heaven`, `/skill-hell`, and `/skill-ultra`;
- only promote Antigravity from Partial when the summon server and surfaces are empirically demonstrated.

Update `packages/agy-zero/PROBE.md` and #137 evidence accordingly.

## D. Opportunistic current-version smoke

If Codex, Grok, and Hermes are already authenticated locally, run a small current-version smoke of plugin discovery + one summon. This is secondary and should not block the three primary lanes above.

Do not turn this into a full re-benchmark.

## E. Windows boundary

#94 still requires a native Windows runtime test of the PowerShell installer. A macOS/Linux `pwsh` parse is useful but does not satisfy that issue.

If no native Windows environment is available, keep this explicitly `NEEDS WINDOWS PROBE`; do not emulate closure.

## Verification and delivery

After probe-driven fixes:

- `npm test`
- `npm run typecheck`
- site build if site/compatibility copy changes
- `node scripts/build-status.mjs` followed by a clean-tree/bundle parity check
- `node scripts/build-mcp.mjs` if plugin/MCP delivery changes
- relevant real harness validation commands
- repeat each load-bearing live probe at least once where reproducibility matters

Document:

1. exact version + OS for each harness;
2. command/route used;
3. hard signal;
4. observed result;
5. evidence vs inference;
6. any negative result;
7. whether a public compatibility/status label changed.

The PR is done when the local-only unknowns from #185 are either converted into pinned evidence or explicitly retained as unsupported/unverified boundaries, and any defects exposed by those probes are repaired with regression coverage.
