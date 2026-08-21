import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";

/** A real skill dir with real bytes — core's own compile fixture. */
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

function silenceStderr(fn: () => number): number {
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr.write as unknown as (s: string) => boolean) = () => true;
  try {
    return fn();
  } finally {
    process.stderr.write = orig;
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
      piArgs: [],
      errors: [],
    });
  });

  it("captures --print, --posture, --level, --model", () => {
    expect(parseArgs(["--print", "--posture", "native", "--level", "zero", "--model", "custom-model"])).toMatchObject({
      print: true,
      posture: "native",
      postureProvided: true,
      level: "zero",
      model: "custom-model",
      errors: [],
    });
  });

  it("collects --skill repeatably, and does not leak it to piArgs", () => {
    const a = parseArgs(["--posture", "curated", "--skill", "/a", "--skill", "/b"]);
    expect(a.skills).toEqual(["/a", "/b"]);
    expect(a.piArgs).toEqual([]);
    expect(a.errors).toEqual([]);
  });

  it("routes everything after -- to piArgs", () => {
    expect(parseArgs(["--", "-p", "hi"]).piArgs).toEqual(["-p", "hi"]);
  });

  it("records error when options requiring values are trailing without arguments", () => {
    expect(parseArgs(["--level"]).errors).toContain("option '--level' requires an argument");
    expect(parseArgs(["--model"]).errors).toContain("option '--model' requires an argument");
    expect(parseArgs(["--posture"]).errors).toContain("option '--posture' requires an argument");
    expect(parseArgs(["--skill"]).errors).toContain("option '--skill' requires an argument");
  });
});

describe("run", () => {
  it("--print emits a valid renderable plan and exits 0 without spawning or writing to disk", () => {
    const { code, out } = captureStdout(() => run(["--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("product-floor");
    expect(plan.command).toBe("pi");
    expect(plan.argv).toContain("--extension");
    expect(plan.argv).toContain("--no-skills");
    expect(plan.argv).toContain("--no-context-files");
    expect(plan.argv).toContain("--no-prompt-templates");
  });

  it("routes a summon rung to the command that arms it, ultra included", () => {
    for (const [level, arm] of [["max", "/skill-hell max"], ["ultra", "/skill-ultra"]] as const) {
      const { code, err } = captureStderr(() => run(["--level", level]));
      expect(code).toBe(2);
      expect(err).toContain("live summon rung, not a boot posture");
      expect(err).toContain(arm);
    }
  });

  it("rejects unknown posture or invalid input with exit 2", () => {
    expect(silenceStderr(() => run(["--posture", "nonsense"]))).toBe(2);
    expect(silenceStderr(() => run(["--level"]))).toBe(2);
  });

  it("translates curated error to level when invoked via --level low", () => {
    const { code, err } = captureStderr(() => run(["--level", "low", "--print"]));
    expect(code).toBe(2);
    expect(err).toContain("--level low requires at least one --skill <path>");
    expect(err).not.toContain("--posture curated");
  });

  it("supports curated level with --skill", () => {
    const { code, out } = captureStdout(() => run(["--level", "low", "--skill", FIXTURE, "--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("curated");
    expect(plan.skillCount).toBe(1);
  });
});
