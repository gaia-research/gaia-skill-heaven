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

  it("refuses the doorless benchmark floor — it is core's, for measurement runs (exit 2)", () => {
    // F6: --disable-slash-commands suppresses plugin COMMANDS too, so a door
    // that launched it would be launching a session it cannot then talk to.
    expect(silenceStderr(() => run(["--posture", "floor"]))).toBe(2);
    expect(silenceStderr(() => run(["--posture", "nonsense"]))).toBe(2);
  });

  it("refuses a level, rather than silently ignoring it (exit 2)", () => {
    expect(silenceStderr(() => run(["--level", "low"]))).toBe(2);
    expect(silenceStderr(() => run(["--level", "off"]))).toBe(2);
  });

  it("--print composes a real curated plan: T9 argv, the env knob, and an fsPlan", () => {
    const { code, out } = captureStdout(() =>
      run(["--print", "--posture", "curated", "--skill", FIXTURE]),
    );
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("curated");
    expect(plan.skillCount).toBe(1);
    expect(plan.standingTokens).toBeGreaterThan(0);
    expect(plan.argv).toContain("--plugin-dir");
    expect(plan.env.CLAUDE_CODE_DISABLE_BUNDLED_SKILLS).toBe("1");
    // the fsPlan IS the mechanism: a plugin manifest + the copied set
    expect(plan.fsPlan.map((op: { kind: string }) => op.kind)).toEqual(["write", "copyDir"]);
    // core's evidence travels with the plan rather than being restated by the door
    expect(plan.notes.join(" ")).toContain("T9");
    // --print writes nothing, so it leaks no temp dir and needs no claude binary
    expect(plan.argv.join(" ")).toContain("$SESSION");
  });

  it("--print composes product-floor with the door mounted and an empty profile", () => {
    const { code, out } = captureStdout(() => run(["--print", "--posture", "product-floor"]));
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.posture).toBe("product-floor");
    expect(plan.standingTokens).toBe(0);
    expect(plan.argv).not.toContain("--disable-slash-commands");
    expect(plan.argv.join(" ")).toMatch(/--plugin-dir \S*claude-heaven\/plugin/);
    expect(plan.fsPlan).toEqual([]);
  });

  it("refuses a curated launch with no --skill instead of composing an empty set (exit 2)", () => {
    // The bare command a surface might be tempted to print. It must fail here so
    // no surface can offer it (KC7).
    expect(silenceStderr(() => run(["--print", "--posture", "curated"]))).toBe(2);
  });

  it("refuses --skill at a posture that cannot admit skills, rather than dropping it", () => {
    expect(
      silenceStderr(() => run(["--print", "--posture", "product-floor", "--skill", FIXTURE])),
    ).toBe(2);
    expect(silenceStderr(() => run(["--print", "--posture", "native", "--skill", FIXTURE]))).toBe(2);
  });

  it("reports an unreadable skill path as an error, not as a silently smaller set", () => {
    expect(
      silenceStderr(() => run(["--print", "--posture", "curated", "--skill", "/nope/not/here"])),
    ).toBe(2);
  });
});
