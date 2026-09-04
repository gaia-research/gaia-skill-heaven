# PLAN — five phases to a summoner you can trust

> [!WARNING]
> **STALE as of 2026-09-04 — founder is replanning.** Do not build from this
> document, and do not treat its rulings as current. An audit of `INTENT.md`
> comes first: Arbor appears to have been reduced to a Yggdrasil-ranked scalar,
> its behavioral graph and the Hell-Heaven Index are absent, and §8 forks a
> contract that `gaia-skill-tree/registry/arbor/` has already ratified.
> See [#115](https://github.com/gaia-research/gaia-skill-heaven/issues/115).
>
> What was measured against this document is still valid as evidence —
> `docs/PHASES-0-4-STATUS.md` and `packages/core/bench/results/` — and the
> retrieval work does not depend on §8.

**Status:** Plan of record for Skill Heaven, 2026-09-03. Supersedes
`GAIA_ROADMAP v5 (BUILD).md` for this product. Companions:
[`INTENT.md`](INTENT.md) (why), [`SPEC.md`](SPEC.md) (contracts).

Each phase is **independently shippable** and **independently valuable**. Each
carries a **kill criterion** — the measurement that would stop it. A phase that
cannot state what would falsify it is not a phase, it is a wish.

---

## Sequencing, and why this order

The instinct is to start with the retriever. That is wrong, and it is the
mistake this plan is built to avoid.

**Phase 0 is the gold set, and it comes first, because every threshold in
`SPEC.md` is currently a guess.** `FLOOR`, `BAND`, `MARGIN`, the BM25 field
weights, `T_low`, `T_high` — all marked PROVISIONAL. Without a measurement
harness, Phase 1 ships new guesses in place of old ones and nobody can tell
whether it helped. With one, every later phase is a decision instead of an
opinion.

It is also the cheapest phase, and it produces the one artifact that makes the
"declines correctly" gate possible at all: the 20 unanswerable queries that
calibrate the floor.

```
Phase 0  GROUND TRUTH ──▶ Phase 1  INDEX + RANK + REFUSE ──┬──▶ Phase 2  SEMANTIC
   the ruler                    the product fix            │      (conditional)
                                                           ├──▶ Phase 3  ULTRA
                                                           └──▶ Phase 4  ARBOR + SEP
```

Phases 2, 3 and 4 are parallel after Phase 1 and are ordered by value, not
dependency. **Phase 2 is conditional**: if Phase 1 alone clears G1 comfortably,
Phase 2 does not ship.

---

## Phase 0 — Ground truth

**Goal:** be able to tell whether anything we do next is an improvement.

**Ships:** `packages/core/bench/` containing the gold set, the runner, the
baseline ledger, and a one-line command in the README.

| # | Work |
|---|---|
| 0.1 | **100 gold queries.** Hand-written capability gaps in the register an agent uses, each labelled with the correct skill id. Drawn across the corpus with 5★/4★/3★ over-represented, since those are the ones people reach for. Human-written — **not** generated from the documents. |
| 0.2 | **20 unanswerable queries.** Plausible capability gaps nothing in the corpus covers. These calibrate `FLOOR` (SPEC §4.4) and gate G2. |
| 0.3 | **The runner.** Zero-dependency; scores a ranker against the gold set, emits per-query JSONL, computes MRR + recall@5, runs the paired bootstrap. |
| 0.4 | **The baseline.** Run today's `scoreMatch` against the gold set and commit the result. This number is the thing everything else is compared to, and it is worth knowing precisely how bad it is. |
| 0.5 | **Offline harness.** The runner must work with egress blocked — which requires a committed corpus snapshot, which is the first draft of Phase 1's index. |

**Kill criterion:** if today's baseline MRR is already above ~0.85, retrieval is
not the bottleneck and this whole plan is aimed at the wrong problem. Stop,
publish the finding, re-diagnose from the session logs.

**Effort:** small. The gold set is the only slow part and it is a day of careful
human work, not an engineering project.

---

## Phase 1 — The Index, the ranker, and the refusal

**Goal:** the product fix. This is the phase that closes #104 and #103 and makes
`/summon` trustworthy.

**Ships:** a committed `skill-index.json`, BM25F ranking, an absolute floor with
`noMatch`, `source` and `preview` arguments, `structuredContent`, and a card
that discloses mismatch, source and index age.

| # | Work | Closes |
|---|---|---|
| 1.1 | **Index builder** in `packages/core` → `plugins/skill-heaven/data/skill-index.json`, per SPEC §2. CI regenerates and fails on drift, exactly as the MCP bundle already does. | #103 |
| 1.2 | **Offline-first resolution.** The committed index is the read path. A network fetch is a refresh into the session root, never a precondition. | #103 |
| 1.3 | **BM25F ranker** (SPEC §3.1) replacing `scoreMatch` for summon ranking. `scoreMatch` stays where the service layer still uses it until 1.7. | |
| 1.4 | **Exact-name fast path** (SPEC §3.4). | #104 |
| 1.5 | **`source` argument** — per-call override, echoed on the card, hard error when unresolvable. | #104 |
| 1.6 | **Absolute floor + `noMatch`** with `topCandidates` and `filtered` reasons (SPEC §4.1–4.2). Floor calibrated against Phase 0's unanswerable set. | #104 |
| 1.7 | **Retrieval expansion** (SPEC §2.3): the offline generation script, the round-trip filter, and the first stamped batch — **5★ then 4★ then 3★**. | |
| 1.8 | **`preview` argument** — rank and disclose, no disk write. | |
| 1.9 | **`structuredContent` + `outputSchema` + `resource_link`** (SPEC §5.2–5.3). | |
| 1.10 | **Card additions**: name-mismatch line, source line, index-freshness line. | #104 |
| 1.11 | **Security invariants** (SPEC §10): summoned content is data, the card is generated from index fields, nothing auto-executes. | #85 |
| 1.12 | **Session log** `summon-log.jsonl` in the session root — local only, never transmitted. | groundwork for #93 |

**Gates:** G1 (MRR delta CI excludes zero), G2 (≥90% correct refusal), G3 (full
gold set green with egress blocked). All three from Phase 0's harness.

**Kill criterion for 1.7 specifically:** if expansion does not move MRR beyond
what 1.3 delivers alone, drop it and keep the index without it. The index is
independently worth having for #103; expansion has to earn its own keep.

**Effort:** the bulk of the plan. Split into at least four PRs — index builder,
ranker, refusal + arguments, expansion — so review stays tractable.

---

## Phase 2 — Semantic recall *(conditional — RESOLVED: does not ship)*

> **Outcome, 2026-09-03.** The precondition was met — Phase 1 landed and G1 was
> measured — and step 2.1 was run. **It killed the phase.** Zero of 59 misses
> are vocabulary mismatch; the residual is 22 curation-bound and 26 ordering.
> Dense retrieval is dropped and recorded as a negative result (D8), with the
> classification in `packages/core/bench/results/miss-analysis.json` and the
> reasoning in [`SPEC.md` §3.2](SPEC.md#32-vector-recall--phase-2-optional-by-construction).
> Per this section's own instruction, the budget moves to Phase 4.


**Goal:** close the residual vocabulary gap that lexical retrieval cannot,
without taking a runtime dependency.

**Precondition:** Phase 1 lands and G1 is measured. If Phase 1's MRR clears the
bar with room, **this phase does not ship** and its budget goes to Phase 4.

| # | Work |
|---|---|
| 2.1 | **Failure analysis.** Take Phase 1's misses and classify them. If they are mostly vocabulary mismatch, vectors help. If they are mostly *missing skills*, vectors change nothing and the answer is curation, not retrieval. This step decides the phase. |
| 2.2 | **Static token-vector table** (SPEC §3.2 route 1): committed table, query embedding by token-vector mean, pure arithmetic, no npm dependency, no ONNX, no WASM. |
| 2.3 | **RRF fusion** at `k = 60` over the lexical and dense rankings (SPEC §3.3). |
| 2.4 | **Re-measure.** Same harness, same gold set, paired bootstrap against Phase 1. |

**Kill criterion:** if 2.1 shows misses are dominated by absent skills, or if 2.4
shows no significant delta over Phase 1, drop dense retrieval entirely and record
it as a negative result (D8). *A measured "we tried it and it didn't help" is a
better artifact than an unmeasured feature.*

**Effort:** medium, and genuinely optional. It is written down mainly so nobody
builds it before Phase 1 is measured.

---

## Phase 3 — Ultra, stable

**Goal:** make the crown rung something the founder leaves switched on.

**Ships:** the deterministic controller of SPEC §6, wired into
`/skill-ultra`, with an explainability line on every rung change.

| # | Work |
|---|---|
| 3.1 | **Margin plumbing.** `margin` in `structuredContent` (already Phase 1) surfaced to the controller via `preview`. |
| 3.2 | **The controller**: EWMA → hysteresis dead band → dwell → single-step clamp. Pure function, unit-tested against synthetic margin traces including adversarial oscillating input. |
| 3.3 | **Explainability line** on every rung change: smoothed margin, threshold crossed, new rung. |
| 3.4 | **Threshold calibration** from real `summon-log.jsonl` traces, replacing the PROVISIONAL values in SPEC §6.3. |
| 3.5 | **Stability test as a gate**: replay a recorded margin trace and assert the rung changes fewer than *N* times. Oscillation becomes a test failure, not a vibe. |

**Kill criterion:** if the controller changes rung more than once per `DWELL`
window on real traces after calibration, the margin signal is too noisy to
control on. Fall back to `ultra` = "Hell with disclosure" and say so plainly.

**Explicitly out of scope:** bandits, learned classifiers, per-user models,
cross-session state. Revisiting that needs a fresh decision against data
`summon-log.jsonl` will by then have accumulated.

**Effort:** small. The controller is a few dozen lines. The tests are the work.

---

## Phase 4 — Arbor's first fill, and the standard

> **Status, 2026-09-03.** Split outcome.
> **Shipped:** 4.4 (summon consumes `arbor.polarity`, falls back to
> `invocation`, and discloses which — `arbor` is null everywhere, so the live
> disclosure is "none"), 4.5 (`skill://` identifiers and `resource_link`), and
> **4.6 went further than "watch"**: SEP-2640 has been accepted by core
> maintainers and stabilised, so the MCP **resource** surface
> (`skill://index.json` and per-skill entries) is built. `skills/list` /
> `skills/get` remain unbuilt pending the reference implementation.
> **Blocked:** 4.1–4.3. Polarity needs behavioural receipts, which need a TASK
> benchmark — that is Phase 5. This plan lists 4 and 5 as parallel; they are
> not. See [`SPEC.md` §8.1](SPEC.md#status-2026-09-03--the-consumption-path-is-built-the-stamps-are-not).

**Goal:** start the one dataset nobody else in the ecosystem has, and get on the
right side of the MCP skills standard.

| # | Work |
|---|---|
| 4.1 | **`polarity` contract** in `gaia-skill-tree`'s `registry/arbor/` (SPEC §8.1). One derived field, not thirteen. Derived-only — no contributor authors it. |
| 4.2 | **Receipt → polarity derivation** from the Phase 0/1 benchmark record: whether a skill helps when converging, when exploring, or both. |
| 4.3 | **Stamp 5★ (5), then 4★ (37), then 3★ (96)** — founder direction, and useful from the first batch. |
| 4.4 | **Summon consumes `arbor.polarity`** for `surface` routing when present, falling back to `disable-model-invocation` when absent, and **disclosing which one it used** on the card. |
| 4.5 | **`skill://` identifiers + resource surface** (SPEC §8.2): canonical ids and `resource_link` now; `skill://index.json` as an MCP resource next. |
| 4.6 | **SEP-2640 watch.** Re-read the SEP at each phase boundary. Implement `skills/list` / `skills/get` only once the draft stops moving. |

**Kill criterion:** if benchmark receipts cannot separate skills by polarity —
if every skill looks dual-safe — then polarity is not a real dimension at this
scale. Record the negative result and leave `arbor` null rather than shipping a
field that always says the same thing.

**Hard constraint, restated:** until receipts exist, `arbor` is `null` and every
surface says "relevance-only." This phase builds the stamps. It is not
permission to describe stamp-gated routing as running.

**Effort:** medium, and the highest long-term value in the plan. It is also the
only phase that touches `gaia-skill-tree`, on `dev/integration-ygg3-playbooks-2026-09-02`
lineage.

---

## Phase 5 — The entropy curve *(research, deliberately last and small)*

Only after Phases 1–4. Three arms (`low`, `high`, `max`), 20 real tasks with
objective pass/fail, cost via `gaia-research/skill-cost`. Reported as a curve
with error bars — or as *"no turn detected at this scale,"* which is a real
finding and gets published as one.

This is last because the N13 thesis is about a product that reliably summons.
Measuring the entropy curve on a retriever that picks the wrong skill measures
the retriever, not the curve.

---

## What this plan explicitly does not do

Stated so it does not creep in:

- **Does not touch the ladder.** No new rung, no rename, no count on a rung.
- **Does not add a second MCP tool.** Capability arrives as arguments and
  resources. (SPEC §5.1.)
- **Does not ship a runtime model.** No ONNX, no WASM, no npm dependency. If
  semantic recall cannot be had within that constraint, it does not ship.
- **Does not build the full Arbor node.** One derived field, not thirteen.
- **Does not implement a draft SEP.** Tracked, not built, until it stabilises.
- **Does not build a learned Ultra.**
- **Does not rewrite the site, the doors, or the launcher.**

---

## Umbrella issues

One umbrella per phase on `gaia-research/gaia-skill-heaven`, each holding its
work items as a checklist and each linking back to the relevant `SPEC.md`
section. Existing issues are absorbed rather than duplicated:

| Umbrella | Issue | Absorbs |
|---|---|---|
| Phase 0 — Ground truth | [#108](https://github.com/gaia-research/gaia-skill-heaven/issues/108) | *(new)* |
| Phase 1 — Index, rank, refuse | [#109](https://github.com/gaia-research/gaia-skill-heaven/issues/109) | #103, #104, #85 (invariants), #93 (groundwork) |
| Phase 2 — Semantic recall | [#110](https://github.com/gaia-research/gaia-skill-heaven/issues/110) | *(conditional — may not ship)* |
| Phase 3 — Ultra, stable | [#111](https://github.com/gaia-research/gaia-skill-heaven/issues/111) | *(new)* |
| Phase 4 — Arbor + SEP-2640 | [#112](https://github.com/gaia-research/gaia-skill-heaven/issues/112) | #47 (surface copy follows the data) |
| Phase 5 — Entropy curve | [#113](https://github.com/gaia-research/gaia-skill-heaven/issues/113) | *(research)* |

Plan PR: [#107](https://github.com/gaia-research/gaia-skill-heaven/pull/107).

Out-of-scope open issues stay where they are and are untouched by this plan:
#94, #88, #87, #86 (platform/install), #79, #73 (frontend), #41, #35, #34, #33
(delivery/CI), #29, #25 (launcher), #26 (benchmark multiplexer), #59, #72, #53,
#40, #77 (packaging).

---

## Risk register

| Risk | Signal it is happening | Response |
|---|---|---|
| **The gold set is written to flatter the design** | Baseline scores suspiciously low; queries read like the descriptions | Write queries *before* touching the ranker, from real session transcripts where possible. Phase 0 lands before Phase 1 for exactly this reason. |
| **Expansion becomes an LLM-slop generator** | Expansions read generically; MRR barely moves | The round-trip filter (SPEC §2.3) plus a diffable committed artifact. Cap and attribute every batch. |
| **The floor is set to make the gate pass** | `FLOOR` tuned after seeing G2 fail | Floor is calibrated on the unanswerable set only, and the separation achieved is written into the index. Poor separation is a finding, not a knob. |
| **The index goes stale silently** | Card never mentions age | Staleness is a card line and a CI drift check from day one (1.1, 1.10). |
| **Ultra oscillates** | Rung changes every gap | Stability is a test (3.5), not a review opinion. |
| **Arbor grows thirteen dimensions before it has one** | Schema work outpaces receipts | Phase 4 ships exactly one field. The others need a fresh decision. |
| **SEP-2640 moves under us** | Our `skill://` shape diverges | Re-read at each phase boundary (4.6). We adopt only what is spec-legal today. |
| **Scope creep into the launcher/site** | PRs touching `packages/*-zero` or `packages/site` | Any such change is out of scope and a signal the design is wrong (SPEC §0). |

---

## Definition of done

Skill Heaven is **complete for this cycle** when all of the following hold:

1. G1, G2, G3 pass and the numbers are committed with their ledger.
2. `/summon` resolves an exact name, honours an explicit `source`, and refuses
   when it should — #104 closed against a test, not a vibe.
3. A summon works with the network down — #103 closed structurally.
4. `ultra` runs a full session without oscillating, and can say why it moved.
5. `arbor.polarity` is stamped for 3★+ **or** the negative result is recorded.
6. Every surface's claim about what is running matches what is running.

Point 6 is not decoration. It is the standing rule this repo has held all the
way through, and it is the one that makes the other five believable.
