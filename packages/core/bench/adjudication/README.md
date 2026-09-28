# The R3 human-adjudication overlay

Lane R of `gaia-skill-heaven#116`, tracking in `#117`.

## Why this exists

`gold.jsonl` is 100 capability-gap queries labelled by LLM subagents, because no
session transcripts existed to draw them from. That provenance is stated in
[`../README.md`](../README.md) and it is not going to change: rewriting the set
would invalidate the calibrated floor and every paired comparison in
`results/ledger.json`.

What was still owed was **human review**. It was framed as "review all 100
labels", which is not a requirement anyone can honestly satisfy by asserting it
was done. The owner has reviewed **55 of 120** cases — 44 gold, 11 unanswerable
— and said plainly that they do not know every Gaia skill well enough to
adjudicate all 100 reliably.

This directory is the smallest honest replacement for that finish gate:

- the historical machine-authored set is **unchanged**, on disk and in every
  recorded result;
- the human judgments live here, in a **separately versioned** artifact, keyed
  by case id and **bound to the exact historical blobs it was made against**;
- a human who said *"unsure"* is recorded as unsure, and unsure is a real
  outcome that is **never coerced** into a correct skill, a wrong skill, or a
  miss.

## The four states

| state | meaning | scored? |
|---|---|---|
| `reviewed` | a human confirmed the machine label | yes |
| `corrected` | a human rejected it; `betterSkillId` may name a replacement | only the named replacement |
| `uncertain` | a human was unsure | **never** — counted, not scored |
| `unreviewed` | no human judgment exists | **never** — counted, not scored |

The scorer **default-rejects**: only an explicit `reviewed` row scores as
human-confirmed. A state this build does not recognise, or a row forged past the
loader, is counted in its own bucket and never scores. The property this lane was
pivoted to protect cannot depend on a fall-through.

## `resolved`, and why it is not just `reviewed`

`resolved` is every human-confirmed label, plus every replacement a human named
**that resolves to a real skill id in the committed corpus**. Seven of the
named alternatives in the snapshot are free prose — `"pbakaus/impeccable or
taste-skill"`, `"basically code-review or other review tools"` — which can never
match a ranked id. Counting those as scoring events would add guaranteed zeros to
the denominator, so they are counted as `namedAlternativeUnresolvable` and kept
out of the mean entirely.

On the committed data: `resolved.n` is 32, not 36.

`unreviewed` is never written to disk. It is derived as the absence of a row,
so the file can only ever grow toward coverage, never fake it.

## Current counts

| set | total | reviewed | corrected | uncertain | unreviewed |
|---|---:|---:|---:|---:|---:|
| `gold.jsonl` | 100 | 30 | 6 | 8 | 56 |
| `unanswerable.jsonl` | 20 | 6 | 0 | 5 | 9 |

Both rows are recomputed from the overlay by `scoreAdjudicated` and asserted in
the test suite, so the partition is machine-checked on both pools rather than
merely recorded in a JSON file.

Only the **30 human-confirmed gold cases** support an absolute label-derived
claim, and that number is printed next to it every run. The 100-case set remains
valid for **paired same-input deltas between systems**, measured on identical
queries, with the machine-label provenance disclosed alongside the number.

## How the binding works

`loadAdjudication()` re-derives `sha256(query)` for every row and compares it
to the digest recorded when the review was made, and for gold rows it compares
the committed `skillId` to the adjudicated `labeledSkillId`. A mismatch means
the historical set moved under the overlay, which makes the judgment about a
case that no longer exists — so it **throws** rather than scoring against a
shifted baseline.

The `caseId` is **derived** from the row's own `kind` + `index`, not trusted from
the file. A row that claimed `caseId: "gold-046"` while carrying
`kind: "unanswerable"` would otherwise be validated against the unanswerable
pool — skipping the committed-label check — and then scored against a gold case
no human ever reviewed. Duplicate adjudications for one case are refused too.

The `pins` in `provenance.json` are asserted against
`git rev-parse HEAD:<path>` in the test suite, so they are a binding rather than
decoration.

`provenance.json` records the source snapshot's own sha256, the original
worksheet URL, and the exact blob ids of `gold.jsonl` and `unanswerable.jsonl`
at review time.

> The owner's review worksheet was a hosted artifact that is no longer
> reachable at its original URL. The marks survived only in a local on-disk
> snapshot, which would have made the entire human review of this benchmark a
> single unrecoverable local file. It is committed here, with its digest, so
> that cannot happen again.

## What this overlay deliberately does not do

- It does not rewrite `gold.jsonl` or `unanswerable.jsonl`.
- It is not read by retrieval, by the admission policy, or by the floor. It has
  no threshold in it. `adjudication.ts` is imported by `../run.ts` and by
  nothing else in `src/`.
- It does not pool the reviewed subset into an estimate of corpus-wide
  quality. 30 of 100 cases, adjudicated in worksheet order, are a **prefix of
  the set**, not a random sample, and that bias is disclosed rather than
  corrected for.

## Regenerating

The overlay is a committed artifact, regenerated only from a new locked
review snapshot. Nothing in the test suite or CI writes it.

```bash
npx vitest run packages/core/test/bench-adjudication.test.ts
```

To see the numbers, run the benchmark. **It writes `packages/core/bench/results/`**,
and those files are deliberately **not** part of this change: the committed
results were produced against `gaia.skill-index/v1` while the shipped index is
`v2`, so a rerun legitimately differs. That skew is pre-existing, tracked
separately, and refreshing it is not this PR's business.

```bash
npx tsx packages/core/bench/run.ts          # prints the adjudicated block; writes results/
```
