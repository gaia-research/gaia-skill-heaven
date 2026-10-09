# Core / Full console acceptance — PR #196

This is a checkpoint, **not release-complete acceptance**. Skill Heaven is one
product. Core is its portable runtime; Full adds a separately removable terminal
console carrier. The Gaia Ecosystem Desktop Mod is separately owned and neither
profile installs it.

## Proof classes

| Class | Observed result | What it does not prove |
|---|---|---|
| Complete deterministic suite | 1,470 tests / 86 files passed after review remedies | Native host runtime, live paint or browser acceptance |
| Claude public SDK runner | 46 tests, zero failures, propagated exit 0 | The runner mocks the SDK; not live terminal paint |
| Type / manifest / generated checks | Root, current public Pi source and Claude SDK typechecks; both Claude manifests/hooks validated; MCP, status, console, profile and Pi-resource generation verified | Host execution or permission behavior |
| Website production build | Passed with About/hero fixes from merged #198 / `2d69d07` included | Current browser responsiveness or accessibility |
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
| Claude Code | 2.1.294 | Historical lifecycle; current SDK validation and mocked runner; final live paint pending |
| Pi | 1.1.0, public pi-tui 0.84.1 minimum | Current native runtime and terminal observations above; restoration/custom metadata conformance separate |
| Codex | 0.162.0 | Current package lifecycle above; historical Core smoke at 0.161.0 is not promoted to this version's Full runtime |
| Hermes | 0.20.0 (2026.8.3) | Historical native lifecycle/Core smoke; remaining Full runtime/receipt binding pending |
| Grok | 1.0.50 (c58f321264ba, stable) | Current package lifecycle; owner-authorized authenticated model discovery; remaining live report/preview pending |
| Antigravity/Agy | 1.3.1 | Historical real-HOME lifecycle/Core observations; remaining Full runtime/receipt binding pending; no HOME/keychain replacement |

Pi complete-read credit is deliberately pinned to the current 1.1.0 builtin
contract. Positive-looking custom metadata is not proof. Paired historical results
lack execution-time tool provenance and remain unknown. An uncertain later read
does not erase prior complete-read evidence. Mixed summaries do not label
unknown bodies unread.

## Frontend gate — not passed

Initial browser inspection covered `/start`, `/console` and `/landing` at
360, 390, 768, 1024 and 1440 CSS pixels: document widths matched viewports;
start/console had no tested WCAG-tag violations. Landing exposed three contrast
defects subsequently corrected. Incomplete axe checks are not blanket WCAG
compliance.

The final confirmation was **not completed**. Earlier CDP screenshot/input calls
timed out. The resumed dedicated ego space then reported user control and an
ended agent assignment. The worker stopped rather than reclaiming it or opening
another browser/space. Current-source contrast, keyboard/focus/clipboard and
About/hero visual confirmation remain gated on explicit browser control.

## Release review and remaining gate

Independent review found no material source defect in the bounded installer
registration epilogue or Pi provenance/uncertainty remedies. Its targeted test
assertions passed but one review runner exited nonzero on a worker timeout; that
run is not counted as a clean test pass. The owner's subsequent complete suite
passed. The stale read-state documentation finding was corrected; Pi resource
names were independently checked against the package's canonical aliases.

Do not mark PR #196 release-ready or merge while browser confirmation and the
remaining native Full runtime cells above are pending. #94 (Windows), #126
(Ultra controller) and the broader #137 scope stay open; package-management or
synthetic evidence does not close them.
