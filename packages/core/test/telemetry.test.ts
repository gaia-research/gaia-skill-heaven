import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";
import type { ResolvedSkill } from "../src/skills.js";
import {
  TELEMETRY_SCHEMA,
  assembleRuntimeObservation,
  containsAbsolutePath,
  newSessionPseudonym,
  serializeRuntimeObservation,
  validateRuntimeObservation,
  type ObservationInput,
} from "../src/telemetry.js";

const skill: ResolvedSkill = {
  id: "example/diagnose",
  dir: "/private/work/skills/diagnose",
  skillMdPath: "/private/work/skills/diagnose/SKILL.md",
  listingLine: "- example/diagnose: diagnose a failure",
  standingTokens: 10,
  invocationTokens: 100,
  contentSha256: "a".repeat(64),
};

const input = (overrides: Partial<ObservationInput> = {}): ObservationInput => ({
  sessionPseudonym: newSessionPseudonym(new Uint8Array([1, 2, 3])),
  observedAt: "2026-08-25T12:00:00.000Z",
  harness: { name: "claude", version: "2.1.237" },
  model: { id: "claude-sonnet", version: "2026-08" },
  posture: "curated",
  mechanism: "plugin-dir",
  skills: [skill],
  invokedSkillIds: [skill.id],
  exitCode: 0,
  wallClockMs: 1250,
  ...overrides,
});

describe("Skill Zero runtime telemetry", () => {
  it("exports a deterministic, versioned observation with exact skill identity", () => {
    const observation = assembleRuntimeObservation(input({
      taskFamily: "repository-debugging",
      retryCount: 1,
      recoveryObserved: true,
      churnCount: 2,
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 },
    }));

    expect(observation.schema).toBe(TELEMETRY_SCHEMA);
    expect(observation.composition.loadedSkills).toEqual([{
      id: skill.id,
      contentSha256: skill.contentSha256,
      invocationObserved: true,
    }]);
    expect(observation.metrics.tokens).toEqual({ input: 10, output: 5, cacheReadInput: 3, total: 18 });
    expect(serializeRuntimeObservation(observation)).toBe(serializeRuntimeObservation(structuredClone(observation)));
    expect(() => validateRuntimeObservation(JSON.parse(serializeRuntimeObservation(observation)))).not.toThrow();
  });

  it("omits task family, model, and tokens when they were not supplied or available", () => {
    const observation = assembleRuntimeObservation(input({
      model: undefined,
      taskFamily: undefined,
      usage: undefined,
      invokedSkillIds: [],
    }));
    expect(observation).not.toHaveProperty("taskFamily");
    expect(observation).not.toHaveProperty("model");
    expect(observation.metrics).toEqual({ latencyMs: 1250 });
    expect(observation.composition.loadedSkills[0].invocationObserved).toBeNull();
    expect(observation.signals).toMatchObject({ retryCount: null, recoveryObserved: null, churnCount: null });
  });

  it("does not serialize source paths, prompts, outputs, or credential values", () => {
    const secretPrompt = "PROMPT_DO_NOT_EXPORT";
    const secretOutput = "OUTPUT_DO_NOT_EXPORT";
    const credential = "sk-secret-do-not-export";
    const observation = assembleRuntimeObservation({
      ...input(),
      // Deliberately demonstrate that unrelated runtime material is outside the
      // telemetry input contract and cannot become an emitted field.
      prompt: secretPrompt,
      output: secretOutput,
      credential,
    } as ObservationInput & { prompt: string; output: string; credential: string });
    const json = serializeRuntimeObservation(observation);
    expect(json).not.toContain(skill.dir);
    expect(json).not.toContain(skill.skillMdPath);
    expect(json).not.toContain(secretPrompt);
    expect(json).not.toContain(secretOutput);
    expect(json).not.toContain(credential);
    expect(json).not.toMatch(/"(prompt|output|credential|path)"\s*:/);
  });

  it.each([
    "/home/alice/project",
    "detail=/private/tmp/session/file.json",
    "C:\\Users\\alice\\project",
    "detail=C:/Users/alice/project",
    "\\\\server\\share\\file",
    "file:///home/alice/file",
  ])("rejects absolute local paths: %s", (path) => {
    expect(containsAbsolutePath(path)).toBe(true);
    const observation = assembleRuntimeObservation(input());
    const unsafe = { ...observation, taskFamily: path };
    expect(() => validateRuntimeObservation(unsafe)).toThrow(/absolute local path/);
  });

  it("rejects unknown privacy-sensitive fields and unloaded invocation claims", () => {
    const observation = assembleRuntimeObservation(input());
    expect(() => validateRuntimeObservation({ ...observation, prompt: "raw prompt" })).toThrow(/unknown field/);
    expect(() => assembleRuntimeObservation(input({ invokedSkillIds: ["not-loaded"] }))).toThrow(/unloaded skill/);
  });

  it("keeps the public JSON Schema aligned with the runtime schema id", () => {
    const schema = JSON.parse(readFileSync(resolve(import.meta.dirname, "../schema/runtime-observation-v1.schema.json"), "utf8"));
    expect(schema.properties.schema.const).toBe(TELEMETRY_SCHEMA);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("telemetry CLI opt-in", () => {
  it("does nothing unless --telemetry-out is explicitly present", () => {
    expect(parseArgs(["--posture", "floor"])).not.toHaveProperty("telemetry");
    expect(parseArgs(["--posture", "floor", "--telemetry-out", "observation.json"]).telemetry?.out)
      .toBe("observation.json");
  });

  it("requires the export opt-in for detail flags and stays separate from benchmark export", () => {
    expect(() => parseArgs(["--telemetry-task-family", "debugging"])).toThrow(/require --telemetry-out/);
    expect(() => parseArgs([
      "-p", "task",
      "--record",
      "--benchmark-id", "b1",
      "--task", "t1",
      "--telemetry-out", "observation.json",
    ])).toThrow(/not benchmark arms/);
  });
});
