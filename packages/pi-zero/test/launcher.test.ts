import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertLevelAllowed,
  planLaunch,
  resolveLevelAlias,
} from "../src/launcher.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "core",
  "test",
  "fixtures",
  "impeccable-skill",
);

describe("launcher level helpers", () => {
  it("resolves valid level aliases to postures", () => {
    expect(resolveLevelAlias("zero")).toBe("product-floor");
    expect(resolveLevelAlias("low")).toBe("curated");
    expect(resolveLevelAlias("med")).toBe("native");
    expect(resolveLevelAlias("native")).toBe("native");
  });

  it("assertLevelAllowed throws on summon-only rungs with redirect instructions", () => {
    expect(() => assertLevelAllowed("high")).toThrow(/live summon rung/);
    expect(() => assertLevelAllowed("ultra")).toThrow(/\/skill-ultra/);
    expect(() => assertLevelAllowed("zero")).not.toThrow();
  });
});

describe("planLaunch", () => {
  it("defaults to product-floor posture with sessionDir placeholder substitution", () => {
    const plan = planLaunch({
      sessionDir: "/tmp/test-session",
    });

    expect(plan.posture).toBe("product-floor");
    expect(plan.command).toBe("pi");
    expect(plan.argv).toContain("--no-skills");
    expect(plan.argv).toContain("--no-context-files");
    expect(plan.argv).toContain("--no-prompt-templates");
    expect(plan.skillCount).toBe(0);
    expect(plan.execSupport).toBe("exec");
  });

  it("plans curated posture with resolved skills", () => {
    const plan = planLaunch({
      posture: "curated",
      skillPaths: [FIXTURE],
      sessionDir: "/tmp/test-session",
    });

    expect(plan.posture).toBe("curated");
    expect(plan.skillCount).toBe(1);
    expect(plan.argv).toContain("--skill");
    expect(plan.argv).toContain(FIXTURE);
  });

  it("plans native posture without suppressing user skills", () => {
    const plan = planLaunch({
      posture: "native",
      sessionDir: "/tmp/test-session",
    });

    expect(plan.posture).toBe("native");
    expect(plan.argv).not.toContain("--no-skills");
  });

  it("passes model and custom piArgs", () => {
    const plan = planLaunch({
      posture: "product-floor",
      model: "custom/test-model",
      sessionDir: "/tmp/test-session",
      piArgs: ["--thinking", "high"],
    });

    expect(plan.argv).toContain("--model");
    expect(plan.argv).toContain("custom/test-model");
    expect(plan.argv).toContain("--thinking");
    expect(plan.argv).toContain("high");
  });
});
