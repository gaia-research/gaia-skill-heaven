// Generates the ladder policy artifact consumed by the zero-dependency plugin
// renderer. Once marketplace-installed it cannot import skill-zero, so the
// canonical constants are machine-copied and freshness-tested.
//
//   npx tsx packages/claude-zero/scripts/generate-ladder.ts

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BAND_INFO,
  LADDER_LEVELS,
  LADDER_WIP,
  POSTURES,
  RUNG_BANDS,
  type Band,
  type BandInfo,
} from "skill-zero";
import { LAUNCHABLE_POSTURES } from "../src/cli.js";

export interface LadderArtifact {
  schema: "skill-heaven/ladder@2";
  source: "skill-zero RUNG_BANDS + BAND_INFO + POSTURES, claude-zero LAUNCHABLE_POSTURES";
  /** The mark every rendering of the line must carry. */
  wip: string;
  /** One ladder, one line — in order, bottom to crown. A rung carries its band
   * (the direction) and nothing else: there are no per-rung counts. */
  rungs: Array<{ id: string; band: Band }>;
  /** The four contiguous bands the line is read as. */
  bands: Record<Band, BandInfo>;
  postures: string[];
  launchablePostures: string[];
}

export function buildLadderArtifact(): LadderArtifact {
  return {
    schema: "skill-heaven/ladder@2",
    source: "skill-zero RUNG_BANDS + BAND_INFO + POSTURES, claude-zero LAUNCHABLE_POSTURES",
    wip: LADDER_WIP,
    rungs: LADDER_LEVELS.map((id) => ({ id, band: RUNG_BANDS[id] })),
    bands: BAND_INFO,
    postures: [...POSTURES],
    launchablePostures: [...LAUNCHABLE_POSTURES],
  };
}

export function ladderArtifactPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // packages/claude-zero/scripts
  return join(here, "..", "..", "..", "plugins", "skill-heaven", "data", "ladder.json");
}

export function serializeLadderArtifact(artifact: LadderArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

const isMain = process.argv[1]?.endsWith("generate-ladder.ts");
if (isMain) {
  const path = ladderArtifactPath();
  writeFileSync(path, serializeLadderArtifact(buildLadderArtifact()));
  process.stdout.write(`wrote ${path}\n`);
}
