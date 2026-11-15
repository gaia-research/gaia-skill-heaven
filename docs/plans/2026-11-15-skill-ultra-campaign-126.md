# Skill Ultra campaign control — execution plan for #126

**Status:** READY FOR EXECUTION, 2026-11-15. All eleven founder decisions are
recorded in §3.1. No founder decision remains open; the two choices the
founder deliberately left to run time (roster, environment) are resolved by the
preflight in §9, not by a new ruling.
**Tracks:** [#126](https://github.com/gaia-research/gaia-skill-heaven/issues/126).
**Supersedes:** nothing. Tracking PR #132 was closed unmerged with no content.
**Scope:** `gaia-skill-heaven`, plus one oracle and lexicon delta in
`gaia-research` that rides U3.

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
its decisions step, a work-unit queue, convergence packets, any carry-over of
controller state across compaction or resume, and the end-to-end proof. That is
all of #126's definition of done.

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

### 1.5 Pre-plan probe: what a resume keeps

Run for FD-5 on Claude Code 2.1.325, headless `-p`, cheap tier, a throwaway
stdio MCP server that logs its pid and environment. One run per cell; U7
repeats it properly.

| Cell | Observed |
|---|---|
| Fresh session | The MCP server child receives `CLAUDE_CODE_SESSION_ID`, equal to the harness session id |
| `--resume <id>` | A new server process; **the same** session id |
| `--resume <id> --fork-session` | A new server process; **a new** session id |
| Cache on the resume turn | About 13k tokens written to cache, the same as a fresh start: a resume re-caches whether or not anything is restored |
| Summon server on exit | Does not delete its session root; the root is reaped later (default 4 hours once its process is dead) |

---

## 2. The design in one page

The one component that already enforces a rule mechanically, and keeps
enforcing it after the model's context is compacted, is the summon MCP server:
it is a process, it owns a session directory, and it refuses calls on its own
authority (`zero_cuts`). The campaign control plane is built the same way.

```
 user ── /skill-ultra <goal> ─────────────────────────────┐
 user ── decide · amend · answer · stop (operator channel) │
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
3. **The agent has no tool that approves a charter.** Decide, amend, answer
   and stop arrive on a separate operator channel (§5.3). A summoned skill body
   that says "approve the campaign" has nothing to call.
4. **Every tool result during a campaign carries a short state digest**, so
   the agent is re-anchored at each call without a hook (§5.7).

---

## 3. Founder decisions

| # | Decision | Ruling |
|---|---|---|
| FD-0 | Continue with the masterplan | **A.** Continue as planned. Compaction probes use the multiplexer the environment has (tmux here, herdr locally); a herdr roster runs the pull requests when available |
| FD-1 | What a decided campaign grants for automatic summons | **A.** Hell's reach, for this campaign only |
| FD-2 | Where D5 stops (research OPEN 7) | **A.** D5 governs the router |
| FD-3 | Human-led skills inside a campaign | **A.** At convergence only |
| FD-4 | Where mechanical campaign support may live | **B.** Core hook-free; the Console plugin may carry a campaign hook |
| FD-5 | May campaign state outlive the session | **A.** Session only. A resume of the same session brings the controller and summoned skills back, at the cost the resume already pays |
| FD-6 | Vocabulary | **B.** Accepted with changes: "ratify" becomes "decisions", naming kept open; converge, Heaven and low skill entropy are interchangeable, as are explore, Hell and high skill entropy |
| FD-7 | Oracle entry | **A.** A new N entry, landing with U3 |
| FD-8 | Harness scope | **Other.** Decided by environment: Claude Code only in the cloud; Claude Code, Pi, Agy and Codex under herdr on the local machine |
| FD-9 | Proof target, model, ceiling | **A.** This repository's open backlog. No budget; the founder states the roster per run and usage caps are the pause. Tiers are heavy, standard, cheap; probes run cheap |
| FD-10 | Execution environment | **Other.** Left open; the preflight decides at execution time |

### 3.1 Rulings, verbatim (2026-11-15)

```json
{
  "FD-0": { "choice": "A", "label": "Continue as planned",
    "note": "Compaction proof can be attempted in an environment with a multiplexer (you mentioned tmux is available, use that. I have a different environment with herdr. If thats available, herdr will be used by a different agent roster doing the 11 prs.)" },
  "FD-1": { "choice": "A", "label": "Hell's reach, for this campaign only", "note": "" },
  "FD-2": { "choice": "A", "label": "D5 governs the router", "note": "" },
  "FD-3": { "choice": "A", "label": "At convergence only", "note": "" },
  "FD-4": { "choice": "B", "label": "Core hook-free, Console may carry a campaign hook", "note": "" },
  "FD-5": { "choice": "A", "label": "Session only",
    "note": "session only. The idea of skill heaven as a whole is that skills are ephemeral. The long running campaign is tied to the session. If a session ends, it ends with the session. If the session resumes tho, im expecting all skills summoned and the controller will be back together with the session, but only if the new message gets recached--check the best balance here of resumability." },
  "FD-6": { "choice": "B", "label": "Ratify with changes",
    "note": "ratify -> change to decisions, im suggesting this naming will be kept open since ratify is a strong word. Converge -> interchangable with heaven and low skill entropy. explore -> interchangable with hell and high skill entropy " },
  "FD-7": { "choice": "A", "label": "A new N entry, landing with U3", "note": "" },
  "FD-8": { "choice": "other", "label": "Something else",
    "note": "Depends on the environment. Claude only if in claude cloud. Claude, pi, agy, and codex only if in herdr in the macbook environment.  Depends on current environment." },
  "FD-9": { "choice": "A", "label": "This repository's open backlog",
    "note": "This needs more scouting. I do prefer some rosters over others depending on the issue. 0.33 is too high for a probe, probes should be haiku not sonnet. No budget exists, i will state the roster of the run and usage caps will be the pause, I change rosters depending on the day and availability. So keep this generalized to heavy model, standard, and cheap." },
  "FD-10": { "choice": "other", "label": "Something else",
    "note": "A is fine, but this depends on availability. Right now keep open. My actual execution will be the preflight--to check if user is in the cloud env or in the local " }
}
```

### 3.2 How three rulings were read

These are the planner's readings of notes that left room. Each is cheap to
correct.

- **FD-5, "only if the new message gets recached".** Read as: restoring the
  controller must not add its own cost. §1.5 shows a resume re-caches the whole
  session regardless, so restoration rides that turn and nothing is injected on
  ordinary turns. The design is in §5.7.
- **FD-6, "decisions".** Read as the working name for the step and the state
  where the person approves, amends or declines a proposed charter. The
  operator verb is `decide`. "Ratify" appears nowhere in shipped copy or code.
  Because the naming is open, the word lives in one constants module and one
  copy table so a later rename is a two-file change.
- **FD-9, "no budget".** Read as: no cost ceiling is compiled in or planned
  for. A usage cap pauses the session; §5.7's resume is what picks it up.

---

## 4. Planner rulings (adopted unless overruled)

- **PR-1 Engine location.** `packages/core/src/campaign/`. `skill-summon`
  already imports `skill-zero`, so the bundled MCP picks it up with no new
  dependency.
- **PR-2 One new tool, not six.** A single `campaign` tool with an `op` field.
  Every tool definition is a standing dose paid by every session that has the
  plugin, including sessions that never use Ultra. U1 measures and reports
  that dose as its own number.
- **PR-3 Status schema.** `skill-heaven/controller-status@0` is promoted to
  `/v1` unchanged in shape; the added states are `RECON`, `DECISIONS` and
  `CONVERGENCE`. The parser in `adapters.ts` already accepts them.
- **PR-4 Bounds are charter fields, not constants.** How many recover and
  reopen attempts a work unit gets, and how long a paused campaign's session
  directory is kept, are proposed per campaign and decided by the person. No
  default is compiled in. These are stop rules (INV-U10), not a count on a
  rung or a cap on a summon, which N13(4) forbids.
- **PR-5 Verification receipts are attested, then replayable.** With no hook
  observing tool calls, a verify result is reported by the agent together with
  the command and an output digest, and is labelled `attested`. A standalone
  CLI re-runs recorded commands and upgrades matching receipts to `replayed`.
  A work unit closes only on a receipt whose command the charter names
  (INV-U15). No receipt is ever described as proof the work is good.
- **PR-6 Default authority split in the charter template.** Automatic: local
  commits, pushes to campaign branches, draft pull requests. Human-only: merge,
  close, release, force-push, deletion, anything the charter lists as
  irreversible. The person edits this in the decisions step.
- **PR-7 Bare `/skill-ultra` is unchanged.** With no goal it stays today's
  stateless rung reference. A campaign starts only from `/skill-ultra <goal>`.
- **PR-8 Pull requests go to `main` one at a time, each inert until U3.** The
  repository squashes; a long integration branch would squash the evidence
  away. The campaign tool is not registered in the bundled MCP before U3, and
  all Ultra copy stays "provisioned" until §8 is recorded.
- **PR-9 A blocked unit does not stop the campaign.** Units that do not depend
  on an open incident keep running; questions are batched (INV-U8, K7).
- **PR-10 A fork is a new session.** `--fork-session` gets a new session id
  and therefore no campaign. The fork says so instead of inheriting one.

---

## 5. Architecture

### 5.1 Artifacts and owners

| Artifact | Schema id | Owner |
|---|---|---|
| Charter (immutable per revision) | `skill-heaven/campaign-charter/v1` | gaia-skill-heaven |
| Reconnaissance record | `skill-heaven/campaign-recon/v1` | gaia-skill-heaven |
| Capability manifest | `skill-heaven/campaign-manifest/v1` | gaia-skill-heaven |
| Trace (append-only, source of truth) | `skill-heaven/campaign-trace/v1` | gaia-skill-heaven |
| Convergence incident | `skill-heaven/convergence-incident/v1` | gaia-skill-heaven |
| Status projection | `skill-heaven/controller-status/v1` | gaia-skill-heaven |
| Rung movement under a campaign | `gaia-steering-trace/v1` (existing) | gaia-skill-heaven |
| Identity, Arbor profiles, edges, installability | `gaia.arbor-*`, `gaia.installability/v1` | gaia-skill-tree |
| HH results, stamps, methodology | not yet published | gaia-research |

If a field this plan needs is missing upstream, the consumer reports the lens
as absent and an upstream issue is filed. No local substitute (INV-U4, K13).

### 5.2 State model and vocabulary

Campaign: `UNARMED → RECON → DECISIONS → EXECUTING ⇄ CONVERGENCE`, ending in
`COMPLETED`, `STOPPED_BY_USER`, `STOPPED_BY_POLICY`, `BLOCKED`, `FAILED_SAFE`
or `ENDED_WITH_SESSION`. An amendment returns to `DECISIONS` at revision n+1
and keeps the queue.

Work unit: `ready → active → verifying → done`, with
`verifying → recovering → active`, `recovering → reopened → active`, and
`→ needs-human` or `→ blocked`.

Controller decisions reuse the steering vocabulary — `HOLD`, `EXPLORE`,
`RECOVER`, `REOPEN`, `CHECKPOINT`, `CLOSE`, `STOP` — plus `RECON`, `DECISIONS`
and `CONVERGENCE`. `HOLD` is the default; absent or malformed input holds.

Per FD-6, two triples are interchangeable in copy and are never treated as
separate concepts:

| Direction | Also called | On the line |
|---|---|---|
| converge | Heaven | low skill entropy |
| explore | Hell | high skill entropy |

So `CONVERGENCE` is the Heaven moment of a campaign and `EXPLORE` is its Hell
moment. A session still sits at exactly one rung; under a campaign the selected
rung stays `ultra` and the working rung is shown beside it.

The engine owns a steering runtime adapter. A verify failure becomes a
`behavioral-failure` event and a verify pass a `behavioral-recovery`, so the
working rung comes from `stepSteering`, not from a second rule set. Retrieval
scores, margins and `noMatch` never become events (INV-U3, K4; SPEC INV-11).

Every trace entry records: `seq`, `from`, `to`, `trigger`, `signal`, the
charter revision and clause that allowed it, skills involved, phase, work
unit, and whether a person was required (INV-U14, K10).

### 5.3 Input channels

| Channel | Who | Can do | Trust |
|---|---|---|---|
| Operator | the person | decide, amend, answer, checkpoint, stop | Authoritative |
| Agent | the model, through the `campaign` tool | open, recon, propose, next, report, incident, status | Untrusted; changes state only where the decided charter allows |
| Engine | the server | mint steering events from verify reports; refuse | Mechanical |

The operator channel is the one part of the design that depends on what the
harness can do, so it is probe-gated (P1, U3). Preference order, each tried on
the pinned harness and used only if its probe passes:

1. **MCP elicitation** — the server asks the person directly; the model is not
   in the path.
2. **Command pre-execution** — `/skill-ultra decide` runs a script before the
   model sees the turn; the script writes an operator record the server reads.
3. **A dedicated operator tool the command never pre-approves**, so the harness
   permission prompt is the gate.

Whichever is used, the evidence record says which, and says plainly what it is
not: channels 2 and 3 are conventions a model with shell access could imitate,
the same class of boundary as the steering brand ("not authentication"). If no
channel passes, the handshake stops at `DECISIONS` and says why.

### 5.4 The handshake (`/skill-ultra <goal>`)

1. **Goal contract.** The agent calls `campaign{op:"open"}` with the goal, the
   work universe, the repositories, the acceptance commands, human-only
   operations and stop conditions it has resolved with the person. Stored as
   structured state.
2. **Reconnaissance.** `campaign{op:"recon", gaps:[…]}`. The agent chooses the
   gap queries; the server runs one preview per gap through the existing
   deterministic ranker and returns cards only (FD-2: no model call inside the
   router). Per gap it records candidates, refusal or `noMatch`, source
   freshness, installability, lane, and the Arbor and Graph lenses or their
   absent state. Nothing is materialized (INV-U2, K2).
3. **Manifest.** The agent selects among the returned cards (FD-2). Each entry
   points at a retrieved card and keeps its lenses as separate fields. The
   schema has no combined score, and a test fails if one is added (INV-U5,
   K6). Relations annotate; they never filter or reorder (K5).
4. **Proposal.** `campaign{op:"propose"}` is refused unless it cites a recon
   record, and every arsenal entry must trace to a card in that record. This is
   the mechanical form of INV-U1 and the test for K1.
5. **Decisions.** A deterministic renderer prints the control strategy:
   phases, arsenal by phase, what runs automatically, what needs the person,
   recovery bounds, the pause window, checkpoints, stops, and which lenses are
   absent. The person approves, amends or declines on the operator channel.

### 5.5 Executing

`campaign{op:"next"}` returns the next ready unit: dependency order, then
charter phase order, then a stable tie-break. The agent may propose batches
before the decisions step; regrouping afterwards writes a checkpoint entry.

During `EXECUTING` the server's summon path consults campaign state (FD-1): a
materializing summon without a per-skill request is allowed for any model-led
skill retrieval returns, unless the charter excludes it, and only for a unit
that is not waiting on a person. Human-led skills and the publish-class
deny-list are never reachable this way (INV-U6, K3; research T8). A summon
outside the manifest goes through and is written to the trace as `unplanned`,
to be shown at the next checkpoint. The grant ends with the campaign. With no
campaign, the server behaves exactly as today.

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
would help are named in the packet for the person to invoke; they are never
summoned on the automatic path (FD-3). The answer arrives on the operator
channel, is written to the trace verbatim, and the affected units resume.

### 5.7 Surviving long context, and resuming

A campaign belongs to one harness session and ends with it (FD-5). Nothing is
exported and nothing is written outside the session's disposable directory, so
P3 is unchanged.

| Layer | Mechanism | Needs |
|---|---|---|
| L0 | State and enforcement live in the server and in the session directory | nothing; portable |
| L1 | Digest in every campaign and summon result | nothing; portable |
| L2 | Console hook re-injects the digest on `compact` and `resume`, and only when this session has a live campaign | FD-4; Claude Code |
| L3 | Re-attach on resume: the server finds the session directory by harness session id | a harness that exposes a stable session id |

How L3 works, from §1.5:

- On first use the server records the harness session id in its session
  manifest. On start, if a directory with the same id exists and its old
  process is dead, the server re-attaches to it instead of creating a new one.
  The trace is folded again and the controller is back in the state it left.
- Summoned skills come back with it: their materialized directories are in the
  same session directory, so the paths already in the transcript stay valid.
- Restoration adds no turn of its own. The resume turn re-caches the session
  anyway; the digest arrives in that turn through L2 where the Console is
  installed, and otherwise with the first campaign or summon result (L1).
- A paused campaign's directory is kept for the pause window the person
  decided (PR-4) instead of the default 4 hours, so a usage-cap pause does not
  destroy it. When the window passes the directory is reaped as usual.
- If the directory is gone — reaped, the machine restarted, a cloud container
  reclaimed — the campaign is over. The server reports
  `ENDED_WITH_SESSION` and nothing recovers it.
- A fork is a new session with no campaign (PR-10).
- On a harness with no stable session id, L3 does not exist and a campaign
  ends when the server process does. That is recorded per door, not assumed.

What is claimed is only what U7 measures on the pinned harness. Envelope
enforcement after compaction and after resume must hold in every run because
it does not depend on the model. Whether the agent keeps working the queue is a
measured rate, reported with its n.

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
| No operator channel passes its probe | The handshake stops at `DECISIONS` and says why |
| No stable session id | No re-attach; the campaign ends with the server process |

---

## 6. Security

- The Core plugin still installs no hooks (founder ruling 2026-11-04;
  `test/core-plugin-no-hooks.test.ts` stays green).
- All new rendered text passes the existing authority-phrase gate.
- New regression tests: a summoned body, a card, and a tool result each
  containing approval or widening text change no campaign state; a proposal
  citing no recon is refused; a human-led skill is refused on the automatic
  path in every campaign state; a charter-excluded skill is refused after a
  simulated compaction and after a simulated resume.
- The server instruction that names `/skill-hell` as the only source of a
  standing permission gains one clause for a campaign the person decided
  (FD-1), in the same pull request as its tests.
- Re-attach trusts only a directory that passes the existing disposable-root
  check and carries the same session id; an environment-supplied id that
  matches nothing creates a fresh directory.
- P3 holds without exception.

---

## 7. Work breakdown

Each unit is one pull request to `main`, safe to merge alone. S ≈ under 300
changed lines, M ≈ 300–900, L ≈ 900–2000, tests included. Tier is the model
class the unit needs (FD-9); the founder names the actual roster per run.

| Unit | Delivers | Size | Tier | After | Evidence that closes it |
|---|---|---|---|---|---|
| U0a | Pure engine: types, schemas, campaign-level `stepCampaign`, replay, verify | L | heavy | — | Unit and property tests; absent or malformed input holds; agent events cannot produce operator transitions |
| U0b | Store, session re-attach, status projection `/v1`, explain and verify CLI flags | M | standard | U0a | Status slot shows reported campaign progress; re-attach and pause-window tests; explain output for every transition kind |
| U1 | `campaign` tool with `open`, `recon`, `status` | M | standard | U0b | Refusal tests; nothing materialized during recon; standing dose of the tool reported |
| U2 | Manifest build and renderer | M | standard | U1 | No-combined-score test; relations-annotate-only test; absent-lens rendering |
| U3 | Charter proposal, decisions step, `/skill-ultra` subcommands, operator channel, oracle and lexicon delta in gaia-research | L | heavy | U2 | P1 record on the pinned harness; authority regression; proposal without recon refused |
| U4 | Work-unit queue, `next`, `report`, `checkpoint`, receipts, steering wiring | L | heavy | U1 | Recover and reopen tests; a 150-unit synthetic sequence replays byte-identically; working rung comes from steering |
| U5 | Summon gate under a campaign | M | standard | U3, U4 | Lane, exclusion and deny-list tests in every state; unchanged behaviour with no campaign |
| U6 | Incident packets and answers | M | standard | U4 | Unprepared packet refused; open incident blocks only dependent units |
| U7 | Compaction and resume probes; Console campaign hook and release | M–L | standard, probes cheap | U5, U6 | `docs/evidence/ultra-126/PROBE.md` with version, cells and n |
| U8 | Arbor cache refresh, declared-claims group, #253 doc fix | M | standard | U2 | Join hits on the refreshed pins; SPEC and PLAN match upstream |
| U9 | The proof, the evidence record, and the copy change from "provisioned" | L | heavy to drive, per-issue tiers in §8.1 | U7, U8 | §8 |

### 7.1 Order and parallel tracks

```
U0a → U0b → U1 ─┬─ U2 ─ U3 ──┐
                │     └─ U8  ├─ U5 ─┐
                └─ U4 ─ U6 ──┴──────┴─ U7 ─ U9
```

After U1 there are two tracks that touch different files: the handshake
(U2, U3) and execution (U4, U6). U8 can run any time after U2. With two pane
workers this is the natural split. Each `campaign` op lives in its own file
under `packages/skill-summon/src/campaign/ops/`, so the tracks do not collide
in the server.

### 7.2 Probes (M0 discipline)

Run on the harness versions present at probe time, recorded in the record, in
a fresh config directory, headless and in a multiplexer TUI (tmux in the
cloud, herdr locally). Cheap tier. A negative result is recorded and narrows
the claim; it does not block units that do not depend on it.

| Probe | Unit | Question |
|---|---|---|
| P1 | U3 | Which operator channels work: elicitation, command pre-execution, permission prompt |
| P2 | U7 | Does the server process and its session directory persist across `/compact`; does re-attach work across `--resume` and `--continue` (n ≥ 3 each) |
| P3 | U7 | After compaction and after resume, is a charter-excluded summon still refused (must be every run) |
| P4 | U7 | After compaction and after resume, does the agent return to the queue, with and without the Console hook (rate, n ≥ 5 each) |
| P5 | U7 | Forced auto-compaction in a scripted long run |
| P6 | U7, local only | Per additional door in scope (§9): does it expose a stable session id, and which operator channel works |

---

## 8. Definition of done

One recorded run in which, in order: the person invokes `/skill-ultra` with a
real goal; reconnaissance precedes the proposal; a manifest and control
strategy are shown; the person approves or edits in the decisions step; work
runs inside the envelope; a real gap triggers a just-in-time model-led summon;
a failure produces an explained recover or reopen; a real human decision
produces a prepared incident; the person answers a small batch; the campaign
resumes without replanning; it survives the compaction and the resume the
harness has been measured to survive; and each stage says which lenses were
absent.

Not part of done: closing 100 issues, a throughput number, Arbor coverage, or
any stamp. The 100-issue horizon is exercised only by the synthetic sequence
in U4.

When the run is recorded, the same pull request updates every surface that
says the controller is unavailable, and the gaia-research entry that says its
heuristics are not built.

### 8.1 Proof campaign

Target: this repository's open backlog (FD-9). The founder names the roster
for the run; a usage cap pauses it and a resume continues it. The slice below
is a proposal for the decisions step of that run, not a commitment: the
charter the person approves is what binds.

### 8.2 Backlog scouting (2026-11-15)

36 issues are open. A cheap-tier sweep classified each from its text; the
campaign's own reconnaissance re-reads them at run time, so treat the tiers as
a starting point for the roster, not a measurement.

Most of the backlog is not work an agent can close on its own. Of the 36, 25
are left out: founder-reviewed visual work, work that needs another harness or
a desktop app, design and research with no closable outcome, and items this
plan already covers. Eleven are candidates:

| Issue | What it asks | Tier | Likely to need the person |
|---|---|---|---|
| #252 | Committed retrieval index lags upstream by 73 skills | standard | No |
| #93 | Learned personal shortcuts for `/summon` | standard | Yes: where shortcuts live touches P3 |
| #29 | Reuse the current session with `--continue` | cheap | Yes: no acceptance criteria stated |
| #35 | Forward-compatibility CI matrix with badges | standard | No |
| #33 | One harness-agnostic test flow for all doors | heavy | No |
| #25 | Audit baseline slash commands for the product floor | cheap | Yes: which commands count as essential |
| #120 | Standards lane: SEP-2640 and MCP conformance | standard | No |
| #150 | Spike: theme switch by armed mode | cheap | No |
| #208 | Stamping: a trusted `verified_outcome` source | heavy | Maybe: whether a v1.1 id is wanted |
| #34 | Zero-manual-update delivery | standard | Yes: delivery questions are open in the issue |
| #137 | Statusline: remaining adapters | standard | Only for doors outside the preflight's scope |

The slice has what §8 needs to be a real test: mechanical work with tests
(#252, #35), a large unit (#33), and at least four issues that should end in a
prepared incident and not a guess (#93, #29, #25, #34).

Left out, with the reason:

- **Founder-reviewed visual work:** #153, #200, #202, #203, #204, #205.
- **Needs another harness or a desktop app:** #41, #72, #161, #206. Under
  herdr on the local machine, #41 and #72 can join the slice.
- **Design and research with no closable outcome:** #26, #40, #162–#166,
  #210, #211.
- **A person's statement or a product frontier:** #180, #149, #199.
- **Handled by this plan:** #123 (U7), #253 (U8), #126 itself.

---

## 9. Environment and preflight

Execution starts with a preflight. Its output decides harness scope (FD-8),
the multiplexer (FD-0), and where the proof runs (FD-10). It asks the founder
nothing.

```bash
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && echo "env=cloud" || echo "env=local"
for t in herdr tmux; do command -v "$t" >/dev/null 2>&1 && echo "mux=$t"; done
for h in claude pi agy codex; do
  command -v "$h" >/dev/null 2>&1 && printf '%s %s\n' "$h" "$("$h" --version 2>&1 | head -1)" || echo "$h absent"
done
node -v && npm ci && npx vitest run && npm run typecheck
```

| Preflight says | Harness scope | Multiplexer | Pull requests | Proof run |
|---|---|---|---|---|
| `env=cloud` | Claude Code only | tmux | Single session, or subagents | In the cloud session; other doors recorded as unprobed |
| `env=local` and `mux=herdr` | Claude Code, Pi, Agy, Codex — each only if logged in | herdr, two pane workers at a time | The founder's roster in panes | In a visible pane |
| `env=local`, no herdr | Claude Code | tmux if present | Single session | In a visible terminal |

A harness that is installed but not logged in is recorded as unprobed. A
missing login is never replaced by an inferred result.

Checked on 2026-11-15 in the cloud environment "Skill Heaven Full Harness
Design": preflight prints `env=cloud`, `mux=tmux`, Claude Code 2.1.325,
Pi 1.5.2, Agy 1.5.9, Codex 0.169.0 (not logged in), Node 22.23.4; the suite
passes.

Known limits of the cloud environment:

- **Claude Code cannot be pinned.** The runtime supplies it. Probes record the
  version they ran on and are re-run when it changes.
- **Nested runs share the account's usage limit.** This is the pause FD-9
  describes; §5.7's re-attach is what makes it survivable, within the life of
  the container.
- **A reclaimed container ends any campaign in it.**

Setup-script delta for the cloud environment: run `npm ci` in
`gaia-skill-heaven`. Nothing else changes. Repositories: gaia-skill-heaven
(push), gaia-research (push, for the U3 delta), gaia-skill-tree (read). No
secrets for U0–U8.

Model tiers for nested and probe runs: a trivial nested call cost $0.33 on the
session's default heavy model and $0.003 on the cheap tier. Every nested or
probe invocation therefore names its model explicitly.

---

## 10. Kill criteria

#126's K1–K14 apply unchanged. Each has a test or a probe in §7:
K1 U3 · K2 U1 · K3 U5 · K4 U4 · K5 U2 · K6 U2 · K7 U6 · K8 U6 · K9 U7 ·
K10 U0b · K11 §6 · K12 §8 · K13 §5.1 · K14 U4.

---

## Appendix A. Unit briefs

Each brief is written to be handed to a worker that starts cold. Common rules
for every unit: branch `feat/ws6-ultra-<unit>`; one pull request to `main`;
squash merge by the owner; no runtime dependencies; rendered text must pass
`test/authority-regression.test.ts`; rebuild committed bundles
(`npm run build:mcp`, `build:status`, `build:console`) when their sources
change; no surface may say the controller is built before U9.

### U0a — campaign engine (heavy)

- **Create** `packages/core/src/campaign/`: `types.ts`, `schema.ts` (schema
  ids and strict hand-written parsers; unknown key → `null`), `engine.ts`
  (`initialCampaignState`, `stepCampaign(state, event)`, `replayCampaign`,
  `verifyCampaignRecord`), `explain.ts`, `status.ts` (`toControllerStatus`),
  `vocabulary.ts` (the one module that spells state and verb names, FD-6),
  `index.ts`. Export from `packages/core/src/index.ts`.
- **Model on** `steering.ts`: pure, no I/O, no clock; operator events need a
  capability the I/O shell creates, exactly like the runtime-adapter brand.
- **Tests** `packages/core/test/campaign-engine.test.ts`: every transition in
  §5.2; malformed input holds; an agent event can never produce a transition
  reserved to the operator; replay equals fold; verify detects tampering.
- **Out of scope:** work-unit transitions (U4), any file I/O.

### U0b — store, re-attach, status (standard)

- **Create** `packages/skill-summon/src/campaign/store.ts`: append to
  `campaign/trace.jsonl`, fold on load, write `campaign/status.json`, all
  through `assertConfinedPath`.
- **Change** `packages/skill-summon/src/summon/session.ts`: record the harness
  session id in the manifest; re-attach on start when the id matches and the
  old pid is dead; reaper honours a campaign's decided pause window.
- **Change** `packages/status/src/adapters.ts`: schema constant to
  `skill-heaven/controller-status/v1`; `packages/console/src/reader.ts` reads
  `status.json`.
- **Change** `packages/core/src/cli.ts`: standalone `--campaign-verify <trace>`
  and `--campaign-explain <trace>`, beside the steering flags.
- **Tests:** re-attach with matching, missing and forged ids; fork id gets a
  fresh directory; reaper keeps a paused campaign inside its window and reaps
  it after; status slot renders reported progress.

### U1 — reconnaissance (standard)

- **Create** `packages/skill-summon/src/campaign/tool.ts` (the one `campaign`
  tool, dispatching on `op`) and `ops/open.ts`, `ops/recon.ts`,
  `ops/status.ts`. Register in `mcp/server.ts` behind a server option the
  bundled binary does not set until U3.
- **Recon** calls the existing service with `preview: true` once per gap and
  records the outcome per gap, including refusal and `noMatch`.
- **Tests:** nothing is written under the session `skills/` directory during
  recon; `zero_cuts=all` refuses recon; a refused gap is recorded and is not an
  error; the Arbor and Graph lenses report their absent state.
- **Report** the standing dose of the tool definition with the vendored
  `chars4` tokenizer, as its own number.

### U2 — manifest (standard)

- **Create** `packages/core/src/campaign/manifest.ts` (pure build from a recon
  record and the agent's selection) and
  `packages/skill-summon/src/campaign/render.ts` for the manifest block.
- **Tests:** the manifest schema rejects any field combining lenses; an entry
  not present in the cited recon record is rejected; relations never change
  entry order; absent lenses render as absent.

### U3 — charter, decisions, operator channel (heavy)

- **Run P1 first** and write `docs/evidence/ultra-126/PROBE.md`. The channel
  order in §5.3 picks the implementation.
- **Create** `ops/propose.ts`, `packages/skill-summon/src/campaign/operator.ts`
  and the control-strategy renderer.
- **Change** `plugins/skill-heaven/commands/skill-ultra.md` and
  `scripts/render-ladder.mjs`: `/skill-ultra <goal>`, `decide`, `amend`,
  `answer`, `status`, `stop`; bare `/skill-ultra` unchanged.
- **Change** `mcp/server.ts` instruction text for FD-1; enable the tool in
  the bundled binary; `npm run build:mcp`.
- **gaia-research pull request** (merge commit there, repository identity
  only, no attribution trailers): the new N entry (FD-7) and the lexicon
  delta (FD-6), then `npx tsx scripts/lexicon/check-lexicon.ts --emit`.
- **Tests:** proposal without recon refused; body, card and tool-result text
  cannot change campaign state; authority regression green.

### U4 — work units (heavy)

- **Create** `packages/core/src/campaign/units.ts`, `receipts.ts`, `queue.ts`;
  `ops/next.ts`, `ops/report.ts`, `ops/checkpoint.ts`.
- **Wire** verify outcomes to `stepSteering` through an adapter the engine
  owns. No retrieval signal reaches it.
- **CLI:** `--campaign-replay-receipts <trace>`.
- **Tests:** recover then reopen then convergence at the charter's bounds; a
  150-unit synthetic sequence replays byte-identically; a unit closes only on
  a receipt whose command the charter names.

### U5 — summon gate (standard)

- **Create** `packages/skill-summon/src/campaign/gate.ts`, called from the
  summon handler; attach the digest to summon results during a campaign.
- **Tests:** in every campaign state, human-led and deny-listed skills are
  refused on the automatic path; a charter-excluded skill is refused; an
  unplanned model-led summon passes and is traced; with no campaign the
  existing suite is unchanged.

### U6 — incidents (standard)

- **Create** `ops/incident.ts`, the packet renderer, and the `answer` path in
  `operator.ts`.
- **Tests:** a packet with no preparation in the trace is refused; an open
  incident blocks only units that depend on it; the answer is stored verbatim.

### U7 — compaction and resume (standard; probe cells cheap)

- **Probes** P2–P5, and P6 when the preflight puts other doors in scope.
- **Console hook:** add a `resume|compact` matcher to
  `plugins/skill-heaven-console/hooks/hooks.json` running a new
  `scripts/campaign-context.mjs` that prints the digest only when this session
  has a live campaign, and prints nothing otherwise.
- **Release** the Console plugin once the probe passes (authorized by FD-4).
- **Tests:** the hook's output is empty with no campaign; Core still has no
  hooks.

### U8 — Arbor refresh (standard)

- **Refresh** `plugins/skill-heaven/data/arbor/` and
  `data/arbor-identity.json` at the Tree revision that contains the 2026-11-10
  seed, using the path #142 established.
- **Update** `scripts/release-acceptance.mjs`, which currently asserts the
  single `inconclusive` record.
- **Docs:** SPEC §5.1 and PLAN Lane G no longer say Arbor has no relation
  contract (#253).
- **Tests:** join hits on refreshed pins; declared claims render as their own
  group with attribution.

### U9 — proof (heavy to drive)

- Run §8 once, in the environment the preflight selects.
- **Write** `docs/evidence/ultra-126/PROOF.md`: harness and version, roster,
  the trace, each of §8's steps with its trace entry, pauses and resumes, and
  what was absent.
- **Then** change the "provisioned" copy on every surface in one pull
  request: `docs/CONTROL-PLANE.md`, `docs/LADDER-FLOW.md`,
  `docs/AGENT-PLUGIN.md`, `packages/console/README.md`,
  `packages/site/PRODUCT.md`, the Ultra skill and command text, and the
  gaia-research N13(3) note. Site copy is a founder-reviewed change.
