import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  assembleRuntimeObservation,
  newSessionPseudonym,
  serializeRuntimeObservation,
} from "../src/telemetry.js";

const bin = resolve(import.meta.dirname, "../bin/skill-zero.mjs");
const tempDir = mkdtempSync(join(tmpdir(), "skill-zero-telemetry-cli-"));

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function run(...args: string[]) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: "utf8" });
}

describe("skill-zero telemetry CLI", () => {
  it("validates a standalone valid observation file", () => {
    const path = join(tempDir, "valid.json");
    const observation = assembleRuntimeObservation({
      sessionPseudonym: newSessionPseudonym(new Uint8Array([1, 2, 3])),
      observedAt: "2026-08-25T12:00:00.000Z",
      harness: { name: "claude", version: "2.1.237" },
      posture: "floor",
      skills: [],
      invokedSkillIds: [],
      exitCode: 0,
      wallClockMs: 1250,
    });
    writeFileSync(path, serializeRuntimeObservation(observation));

    const result = run("--telemetry-validate", path);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(`valid ${observation.schema}`);
  });

  it("rejects a standalone invalid observation file", () => {
    const path = join(tempDir, "invalid.json");
    writeFileSync(path, JSON.stringify({ schema: "not-a-runtime-observation" }));

    const result = run("--telemetry-validate", path);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("observation.schema must be");
  });

  it.each([
    ["--telemetry-retry-count", "not-a-number"],
    ["--telemetry-retry-count", "1.5"],
    ["--telemetry-retry-count", "-1"],
    ["--telemetry-churn-count", "not-a-number"],
    ["--telemetry-churn-count", "1.5"],
    ["--telemetry-churn-count", "-1"],
  ])("rejects invalid integer flag %s %s", (flag, value) => {
    const result = run("--telemetry-out", join(tempDir, "out.json"), flag, value);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`${flag} must be a non-negative integer`);
  });

  it("rejects an invalid recovery enum", () => {
    const result = run(
      "--telemetry-out", join(tempDir, "out.json"),
      "--telemetry-recovery", "sometimes",
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--telemetry-recovery must be observed or not-observed");
  });

  it("rejects a model version without a model", () => {
    const result = run(
      "--telemetry-out", join(tempDir, "out.json"),
      "--telemetry-model-version", "2026-08",
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--telemetry-model-version requires --model");
  });
});
