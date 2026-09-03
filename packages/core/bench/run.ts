// The benchmark runner (PLAN 0.3).
//
//   npx tsx packages/core/bench/run.ts                 # score every system
//   npx tsx packages/core/bench/run.ts --system bm25f  # one system
//   npx tsx packages/core/bench/run.ts --calibrate     # sweep the floor (SPEC §4.4)
//
// Zero dependencies and zero network. `fetch` is trapped below and throws: G3
// ("summon works with the network down") is asserted by the harness itself
// rather than by a promise in a README. If a future ranker reaches for the
// network, this run fails loudly instead of quietly measuring an online system.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Bm25fRanker, marginOf, type ScoredSkill } from "../src/retrieval/bm25f.js";
import { isReachable } from "../src/retrieval/build-index.js";
import { rankBaseline } from "../src/retrieval/baseline.js";
import { decide } from "../src/retrieval/decide.js";
import {
  mean,
  pairedBootstrap,
  recallAt,
  reciprocalRank,
  type BootstrapResult,
} from "../src/retrieval/metrics.js";
import { assertSkillIndex, type IndexedSkill, type SkillIndex } from "../src/retrieval/schema.js";
import { INDEX_BUILDER_VERSION } from "../src/retrieval/version.js";

globalThis.fetch = (() => {
  throw new Error(
    "The benchmark is offline by contract (G3). Something reached for the network.",
  );
}) as typeof fetch;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const resultsDir = join(here, "results");

export type GoldEntry = {
  query: string;
  skillId: string;
  level?: string;
  rationale?: string;
  overlap?: string[];
  ambiguous?: boolean;
  note?: string;
};

export type UnanswerableEntry = {
  query: string;
  why?: string;
  nearest?: string;
  distance?: "near" | "mid" | "far";
};

type System = {
  id: string;
  label: string;
  /** Full ranking, best first. The floor decision is reported separately. */
  rank: (query: string) => ScoredSkill[];
  /** True when this system declines rather than returning the best of a bad set. */
  refuses: (ranked: ScoredSkill[]) => boolean;
  /**
   * Whether this system could return `doc` at all. A quarter of the gold
   * targets publish neither an installable SKILL.md link nor suite
   * components, so any system that filters for reachability carries a hard
   * MRR ceiling no matter how good its retrieval is. Reporting MRR without
   * that ceiling would blame the ranker for a curation problem.
   */
  reachable: (doc: IndexedSkill) => boolean;
};

const index = loadIndex();
const gold = readJsonl<GoldEntry>(join(here, "gold.jsonl"));
const unanswerable = readJsonl<UnanswerableEntry>(join(here, "unanswerable.jsonl"));
const bm25f = new Bm25fRanker(index);

const systems: System[] = [
  {
    id: "baseline-shipped",
    label: "scoreMatch as shipped (installable + MIN_RELEVANCE + BAND)",
    rank: (query) => rankBaseline(index, query, "shipped"),
    // Today's only refusal: nothing cleared MIN_RELEVANCE. There is no
    // absolute floor, which is exactly issue #104.
    refuses: (ranked) => ranked.length === 0,
    reachable: (doc) => doc.installable,
  },
  {
    id: "baseline-raw",
    label: "scoreMatch, ungated — ordering ability alone",
    rank: (query) => rankBaseline(index, query, "raw"),
    refuses: (ranked) => ranked.length === 0,
    reachable: () => true,
  },
  {
    id: "bm25f",
    label: "BM25F over the committed index + exact-name fast path (no floor)",
    rank: (query) => bm25f.rank(query),
    refuses: (ranked) => ranked.length === 0,
    reachable: () => true,
  },
  {
    id: "bm25f-decide",
    label: "BM25F + the L2 decide layer: surface filter, calibrated floor, band",
    rank: (query) => decide({ index, query, ranked: bm25f.rank(query) }).admitted,
    // A `noMatch` is a refusal. This is the system the product ships.
    refuses: (ranked) => ranked.length === 0,
    reachable: isReachable,
  },
];

const requested = argValue("--system");
const selected = requested ? systems.filter((s) => s.id === requested) : systems;
if (selected.length === 0) {
  throw new Error(`Unknown system ${requested}. Known: ${systems.map((s) => s.id).join(", ")}`);
}

mkdirSync(resultsDir, { recursive: true });

const runs = selected.map((system) => scoreSystem(system));
for (const run of runs) {
  writeFileSync(
    join(resultsDir, `${run.system}.jsonl`),
    `${run.perQuery.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
}

const baselineRun = runs.find((run) => run.system === "baseline-shipped");
const comparisons: Array<{ system: string; against: string } & BootstrapResult> = [];
if (baselineRun) {
  for (const run of runs) {
    if (run.system === baselineRun.system) continue;
    comparisons.push({
      system: run.system,
      against: baselineRun.system,
      ...pairedBootstrap(
        baselineRun.perQuery.map((row) => row.reciprocalRank),
        run.perQuery.map((row) => row.reciprocalRank),
      ),
    });
  }
}

const ledger = {
  schema: "gaia.bench-ledger/v1",
  ranAt: new Date().toISOString(),
  index: {
    schema: index.schema,
    generatedAt: index.generatedAt,
    sourceDigest: index.sourceDigest,
    builder: index.builder,
    docs: index.stats.docs,
  },
  builderVersion: INDEX_BUILDER_VERSION,
  goldSet: { queries: gold.length, ambiguous: gold.filter((entry) => entry.ambiguous).length },
  unanswerableSet: { queries: unanswerable.length },
  systems: runs.map(({ perQuery: _perQuery, ...summary }) => summary),
  comparisons,
  floorSweep: argFlag("--calibrate") ? sweepFloor() : undefined,
};

writeFileSync(join(resultsDir, "ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
printReport();

function scoreSystem(system: System) {
  const perQuery = gold.map((entry) => {
    const ranked = system.rank(entry.query);
    const ids = ranked.map((hit) => hit.doc.id);
    return {
      query: entry.query,
      correctId: entry.skillId,
      ...(entry.level ? { level: entry.level } : {}),
      returned: ids.slice(0, 10),
      rank: ids.indexOf(entry.skillId) + 1 || null,
      reciprocalRank: reciprocalRank(ids, entry.skillId),
      topScore: ranked[0]?.score ?? 0,
      margin: marginOf(ranked),
      matchKind: ranked[0]?.matchKind ?? null,
      refused: system.refuses(ranked),
    };
  });

  const refusals = unanswerable.map((entry) => {
    const ranked = system.rank(entry.query);
    return {
      query: entry.query,
      ...(entry.distance ? { distance: entry.distance } : {}),
      refused: system.refuses(ranked),
      topScore: ranked[0]?.score ?? 0,
      topId: ranked[0]?.doc.id ?? null,
    };
  });

  const byId = new Map(index.docs.map((doc) => [doc.id, doc]));
  const reachableRows = perQuery.filter((row) => {
    const doc = byId.get(row.correctId);
    return doc !== undefined && system.reachable(doc);
  });

  return {
    system: system.id,
    label: system.label,
    /** Gold targets this system could return at all. Its MRR ceiling is this / 100. */
    reachableTargets: reachableRows.length,
    /** MRR over the queries this system can actually answer — the ranker's own score. */
    mrrOnReachable: round4(mean(reachableRows.map((row) => row.reciprocalRank))),
    mrr: round4(mean(perQuery.map((row) => row.reciprocalRank))),
    // Six gold entries name a target that no honest query can separate from a
    // sibling (README § Provenance). Reported both ways rather than quietly
    // dropped: excluding them is a judgement, and the reader gets to see it.
    mrrExcludingAmbiguous: round4(
      mean(
        perQuery
          .filter((_row, position) => !gold[position]?.ambiguous)
          .map((row) => row.reciprocalRank),
      ),
    ),
    recallAt5: round4(
      recallAt(
        perQuery.map((row) => ({ ranked: row.returned, correctId: row.correctId })),
        5,
      ),
    ),
    // G2 — the fraction of deliberately-unanswerable queries that get a
    // `noMatch` rather than a confident wrong card.
    refusalRate: round4(
      refusals.length === 0 ? 0 : refusals.filter((row) => row.refused).length / refusals.length,
    ),
    /** Answerable queries wrongly refused. A floor that refuses everything passes G2 and fails the product. */
    falseRefusalRate: round4(
      perQuery.length === 0 ? 0 : perQuery.filter((row) => row.refused).length / perQuery.length,
    ),
    perQuery,
    refusals,
  };
}

/**
 * SPEC §4.4 — score both sets, then choose the threshold maximising separation.
 * Reported, never silently applied: a floor picked to make the gate pass is the
 * failure mode the risk register names.
 */
function sweepFloor() {
  // Exact name/id hits skip ranking entirely (SPEC §3.4), so they never meet a
  // floor and must not stretch the sweep's range. They are counted, not scored.
  const topScores = (entries: ReadonlyArray<{ query: string }>) =>
    entries
      .map((entry) => bm25f.rank(entry.query)[0])
      .filter((hit) => hit?.matchKind !== "exact")
      .map((hit) => hit?.score ?? 0);
  const answerable = topScores(gold);
  const rejectable = topScores(unanswerable);
  const exactBypass = gold.length - answerable.length;
  const ceiling = Math.max(0, ...answerable, ...rejectable);
  const steps = 200;

  const points = [];
  for (let step = 0; step <= steps; step++) {
    const floor = (ceiling * step) / steps;
    const admitted = answerable.filter((score) => score >= floor).length / (answerable.length || 1);
    const rejected =
      rejectable.filter((score) => score < floor).length / (rejectable.length || 1);
    points.push({ floor: round4(floor), answerableAdmitted: round4(admitted), unanswerableRejected: round4(rejected) });
  }

  // The floor is the cheapest one that clears G2 (>= 0.9 rejected); among those,
  // the one admitting the most answerable queries.
  const viable = points.filter((point) => point.unanswerableRejected >= 0.9);
  const recommended =
    viable.length === 0
      ? null
      : viable.reduce((best, point) =>
          point.answerableAdmitted > best.answerableAdmitted ? point : best,
        );

  return {
    exactBypass,
    answerableTopScores: answerable.map(round4),
    unanswerableTopScores: rejectable.map(round4),
    points,
    recommended,
    note:
      recommended === null
        ? "No floor rejects >=90% of the unanswerable set. That is a finding (D8), not a knob to turn."
        : undefined,
  };
}

function printReport(): void {
  console.log(`\ngold ${gold.length} queries · unanswerable ${unanswerable.length} · index ${index.stats.docs} docs @ ${index.generatedAt}\n`);
  console.log(
    ["system", "MRR", "R@5", "refuse(neg)", "false-refuse"].map(pad).join(" ") + "\n" + "-".repeat(72),
  );
  for (const run of runs) {
    console.log(
      [run.system, run.mrr.toFixed(4), run.recallAt5.toFixed(4), run.refusalRate.toFixed(4), run.falseRefusalRate.toFixed(4)]
        .map(pad)
        .join(" "),
    );
  }
  for (const comparison of comparisons) {
    console.log(
      `\nΔ MRR (${comparison.system} vs ${comparison.against}) = ${signed(comparison.delta)}, ` +
        `95% CI [${signed(comparison.ciLow)}, ${signed(comparison.ciHigh)}], n = ${gold.length} — ` +
        `${comparison.excludesZero ? "CI excludes zero (G1 met)" : "CI includes zero (G1 NOT met)"}`,
    );
  }
  if (ledger.floorSweep) {
    const recommended = ledger.floorSweep.recommended;
    console.log(
      recommended
        ? `\nfloor sweep — recommended FLOOR ${recommended.floor} · admits ${(recommended.answerableAdmitted * 100).toFixed(0)}% of gold · rejects ${(recommended.unanswerableRejected * 100).toFixed(0)}% of unanswerable`
        : `\nfloor sweep — ${ledger.floorSweep.note}`,
    );
  }
  console.log(`\nledger  ${join(resultsDir, "ledger.json")}`);
}

function loadIndex(): SkillIndex {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json"), "utf8"),
  );
  assertSkillIndex(raw);
  return raw;
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .map((line) => JSON.parse(line) as T);
}

function argValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

function argFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function pad(value: string): string {
  return value.padEnd(14);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;
}

function round4(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : value;
}
