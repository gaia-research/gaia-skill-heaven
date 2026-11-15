# P1c: repair the evidence gaps from Terra review P1-9b89398 (Team C, Antigravity)

Worktree `~/skill-heaven-wt/p1`, branch `feat/ws6-ultra-u3-p1`. Read
`docs/evidence/ultra-126/briefs/P1.md` (rules and fixture) and
`docs/evidence/ultra-126/reviews/P1-9b89398.md` (the findings). You are in your own
herdr tab. Split TUI panes inside it if you need any, and close them after recording.
Model under test: `claude-haiku-5-5`, binary `~/.local/bin/claude`.

Fix exactly these three **warning** findings. Do not touch the critical finding
or any `### Interpretation (orchestrator)` or `## Limit:` text; the orchestrator owns those.

1. **C3 and C4-b raw evidence.** The C3 claims (first assistant-event timestamp,
   echoed stdout reaching the model) and the C4-b claim (`permission_denials: []`)
   have no committed raw output. Re-run C3-h and C4-b (n = 3 each, same flags as
   recorded), capture the harness `--output-format stream-json --verbose` output for
   each run, and commit **sanitized** excerpts under `probes/p1/logs/`: the
   `system`/`init` line with secrets removed (keep `model` and `claude_code_version`),
   the first `assistant` event with its timestamp, and the final `result` event.
   Update the C3-h and C4-b table rows so that each claim cites its log file.
   For C3-t, which is TUI-only, either commit a timestamped pane excerpt file
   or mark the timing claim as "observed in pane, not committed". Do not invent.
2. Already fixed by the orchestrator. Skip it.
3. **Private paths.** Replace the absolute user paths in
   `probes/p1/commands/probe-decide.md` and in `briefs/P1.md` with
   placeholders (`<repo>/…`, `<run_dir>/…`). The fixture must build the absolute
   path inside the disposable run dir at run time (document how in the fixture
   header). Then `grep -rn '/Users/' docs/evidence/ultra-126/` must return nothing
   except in `briefs/P1c.md` and `briefs/P1b.md`, which the orchestrator wrote.

Commit with `Co-Authored-By: Gemini 4 Hydrogen <noreply@google.com>`, then push. PR #258
already exists, so do not open another. Final reply, exactly four lines:
```
PR: #258
Commit: <HEAD SHA>
Handoff: docs/evidence/ultra-126/PROBE.md
Status: READY FOR REVIEW | BLOCKED: <one line>
```
