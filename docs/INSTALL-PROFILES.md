# Core vs Full — the two install profiles

**Status: design of record for #191 · #192 · #193 · #194 · #195.** Implementation guidance, not
ratification — decisions stay with `gaia-research/founder/RATIFICATION.md`; the product model is N13
(`docs/LADDER-FLOW.md`) and the console design is `docs/CONTROL-PLANE.md`.

Skill Heaven installs in exactly two profiles, on every supported harness:

| Profile | You get | You do not get |
|---|---|---|
| **Core** | The Skill Heaven runtime: the summon engine, Skill Zero, Skill Heaven, Skill Hell and the Skill Ultra surface. | No console package, no persistent HUD, no pane, no console registration. |
| **Full** | Core, **plus** the best truthful native Skill Heaven console for your harness — Status, Lens, Session, Scope, Flow and Trust where the harness supports them. | A pixel-for-pixel copy of another harness's console. Hosts paint the same six surfaces differently. |

> **Core means no console. Full means console.** That holds for fresh installs, updates,
> reinstalls, switches and uninstalls.

The `*-zero` launchers are a separate, optional axis. All four of these are valid:
**Core**, **Core + launcher**, **Full**, **Full + launcher**. A launcher is not an edition and not part of
either profile.

## One source of truth

Everything below is derived from one table, `HARNESS_PATHS` in `packages/status/src/compat.ts`:

```text
HARNESS_PATHS ──► install plans (packages/status/src/install-plan.ts)
                    ├─ install-agent-plugin.sh / .ps1     (scripts/install-profile.mjs, generated bundle)
                    ├─ /start                              (site: the exact commands for harness × profile)
                    ├─ console Trust                       (what Full installed, what it reads and writes)
                    ├─ the /console showcase               (per-surface native · degraded · unsupported)
                    └─ docs + tests                        (test/install-profiles.test.ts holds them equal)
```

No installer, page or doc spells a registration command of its own. A drift test fails the build if one
does.

## The invariants

1. **Full = Core + one piece.** The console is always a *separately registrable and removable* piece. A
   harness whose console cannot be registered that way is **blocked**: the installer says so and stops. It
   never falls back to Core and calls it Full.
2. **Core never depends on the console. The console depends on Core.** Core works with the console absent,
   disabled or removed.
3. **Switching touches only the console.** Core → Full adds the console piece. Full → Core removes it.
   Neither re-registers or removes Core.
4. **No surprise Full.** With no `--profile` and no terminal to ask on, the profile is **Core**. A re-run
   without `--profile` keeps the profile the last run recorded.
5. **Nothing is installed or edited silently.** The installers never install a harness binary and never
   edit a harness's settings. They *print* each client's own registration commands; `--register` runs
   exactly those commands, and only when you ask.
6. **Fail closed.** If a required Full piece cannot be registered safely, the install stops and says why.
7. **The console observes; it never governs.** It cannot submit a prompt, call a tool on its own, widen a
   permission or write shared state. A button pre-fills a command a person submits.

## Transitions

| From → To | What changes | What does not |
|---|---|---|
| none → Core | Core's register steps. | No console file or registration exists. |
| none → Full | Core's register steps, then the console's. | |
| Core → Full | The console's register steps only. | Core is untouched. |
| Full → Core | The console's remove steps only. | Core keeps working. |
| Core → Core, Full → Full (re-run) | Update steps; idempotent. | Nothing is added or removed. |
| Full → none | The console's remove steps, then Core's. | Launchers are not touched. |
| Core → none | Core's remove steps. | Launchers are not touched. |

Windows: the PowerShell installer shares the same plan data. Native Windows runtime evidence is tracked
separately in #94 and is **not** claimed here.
