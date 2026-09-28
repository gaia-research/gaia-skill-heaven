// The R3 adjudication overlay (bench/adjudication.ts).
//
// Three properties matter more than the arithmetic:
//   1. the historical gold/unanswerable sets are never rewritten
//   2. a moved historical set invalidates the overlay loudly, not silently
//   3. `uncertain` and `unreviewed` are counted and never scored
//
// The third one is the one this lane was pivoted for, so it is tested hardest.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AdjudicationError,
  loadAdjudication,
  scoreAdjudicated,
  type AdjudicationOverlay,
  type AdjudicationRow,
} from "../bench/adjudication.js";

const here = dirname(fileURLToPath(import.meta.url));
const benchDir = join(here, "..", "bench");

type Gold = { query: string; skillId: string };
type Unanswerable = { query: string };

const readJsonl = <T,>(path: string): T[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"))
    .map((line) => JSON.parse(line) as T);

const gold = readJsonl<Gold>(join(benchDir, "gold.jsonl"));
const unanswerable = readJsonl<Unanswerable>(join(benchDir, "unanswerable.jsonl"));

function overlayWith(
  mutate: (rows: AdjudicationRow[]) => AdjudicationRow[],
  g: Gold[] = gold,
  u: Unanswerable[] = unanswerable,
): AdjudicationOverlay {
  const base = loadAdjudication(gold, unanswerable);
  const rows = mutate([...base.rows]);
  // Rebuild the case map the same way the loader does, so a fixture cannot
  // accidentally pass by having a differently-shaped map than production.
  const byCase = new Map<string, AdjudicationRow | null>();
  for (const row of rows) byCase.set(row.caseId, row);
  for (const pool of [
    { kind: "gold" as const, rows: g },
    { kind: "unanswerable" as const, rows: u },
  ]) {
    for (let position = 0; position < pool.rows.length; position += 1) {
      const caseId = `${pool.kind}-${String(position + 1).padStart(3, "0")}`;
      if (!byCase.has(caseId)) byCase.set(caseId, null);
    }
  }
  return { ...base, rows, byCase };
}

/** Rankings that put `hit` at `rank` (1-based) for `caseId`, nothing anywhere else. */
function rankings(hits: Record<string, string>): Map<string, string[]> {
  return new Map(Object.entries(hits).map(([caseId, id]) => [caseId, [id]]));
}

/**
 * Every case that must appear in `resolved`: each confirmed label, plus every
 * replacement a human actually named, on a confirmed or a corrected row. A
 * corrected row contributes its replacement ONLY.
 */
function expectedResolvedN(overlay: AdjudicationOverlay): number {
  return overlay.rows
    .filter((row) => row.kind === "gold")
    .reduce((total, row) => {
      if (row.state === "reviewed") return total + (row.betterSkillId ? 2 : 1);
      // A corrected row contributes its replacement ONLY — the rejected label
      // is not a correct answer and must never be scored as one.
      if (row.state === "corrected" && row.betterSkillId) return total + 1;
      return total;
    }, 0);
}

/** Gold rows in a state, optionally restricted to those that name a replacement. */
function countGold(
  overlay: AdjudicationOverlay,
  state: AdjudicationRow["state"],
  withReplacement = false,
): number {
  return overlay.rows.filter(
    (row) => row.kind === "gold" && row.state === state && (!withReplacement || Boolean(row.betterSkillId)),
  ).length;
}

describe("R3 adjudication overlay", () => {
  it("loads, binds to the committed sets, and refuses to invent a state", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    expect(overlay.provenance.historicalLabelsModified).toBe(false);
    expect(overlay.rows.length).toBe(overlay.provenance.counts.gold.reviewed +
      overlay.provenance.counts.gold.corrected +
      overlay.provenance.counts.gold.uncertain +
      overlay.provenance.counts.unanswerable.reviewed +
      overlay.provenance.counts.unanswerable.corrected +
      overlay.provenance.counts.unanswerable.uncertain);
    const writable: string[] = ["reviewed", "corrected", "uncertain"];
    for (const row of overlay.rows) expect(writable).toContain(row.state);
  });

  it("never wrote an `unreviewed` row: that state is derived from absence", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    const states: string[] = overlay.rows.map((row) => row.state);
    expect(states).not.toContain("unreviewed");
    // An unreviewed case is present in the map, and present as null.
    expect(overlay.byCase.get("gold-046")).toBeNull();
    expect(overlay.byCase.size).toBe(gold.length + unanswerable.length);
  });

  it("rejects an overlay that tries to write the `unreviewed` state", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    const forged = overlay.rows.map((row) =>
      row.caseId === "gold-001" ? { ...row, state: "unreviewed" } : row,
    ) as AdjudicationRow[];
    const byCase = new Map<string, AdjudicationRow | null>(
      forged.map((row) => [row.caseId, row]),
    );
    const scored = scoreAdjudicated(
      { ...overlay, rows: forged, byCase },
      gold,
      new Map<string, string[]>([["gold-001", [gold[0].skillId]]]),
    );
    // Even if such a row reached the scorer, it must not become a hit.
    expect(scored.unreviewed).toBeGreaterThan(0);
    expect(scored.reviewed.n).toBe(overlay.provenance.counts.gold.reviewed);
  });

  it("counts every gold case exactly once across the four states", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    const scores = scoreAdjudicated(overlay, gold, new Map());
    const total =
      scores.reviewed.n + scores.corrected + scores.uncertain + scores.unreviewed;
    expect(total).toBe(gold.length);
  });

  it("throws when the historical set moved under the overlay", () => {
    const shifted = gold.map((entry, position) =>
      position === 0 ? { ...entry, query: `${entry.query} (edited)` } : entry,
    );
    expect(() => loadAdjudication(shifted, unanswerable)).toThrow(AdjudicationError);
    expect(() => loadAdjudication(shifted, unanswerable)).toThrow(/historical set moved/);
  });

  it("throws when a gold label was relabelled under the overlay", () => {
    const relabelled = gold.map((entry, position) =>
      position === 0 ? { ...entry, skillId: "someone/else" } : entry,
    );
    expect(() => loadAdjudication(relabelled, unanswerable)).toThrow(/committed label/);
  });

  it("never scores an uncertain case as correct, even at rank 1", () => {
    const overlay = overlayWith((rows) =>
      rows.map((row) => (row.caseId === "gold-001" ? { ...row, state: "uncertain" } : row)),
    );
    const scores = scoreAdjudicated(
      overlay,
      gold,
      rankings({ "gold-001": gold[0].skillId }),
    );
    // It leaves `reviewed` entirely and lands in `uncertain`. It is not a hit
    // anywhere, and it is certainly not a miss that drags a mean down.
    expect(scores.reviewed.n).toBe(overlay.provenance.counts.gold.reviewed - 1);
    expect(scores.uncertain).toBe(overlay.provenance.counts.gold.uncertain + 1);
  });

  it("never scores an unreviewed case at all", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    const withHits = rankings(Object.fromEntries(gold.map((entry, position) => [
      `gold-${String(position + 1).padStart(3, "0")}`,
      entry.skillId,
    ])));
    const scores = scoreAdjudicated(overlay, gold, withHits);
    // Every case ranked #1, so any leakage of unreviewed/uncertain rows into
    // the scored sets would move these numbers. They must reflect only the
    // human-confirmed subset.
    expect(scores.reviewed.mrr).toBe(1);
    expect(scores.reviewed.n).toBe(overlay.provenance.counts.gold.reviewed);
  });

  it("counts a correction with no named replacement, and scores it nothing", () => {
    const overlay = overlayWith((rows) =>
      rows.map((row) =>
        row.caseId === "gold-002"
          ? { ...row, state: "corrected", betterSkillId: null }
          : row,
      ),
    );
    const scores = scoreAdjudicated(
      overlay,
      gold,
      rankings({ "gold-002": gold[1].skillId }),
    );
    expect(scores.corrected).toBe(overlay.provenance.counts.gold.corrected + 1);
    // The rejected label leaves the confirmed set and no replacement is invented.
    expect(scores.reviewed.n).toBe(countGold(overlay, "reviewed"));
    // Nothing is scored for a correction the human declined to name a
    // replacement for, even though its rejected label sits at rank 1.
    expect(scores.resolved.n).toBe(expectedResolvedN(overlay));
  });

  it("keeps a rejected label out of every score even when it ranks first", () => {
    const overlay = overlayWith((rows) =>
      rows.map((row) =>
        row.caseId === "gold-002" ? { ...row, state: "corrected", betterSkillId: null } : row,
      ),
    );
    const scores = scoreAdjudicated(
      overlay,
      gold,
      rankings(Object.fromEntries(gold.map((entry, position) => [
        `gold-${String(position + 1).padStart(3, "0")}`,
        entry.skillId,
      ]))),
    );
    // Every label ranks #1. If the rejected one leaked in, resolved.n would be
    // countGold(reviewed) + countGold(corrected) instead of the replacement-only sum.
    expect(scores.resolved.n).toBe(expectedResolvedN(overlay));
    expect(scores.resolved.n).toBeLessThan(scores.reviewed.n + scores.corrected);
  });

  it("scores a named replacement instead of the rejected label", () => {
    const overlay = overlayWith((rows) =>
      rows.map((row) =>
        row.caseId === "gold-002"
          ? { ...row, state: "corrected", betterSkillId: "someone/better" }
          : row,
      ),
    );
    const scores = scoreAdjudicated(
      overlay,
      gold,
      rankings({ "gold-002": "someone/better" }),
    );
    expect(scores.resolved.mrr).toBeGreaterThan(scores.reviewed.mrr);
  });

  it("carries a human-confirmed label into `resolved` even when no alternative was named", () => {
    const overlay = overlayWith((rows) =>
      rows.map((row) =>
        row.caseId === "gold-001" ? { ...row, state: "reviewed", betterSkillId: null } : row,
      ),
    );
    const scores = scoreAdjudicated(
      overlay,
      gold,
      rankings(Object.fromEntries(gold.map((entry, position) => [
        `gold-${String(position + 1).padStart(3, "0")}`,
        entry.skillId,
      ]))),
    );
    // Every confirmed label ranks #1, so confirmed MRR is 1. `resolved` is
    // confirmed PLUS the six named alternatives; four of those alternatives
    // are not in the index and score 0, which is why resolved MRR drops below
    // confirmed MRR rather than rising.
    expect(scores.reviewed.mrr).toBe(1);
    expect(scores.resolved.n).toBe(expectedResolvedN(overlay));
    expect(scores.resolved.mrr).toBeLessThan(scores.reviewed.mrr);
  });

  it("never lets the overlay change a historical number", () => {
    // The historical sets on disk are byte-identical to what the runner read
    // before the overlay existed; this asserts they still are, structurally.
    expect(gold).toHaveLength(100);
    expect(unanswerable).toHaveLength(20);
    const overlay = loadAdjudication(gold, unanswerable);
    expect(overlay.provenance.pins.goldBlob).toMatch(/^[0-9a-f]{40}$/);
    expect(overlay.provenance.claimLimits.join(" ")).toMatch(/adjudicated subset/);
  });
});
