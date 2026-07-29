import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";

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

describe("parseArgs", () => {
  it("defaults to native, print off", () => {
    expect(parseArgs([])).toEqual({ print: false, posture: "native", level: undefined, skills: [], claudeArgs: [] });
  });
  it("captures --print, --posture, --level", () => {
    expect(parseArgs(["--print", "--posture", "native", "--level", "off"])).toMatchObject({ print: true, posture: "native", level: "off" });
  });
  it("collects --skill repeatably, and does not leak it to claude", () => {
    const a = parseArgs(["--posture", "curated", "--skill", "/a", "--skill", "/b"]);
    expect(a.skills).toEqual(["/a", "/b"]);
    expect(a.claudeArgs).toEqual([]);
  });
  it("routes everything after -- to claude, plus unknown flags", () => {
    expect(parseArgs(["--", "-p", "hi"]).claudeArgs).toEqual(["-p", "hi"]);
    expect(parseArgs(["--model", "haiku"]).claudeArgs).toEqual(["--model", "haiku"]);
  });
});

describe("run", () => {
  it("--print emits a valid renderable plan and exits 0 without spawning or writing to disk", () => {
    const { code, out } = captureStdout(() => run(["--print"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("native");
    expect(plan.launcherLocked).toBe(true);
    expect(plan.command).toBe("claude");
    // the exact manifest that WOULD be written is shown inline (no temp dir)
    expect(plan.manifest.schema).toBe("claude-heaven/profile@1");
    expect(plan.settings).toEqual({ statusLine: { type: "command", command: expect.stringContaining("statusline.mjs") } });
    expect(plan).not.toHaveProperty("sessionDir");
  });

  it("rejects a gated Hell-lane level (P2) before spawning", () => {
    expect(() => run(["--level", "max"])).toThrow(/gated \(P2\)/);
  });

  it("refuses non-native postures in slice 1 (exit 2, no spawn)", () => {
    expect(silenceStderr(() => run(["--posture", "floor"]))).toBe(2);
  });

  it("refuses a non-gated level too, rather than silently ignoring it (exit 2)", () => {
    expect(silenceStderr(() => run(["--level", "low"]))).toBe(2);
    expect(silenceStderr(() => run(["--level", "off"]))).toBe(2);
  });
});
