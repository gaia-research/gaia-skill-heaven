// Generates plugin/data/p2-gate.json — the P2 (Hell-lane) gate list the plugin's
// zero-dependency renderer enforces at runtime.
//
// WHY GENERATED. `src/launcher.ts` reuses core's HELL_LEVELS directly (a real
// import, never a hand-copied literal — that was the step-1 review finding). The
// plugin renderer cannot: once installed from the marketplace it has no
// node_modules, so it cannot resolve `skill-heaven`. So the list is
// MACHINE-copied from core here and byte-checked by test/p2-gate.test.ts — the
// same generated-artifact + freshness-test pattern the census parity fixture
// uses. If core ever adds or renames a Hell level (e.g. the pending N4 "ultra"),
// CI fails until this is regenerated.
//
//   npx tsx packages/claude-heaven/scripts/generate-p2-gate.ts

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HELL_LEVELS, LADDER_LEVELS, POSTURES, UNRATIFIED_LEVELS } from "skill-heaven";
import { LAUNCHABLE_POSTURES } from "../src/cli.js";

export interface P2Gate {
  schema: "claude-heaven/p2-gate@1";
  /** Provenance, so a reader of the generated file knows not to hand-edit it. */
  source: "skill-heaven LADDER_LEVELS + HELL_LEVELS + UNRATIFIED_LEVELS + POSTURES, claude-heaven LAUNCHABLE_POSTURES";
  levels: string[];
  gatedLevels: string[];
  unratifiedLevels: string[];
  /** Core's posture list, machine-copied for one renderer purpose: a core-known
   * posture name with no row is answered "not offered here", never rendered as
   * an unknown word. Carries no status claim about any entry. */
  postures: string[];
  /** src/cli.ts's LAUNCHABLE_POSTURES, machine-copied for the same reason the
   * other two lists are: the renderer cannot import the CLI once installed. The
   * renderer prints a relaunch ONLY for a row whose id is in here (KC7), so
   * dropping a posture from the CLI array + regenerating this file withdraws the
   * offer with it — the affordance cannot outlive the capability. */
  launchablePostures: string[];
}

export function buildP2Gate(): P2Gate {
  return {
    schema: "claude-heaven/p2-gate@1",
    source: "skill-heaven LADDER_LEVELS + HELL_LEVELS + UNRATIFIED_LEVELS + POSTURES, claude-heaven LAUNCHABLE_POSTURES",
    levels: [...LADDER_LEVELS],
    gatedLevels: [...HELL_LEVELS],
    unratifiedLevels: [...UNRATIFIED_LEVELS],
    postures: [...POSTURES],
    launchablePostures: [...LAUNCHABLE_POSTURES],
  };
}

export function p2GatePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "plugin", "data", "p2-gate.json");
}

export function serializeP2Gate(gate: P2Gate): string {
  return `${JSON.stringify(gate, null, 2)}\n`;
}

const isMain = process.argv[1]?.endsWith("generate-p2-gate.ts");
if (isMain) {
  const path = p2GatePath();
  writeFileSync(path, serializeP2Gate(buildP2Gate()));
  process.stdout.write(`wrote ${path}\n`);
}
