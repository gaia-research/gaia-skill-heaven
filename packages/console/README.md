# Full console adapters

`packages/status/src/console-{state,host,view}.ts` is the shared semantic/evidence
model. Adapters observe host events or explicitly bound engine receipts and paint
that model; they do not implement another selection policy or summon server.
Ultra remains provisioned with no working controller (#126).

## Carriers and limits

| Host/version exercised | Separate artifact | Strongest implemented carrier |
|---|---|---|
| Claude Code 2.1.294 | `plugins/skill-heaven-console` | Native mod SDK: one compact status contribution, explicit pane and Lens band |
| Pi 1.1.0 | `plugins/skill-heaven-console-pi` | Owned compact status; official `ctx.ui.custom` overlay; explicit Lens handoff |
| Codex 0.161.0 | `plugins/skill-heaven-console-codex` | Explicit plugin skill, model-mediated bundled report |
| Hermes 0.20.0 | `plugins/skill-heaven-console-hermes` | Native Python command registration; stateless Node report; printed Lens handoff |
| Grok 1.0.46 | `plugins/skill-heaven-console-grok` | Explicit command file, model-mediated bundled report |
| Agy 1.3.1 | `plugins/skill-heaven-console-agy` | Namespaced plugin skill, model-mediated bundled report; real HOME preserved |

The versions above are native package-management pins, not a claim that every
runtime surface has passed. Pi's Full pane requires Pi 1.1+ / pi-tui 0.84.1+.
Command-backed hosts have **no persistent HUD**. Their terminal/tool-trace layout
and dismissal are host-owned; do not promise Pi's overlay on them. Flow is
unsupported where real agent IDs cannot be observed. No agents are fabricated.

## Concise first, inspect deliberately

- Persistent contribution: **one compact line**. No automatic pane or Lens band
  on ordinary summon/read events; another extension's footer/widgets are untouched.
- Bundled text report: at most **eight lines** by default. `--details` is explicit.
- Pi: `/heaven [section]` opens the bounded overlay. `1–6`, Tab/Shift-Tab or arrows
  select Status, Lens, Session, Scope, Flow and Trust. `i` toggles inspection;
  inspected details support Up/Down, PageUp/PageDown and Home/End. Escape, q or
  Ctrl+C dismiss. At most terminal rows minus eight are used; summary body is at
  most eight physical lines. Closing restores native editor focus.
- Pi `/lens <need>` creates only a two-line handoff notice. `/heaven fill` is an
  intentional prefill, not submission. `/heaven dismiss` clears the owned band.
  Existing requested bands render fresh state without opening new widgets.
- Claude: `/heaven` opens a concise pane; `Inspect section` or `/heaven inspect
  <section>` reveals details. Section changes return to summaries. Close/Escape
  dismiss it. Above-prompt Lens appears only after explicit `/lens`, not ordinary
  Core calls. `status:full` does not expand the persistent contribution.
- Hermes `/heaven inspect <section>` adds details; `/lens inspect <need>` prints
  the handoff recipe. A plain `/lens` makes no Core call.
- Codex/Grok/Agy command instructions require the brief bundled report by default;
  an explicit `heaven inspect <section>` adds `--details`. Printed operations never
  execute themselves. Host-owned model prose/tool traces remain a disclosed limit.

Pi's intrinsic **Core tool receipt** also has a concise native renderer; Ctrl+O
shows its complete cards, arguments and structured receipt. The full content is
still delivered to the model as reference data. This is not a Core console/HUD.
Its actual registered schema declares optional boolean `preview`; `preview:true`
was observed returning a candidate with zero materialized manifest entries.

## Authority and evidence

Pi and Hermes Lens commands do **not** dispatch Core tools, publish a request
bridge, retrieve files or submit a prompt. A human submits the handoff through the
normal host tool path and its permission hooks. Native Pi denial-hook testing
blocked a preview without calling Core; a subsequent normal preview succeeded.

Report readers require an exact caller-supplied sessionRoot. Agy additionally
accepts an exact conversation transcript, with unambiguous successful pairing and
result-file confinement to that conversation. They never enumerate sessions,
choose the newest directory, scan general transcripts or export prompts.
Unbound counts are unknown, not zero. Torn JSONL fails closed. Input caps are
8 MiB / 10,000 rows; the shared model keeps 50 recent receipts.

Ledger facts are **reported**, not observed reads. Pi credits complete bodies
only on the **pinned 1.1.0 builtin `read`**: exact public current-tool provenance,
unbounded input, a single text block matching structured output, and no truncation
metadata. The native API deliberately omits details for this complete result;
custom reads and positive-looking `truncation:false` metadata are not proof.
Unknown successful reads show **complete body read not observed**, not “body not
read.” Prior proven full reads survive a subsequent partial/unknown read.
Restoration uses current-branch exact call/result IDs but saved results lack
execution-time source provenance: their whole-body context is **unknown**, never
validated using today's builtin. Other Pi versions keep the console but complete
body-read credit is unverified until their native contract is probed.

## Installation and verification

The canonical profile helper stages exactly one selected console piece at
`marketplace/plugins/skill-heaven-console`, independently of Core. It prepares
clonable marketplace payloads and independent child Git roots, including Hermes.
Stage-only is the default. Explicit `--register` runs canonical argv without shell
interpolation; receipt checkpoints preserve recoverable sources on failure.
Core/Full switches issue console lifecycle operations only. Selected-package
removal is real uninstall/removal, not merely disabling a retained cache. Agy
uninstall confirmation is the empirically accepted canonical stdin, not a guessed
purge, and HOME/keychain behavior is unchanged.

`build:status`, `build:console`, `build:profiles` and `build:pi-skills` regenerate
committed artifacts. Drift checks, root/site/SDK typechecks and deterministic
conformance are separate from native runtime acceptance.

The saved native lifecycle pass observed Core → Full → Core → uninstall with exit
0 in all 24 cells, with no Agy config snapshot differences. Exact exit results were
recovered from the original session's saved tool output after scratch cleanup;
the large reconnaissance campaign was not rerun. Native Pi now additionally has
schema, permission-denial, positive preview, materialization/read, pane height,
paging and dismissal observations. Remaining live report/permission/isolation/
cache-refresh and UI cells must remain explicitly pending until observed. Windows
is unverified (#94); synthetic tests and successful package management do not close
that gap or prove complete six-host runtime acceptance.
