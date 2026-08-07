import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURATED_DOOR_ABSENCE_NOTE } from "../src/launcher.js";
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
  it("defaults to off/product-floor, print off", () => {
    expect(parseArgs([])).toEqual({
      help: false,
      print: false,
      posture: "product-floor",
      postureProvided: false,
      level: undefined,
      skills: [],
      claudeArgs: [],
    });
  });
  it("captures --print, --posture, --level", () => {
    expect(parseArgs(["--print", "--posture", "native", "--level", "off"])).toMatchObject({
      print: true,
      posture: "native",
      postureProvided: true,
      level: "off",
    });
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
    expect(plan.posture).toBe("product-floor");
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

  it("resolves --level off to the product floor and rejects contradictions", () => {
    const { code, out } = captureStdout(() => run(["--level", "off", "--print"]));
    expect(code).toBe(0);
    expect(JSON.parse(out).posture).toBe("product-floor");
    expect(silenceStderr(() => run(["--posture", "floor", "--level", "off"]))).toBe(2);
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

// KC6 (Issue #12): a refusal must say which of two unlike things it is —
// withheld by policy (a key exists, could turn) or harness-incapable (no key
// exists at all). The Hell-lane refusal already reads as policy ("gated
// (P2)"); the floor refusal must read as the OTHER class, explicitly, not
// just as a bare "not launchable" that a reader could mistake for either.
describe("refusal honesty (KC6)", () => {
  it("marks the floor refusal as harness-incapable, not policy — and cites F6", () => {
    const { code, err } = captureStderr(() => run(["--posture", "floor"]));
    expect(code).toBe(2);
    expect(err).toContain("not a policy hold");
    expect(err).toMatch(/P2 gates the Hell lane\s+only/);
    expect(err).toContain("F6");
    expect(err).toContain("no door to open at this posture");
  });

  it("does not claim the F6/harness-incapable framing for a plain unknown posture", () => {
    // "nonsense" is not core-known at all — a different, un-classed failure
    // (bad input), not a claim about capability or policy.
    const { code, err } = captureStderr(() => run(["--posture", "nonsense"]));
    expect(code).toBe(2);
    expect(err).toContain('unknown --posture "nonsense"');
    expect(err).not.toContain("F6");
    expect(err).not.toContain("policy hold");
  });

  it("distinguishes the Hell-lane refusal (policy) from the floor refusal (harness-incapable)", () => {
    // assertLevelAllowed throws directly (P2 gate, checked before anything
    // else in run()) — it is never caught into a stderr write, so the
    // existing convention throughout this suite is `toThrow`, not stderr
    // capture.
    let hell = "";
    try {
      run(["--level", "max"]);
    } catch (e) {
      hell = (e as Error).message;
    }
    const floor = captureStderr(() => run(["--posture", "floor"])).err;
    expect(hell).toContain("withheld by policy, not a harness limit");
    expect(floor).toContain("not a policy hold");
    // Neither borrows the other's vocabulary.
    expect(hell).not.toContain("harness-incapable");
    expect(floor).not.toMatch(/gated \(P2\)/);
  });

  it("prints the curated door-absence disclosure to stderr before the process could ever spawn claude, and --print carries it in notes instead", () => {
    // A real (non---print) curated launch is NOT exercised here — it would
    // spawn a real `claude` process with stdio: "inherit", which is unsafe to
    // run from an automated test. Instead this pins the SOURCE shape: the
    // disclosure constant is referenced, and it appears before the spawnSync
    // call, so the message is guaranteed to reach the user's terminal while
    // the door still exists to print it (KC6) — and --print's JSON exposes
    // the same fact through `notes`, checked below without spawning anything.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.ts"), "utf-8");
    const noteRefIdx = src.indexOf("CURATED_DOOR_ABSENCE_NOTE");
    const spawnIdx = src.indexOf("spawnSync(live.command");
    expect(noteRefIdx).toBeGreaterThan(-1);
    expect(spawnIdx).toBeGreaterThan(-1);
    expect(noteRefIdx, "disclosure must be printed before claude could spawn").toBeLessThan(spawnIdx);

    const { code, out } = captureStdout(() =>
      run(["--print", "--posture", "curated", "--skill", FIXTURE]),
    );
    expect(code).toBe(0);
    const plan = JSON.parse(out);
    expect(plan.notes.join(" ")).toContain(CURATED_DOOR_ABSENCE_NOTE);
  });

  it("carries no curated door-absence note for postures where the door is not at stake", () => {
    const { out: nativeOut } = captureStdout(() => run(["--print"]));
    expect(JSON.parse(nativeOut).notes.join(" ")).not.toContain("does not exist inside this curated session");

    const { out: floorOut } = captureStdout(() => run(["--print", "--posture", "product-floor"]));
    expect(JSON.parse(floorOut).notes.join(" ")).not.toContain("does not exist inside this curated session");
  });
});
