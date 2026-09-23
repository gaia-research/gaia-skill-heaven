import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "impeccable-skill",
);

function captureStdout(fn: () => number): { code: number; out: string } {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    return { code: fn(), out: chunks.join("") };
  } finally {
    process.stdout.write = orig;
  }
}

function captureStderr(fn: () => number): { code: number; err: string } {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr.write as unknown as (s: string) => boolean) = (s: string) => {
    chunks.push(s);
    return true;
  };
  try {
    return { code: fn(), err: chunks.join("") };
  } finally {
    process.stderr.write = orig;
  }
}

describe("parseArgs", () => {
  it("defaults to product-floor, print off", () => {
    expect(parseArgs([])).toEqual({
      help: false,
      print: false,
      posture: "product-floor",
      postureProvided: false,
      level: undefined,
      skills: [],
      model: undefined,
      prompt: undefined,
      agyArgs: [],
    });
  });

  it("captures --print, --posture, --level, --model, -p", () => {
    const a = parseArgs([
      "--print",
      "--posture",
      "floor",
      "--level",
      "zero",
      "--model",
      "gemini-3.8-flash-low",
      "-p",
      "hello",
      "--",
      "--verbose",
    ]);
    expect(a.print).toBe(true);
    expect(a.posture).toBe("floor");
    expect(a.postureProvided).toBe(true);
    expect(a.level).toBe("zero");
    expect(a.model).toBe("gemini-3.8-flash-low");
    expect(a.prompt).toBe("hello");
    expect(a.agyArgs).toEqual(["--verbose"]);
  });

  it("collects repeated --skill flags", () => {
    const a = parseArgs(["--skill", "/path/one", "--skill", "/path/two"]);
    expect(a.skills).toEqual(["/path/one", "/path/two"]);
  });
});

describe("run --print", () => {
  it("prints product-floor plan by default with exit 0", () => {
    const res = captureStdout(() => run(["--print"]));
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.out);
    expect(parsed.posture).toBe("product-floor");
    expect(parsed.command).toBe("agy");
    expect(parsed.argv).toContain("--dangerously-skip-permissions");
    expect(parsed.env.HOME).toBe("$SESSION");
    expect(parsed.execSupport).toBe("exec");
  });

  it("prints floor plan with --disable-slash-commands", () => {
    const res = captureStdout(() => run(["--print", "--posture", "floor"]));
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.out);
    expect(parsed.posture).toBe("floor");
    expect(parsed.argv).toContain("--disable-slash-commands");
    expect(parsed.argv).toContain("--dangerously-skip-permissions");
  });

  it("prints curated plan with copied skill", () => {
    const res = captureStdout(() => run(["--print", "--level", "low", "--skill", FIXTURE]));
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.out);
    expect(parsed.posture).toBe("curated");
    expect(parsed.skillCount).toBe(1);
    expect(parsed.fsPlan.some((op: any) => op.kind === "copyDir" && op.to.includes("impeccable"))).toBe(true);
  });

  it("prints native plan untouched", () => {
    const res = captureStdout(() => run(["--print", "--level", "native"]));
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.out);
    expect(parsed.posture).toBe("native");
    expect(parsed.env).toEqual({});
    expect(parsed.argv).toEqual([]);
  });

  it("rejects unknown level with exit 2", () => {
    const errRes = captureStderr(() => run(["--level", "bogus"]));
    expect(errRes.code).toBe(2);
    expect(errRes.err).toContain('unknown --level "bogus"');
  });

  it("refuses live summon rungs with redirection guidance and exit 2", () => {
    const errRes = captureStderr(() => run(["--level", "high"]));
    expect(errRes.code).toBe(2);
    expect(errRes.err).toContain("live summon rung, not a boot posture");
    expect(errRes.err).toContain("/skill-hell high");
  });
});
