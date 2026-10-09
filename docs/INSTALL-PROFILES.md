# Core / Core + Console — the two install profiles

**Status: design of record for #191 · #192 · #193 · #194 · #195.** Implementation guidance, not
ratification — decisions stay with `gaia-research/founder/RATIFICATION.md`; the product model is N13
(`docs/LADDER-FLOW.md`) and the console design is `docs/CONTROL-PLANE.md`.

Skill Heaven is one product compatible with agentic terminal harnesses. Its two outward-facing installation choices are **Core / Core + Console**; internal `core` / `full` identifiers and installer flags stay unchanged. Console includes the compact statusline, receipts and intentionally opened terminal views, not an always-open pane.

## Approved release boundary — PR #196 only

**5 accepted / 1 provisional**, approved by the founder as a revised release boundary, not a sixth acceptance pass. Claude Code, Pi, Codex, Hermes and Grok have earned runtime acceptance. Antigravity/Agy remains installable but its Console runtime is **provisional/unverified**: Core/Full registration succeeded and installed assets exist; installed-carrier invocation, native Core preview and exact sessionRoot binding are not accepted. Package registration does not prove native Console invocation. The narrow debt is [#206](https://github.com/gaia-research/gaia-skill-heaven/issues/206); see the [acceptance matrix](evidence/core-full-196/acceptance.md).

Preserve the six existing normal `full` installations. Do not uninstall or modify normal HOME configuration as cleanup.

The two choices:

| Profile | You get | You do not get |
|---|---|---|
| **Core** | The Skill Heaven runtime: the summon engine, Skill Zero, Skill Heaven, Skill Hell and the Skill Ultra surface. | No console package, no persistent HUD, no pane, no console registration. |
| **Core + Console** | Core, **plus** the supported Skill Heaven console for your harness — Status, Lens, Session, Scope, Flow and Trust where the harness supports them. | A pixel-for-pixel copy of another harness's console. Hosts paint the same six surfaces differently. |

> **Core means no console. Core + Console means console.** That holds for fresh installs, updates,
> reinstalls, switches and uninstalls.

The `*-zero` launchers are a separate, optional axis. All four of these are valid:
**Core**, **Core + launcher**, **Core + Console**, **Core + Console + launcher**. A launcher is not an edition and not part of
either profile.

## Not the Gaia Ecosystem Desktop Mod

Skill Heaven is one product compatible with agentic terminal harnesses. “CLI” is
informal shorthand for its terminal experience, never a separate product name.
Core + Console adds Skill Heaven's supported terminal console/readout, **not** the separately
released Gaia Ecosystem Desktop Mod. That optional Skill Tree + Skill Heaven
integration is governed by HQ #286 / Heaven #161 / Tree #2046: Living Tree B first,
then justified C enhancements. No Mod is silently installed or advertised as
accepted by this profile. Future terminal-native adaptations are outside #196.

Statusline visibility is independently configurable: `SKILL_HEAVEN_STATUS=off`
for Pi; Claude's console `status: off` option. Its persistent contribution never
exceeds one compact line, even under the legacy statusline `full` option.
Command-backed consoles add no persistent statusline. Launchers remain optional.

## One source of truth

Everything below is derived from one table, `HARNESS_PATHS` in `packages/status/src/compat.ts`:

```text
HARNESS_PATHS ──► install plans (packages/status/src/install-plan.ts)
                    ├─ install-agent-plugin.sh / .ps1     (scripts/install-profile.mjs, generated bundle)
                    ├─ /start                              (site: the exact commands for harness × profile)
                    ├─ console Trust                       (what Core + Console installed, what it reads and writes)
                    ├─ the /console showcase               (per-surface native · degraded · unsupported)
                    └─ docs + tests                        (test/install-profiles.test.ts holds them equal)
```

No installer, page or doc spells a registration command of its own. A drift test fails the build if one
does.

## The invariants

1. **Core + Console = Core + one piece.** The console is always a *separately registrable and removable* piece. A
   harness whose console cannot be registered that way is **blocked**: the installer says so and stops. It
   never falls back to Core and calls it Core + Console.
2. **Core never depends on the console. The console depends on Core.** Core works with the console absent,
   disabled or removed.
3. **Switching touches only the console.** Core → Core + Console adds the console piece. Core + Console → Core removes it.
   Neither re-registers or removes Core.
4. **No surprise Core + Console.** With no `--profile` and no terminal to ask on, the profile is **Core**. A re-run
   without `--profile` keeps the profile the last run recorded.
5. **No silent host mutation.** Staging never installs a harness binary or edits
   host settings. It prints each client's canonical registration commands;
   explicit `--register` runs exactly those host-owned commands. The host records
   only the selected packages; unrelated settings must be preserved.
6. **Fail closed.** If a required Core + Console piece cannot be registered safely, the install stops and says why.
7. **The console observes; it never governs.** It cannot submit a prompt,
   independently retrieve, widen a permission or write shared runtime state.
   Pi/Hermes Lens draft a handoff only. Claude's explicitly requested preview uses
   the supported host tool path; other command-backed previews are model-mediated
   through the normal Core tool. Buttons prefill; the person submits.

## Transitions

| From → To | What changes | What does not |
|---|---|---|
| none → Core | Core's register steps. | No console file or registration exists. |
| none → Core + Console | Core's register steps, then the console's. | |
| Core → Core + Console | The console's register steps only. | Core is untouched. |
| Core + Console → Core | The console's remove steps only. | Core keeps working. |
| Core → Core, Core + Console → Core + Console (re-run) | Update steps; idempotent. | Nothing is added or removed. |
| Core + Console → none | The console's remove steps, then Core's. | Launchers are not touched. |
| Core → none | Core's remove steps. | Launchers are not touched. |

Windows: the PowerShell installer shares the same plan data. Native Windows runtime evidence is tracked
separately in #94 and is **not** claimed here.
