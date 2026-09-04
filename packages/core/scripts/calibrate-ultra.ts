// PLAN 3.4 — replace the PROVISIONAL Ultra thresholds with measured ones.
//
//   npx tsx packages/core/scripts/calibrate-ultra.ts
//   npx tsx packages/core/scripts/calibrate-ultra.ts --log <summon-log.jsonl>
//
// The controller consumes exactly one number: `margin = (top1 − top2) / top1`.
// Its thresholds are only meaningful against the distribution that number
// ACTUALLY takes on this index, and SPEC §6.3's provisional values were set
// before anyone had looked at it.
//
// Source of margins, in order of preference:
//   1. `--log` — a real `summon-log.jsonl` from a session. This is what SPEC
//      §6.3 asks for and it is the only source that reflects the queries
//      people really ask.
//   2. The gold set, as a PROXY. Available today, and clearly labelled as a
//      proxy: gold queries are all answerable by construction, so their
//      margins skew more decisive than a real session's, which include gaps
//      the corpus does not cover.
//
// The target is a controller that spends roughly a third of its gaps in each
// of converge / hold / explore. A dead band that never fires is a controller
// that does nothing; one that always fires is a controller that oscillates.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Bm25fRanker } from "../src/retrieval/bm25f.js";
import { decide } from "../src/retrieval/decide.js";
import { assertSkillIndex, type SkillIndex } from "../src/retrieval/schema.js";
import { DEFAULT_ULTRA_PARAMS, replayUltra } from "../src/retrieval/ultra.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const benchDir = join(here, "..", "bench");

const logPath = argValue("--log");
const { margins, source } = logPath ? fromLog(logPath) : fromGoldSet();

const sorted = [...margins].sort((left, right) => left - right);
const at = (fraction: number) => sorted[Math.floor(fraction * (sorted.length - 1))] ?? 0;

const tLow = round3(at(1 / 3));
const tHigh = round3(at(2 / 3));

// A dead band needs width or hysteresis stops meaning anything. When the
// distribution is too concentrated to give one, that is a finding about the
// SIGNAL, not a reason to invent a gap.
const degenerate = tHigh - tLow < 0.05;

const calibration = {
  source,
  samples: margins.length,
  quantiles: {
    p10: round3(at(0.1)),
    p25: round3(at(0.25)),
    p50: round3(at(0.5)),
    p75: round3(at(0.75)),
    p90: round3(at(0.9)),
  },
  provisional: { tLow: DEFAULT_ULTRA_PARAMS.tLow, tHigh: DEFAULT_ULTRA_PARAMS.tHigh },
  provisionalShares: shares(DEFAULT_ULTRA_PARAMS.tLow, DEFAULT_ULTRA_PARAMS.tHigh),
  measured: degenerate ? null : { tLow, tHigh },
  measuredShares: degenerate ? null : shares(tLow, tHigh),
  ...(degenerate
    ? {
        note:
          `The margin distribution is too concentrated to support a dead band ` +
          `(p33 ${tLow}, p67 ${tHigh}). That is a finding about the signal, not a reason to invent a gap. ` +
          "Keep the provisional thresholds and say the controller cannot yet be calibrated on this signal.",
      }
    : {}),
  stability: degenerate
    ? null
    : {
        provisionalChanges: replayUltra(margins.map((margin) => ({ margin }))).changes,
        measuredChanges: replayUltra(margins.map((margin) => ({ margin })), {
          ...DEFAULT_ULTRA_PARAMS,
          tLow,
          tHigh,
        }).changes,
        gaps: margins.length,
      },
  calibratedAt: new Date().toISOString(),
};

writeFileSync(join(benchDir, "results", "ultra-calibration.json"), `${JSON.stringify(calibration, null, 2)}\n`);
console.log(JSON.stringify(calibration, null, 2));

/** How the controller's three decisions would split at a given pair of thresholds. */
function shares(low: number, high: number) {
  const explore = margins.filter((margin) => margin < low).length / (margins.length || 1);
  const converge = margins.filter((margin) => margin > high).length / (margins.length || 1);
  return {
    explore: round3(explore),
    hold: round3(1 - explore - converge),
    converge: round3(converge),
  };
}

function fromLog(path: string): { margins: number[]; source: string } {
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { margin?: number; noMatch?: string | null });
  return {
    // A `noMatch` says nothing about depth (see ultra.ts), so it is not a
    // sample of the signal the controller steers on.
    margins: entries.filter((entry) => !entry.noMatch).map((entry) => entry.margin ?? 0),
    source: `summon-log: ${path}`,
  };
}

function fromGoldSet(): { margins: number[]; source: string } {
  const index = loadIndex();
  const ranker = new Bm25fRanker(index);
  const gold = readFileSync(join(benchDir, "gold.jsonl"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { query: string });

  const margins: number[] = [];
  for (const entry of gold) {
    const decision = decide({
      index,
      query: entry.query,
      ranked: ranker.rank(entry.query),
      source: index.source,
    });
    if (!decision.noMatch) margins.push(decision.margin);
  }
  return {
    margins,
    source:
      "PROXY: gold-set margins. Gold queries are answerable by construction, so these skew more " +
      "decisive than a real session's. Re-run with --log against a real summon-log.jsonl.",
  };
}

function loadIndex(): SkillIndex {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, "plugins", "skill-heaven", "data", "skill-index.json"), "utf8"),
  );
  assertSkillIndex(raw);
  return raw;
}

function argValue(flag: string): string | undefined {
  const at_ = process.argv.indexOf(flag);
  return at_ === -1 ? undefined : process.argv[at_ + 1];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
