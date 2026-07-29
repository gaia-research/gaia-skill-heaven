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
import { HELL_LEVELS, POSTURES } from "skill-heaven";

export interface P2Gate {
  schema: "claude-heaven/p2-gate@1";
  /** Provenance, so a reader of the generated file knows not to hand-edit it. */
  source: "skill-heaven HELL_LEVELS + POSTURES";
  gatedLevels: string[];
  /** Core's posture list, machine-copied for one renderer purpose: a core-known
   * posture name with no row is answered "not offered here", never rendered as
   * an unknown word. Carries no status claim about any entry. */
  postures: string[];
}

export function buildP2Gate(): P2Gate {
  return {
    schema: "claude-heaven/p2-gate@1",
    source: "skill-heaven HELL_LEVELS + POSTURES",
    gatedLevels: [...HELL_LEVELS],
    postures: [...POSTURES],
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
