# Skill Ultra campaign control — execution plan for #126

**Status:** DRAFT, 2026-11-15. Eleven founder decisions are pending (§3). Each
section below is written against the recommended option and names the decision
it depends on, so a different ruling changes a marked paragraph, not the plan.
**Tracks:** [#126](https://github.com/gaia-research/gaia-skill-heaven/issues/126).
**Supersedes:** nothing. Tracking PR #132 was closed unmerged with no content.
**Scope:** `gaia-skill-heaven`, plus one ratification delta in `gaia-research`.

Nothing in this document is a claim that a campaign controller exists. Until
the proof in §8 is recorded, every surface keeps saying what it says today:
Ultra is provisioned and its controller is unavailable.

---

## 1. Where we are (scouted 2026-11-15)

Five read-only scouts covered the three repositories and the linked issues;
load-bearing claims were then re-checked against source. `main` at `95c8b10`:
105 test files, 1840 tests pass, typecheck clean, Node 22.23.4.

### 1.1 What #126 can stand on

| Piece | State | Where |
|---|---|---|
| Deterministic steering (`stepSteering`, replay, verify) | Built, tested, **wired to no session** | `packages/core/src/steering.ts` |
| Preview ranking that materializes nothing | Built | `packages/skill-summon/src/summon/summon.ts` (`preview: true`) |
| Refusal and `noMatch` as first-class outcomes | Built | same, plus `log.ts` |
| Human-led / model-led lane filter | Built | `rank.ts`, `summon.ts` |
| Server-side refusal that survives the model forgetting (`zero_cuts`) | Built, live-probed on Claude Code 2.1.318 | `zero-cut.ts`, `docs/evidence/hooks-123/PROBE.md` |
| Status slot for a reported controller, with campaign progress | Built, **nothing feeds it** | `packages/status/src/model.ts`, `adapters.ts` |
| Proposed status schema `skill-heaven/controller-status@0` | Proposed; "the owner of #126 decides the real one" | `adapters.ts:429` |
| Arbor consumer (profiles, identity, band, composition, disclosure) | Built | `packages/core/src/arbor/*` |
| Installability consumer | Built; upstream publishes `gaia.installability/v1` (472 skills, 0 observations) | `packages/skill-summon/src/data/installability.ts` |
| Transcript stamp reader `skill-ultra-stamp/v1` | Built; `verified_outcome` has no trusted source yet (#208) | `packages/core/src/ultra-stamp/` |
| SessionStart context hook | Built in the Console plugin only, opt-in, default off | `plugins/skill-heaven-console/hooks/hooks.json` |

### 1.2 What does not exist

Campaign state, reconnaissance fan-out, a capability manifest, a charter and
its ratification, a work-unit queue, convergence packets, any carry-over of
controller state across compaction, and the end-to-end proof. That is all of
#126's definition of done.

### 1.3 Upstream, as published today

- **Arbor profiles** (`gaia.arbor-runtime/v1`): 22 runtime files, 28 claims,
  all source-declared except one governed record that is `inconclusive`.
  Human-led and model-led are published as independent facets. No HH payload
  contract exists (research#207 open on Q3/Q4).
- **Interaction edges** (`gaia.arbor-edge-index/v1`): all seven kinds are in
  the contract; three declared edges exist; `pairsEvaluated: 0`.
- **Tree guidance for this consumer** already exists:
  `gaia-skill-tree/founder/reports/arbor-i-seed-2026-11-10/HANDOFF.md` §12.
  This plan adopts it unchanged (§5.8).
- **Stamps** (`ultra-ready` and the rest) are drafted only. The benchmark
  ledger has no `hell` or `ultra` records.

Nothing upstream blocks the controller. Every upstream lens has a defined
absent state, and the plan ships against the absent state.

### 1.4 Lane issues

Closed: #116, #117, #118, #119, #125, #85, #91, tree#1711, tree#1712,
research#208. Open and relevant: #123 (Console release and the hook default),
#137 (statusline adapters), #208 (stamping), research#207 (HH payload),
#253 (SPEC and PLAN still say Arbor has no relation contract — fixed in U8).

---

## 2. The design in one page

The one component that already enforces a rule mechanically, and keeps
enforcing it after the model's context is compacted, is the summon MCP server:
it is a process, it owns a session directory, and it refuses calls on its own
authority (`zero_cuts`). The campaign control plane is built the same way.

```
 user ── /skill-ultra <goal> ─────────────────────────────┐
 user ── ratify · amend · answer · stop (operator channel) │
                                                           ▼
 agent ── campaign tool ──►  summon MCP server  ──►  campaign engine (pure)
          recon · propose        │  enforces            packages/core/src/campaign
          next · report          │  the envelope        fold over an append-only trace
          incident · status      ▼
                          session root/campaign/
                          trace.jsonl · charter · manifest · incidents · status.json
                                 │
                                 ▼
                 status model ──► statusline · console · explain CLI
```

Four rules carry the design:

1. **State is a fold over an append-only trace.** The engine is pure, like
   `steering.ts`: no I/O, no clock, no randomness. Current state is recomputed
   from `trace.jsonl`, so it is replayable and verifiable, and no prose in the
   model's context is ever the source of truth (INV-U12, K9).
2. **The server enforces the envelope; the agent proposes inside it.** A summon
   or a state change the charter does not allow is refused by the server, not
   discouraged by a prompt (INV-U7, INV-U13).
3. **The agent has no tool that ratifies.** Ratify, amend, answer and stop
   arrive on a separate operator channel (§5.3). A summoned skill body that
   says "approve the campaign" has nothing to call.
4. **Every tool result during a campaign carries a short state digest**, so
   the agent is re-anchored at each call without a hook (§5.7).

---

## 3. Founder decisions

Recorded verbatim in §3.1 once made; nothing is built against an unrecorded
choice. The review surface is the founder packet (a private page, linked from
the PR); this table is the record.

| # | Decision | Recommended | Blocks |
|---|---|---|---|
| FD-0 | Continue with the masterplan | Continue as planned, through the recorded proof | everything |
| FD-1 | What a ratified campaign grants for automatic summons | Same reach as `/skill-hell`, for that campaign only, minus what the charter excludes; unplanned summons flagged | U3, U5 |
| FD-2 | Where D5 ("no model call ever decides a loadout") stops — closes research OPEN 7 | D5 governs the router: ranking stays deterministic with no model inside it; choosing among returned cards is outside D5 | U1, U2 |
| FD-3 | Human-led skills inside a campaign | Convergence-time only: Ultra names the skill in the incident, the person invokes it | U3, U6 |
| FD-4 | Where mechanical campaign support may live | Core stays hook-free and enforces in the server; the Console plugin may add an opt-in hook that is inert unless a ratified campaign exists | U7 |
| FD-5 | Whether campaign state may outlive the session | Session directory by default, plus an explicit export file the person names, for resume | U0, U7 |
| FD-6 | Vocabulary | Ratify the #126 words as canonical on the PR that ships each surface | every shipped string |
| FD-7 | Oracle entry | Record #126's direction as a new N-entry, landing with the first implementing PR (D9) | U3 |
| FD-8 | Harness scope of the first proof | Claude Code only; other doors get the portable core, labelled unprobed | U7, U9 |
| FD-9 | Proof campaign target, model and cost ceiling | This repository's own open backlog, a bounded slice | U9 |
| FD-10 | Execution environment | Build and probe in the cloud environment; run the proof where the founder can watch it | scheduling |

### 3.1 Rulings

_None recorded yet._

---

## 4. Planner rulings (adopted unless overruled)

These are design choices #126 delegates to the planner. They are listed so
they can be overruled cheaply, not because they need sign-off.

- **PR-1 Engine location.** `packages/core/src/campaign/`. `skill-summon`
  already imports `skill-zero`, so the bundled MCP picks it up with no new
  dependency.
- **PR-2 One new tool, not six.** A single `campaign` tool with an `op` field.
  Every tool definition is a standing dose paid by every session that has the
  plugin, including sessions that never use Ultra. U1 measures and reports
  that dose as its own number.
- **PR-3 Status schema.** `skill-heaven/controller-status@0` is promoted to
  `/v1` unchanged in shape; the added states are `RECON`, `RATIFY` and
  `CONVERGENCE`. The parser in `adapters.ts` already accepts them.
- **PR-4 Recovery bounds are charter fields, not constants.** How many recover
  and reopen attempts a work unit gets is proposed per campaign and ratified by
  the person. No default is compiled in. This is a stop rule for repeated
  failure (INV-U10), not a count on a rung or a cap on a summon, which N13(4)
  forbids.
- **PR-5 Verification receipts are attested, then replayable.** With no hook
  observing tool calls, a verify result is reported by the agent together with
  the command and an output digest, and is labelled `attested`. A standalone
  CLI re-runs recorded commands and upgrades matching receipts to `replayed`.
  A work unit closes only on a receipt whose command the charter names
  (INV-U15). No receipt is ever described as proof the work is good.
- **PR-6 Default authority split in the charter template.** Automatic: local
  commits, pushes to campaign branches, draft pull requests. Human-only: merge,
  close, release, force-push, deletion, anything the charter lists as
  irreversible. The person edits this at ratification.
- **PR-7 Bare `/skill-ultra` is unchanged.** With no goal it stays today's
  stateless rung reference. A campaign starts only from `/skill-ultra <goal>`.
- **PR-8 Sequential PRs to `main`, each inert until U3.** The repository
  squashes; a long integration branch would squash the evidence away. The
  campaign tool is not registered in the bundled MCP before U3, and all Ultra
  copy stays "provisioned" until §8 is recorded.
- **PR-9 A blocked unit does not stop the campaign.** Units that do not depend
  on an open incident keep running; questions are batched (INV-U8, K7).

---

## 5. Architecture

### 5.1 Artifacts and owners

| Artifact | Schema id | Owner |
|---|---|---|
| Charter (immutable per revision) | `skill-heaven/campaign-charter/v1` | gaia-skill-heaven |
| Capability manifest | `skill-heaven/campaign-manifest/v1` | gaia-skill-heaven |
| Trace (append-only, source of truth) | `skill-heaven/campaign-trace/v1` | gaia-skill-heaven |
| Convergence incident | `skill-heaven/convergence-incident/v1` | gaia-skill-heaven |
| Status projection | `skill-heaven/controller-status/v1` | gaia-skill-heaven |
| Rung movement under a campaign | `gaia-steering-trace/v1` (existing) | gaia-skill-heaven |
| Identity, Arbor profiles, edges, installability | `gaia.arbor-*`, `gaia.installability/v1` | gaia-skill-tree |
| HH results, stamps, methodology | not yet published | gaia-research |

If a field this plan needs is missing upstream, the consumer reports the lens
as absent and an upstream issue is filed. No local substitute (INV-U4, K13).

### 5.2 State model

Campaign: `UNARMED → RECON → PROPOSED → RATIFIED → EXECUTING ⇄ CONVERGENCE`,
ending in `COMPLETED`, `STOPPED_BY_USER`, `STOPPED_BY_POLICY`, `BLOCKED` or
`FAILED_SAFE`. An amendment returns to `PROPOSED` at revision n+1 and keeps the
queue.

Work unit: `ready → active → verifying → done`, with
`verifying → recovering → active`, `recovering → reopened → active`, and
`→ needs-human` or `→ blocked`.

Controller decisions reuse the steering vocabulary — `HOLD`, `EXPLORE`,
`RECOVER`, `REOPEN`, `CHECKPOINT`, `CLOSE`, `STOP` — plus `RECON`, `RATIFY`
and `CONVERGENCE`. `HOLD` is the default; absent or malformed input holds.

The engine owns a steering runtime adapter. A verify failure becomes a
`behavioral-failure` event and a verify pass a `behavioral-recovery`, so the
effective rung shown under `[ULTRA]` comes from `stepSteering`, not from a
second rule set. Retrieval scores, margins and `noMatch` never become events
(INV-U3, K4; SPEC INV-11).

Every trace entry records: `seq`, `from`, `to`, `trigger`, `signal`, the
charter revision and clause that allowed it, skills involved, phase, work
unit, and whether a person was required (INV-U14, K10).

### 5.3 Input channels

| Channel | Who | Can do | Trust |
|---|---|---|---|
| Operator | the person | ratify, amend, answer, checkpoint, stop, resume | Authoritative |
| Agent | the model, through the `campaign` tool | recon, propose, next, report, incident, status | Untrusted; changes state only where the ratified charter allows |
| Engine | the server | mint steering events from verify reports; refuse | Mechanical |

The operator channel is the one part of the design that depends on what the
harness can do, so it is probe-gated (§7, U3). Preference order, each tried on
the pinned harness and used only if its probe passes:

1. **MCP elicitation** — the server asks the person directly; the model is not
   in the path.
2. **Command pre-execution** — `/skill-ultra ratify` runs a script before the
   model sees the turn; the script writes an operator record the server reads.
3. **A dedicated operator tool the command never pre-approves**, so the harness
   permission prompt is the gate.

Whichever is used, the evidence record says which, and says plainly what it is
not: channels 2 and 3 are conventions a model with shell access could imitate,
the same class of boundary as the steering brand ("not authentication").

### 5.4 The handshake (`/skill-ultra <goal>`)

1. **Goal contract.** The agent calls `campaign{op:"open"}` with the goal, the
   work universe, the repositories, the acceptance commands, human-only
   operations and stop conditions it has resolved with the person. Stored as
   structured state.
2. **Reconnaissance.** `campaign{op:"recon", gaps:[…]}`. The agent chooses the
   gap queries; the server runs one preview per gap through the existing
   deterministic ranker and returns cards only. Per gap it records candidates,
   refusal or `noMatch`, source freshness, installability, lane, and the Arbor
   and Graph lenses or their absent state. Nothing is materialized (INV-U2, K2).
3. **Manifest.** Each entry points at a retrieved card and keeps its lenses as
   separate fields. The schema has no combined score, and a test fails if one
   is added (INV-U5, K6). Relations annotate; they never filter or reorder
   (K5).
4. **Proposal.** `campaign{op:"propose"}` is refused unless it cites a recon
   record, and every arsenal entry must trace to a card in that record. This is
   the mechanical form of INV-U1 and the test for K1.
5. **Ratification.** A deterministic renderer prints the control strategy:
   phases, arsenal by phase, what runs automatically, what needs the person,
   recovery bounds, checkpoints, stops, and which lenses are absent. The person
   ratifies, amends or declines on the operator channel.

### 5.5 Executing

`campaign{op:"next"}` returns the next ready unit: dependency order, then
charter phase order, then a stable tie-break. The agent may propose batches
before ratification; regrouping afterwards writes a checkpoint entry.

During `EXECUTING` the server's summon path consults campaign state
(FD-1): a materializing summon without a per-skill request is allowed only for
a model-led skill the charter does not exclude, and only for a unit that is not
waiting on a person. Human-led skills and the publish-class deny-list are
never reachable this way (INV-U6, K3; research T8). A summon outside the
manifest is allowed and written to the trace as `unplanned`, to be shown at the
next checkpoint. With no campaign, the server behaves exactly as today.

`campaign{op:"report"}` moves a unit. A verify failure leads to `RECOVER`
until the charter's bound, then `REOPEN` until its bound, then `CONVERGENCE`.
A refusal from retrieval is never read as a reason to explore harder.

### 5.6 Convergence incidents

`campaign{op:"incident"}` takes a packet: work affected, what was attempted,
why progress stopped, branches explored, evidence, skills consulted, what is
ruled out, at least two remaining options with tradeoffs, why this needs a
person (`product-intent`, `irreversible`, `authority-boundary` or
`charter-gap`), the questions, and what happens after the answer.

The server refuses a packet that shows no preparation: the trace must hold at
least one preview or summon for the affected unit since it became unstable, or
an explicit refusal record (INV-U8, K7). It also refuses to let the campaign
continue through a unit whose incident is open (K8). Human-led skills that
would help are named in the packet as candidates for the person to invoke
(FD-3). The answer arrives on the operator channel, is written to the trace
verbatim, and the affected units resume.

### 5.7 Surviving long context

| Layer | Mechanism | Needs |
|---|---|---|
| L0 | State and enforcement live in the server and on disk | nothing; portable |
| L1 | Digest in every campaign and summon result | nothing; portable |
| L2 | Console hook re-injects the digest after `compact` and `resume` when a ratified campaign exists | FD-4, Claude Code |
| L3 | Export file and `/skill-ultra resume <file>`, binding through `SKILL_SUMMON_SESSION` | FD-5 |

What is claimed is only what §7's compaction cells measure on the pinned
harness. Envelope enforcement after compaction must hold in every run because
it does not depend on the model. Whether the agent keeps working the queue
after compaction is a measured rate, reported with its n.

### 5.8 Arbor and Graph

Adopted from the Tree handoff: refresh the shipped Arbor cache and identity
pins; render declared claims as their own group, "declared, not measured",
with attribution; let the charter review be the conditions check instead of a
prose matcher; use relations only to annotate; treat human-led claims as
convergence candidates. A join miss or an `absent-*` lens is unknown.

### 5.9 Degraded states

| Available | Result |
|---|---|
| Reach only | Retrieval-backed campaign; composition disclosed as relevance-only |
| Reach and Arbor profiles | Declared claims shown; pairwise composition unknown |
| Retrieval refusal on a gap | "No capability found"; never a signal to explore |
| HH absent | Disclosed as absent; no local substitute |
| No operator channel passes its probe | The handshake stops at `PROPOSED` and says why |

---

## 6. Security

- The Core plugin still installs no hooks (founder ruling 2026-11-04;
  `test/core-plugin-no-hooks.test.ts` stays green).
- All new rendered text passes the existing authority-phrase gate.
- New regression tests: a summoned body, a card, and a tool result each
  containing ratification or widening text change no campaign state; a
  proposal citing no recon is refused; a human-led skill is refused on the
  automatic path in every campaign state; a forbidden skill is refused after
  a simulated compaction.
- The server instruction that names `/skill-hell` as the only source of a
  standing permission changes only under FD-1, in the same PR as its tests.
- P3 holds: writes stay inside the session root, except the export file the
  person names (FD-5).

---

## 7. Work breakdown

Each unit is one PR to `main`, safe to merge alone. S ≈ under 300 changed
lines, M ≈ 300–900, L ≈ 900–2000, tests included.

| Unit | Delivers | Size | After | Evidence that closes it |
|---|---|---|---|---|
| U0a | Pure engine: types, schemas, `stepCampaign`, replay, verify | L | FD-5 | Unit and property tests; a 150-unit synthetic sequence replays byte-identically |
| U0b | Persistence shell, status projection `/v1`, explain and verify CLI flags | M | U0a | Status slot shows reported campaign progress in tests; explain output for every transition kind |
| U1 | `campaign` tool with `recon` and `status`; recon report | M | U0b, FD-2 | Refusal tests; no file materialized during recon; standing dose of the tool reported |
| U2 | Manifest build and renderer | M | U1 | No-combined-score test; relations-annotate-only test; absent-lens rendering |
| U3 | Charter, proposal renderer, `/skill-ultra` subcommands, operator channel, ratification delta in gaia-research | L | U2, FD-1, FD-3, FD-6, FD-7 | Operator-channel probe record on the pinned harness; authority regression; plan-before-recon refused |
| U4 | Work-unit queue, `next`, `report`, steering wiring | L | U3 | Recover and reopen tests; replay explains each; rung under `[ULTRA]` from steering |
| U5 | Summon gate under a campaign | M | U4 | Lane, exclusion and deny-list tests in every state; unchanged behaviour with no campaign |
| U6 | Incident packets and answers | M | U5 | Unprepared packet refused; open incident blocks only dependent units |
| U7 | Compaction probes; Console hook if FD-4 allows; export and resume if FD-5 allows | M–L | U6 | `docs/evidence/ultra-126/PROBE.md` with pinned version, cells and n |
| U8 | Arbor cache refresh, declared-claims group, #253 doc fix | M | U2 | Join hits on the refreshed pins; SPEC and PLAN match upstream |
| U9 | The proof, the evidence record, and the copy change from "provisioned" | L | U7, FD-8, FD-9 | §8 |

U8 can run any time after U2. Everything else is a chain.

### Probes (M0 discipline)

Run on the Claude Code version present at probe time, recorded in the record,
in a fresh config directory, headless and in a tmux TUI.

| Probe | Unit | Question |
|---|---|---|
| P1 | U3 | Which operator channels work: elicitation, command pre-execution, permission prompt |
| P2 | U7 | Does the server process and its session root persist across `/compact`, `--resume`, `--continue` |
| P3 | U7 | After compaction, is a forbidden summon still refused (must be every run) |
| P4 | U7 | After compaction, does the agent return to the queue, with and without the L2 hook (rate, n ≥ 5 each) |
| P5 | U7 | Forced auto-compaction in a scripted long run |

A negative result is recorded and narrows the claim; it does not block the
units that do not depend on it.

---

## 8. Definition of done

One recorded run in which, in order: the person invokes `/skill-ultra` with a
real goal; reconnaissance precedes the proposal; a manifest and control
strategy are shown; the person ratifies or edits; work runs inside the
envelope; a real gap triggers a just-in-time model-led summon; a failure
produces an explained recover or reopen; a real human decision produces a
prepared incident; the person answers a small batch; the campaign resumes
without replanning; it survives the compaction the harness has been measured
to survive; and each stage says which lenses were absent.

Not part of done: closing 100 issues, a throughput number, Arbor coverage, or
any stamp. The 100-issue horizon is exercised only by the synthetic sequence in
U0a.

When the run is recorded, the same PR updates every surface that says the
controller is unavailable, and the gaia-research entry that says its
heuristics are not built.

---

## 9. Environment

Checked on 2026-11-15 in the cloud environment "Skill Heaven Full Harness
Design" (unrestricted network, setup script installs the other harnesses).

| Need | State |
|---|---|
| Node 22, npm, tests, typecheck | Present; suite passes |
| Claude Code, nested headless run | Present (2.1.325); a nested `-p` run works |
| tmux for TUI probe cells | Present |
| Other harnesses | Installed, not logged in; not needed under FD-8 |
| `herdr` | Absent; needed only for benchmark arms, which this plan has none of |
| Repository access | gaia-skill-heaven (push), gaia-research (push, for the ratification delta), gaia-skill-tree (read) |
| Secrets | None for U0–U8 |

Two things the cloud environment cannot give:

- **A pinned Claude Code.** The runtime supplies it, and it has already moved
  past the 2.1.318 the hooks probe pinned. Probes record the version they ran
  on and are re-run when it changes.
- **Its own usage budget.** Nested runs draw on the same account limit as the
  session driving them. The scouting for this plan stopped for an hour on that
  limit. A long proof run needs either a visible local session or separate
  billing (FD-10).

Setup-script delta to apply before execution: run `npm ci` in
`gaia-skill-heaven`. Nothing else changes.

---

## 10. Kill criteria

#126's K1–K14 apply unchanged. Each has a test or a probe in §7:
K1 U3 · K2 U1 · K3 U5 · K4 U4 · K5 U2 · K6 U2 · K7 U6 · K8 U6 · K9 U7 ·
K10 U0b · K11 §6 · K12 §8 · K13 §5.1 · K14 U4.
