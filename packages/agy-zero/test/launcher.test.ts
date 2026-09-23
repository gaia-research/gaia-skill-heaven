import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planLaunch, resolveLevelAlias, assertLevelAllowed } from "../src/launcher.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "impeccable-skill",
);

describe("resolveLevelAlias", () => {
  it("resolves zero, low, med, native", () => {
    expect(resolveLevelAlias("zero")).toBe("product-floor");
    expect(resolveLevelAlias("low")).toBe("curated");
    expect(resolveLevelAlias("med")).toBe("native");
    expect(resolveLevelAlias("native")).toBe("native");
    expect(resolveLevelAlias("unknown")).toBeUndefined();
  });
});

describe("assertLevelAllowed", () => {
  it("throws for live summon rungs", () => {
    expect(() => assertLevelAllowed("high")).toThrow("/skill-hell high");
    expect(() => assertLevelAllowed("xhigh")).toThrow("/skill-hell xhigh");
    expect(() => assertLevelAllowed("max")).toThrow("/skill-hell max");
    expect(() => assertLevelAllowed("ultra")).toThrow("/skill-ultra");
  });

  it("permits undefined or non-summon-only levels", () => {
    expect(() => assertLevelAllowed(undefined)).not.toThrow();
    expect(() => assertLevelAllowed("zero")).not.toThrow();
    expect(() => assertLevelAllowed("low")).not.toThrow();
  });
});

describe("planLaunch", () => {
  it("plans product-floor launch with session-scoped HOME and auth copying", () => {
    const plan = planLaunch({ sessionDir: "/tmp/sess-test" });
    expect(plan.posture).toBe("product-floor");
    expect(plan.command).toBe("agy");
    expect(plan.env.HOME).toBe("/tmp/sess-test");
    expect(plan.argv).toEqual(["--dangerously-skip-permissions"]);
    expect(plan.execSupport).toBe("exec");
    expect(plan.fsPlan.some((op) => op.kind === "copyFileIfExists" && op.to.includes("oauth"))).toBe(true);
  });

  it("plans curated launch with copied skill directory", () => {
    const plan = planLaunch({
      posture: "curated",
      skillPaths: [FIXTURE],
      sessionDir: "/tmp/sess-test",
    });
    expect(plan.posture).toBe("curated");
    expect(plan.skillCount).toBe(1);
    expect(plan.fsPlan.some((op) => op.kind === "copyDir" && op.to.includes(".gemini/config/skills/impeccable"))).toBe(true);
  });

  it("plans native launch untouched", () => {
    const plan = planLaunch({
      posture: "native",
      sessionDir: "/tmp/sess-test",
    });
    expect(plan.posture).toBe("native");
    expect(plan.argv).toEqual([]);
    expect(plan.env).toEqual({});
    expect(plan.fsPlan).toEqual([]);
  });
});
