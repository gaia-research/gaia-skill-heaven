# Terra review brief: P1 and P1b probe record (PR #258)

You are the independent reviewer for the Skill Ultra #126 campaign. Review the
actual repository state in this worktree (`~/skill-heaven-wt/p1`, branch
`feat/ws6-ultra-u3-p1`). Do not rely on summaries. Read-only.

Scope: `git diff origin/integration/skill-ultra-126...HEAD`, which adds
`docs/evidence/ultra-126/PROBE.md`, `probes/p1/` (fixture server, writer,
command, logs) and two briefs.

Check:

1. **Evidence integrity.** Every row in the P1 and P1b tables matches a committed log
   under `probes/p1/logs/` (spot-check at least one run per cell against the raw
   JSONL). Flag any claimed signal that has no log behind it.
2. **Fixture correctness.** `server.mjs` really sends `elicitation/create` and
   logs the client response verbatim. `operator_decide` is a no-op. Nothing in
   the fixture could manufacture an `accept`.
3. **Interpretation soundness.** Do the orchestrator's interpretations under P1 and
   P1b follow from the signals? Is anything overstated? In particular: is
   "headless fails closed" supported, and is "bypass/auto do not void channel 1"
   supported?
4. **D-009 limit.** Does the "Limit: channel 1 is terminal input, not
   authentication" section state the boundary accurately and completely? Does
   any part of the record, anywhere, imply that channel 1 authenticates a person
   or that a fixture keystroke was a human decision?
5. **Privacy and secrets.** No credentials, tokens, private paths or personal data
   in committed logs.
6. **Security invariants** from the plan (`docs/plans/2026-11-15-skill-ultra-campaign-126.md`
   section 6, and section 5.3 on channels). Does the record support U3 building on channel 1
   without violating "agent text cannot manufacture operator authority"? Name the
   conditions U3 must meet.

Output: reviewed SHA (`git rev-parse HEAD`), a verdict, `Blocking findings: yes|no`,
then each finding with file:line, severity and a fix.
