// Skill Hell's presentation layer for the pi door.
//
// This lives in src/ rather than extension/ on purpose. The extension imports
// pi's own SDK (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`),
// which ships with the harness and not with this repo — so `packages/*/extension`
// is excluded from our tsconfig and pi type-checks it against its own SDK when it
// loads it. Anything a test needs to import must therefore live outside that
// boundary, or the exclusion is silently defeated and tsc fails on the SDK it
// was never meant to see.
//
// Nothing here touches pi. It is string rendering over a plain data shape.

import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The shape summon returns. Trust fields are OPTIONAL and tree-provided: a tree
 *  publishes what it has and we render what it published. Never require them. */
export interface SummonedSkill {
  id: string;
  name?: string;
  level?: string;
  trustMagnitude?: number;
  trust?: Record<string, unknown>;
  trustFields?: Record<string, unknown>;
  path: string;
  fileCount?: number;
  cache?: string;
  cacheState?: string;
  totalSeconds?: number;
}

/** Hell rungs are a summon budget, not a posture — how many skills one capability
 *  gap may pull. Score-band filtering is not implemented. `ultra` is absent because
 *  it is unratified: there is no approved budget to give it. */
export const rungBudgets = {
  high: { count: 1, relevance: "up to 1 result" },
  xhigh: { count: 3, relevance: "up to 3 results; no score band yet" },
  max: { count: 5, relevance: "up to 5 results; no score band yet" },
} as const;

export type HellLevel = keyof typeof rungBudgets;

const PROTOTYPE_NOTE =
  "   WORKING PROTOTYPE · actively tested for public use · interfaces may change";

export function renderHellChooser(): string {
  return [
    "🔥 Skill Hell · high · xhigh · max · ultra",
    PROTOTYPE_NOTE,
    "",
    "   ● high    default · up to 1 result/gap",
    "   ○ xhigh   up to 3 results/gap · no score band yet",
    "   ○ max     up to 5 results/gap · no score band yet",
    "   ⊘ ultra   UNRATIFIED · no approved summon budget",
    "",
    "   Select a rung to arm the lane; any other text manually summons for that intent.",
  ].join("\n");
}

export function renderArmed(level: HellLevel): string {
  const budget = rungBudgets[level];
  return [
    `🔥 Skill Hell armed: ${level}`,
    `   budget: up to ${budget.count} skill${budget.count === 1 ? "" : "s"} per capability gap · ${budget.relevance}`,
    "   Summon only for a real gap; the lane remains armed afterward.",
    `   engine seam: summon --limit ${budget.count}; automatic gap detection remains a harness integration seam.`,
  ].join("\n");
}

export function renderSummonedCard(winner: SummonedSkill): string {
  const identity = winner.name ?? winner.id;
  const lines = [`┌ summoned · ${identity}`];
  if (winner.name && winner.id !== winner.name) lines.push(`   id: ${winner.id}`);

  // Render whatever trust the tree published; omit the row entirely when it
  // published none. A tree must be able to invent a dimension we have never
  // heard of and have it display without a code change here.
  const trust =
    winner.trustFields ??
    winner.trust ??
    (typeof winner.trustMagnitude === "number" ? { trustMagnitude: winner.trustMagnitude } : undefined);
  for (const [name, value] of Object.entries(trust ?? {})) {
    if (["string", "number", "boolean"].includes(typeof value)) lines.push(`   ${name}: ${String(value)}`);
  }

  // Timing and cache state are shown together or not at all: they differ by
  // roughly an order of magnitude, so a duration without its cache state cannot
  // be interpreted.
  const cache = winner.cacheState ?? winner.cache;
  if (typeof winner.totalSeconds === "number" && cache) {
    lines.push(`   install: ${winner.totalSeconds.toFixed(2)}s · ${cache}`);
  }

  if (typeof winner.fileCount === "number") lines.push(`   files: ${winner.fileCount}`);
  lines.push(`   path: ${winner.path}`);
  lines.push(`   inspect: ${pathToFileURL(join(winner.path, "SKILL.md")).href}`);
  lines.push("   status: WORKING PROTOTYPE · actively tested for public use");
  lines.push("└");
  return lines.join("\n");
}
