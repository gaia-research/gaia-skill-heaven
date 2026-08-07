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

function captureStderr(fn: () => number): { code: number; err: string } {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  (process.stderr.write as unknown as (text: string) => boolean) = (text: string) => {
    chunks.push(text);
    return true;
  };
  try {
    return { code: fn(), err: chunks.join("") };
  } finally {
    process.stderr.write = original;
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
      expect(result.out).toContain("off|low|med (default: off)");
      expect(result.out).toContain("Hell (high|xhigh|max) is armed live with /skill-hell");
      expect(result.out).toContain("--level native");

      for (const level of ["med", "native"]) {
        const native = captureStdout(() => run(["--level", level, "--print"]));
        expect(native.code).toBe(0);
        expect(JSON.parse(native.out).posture).toBe("native");
      }
    });

    it(`${name} routes Hell live and distinguishes unratified ultra`, () => {
      const hell = captureStderr(() => run(["--level", "max", "--print"]));
      expect(hell.code).toBe(2);
      expect(hell.err).toContain("live Hell summon budget");
      expect(hell.err).toContain("/skill-hell max");
      expect(hell.err).not.toMatch(/P2|gated|policy/i);

      expect(() => run(["--level", "ultra", "--print"])).toThrow(/UNRATIFIED/);
    });
  }
});
