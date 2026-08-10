// Generates the ladder policy artifact consumed by the zero-dependency plugin
// renderers. Once marketplace-installed they cannot import skill-zero, so the
// canonical lists are machine-copied and freshness-tested.
//
//   npx tsx packages/claude-zero/scripts/generate-ladder.ts

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HEAVEN_LEVELS,
  HELL_LEVELS,
  LADDER_LEVELS,
  POSTURES,
  UNRATIFIED_LEVELS,
} from "skill-zero";
import { LAUNCHABLE_POSTURES } from "../src/cli.js";

export interface LadderArtifact {
  schema: "claude-zero/ladder@1";
  source: "skill-zero ladder constants + POSTURES, claude-zero LAUNCHABLE_POSTURES";
  levels: string[];
  heavenLevels: string[];
  hellLevels: string[];
  unratifiedLevels: string[];
  postures: string[];
  launchablePostures: string[];
}

export function buildLadderArtifact(): LadderArtifact {
  return {
    schema: "claude-zero/ladder@1",
    source: "skill-zero ladder constants + POSTURES, claude-zero LAUNCHABLE_POSTURES",
    levels: [...LADDER_LEVELS],
    heavenLevels: [...HEAVEN_LEVELS],
    hellLevels: [...HELL_LEVELS],
    unratifiedLevels: [...UNRATIFIED_LEVELS],
    postures: [...POSTURES],
    launchablePostures: [...LAUNCHABLE_POSTURES],
  };
}

export function ladderArtifactPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "plugin", "data", "ladder.json");
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
