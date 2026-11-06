import { describe, expect, it } from "vitest";
import { run as runClaude } from "../../claude-zero/src/cli.js";
import { run as runPi } from "../../pi-zero/src/cli.js";
import { run as runCodex } from "../../codex-zero/src/cli.js";
import { run as runHermes } from "../../hermes-zero/src/cli.js";
import { run as runGrok } from "../../grok-zero/src/cli.js";
import { run as runAgy } from "../../agy-zero/src/cli.js";

const doors = [
  ["claude-zero", runClaude],
  ["pi-zero", runPi],
  ["codex-zero", runCodex],
  ["hermes-zero", runHermes],
  ["grok-zero", runGrok],
  ["agy-zero", runAgy],
] as const;

function captureStdout(fn: () => number): { code: number; out: string } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (text: string) => boolean) = (text: string) => {
    chunks.push(text);
    return true;
  };
  try {
    return { code: fn(), out: chunks.join("") };
  } finally {
    process.stdout.write = original;
  }
}

// The behavioural half of the ladder contract (default rung composes, every boot rung
// composes, high..ultra route live without gate language) now runs as subprocess cells in
// door-contract.test.ts. What stays here is the in-process help text, which no cell reads.
describe("ladder-first door help", () => {
  for (const [name, run] of doors) {
    it(`${name} leads help with the ladder and keeps native explicit`, () => {
      const result = captureStdout(() => run(["--help"]));
      expect(result.code).toBe(0);
      expect(result.out).toContain("--level <level>");
      expect(result.out).toContain("zero|low|med (default: zero)");
      expect(result.out).toContain("Hell (high|xhigh|max) is selected in-session with /skill-hell");
      expect(result.out).toContain("--level native");
    });
  }
});
