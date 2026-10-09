# Core / Full console acceptance — PR #196

This is a checkpoint, **not release-complete acceptance**. Skill Heaven is one
product. Core is its portable runtime; Full adds a separately removable terminal
console carrier. The Gaia Ecosystem Desktop Mod is separately owned and neither
profile installs it.

## Proof classes

| Class | Observed result | What it does not prove |
|---|---|---|
| Complete deterministic suite | 1,471 tests / 86 files passed after browser fixes; the first concurrent run timed out and is not counted | Native host runtime, live paint or browser acceptance |
| Claude public SDK runner | 46 tests, zero failures, propagated exit 0 | The runner mocks the SDK; not live terminal paint |
| Type / manifest / generated checks | Root, current public Pi source and Claude SDK typechecks; both Claude manifests/hooks validated; MCP, status, console, profile and Pi-resource generation verified | Host execution or permission behavior |
| Website production build | Passed with About/hero fixes from merged #198 / `2d69d07`, collapse contrast and labeled-region fixes included | A build alone is not browser acceptance |
| Current browser confirmation | 15 rebuilt-source route/width cells: no page overflow or definite tagged axe violations; six host fixture selectors, twelve install choices, keyboard focus, copy feedback and desktop/mobile About stacking observed | Contrast incomplete/manual-review findings remain; not complete WCAG certification |
| Current Claude terminal / preview | 2.1.295 manual-mode status, summary/inspection/dismissal, ordinary per-call refusal, separate approved preview, both receipts painted | No current Claude body-read/effective-use or desktop paint claim |
| Current Hermes command runtime | vgit.8ac5c74 Full registration/removal exit0; actual bounded unknown-count report, Trust inspection, deliberate Lens draft inspection, new-session reset | No current bound Core preview/materialization: default Nous Portal authentication was unavailable |
| Historical native package lifecycle | Core → Full → Core → remove: 24 exit-0 cells, six hosts; Agy configuration snapshot unchanged | Complete six-host runtime acceptance |
| Current Codex / Grok package lifecycle | 12 exit-0 cells: Core, Full, same-profile update, repeated update, console-only downgrade, remove | Core survival requires its own runtime check; plugin-manager exit 0 is not that check |
| Current Pi native runtime | Loaded optional boolean preview schema, ordinary hook denial, approved exact-name preview with one candidate/zero materializations, materialization plus complete builtin read | Retrieval/materialization/read do not prove effective use or successful frontend QA |
| Current Pi terminal paint | Ordinary calls left only the owned compact status; deliberate six-line summary; bounded inspection in a 20-row terminal; q/Escape restore editor; complete read displayed as observed | Unsupported hosts do not gain this pane or a persistent HUD |
| Current Pi aliases / isolation | Package-owned runtime resources loaded through Zero, Heaven `med`, Hell `max`, Ultra aliases; `/new` reset count and selection | Ultra still has no working controller; this is not steering validation |
| Current Pi console removal | Console-only downgrade succeeded; a fresh Core session loaded no console extension, retained summon, and returned one preview candidate; final selected-package cleanup exit 0 | Native Windows remains unverified |

A broad native query also returned an engine `below_floor` no-match. That is kept
as a negative result, not reclassified as a failure or silently discarded. The
exact-name positive case followed without changing retrieval policy.

## Native pins and scope

| Host | Pin | Acceptance scope |
|---|---|---|
| Claude Code | 2.1.295 live continuation; SDK pin2.1.294 | Actual terminal and permission-gated preview observed; public SDK mocks remain separate |
| Pi | 1.1.0, public pi-tui 0.84.1 minimum | Current native runtime and terminal observations above; restoration/custom metadata conformance separate |
| Codex | 0.162.0 | Current package lifecycle above; historical Core smoke at 0.161.0 is not promoted to this version's Full runtime |
| Hermes | vgit.8ac5c74 (2026.9.24); historical0.20.0 | Current native command report/draft/reset observed; bound Core runtime still pending |
| Grok | 1.0.50 (c58f321264ba, stable) | Current package lifecycle; owner-authorized authenticated model discovery; remaining live report/preview pending |
| Antigravity/Agy | 1.3.2 discovered; historical1.3.1 | Public model identifiers only; Full runtime/receipt binding pending; no HOME/keychain replacement |

Pi complete-read credit is deliberately pinned to the current 1.1.0 builtin
contract. Positive-looking custom metadata is not proof. Paired historical results
lack execution-time tool provenance and remain unknown. An uncertain later read
does not erase prior complete-read evidence. Mixed summaries do not label
unknown bodies unread.

## Frontend confirmation — bounded pass

The user explicitly reauthorized the same ego space13/pagep1. Current rebuilt
JavaScript was reloaded for `/start?h=pi` (Full), `/console` and `/landing` at
360,390,768,1024,1440 actual CSS pixels. All15 cells had no page overflow and
zero definite axe4.10.3 WCAG A/AA +2.1 A/AA tagged violations. An animated
landing-row opacity transition exposed1.76:1 contrast during collapse; it now
clips height instead, retaining ink. Focusable labeled readouts have valid
region roles; the earlier aria-prohibited-attr incomplete finding disappeared.

Native radio ArrowDown moved selection and visible focus Pi→Grok. Installer
copy announced success without reading clipboard contents. All twelve host/profile
install choices and six explicitly fixture-labeled console host selectors were
exercised. About was below LIVE at desktop/mobile y58/y68; opened panel was
readable and hit-tested above the ladder at z-index60. Viewport screenshots were
inspected. Eight timed reel samples retained cut-row opacity1 where sampled.

Color-contrast incomplete/manual-review checks remain: Start3 per width,
Console71–356, Landing91–99. This is **not WCAG certification**, every animation
frame, exhaustive keyboard coverage or every clipboard failure path. Earlier
CDP transport/control failures and stale-dist intermediate runs are superseded
by the final rebuilt-source matrix, not counted as passes.

## Release review and remaining gate

Independent review found no material source defect in the bounded installer
registration epilogue or Pi provenance/uncertainty remedies. Its targeted test
assertions passed but one review runner exited nonzero on a worker timeout; that
run is not counted as a clean test pass. The owner's subsequent complete suite
passed. The stale read-state documentation finding was corrected; Pi resource
names were independently checked against the package's canonical aliases.

A separate OpenAI Luna High review found no material browser-fix source defect;
the bounded site test passed26 assertions. The final complete suite passed after
a concurrent-run test/worker timeout. Current Codex native inference succeeded
but selected a nonexistent shell `heaven` command (exit127) rather than visibly
invoking its plugin skill; no Core call followed. That is a failed acceptance
attempt, not an auth/quota error or proof that the plugin is absent. A bounded
load review recommends explicit native skill/MCP discovery before retrying.

Do not mark PR #196 release-ready or merge while the remaining native Full
runtime/binding cells above are pending. #94 (Windows), #126
(Ultra controller) and the broader #137 scope stay open; package-management or
synthetic evidence does not close them.
