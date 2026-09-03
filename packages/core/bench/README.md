# bench — the ruler

Phase 0 of [`docs/PLAN.md`](../../../docs/PLAN.md). Every threshold in
[`docs/SPEC.md`](../../../docs/SPEC.md) is marked PROVISIONAL because nothing
had measured it. This directory is what replaces a guess with a number.

## Run it

```bash
npx tsx packages/core/bench/run.ts              # score every system
npx tsx packages/core/bench/run.ts --calibrate  # + sweep the absolute floor
npx tsx packages/core/bench/run.ts --system bm25f
```

Offline by contract. `run.ts` replaces `globalThis.fetch` with a throw before
it does anything else, so **G3 ("summon works with the network down") is
asserted by the harness rather than promised in a README.** A ranker that
reaches for the network fails the run instead of quietly being measured online.

## What is here

| Path | What it is |
|---|---|
| `gold.jsonl` | 100 capability-gap queries, each labelled with one correct skill id |
| `unanswerable.jsonl` | 20 plausible gaps nothing in the corpus covers — these calibrate `FLOOR` and gate G2 |
| `corpus/named-projection.json` | The committed corpus snapshot everything reads. Refresh with `scripts/snapshot-corpus.ts` — the only step that touches the network |
| `run.ts` | The runner: MRR, recall@5, refusal rates, paired bootstrap, floor sweep |
| `results/*.jsonl` | Per-query scores, one line per query per system |
| `results/ledger.json` | The committed run record (SPEC §7.5) |

## Provenance of the gold set — read this before citing the number

The gold set was **not** written from real session transcripts, because none
have been collected yet (`summon-log.jsonl` is PLAN 1.12; when it exists, the
next revision of this set should be drawn from it). It was written by five
LLM subagents working from the corpus under
[the brief reproduced below](#the-authoring-brief), one query per assigned
skill, then checked mechanically for target coverage and duplicate labels.

That is a **weaker provenance than SPEC §7.1 asks for**, and it is stated here
rather than buried, because the risk register names exactly this failure mode:
*"the gold set is written to flatter the design."* Three things were done about
it, and one thing was not:

- **Vocabulary leakage is self-audited per query.** Every entry carries an
  `overlap` array listing the distinctive words it shares with the target's
  name/title/tags/description. Current distribution: **65 queries with zero
  overlap, 33 with one word, 2 with two.** A query that copies the description
  is worthless as evidence and is visible in the data as such.
- **The queries were written before any ranker changed.** Phase 0 landed before
  Phase 1's ranker for this reason, and the baseline was scored first.
- **Genuinely indistinguishable targets are flagged, not fudged.** Six entries
  carry `"ambiguous": true` with the sibling skill they collide with. The
  runner reports MRR with and without them.
- **Not done: independent human review of all 100 labels.** Until that happens,
  treat the absolute MRR as approximate and the *delta between systems* — which
  is what G1 actually gates on, and which is measured on identical queries — as
  the load-bearing number.

## Levels covered

Over-represented at the top, per PLAN 0.1, since those are the skills people
reach for: **5★ 5 · 4★ 20 · 3★ 40 · 2★ 25 · 1★ 10.**

## The authoring brief

Reproduced verbatim in [`GOLD-BRIEF.md`](GOLD-BRIEF.md) so the set can be
regenerated or extended under the same constraints.
