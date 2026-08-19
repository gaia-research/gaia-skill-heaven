import { describe, expect, it } from "vitest";
import { parseArgs as parseClaude, run as runClaude } from "../../claude-zero/src/cli.js";
import { parseArgs as parsePi, run as runPi } from "../../pi-zero/src/cli.js";
import { parseArgs as parseCodex, run as runCodex } from "../../codex-zero/src/cli.js";
import { parseArgs as parseHermes, run as runHermes } from "../../hermes-zero/src/cli.js";
import { parseArgs as parseGrok, run as runGrok } from "../../grok-zero/src/cli.js";

const doors = [
  ["claude-zero", parseClaude, runClaude],
  ["pi-zero", parsePi, runPi],
  ["codex-zero", parseCodex, runCodex],
  ["hermes-zero", parseHermes, runHermes],
  ["grok-zero", parseGrok, runGrok],
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
    it(`${name} defaults to zero/product-floor`, () => {
      expect(parse([]).posture).toBe("product-floor");
      const result = captureStdout(() => run(["--print"]));
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out).posture).toBe("product-floor");
    });

    it(`${name} leads help with the ladder and keeps native explicit`, () => {
      const result = captureStdout(() => run(["--help"]));
      expect(result.code).toBe(0);
      expect(result.out).toContain("--level <level>");
      expect(result.out).toContain("zero|low|med (default: zero)");
      expect(result.out).toContain("Hell (high|xhigh|max) is armed live with /skill-hell");
      expect(result.out).toContain("--level native");

      for (const level of ["med", "native"]) {
        const native = captureStdout(() => run(["--level", level, "--print"]));
        expect(native.code).toBe(0);
        expect(JSON.parse(native.out).posture).toBe("native");
      }
    });

    // N13: nothing on the line refuses. Every rung above the boot dial — ultra
    // included — gets the SAME answer: it is armed live, here is the command.
    it(`${name} routes every summon rung live, ultra included, and never as a gate`, () => {
      for (const [level, arm] of [
        ["high", "/skill-hell high"],
        ["xhigh", "/skill-hell xhigh"],
        ["max", "/skill-hell max"],
        ["ultra", "/skill-ultra"],
      ] as const) {
        const routed = captureStderr(() => run(["--level", level, "--print"]));
        expect(routed.code, `${name} --level ${level}`).toBe(2);
        expect(routed.err).toContain("live summon rung, not a boot posture");
        expect(routed.err).toContain(arm);
        expect(routed.err).not.toMatch(/UNRATIFIED|P2|gated|policy/i);
      }
    });
  }
});
