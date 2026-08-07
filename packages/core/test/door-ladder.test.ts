import { describe, expect, it } from "vitest";
import { parseArgs as parseClaude, run as runClaude } from "../../claude-heaven/src/cli.js";
import { parseArgs as parsePi, run as runPi } from "../../pi-heaven/src/cli.js";
import { parseArgs as parseCodex, run as runCodex } from "../../codex-heaven/src/cli.js";
import { parseArgs as parseHermes, run as runHermes } from "../../hermes-heaven/src/cli.js";
import { parseArgs as parseGrok, run as runGrok } from "../../grok-heaven/src/cli.js";

const doors = [
  ["claude-heaven", parseClaude, runClaude],
  ["pi-heaven", parsePi, runPi],
  ["codex-heaven", parseCodex, runCodex],
  ["hermes-heaven", parseHermes, runHermes],
  ["grok-heaven", parseGrok, runGrok],
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

describe("ladder-first door contract", () => {
  for (const [name, parse, run] of doors) {
    it(`${name} defaults to off/product-floor`, () => {
      expect(parse([]).posture).toBe("product-floor");
      const result = captureStdout(() => run(["--print"]));
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out).posture).toBe("product-floor");
    });

    it(`${name} leads help with the ladder and keeps native explicit`, () => {
      const result = captureStdout(() => run(["--help"]));
      expect(result.code).toBe(0);
      expect(result.out).toContain("--level <level>");
      expect(result.out).toContain("off|low|med|high|xhigh|max|ultra (default: off)");
      expect(result.out).toContain("--level native");

      const native = captureStdout(() => run(["--level", "native", "--print"]));
      expect(native.code).toBe(0);
      expect(JSON.parse(native.out).posture).toBe("native");
    });

    it(`${name} distinguishes the P2 gate from unratified ultra`, () => {
      expect(() => run(["--level", "max", "--print"])).toThrow(/gated \(P2\)/);
      expect(() => run(["--level", "ultra", "--print"])).toThrow(/not ratified/);
      expect(() => run(["--level", "ultra", "--print"])).toThrow(/not the P2 Hell-lane gate/i);
    });
  }
});
