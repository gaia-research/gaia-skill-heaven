# Gaia organization dogfooding and public feedback

This policy is for real work in the five shared Gaia repositories:
`gaia-research`, `gaia-skill-heaven`, `gaia-skill-tree`, `gaia-mcp`, and
`gaia-operator`. Standalone `skill-*` repositories, archived repositories,
forks, Milim/apps/pets, `marketing-tasks`, and private `.github` repositories
are exempt. A private organization file is not assumed to load in another
repository or harness.

## Use what is already available

- Prefer the in-house Skill Heaven Agent Plugin or its actual supported Skills
  API surface when a real task need or capability gap makes it relevant and the
  current harness makes it available. Native harness skills may be a fallback
  only when the in-house surface is unavailable; using one is not Skill Heaven
  validation. There is no quota, mandatory skill count, or gratuitous summon.
- Do not pretend a plugin, MCP, native skill, command, or client is installed
  or available. Availability is harness- and session-specific; an unavailable
  capability is an observed blocker. Preserve the zero posture and human intent;
  do not silently edit user-global configuration or install anything globally.
- `/summon` adds one skill to the current session. It is not a permanent
  installation. Use the actual client surface available in the current session;
  do not invent a universal registration command or tool name.
- Apply a summoned skill only after reviewing its returned card and, when
  provided, its resource-linked `SKILL.md`. Relevance or retrieval rank is not
  proof that the skill helped.

## Record observed friction, not speculation

When friction appears during relevant real work or through direct human
feedback, capture a minimal local note immediately or as soon as practical.
At task end, review pending notes before deciding whether any needs action. The
note should include:

- observed behavior versus expected behavior;
- repository and commit, harness/client and version, and the route or source
  when known;
- a safe, minimal reproduction and impact; and
- evidence separated from inference, with human-reported facts identified as
  such.

Do not treat retrieval score, materialization success, an exit code, or a
`judgeVerdict: null` as behavioral success, usefulness, or task outcome. Keep
existing selection policy, labels, evidence semantics, and curator gates
unchanged. Unknown outcomes stay unknown.

## File one public issue only for new actionable friction

At task end, after reviewing pending notes, only when a note describes new,
actionable friction, use the smallest safe light-agent capability that the
current supported harness actually provides to deduplicate/search and file one
issue in [`gaia-research/gaia-skill-heaven`](https://github.com/gaia-research/gaia-skill-heaven).
The dispatch must respect active worker limits, explicit no-delegation
instructions, and repository-specific approval gates. The issue writer must
not invoke another issue writer or restart this loop; avoid duplicate reports.
Aggregate one underlying problem, and add new facts to an existing issue when
that is the better match.
If dispatch or filing is blocked, save a local draft and report the blocker; do
not bootstrap another harness or override a gate.

Filing is authorized for this feedback procedure, but privacy is a hard gate.
Public issues must contain a synthetic minimal reproduction or an explicitly
redacted one—never raw prompts, transcripts, session logs, credentials, access
tokens, raw tokenized content, personal data, private code, private URLs or
paths, customer identifiers, or confidential details. If aggregate cost or
usage is included, it must come from canonical `gaia-research/skill-cost` with
provenance, never from a UI or model self-report. Do not collect more data for
that purpose. If the case cannot be safely reduced, save a local draft and ask
the owner; do not post it. If no safe agent, authentication, or issue tool is
available, save a draft and report that honestly rather than claiming it was
filed. Use only labels that actually exist.

Use an issue title and summary that state expected versus observed behavior,
exact versions when known, a reproducible safe case, impact, evidence, and
unknowns. Distinguish the agent's report from a human assertion; neither is a
curated behavioral result. Safe filing under this procedure is not a general
exception to per-action approval for other public or irreversible actions; in
Gaia Operator, keep any required draft and request approval before acting.

## Optional local observations

Prefer existing caller-controlled local JSON/log surfaces. In Skill Heaven,
`skill-zero --telemetry-out FILE` is opt-in and can be checked with
`skill-zero --telemetry-validate FILE`; supply only signals actually observed
and use a coarse task family. Existing summon JSON, session manifests, and
`summon-log.jsonl` are local observation surfaces, not proof of task success.
Do not add always-on upload, full-transcript capture, a background daemon,
an autonomous issue flood, or automatic Skill Heaven policy tuning. Automatic
issue handoff is an agent procedure, not deterministic implemented telemetry.

The owner/orchestrator centrally reviews and merges these policy PRs. Workers
prepare branches and PRs; they do not merge their own changes.
