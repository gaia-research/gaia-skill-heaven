// `summon-log.jsonl` in the session root (PLAN 1.12, SPEC §5.5).
//
// LOCAL ONLY. It is written inside the disposable session root, it is never
// transmitted, and nothing in this package reads it back over a network. It is
// not telemetry. It exists so that two later things can be built against real
// data rather than intuition: the alias/shortcut layer (#93) and the Ultra
// controller's signal history (SPEC §6.5).
//
// A failure to write is swallowed. A session log is a convenience; losing one
// must never fail a summon that otherwise succeeded.

import { appendFile } from "node:fs/promises";
import path from "node:path";

import type { SummonOutcome } from "./summon.js";
import type { SummonSession } from "./session.js";

export const SUMMON_LOG_FILE = "summon-log.jsonl";

export type SummonLogEntry = {
  at: string;
  query: string;
  surface: string;
  source: string;
  preview: boolean;
  chosen: Array<{ id: string; score: number; margin: number; matchKind: string }>;
  noMatch: string | null;
  filtered: number;
  margin: number;
  indexGeneratedAt: string;
  totalSeconds: number;
};

export function summonLogPath(session: SummonSession): string {
  return path.join(session.root, SUMMON_LOG_FILE);
}

export async function appendSummonLog(
  session: SummonSession,
  outcome: SummonOutcome,
): Promise<void> {
  const chosen = [
    ...outcome.summoned.map((skill) => ({
      id: skill.id,
      score: skill.retrieval?.score ?? 0,
      margin: skill.retrieval?.margin ?? 0,
      matchKind: skill.retrieval?.matchKind ?? "ranked",
    })),
    ...outcome.previewed.map((skill) => ({
      id: skill.id,
      score: skill.retrieval.score,
      margin: skill.retrieval.margin,
      matchKind: skill.retrieval.matchKind,
    })),
  ];

  const entry: SummonLogEntry = {
    at: new Date().toISOString(),
    query: outcome.query,
    surface: outcome.surface,
    source: outcome.source,
    preview: outcome.previewed.length > 0,
    chosen,
    noMatch: outcome.noMatch?.reason ?? null,
    filtered: outcome.filtered.length,
    margin: outcome.margin,
    indexGeneratedAt: outcome.ranking.indexGeneratedAt,
    totalSeconds: outcome.totalSeconds,
  };

  try {
    await appendFile(summonLogPath(session), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Deliberately silent — see the header.
  }
}
