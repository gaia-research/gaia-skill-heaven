import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";

describe("parseArgs", () => {
  it("defaults to native, print off", () => {
    expect(parseArgs([])).toEqual({ print: false, posture: "native", level: undefined, claudeArgs: [] });
  });
  it("captures --print, --posture, --level", () => {
    expect(parseArgs(["--print", "--posture", "native", "--level", "off"])).toMatchObject({ print: true, posture: "native", level: "off" });
  });
  it("routes everything after -- to claude, plus unknown flags", () => {
    expect(parseArgs(["--", "-p", "hi"]).claudeArgs).toEqual(["-p", "hi"]);
    expect(parseArgs(["--model", "haiku"]).claudeArgs).toEqual(["--model", "haiku"]);
  });
});

describe("run", () => {
  it("--print writes the manifest + settings and exits 0 without spawning claude", () => {
    // Capture stdout to recover the sessionDir the CLI created.
    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout.write as unknown as (s: string) => boolean) = (s: string) => {
      chunks.push(s);
      return true;
    };
    let code: number;
    try {
      code = run(["--print"]);
    } finally {
      process.stdout.write = orig;
    }
    expect(code).toBe(0);
    const out = JSON.parse(chunks.join(""));
    expect(out.posture).toBe("native");
    expect(out.launcherLocked).toBe(true);
    expect(existsSync(join_(out.sessionDir, "profile.json"))).toBe(true);
    expect(existsSync(join_(out.sessionDir, "settings.json"))).toBe(true);
    // manifest on disk is a valid, renderable profile
    const manifest = JSON.parse(readFileSync(join_(out.sessionDir, "profile.json"), "utf-8"));
    expect(manifest.schema).toBe("claude-heaven/profile@1");
    rmSync(out.sessionDir, { recursive: true, force: true });
  });

  it("rejects a gated Hell-lane level (P2) before spawning", () => {
    expect(() => run(["--level", "max"])).toThrow(/gated \(P2\)/);
  });

  it("refuses non-native postures in slice 1 (exit 2, no spawn)", () => {
    const origErr = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown as (s: string) => boolean) = () => true;
    let code: number;
    try {
      code = run(["--posture", "floor"]);
    } finally {
      process.stderr.write = origErr;
    }
    expect(code).toBe(2);
  });
});

// tiny local join to avoid importing path just for the test assertions
function join_(...parts: string[]): string {
  return parts.join("/");
}
