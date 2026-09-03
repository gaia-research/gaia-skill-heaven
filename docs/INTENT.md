# INTENT — what Skill Heaven is for, and what "finished" means

**Status:** Founder direction, 2026-09-03. Supersedes `GAIA_ROADMAP v5 (BUILD).md`
as the plan of record for **Skill Heaven**. It does not touch v5's rulings about
the other planes, and it does not change the ladder (N13).

Companion documents: [`SPEC.md`](SPEC.md) (the contracts) and [`PLAN.md`](PLAN.md)
(the phases). Read this one first; it is the only one that answers *why*.

---

## 1. Where we actually are

The prototype works. It has been used by the founder and by friends, on real
work, in real sessions. The install path is real, the plugin is self-contained,
five doors exist, the ladder renders, `/summon` materialises a whole skill
directory onto disk and prints a card. None of that is aspiration.

**One thing is missing, and it is the thing the product is named after:
`/summon` cannot reliably find the right skill.**

That is not a vague complaint. It is a measured property of the code:

- Retrieval is `scoreMatch` — weighted substring counting over a handful of
  fields (`packages/skill-summon/src/service.ts:434`). No term weighting, no
  length normalisation, no synonym handling, no semantics.
- The corpus it searches is **326 named skills** whose descriptions have a
  **median length of 154 characters** and of which **45% carry no tags at all**
  (measured 2026-09-03 against the live `graph/named/index.json`).
- Queries are agents describing a capability gap in prose — *"I need to make
  this API faster"* — which shares almost no surface tokens with a 154-character
  description written by a contributor for other humans.

Substring matching over short documents with a natural-language query is the
textbook worst case for vocabulary mismatch. The consequences are already filed:

- **[#104](https://github.com/gaia-research/gaia-skill-heaven/issues/104)** — an
  exact-name query returns an unrelated skill, silently. There is no floor below
  which the tool declines to answer, so *a wrong answer always outranks "I don't
  know."*
- **[#103](https://github.com/gaia-research/gaia-skill-heaven/issues/103)** —
  a projection fetch failure takes every tool down, because there is no local
  copy of the index to fall back to. (The reported 403 does not reproduce as of
  2026-09-03 — all three URLs return 200 — which makes the transient nothing and
  the *absence of a fallback* everything.)

Everything else in this plan exists to serve one sentence.

---

## 2. The intent

> **When an agent needs a capability it does not have, Skill Heaven puts the
> right skill in front of it — and when there isn't one, says so.**

Both halves are load-bearing. A summoner that always answers is not more useful
than one that sometimes declines; it is *less* useful, because the caller can no
longer trust any answer. Reliability here means calibration, not coverage.

### What the founder should feel, using it daily

1. **I ask in my own words and get the right thing.** Not the right keyword —
   the right thing. "make this API faster" finds the profiling skill.
2. **When it doesn't know, it tells me.** Empty result with a reason beats a
   confident wrong card, every time.
3. **I can point it at a specific repo and it goes there.** `summon scout-fleet
   from gaia-research/skill-scout-fleet` resolves that repo, or fails loudly.
4. **It works on a plane.** The index is on disk. The network is a refresh, not
   a dependency.
5. **Hell is genuinely agentic.** At the explore rungs the agent reaches around
   the gap without being told to, and each arrival is disclosed.
6. **Ultra is boring in the best way.** It moves when the evidence moves, holds
   when it doesn't, and can always say why. It never oscillates.

### What this is not

- **Not a rewrite.** The ladder, the postures, the card, the session root, the
  five doors, P3 and D12 all stand. This plan changes *how candidates are
  chosen*, and adds a controller and an index around it.
- **Not a change to the ladder.** N13 is settled: one mechanic, one line, seven
  rungs, four bands. Nothing here proposes a rung, renames one, or assigns a
  count to one.
- **Not a marketplace.** We are not competing on catalogue size. See §4.
- **Not a research project wearing a product's clothes.** Product first. The
  benchmark exists to keep us honest about the product, not the reverse.

---

## 3. The one architectural bet

**Move the intelligence to index time.**

The corpus is small (hundreds), static between refreshes, and ours. The query is
live, latency-sensitive, and arrives in an agent's turn. Every unit of work we
can do once at build time is a unit we never pay per summon — and, crucially,
one that needs no runtime dependency, which is the constraint this repo has
correctly refused to break.

So: instead of a cleverer matcher at query time, we build a **better index**.

- Rewrite each skill's retrieval surface at build time — the contributor's
  description stays untouched and displayed; a generated *retrieval* field sits
  beside it carrying the phrasings a caller would actually use.
- Commit the resulting index into the plugin. Offline by construction. #103
  becomes structurally impossible rather than patched.
- Keep the runtime a small, deterministic, dependency-free ranker over that
  index.

This is the same shape as document expansion in the IR literature and as
Anthropic's contextual retrieval, and it is the one that fits a zero-dependency
bundle. `SPEC.md` §2 states it precisely; `PLAN.md` Phase 1 builds it.

The second bet follows from the first: **because the index is ours and offline,
we can afford to refuse.** A relevance floor is only safe when you can explain
what was below it, and an offline index is what makes that explanation cheap.

---

## 4. Why this is worth doing well — the long-term position

A research sweep of the discovery landscape (2026-09-03; sources in
[`SPEC.md` §9](SPEC.md#9-evidence-base)) found two gaps that nobody has filled:

1. **No skill registry does semantic retrieval.** The official MCP Registry,
   Smithery, Glama, SkillsMD, the Claude marketplaces — all keyword and category
   search. A skill for "multi-file refactoring" does not surface for "batch code
   rewrite" anywhere in the ecosystem today.
2. **No registry publishes what a skill *does to an agent*.** Every ranking
   signal in the market is popularity or maintenance hygiene — stars, downloads,
   OpenSSF scores. None of them measure capability lift.

Those two gaps are Yggdrasil and Arbor, stated in someone else's words. The Tree
already holds trust; **Arbor I is empty and that emptiness is the opportunity**,
not a debt. We are not trying to have the most skills. We are trying to be the
only place that knows which one to reach for and what happens when you do.

There is a third thing, and it is time-sensitive. MCP now has a **Skills Over
MCP working group** and a draft **Skills Extension (SEP-2640)** — Anthropic and
Nordstrom co-leading, with Google, GitHub, AWS, Databricks and Bloomberg at the
table — standardising exactly the act this product performs: skills discovered
and consumed over MCP, on a `skill://` resource convention (verified against the
2026-07-28 spec, 2026-09-03). We should be early and conformant rather than
parallel and clever. A registry that speaks the standard *and* carries trust and
behavioural data is a position; a bespoke summoner that does the same job in its
own dialect is a liability the moment the standard lands.

---

## 5. Non-negotiables carried forward

These are not restated for ceremony; each one constrains a real decision below.

- **M0 / D8** — nothing load-bearing ships ahead of a probe on a pinned version.
  A negative result is a finding. This plan contains at least one already: the
  #103 403 does not reproduce.
- **P3** — never mutate shared state. The index is committed into the plugin;
  everything else lives in a disposable session dir.
- **Zero runtime dependencies.** Not a preference. It is why the index approach
  wins over a runtime embedding model, and the plan is built around it.
- **N13** — the ladder is settled and untouched.
- **Two-number doses**, and cost measured through `gaia-research/skill-cost`,
  never self-reported.
- **Stamps are not built.** This plan builds them. Until receipts exist, every
  surface keeps saying "relevance-only" — the plan is not permission to claim
  otherwise ahead of the data.

---

## 6. How we will know it worked

Not "it feels better." Three gates, in priority order, defined in
[`SPEC.md` §7](SPEC.md#7-the-benchmark--minimal-by-design):

| # | Gate | Measured how |
|---|---|---|
| **G1** | Summon finds the right skill materially more often than today | MRR on 100 hand-labelled capability-gap queries, paired bootstrap vs. the substring baseline, p < 0.05 |
| **G2** | Summon declines when it should | ≥90% of the 20 deliberately-unanswerable queries return `noMatch`, not a card |
| **G3** | Summon works with the network down | Full gold set runs green with egress blocked |

G2 and G3 are pass/fail. G1 is the number we publish. Nothing else is a gate —
see `SPEC.md` §7.4 for the list of things we are deliberately not measuring, so
that the benchmark stays a day of work to re-run and not a program.

---

## 7. Reading order

- **[`SPEC.md`](SPEC.md)** — the contracts. What the index contains, what the
  ranker does, what the tool accepts and returns, how Ultra decides, what Arbor
  stamps mean, what the benchmark measures.
- **[`PLAN.md`](PLAN.md)** — five phases, each independently shippable, each
  with a kill criterion, mapped onto umbrella issues.
