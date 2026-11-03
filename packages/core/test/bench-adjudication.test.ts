// The R3 adjudication overlay (bench/adjudication.ts).
//
// Three properties matter more than the arithmetic:
//   1. the historical gold/unanswerable sets are never rewritten
//   2. a moved historical set invalidates the overlay loudly, not silently
//   3. `uncertain` and `unreviewed` are counted and never scored
//
// The third one is the one this lane was pivoted for, so it is tested hardest.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AdjudicationError,
  assertAdjudicationArtifacts,
  assertUtcTimestamp,
  loadAdjudication as loadAdjudicationFromFiles,
  scoreAdjudicated,
  validateAdjudicationRows,
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

const goldBytes = readFileSync(join(benchDir, "gold.jsonl"));
const unanswerableBytes = readFileSync(join(benchDir, "unanswerable.jsonl"));
const gold = readJsonl<Gold>(join(benchDir, "gold.jsonl"));
const unanswerable = readJsonl<Unanswerable>(join(benchDir, "unanswerable.jsonl"));

const loadAdjudication = (
  g: Gold[] = gold,
  u: Unanswerable[] = unanswerable,
) => loadAdjudicationFromFiles(g, u, { goldBytes, unanswerableBytes });

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

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Re-run the loader's own validation over a row list, with no disk writes. */
function revalidate(rows: AdjudicationRow[]): unknown {
  return validateAdjudicationRows(rows as never[], gold, unanswerable);
}

function gitBlob(path: string): string {
  return execFileSync("git", ["-C", join(here, "..", ".."), "rev-parse", `HEAD:${path}`], {
    encoding: "utf8",
  }).trim();
}

/** Rankings that put `hit` at `rank` (1-based) for `caseId`, nothing anywhere else. */
function rankings(hits: Record<string, string>): Map<string, string[]> {
  return new Map(Object.entries(hits).map(([caseId, id]) => [caseId, [id]]));
}

/**
 * A small stand-in corpus. Only these ids are real skill ids, so only these can
 * earn a slot in a denominator; anything else a human wrote is prose.
 */
const CORPUS_IDS = new Set([
  ...gold.map((entry) => entry.skillId),
  "pbakaus/impeccable",
  "obra/writing-plans",
]);

/**
 * Every scoring event that must appear in `resolved`: each confirmed label, plus
 * every replacement a human actually named that resolves in the corpus. A
 * corrected row contributes its replacement ONLY — the rejected label is not a
 * correct answer and must never be scored as one.
 */
function expectedResolvedN(overlay: AdjudicationOverlay): number {
  return overlay.rows
    .filter((row) => row.kind === "gold")
    .reduce((total, row) => {
      const resolvable = row.betterSkillId !== null && CORPUS_IDS.has(row.betterSkillId);
      if (row.state === "reviewed") return total + 1;
      if (row.state === "corrected" && resolvable) return total + 1;
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
      CORPUS_IDS,
    );
    // The forged row is NOT treated as human-confirmed: the confirmed slice
    // loses it, and it lands in no scoring bucket at all.
    expect(scored.reviewed.n).toBe(overlay.provenance.counts.gold.reviewed - 1);
    expect(scored.unreviewed).toBe(overlay.provenance.counts.gold.unreviewed);
  });

  it("counts every gold case exactly once across the four states", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    const scores = scoreAdjudicated(overlay, gold, new Map(), CORPUS_IDS);
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
    const scores = scoreAdjudicated(overlay, gold, withHits, CORPUS_IDS);
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
      CORPUS_IDS,
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
      CORPUS_IDS,
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
      new Set([...CORPUS_IDS, "someone/better"]),
    );
    expect(scores.resolved.mrr).toBeGreaterThan(scores.reviewed.mrr);
  });

  it("uses one resolved denominator slot for a reviewed case with a resolvable alternative", () => {
    const overlay = overlayWith((rows) => rows.map((row) =>
      row.caseId === "gold-024" ? row : { ...row, state: "uncertain" },
    ));
    const scores = scoreAdjudicated(
      overlay,
      gold,
      rankings({ "gold-024": "pbakaus/impeccable" }),
      CORPUS_IDS,
    );
    expect(scores.resolved.n).toBe(1);
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
      CORPUS_IDS,
    );
    // Every confirmed label ranks #1. Resolved uses one best-answer slot per
    // case, so prose alternatives do not add zero-weighted denominator entries.
    expect(scores.reviewed.mrr).toBe(1);
    expect(scores.resolved.n).toBe(expectedResolvedN(overlay));
    expect(scores.resolved.mrr).toBe(1);
  });

  it("loads against the full historical sets and carries its claim limits", () => {
    // Byte-level protection of the historical sets is the blob-pin check
    // (assertAdjudicationArtifacts, tested above); this only asserts the overlay
    // binds to the full 100/20 sets and states its claim limits.
    expect(gold).toHaveLength(100);
    expect(unanswerable).toHaveLength(20);
    const overlay = loadAdjudication(gold, unanswerable);
    expect(overlay.provenance.pins.goldBlob).toMatch(/^[0-9a-f]{40}$/);
    expect(overlay.provenance.claimLimits.join(" ")).toMatch(/adjudicated subset/);
  });

  // ---- regression tests added after independent review (see PR discussion) ----

  it("refuses a row whose caseId disagrees with its own kind+index", () => {
    // A row filed as `gold-046` while carrying `kind: "unanswerable"` would be
    // validated against the unanswerable pool (skipping the committed-label
    // check) and then scored against a gold case no human ever reviewed.
    const forged = {
      caseId: "gold-046",
      kind: "unanswerable" as const,
      index: 8,
      querySha256: sha256(unanswerable[7].query),
      labeledSkillId: null,
      state: "reviewed" as const,
      verdict: "suitable" as const,
      betterSkillId: null,
      adjudicatedBy: "forged",
      adjudicatedAt: "2026-01-01T00:00:00Z",
      note: null,
    };
    const base = loadAdjudication(gold, unanswerable);
    expect(() => revalidate([...base.rows, forged])).toThrow(/disagrees with its own kind\+index/);
  });

  it("refuses a duplicate adjudication for the same case", () => {
    const base = loadAdjudication(gold, unanswerable);
    const first = base.rows[0];
    expect(() => revalidate([...base.rows, { ...first, verdict: "unsuitable" }])).toThrow(
      /duplicate adjudication row/,
    );
  });

  it("rejects invalid kinds", () => {
    const row = { ...loadAdjudication(gold, unanswerable).rows[0], kind: "other" };
    expect(() => revalidate([row as never])).toThrow(/kind must be exactly/);
  });

  it("rejects non-number and non-positive indices", () => {
    const base = loadAdjudication(gold, unanswerable).rows[0];
    expect(() => revalidate([{ ...base, index: "1" } as never])).toThrow(/positive safe integer/);
    expect(() => revalidate([{ ...base, index: 0 } as never])).toThrow(/positive safe integer/);
  });

  it("rejects verdicts that are unknown or disagree with state", () => {
    const base = loadAdjudication(gold, unanswerable).rows[0];
    expect(() => revalidate([{ ...base, verdict: "ambiguous" } as never])).toThrow(/does not agree/);
    expect(() => revalidate([{ ...base, verdict: "other" } as never])).toThrow(/verdict must be/);
  });

  it("rejects a labeled skill on an unanswerable row", () => {
    const base = loadAdjudication(gold, unanswerable).rows.find((row) => row.kind === "unanswerable")!;
    expect(() => revalidate([{ ...base, labeledSkillId: "wrong/id" }])).toThrow(/labeledSkillId null/);
  });

  it("rejects an empty adjudicator", () => {
    const base = loadAdjudication(gold, unanswerable).rows[0];
    expect(() => revalidate([{ ...base, adjudicatedBy: "" }])).toThrow(/non-empty string/);
  });

  it("accepts committed UTC timestamps and rejects offsets, invalid dates, and malformed values", () => {
    expect(() => assertUtcTimestamp("committed", "2026-09-16T20:46:40.710Z")).not.toThrow();
    expect(() => assertUtcTimestamp("offset", "2026-01-01T00:00:00+08:00")).toThrow();
    expect(() => assertUtcTimestamp("invalid date", "2026-02-30T00:00:00Z")).toThrow();
    expect(() => assertUtcTimestamp("malformed", "not-a-date")).toThrow();
  });

  it("keeps a free-prose alternative out of every denominator", () => {
    // "pbakaus/impeccable or taste-skill" is a note, not a skill id. Counting
    // it as a scoring event would add a guaranteed zero to the mean.
    const overlay = loadAdjudication(gold, unanswerable);
    const prose = overlay.rows.filter(
      (row) => row.betterSkillId !== null && !CORPUS_IDS.has(row.betterSkillId),
    );
    expect(prose.length).toBeGreaterThan(0);
    const scores = scoreAdjudicated(overlay, gold, new Map(), CORPUS_IDS);
    // prose.length counts gold+unanswerable rows; the score counts gold only.
    expect(scores.namedAlternativeUnresolvable).toBe(
      prose.filter((row) => row.kind === "gold").length,
    );
    expect(scores.resolved.n).toBe(expectedResolvedN(overlay));
  });

  it("partitions the unanswerable set into the same four states", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    const scores = scoreAdjudicated(overlay, gold, new Map(), CORPUS_IDS);
    const u = scores.unanswerable;
    expect(u.reviewed + u.corrected + u.uncertain + u.unreviewed).toBe(unanswerable.length);
    const counts = overlay.provenance.counts.unanswerable;
    expect(u).toEqual({
      reviewed: counts.reviewed,
      corrected: counts.corrected,
      uncertain: counts.uncertain,
      unreviewed: counts.unreviewed,
    });
  });

  it("pins the overlay to the exact historical blobs it was adjudicated against", () => {
    const overlay = loadAdjudication(gold, unanswerable);
    expect(overlay.provenance.pins.goldBlob).toBe(
      gitBlob("packages/core/bench/gold.jsonl"),
    );
    expect(overlay.provenance.pins.unanswerableBlob).toBe(
      gitBlob("packages/core/bench/unanswerable.jsonl"),
    );
  });

  it("derives every overlay row exactly from the locked review snapshot", () => {
    const snapshot = JSON.parse(readFileSync(
      join(benchDir, "adjudication", "source", "locked-2026-09-17.json"),
      "utf8",
    )) as { reviews: Record<string, { at: string; betterSkill: string; kind: string; labeledSkill?: string; note: string; verdict: string }> };
    const overlay = loadAdjudication(gold, unanswerable);
    const byCase = new Map(overlay.rows.map((row) => [row.caseId, row]));
    const state = { suitable: "reviewed", unsuitable: "corrected", ambiguous: "uncertain" } as const;
    for (const [key, review] of Object.entries(snapshot.reviews)) {
      const kind = key.startsWith("g") ? "gold" : "unanswerable";
      const caseId = `${kind}-${key.slice(1)}`;
      expect(byCase.get(caseId)).toMatchObject({
        caseId,
        kind,
        index: Number(key.slice(1)),
        state: state[review.verdict as keyof typeof state],
        verdict: review.verdict,
        betterSkillId: review.betterSkill === "" ? null : review.betterSkill,
        note: review.note === "" ? null : review.note,
        adjudicatedAt: review.at,
        labeledSkillId: kind === "unanswerable" ? null : review.labeledSkill,
      });
    }
  });

  it("rejects tampered historical, overlay, or snapshot bytes and accepts untouched bytes", () => {
    const provenance = JSON.parse(readFileSync(join(benchDir, "adjudication", "provenance.json"), "utf8"));
    const overlayBytes = readFileSync(join(benchDir, "adjudication", "adjudication.v1.jsonl"));
    const snapshotBytes = readFileSync(join(benchDir, "adjudication", "source", "locked-2026-09-17.json"));
    const untouched = { goldBytes, unanswerableBytes, overlayBytes, snapshotBytes };
    expect(() => assertAdjudicationArtifacts(provenance, untouched)).not.toThrow();
    const tamperedGold = Buffer.from(goldBytes); tamperedGold[0] ^= 1;
    expect(() => assertAdjudicationArtifacts(provenance, { ...untouched, goldBytes: tamperedGold })).toThrow(/gold/);
    const tamperedOverlay = Buffer.from(overlayBytes); tamperedOverlay[0] ^= 1;
    expect(() => assertAdjudicationArtifacts(provenance, { ...untouched, overlayBytes: tamperedOverlay })).toThrow(/overlay/);
    const tamperedSnapshot = Buffer.from(snapshotBytes); tamperedSnapshot[0] ^= 1;
    expect(() => assertAdjudicationArtifacts(provenance, { ...untouched, snapshotBytes: tamperedSnapshot })).toThrow(/snapshot/);
  });

  it("anchors the committed counts so a self-consistent rewrite is visible", () => {
    // Cross-checking counts against the overlay's own rows only proves the two
    // agree with each other. These constants are the external anchor: changing
    // them is a visible diff, not a silent edit to a JSON file.
    const overlay = loadAdjudication(gold, unanswerable);
    expect(overlay.provenance.counts.gold).toEqual({
      total: 100, reviewed: 30, corrected: 6, uncertain: 8, unreviewed: 56,
    });
    expect(overlay.provenance.counts.unanswerable).toEqual({
      total: 20, reviewed: 6, corrected: 0, uncertain: 5, unreviewed: 9,
    });
    expect(overlay.rows).toHaveLength(55);
  });

  it("would catch a scorer that scored a non-`reviewed` state as confirmed", () => {
    // Guards the default-reject dispatch: for a forged `unreviewed` row the
    // confirmed slice must shrink. A fall-through implementation scores it and
    // leaves the slice at full size, failing the assertion below.
    const overlay = loadAdjudication(gold, unanswerable);
    const forged = overlay.rows.map((row) =>
      row.caseId === "gold-001" ? { ...row, state: "unreviewed" } : row,
    ) as AdjudicationRow[];
    const byCase = new Map<string, AdjudicationRow | null>(
      forged.map((row) => [row.caseId, row]),
    );
    const allRankedFirst = new Map<string, string[]>(
      gold.map((entry, position) => [
        `gold-${String(position + 1).padStart(3, "0")}`,
        [entry.skillId],
      ]),
    );
    const scores = scoreAdjudicated({ ...overlay, rows: forged, byCase }, gold, allRankedFirst, CORPUS_IDS);
    expect(scores.reviewed.n).toBe(29);
    expect(scores.reviewed.mrr).toBe(1);
  });
});
