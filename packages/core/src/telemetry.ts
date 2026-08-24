import { createHash, randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import type { Mechanism, Posture } from "./compile.js";
import type { ResolvedSkill } from "./skills.js";

export const TELEMETRY_SCHEMA = "gaia.skill-zero-runtime-observation/v1" as const;

export interface RuntimeObservation {
  schema: typeof TELEMETRY_SCHEMA;
  sessionPseudonym: string;
  observedAt: string;
  harness: { name: string; version?: string };
  model?: { id: string; version?: string };
  composition: {
    posture: Posture;
    mechanism?: Mechanism;
    loadedSkills: Array<{
      id: string;
      contentSha256: string;
      invocationObserved: true | null;
    }>;
  };
  taskFamily?: string;
  signals: {
    outcome: { status: "succeeded" | "failed"; exitCode: number };
    retryCount: number | null;
    recoveryObserved: boolean | null;
    churnCount: number | null;
  };
  metrics: {
    latencyMs: number;
    tokens?: {
      input?: number;
      output?: number;
      cacheCreationInput?: number;
      cacheReadInput?: number;
      total?: number;
    };
  };
}

export interface AvailableTokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  total_tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  totalTokens?: number;
}

export interface ObservationInput {
  sessionPseudonym: string;
  observedAt: string;
  harness: { name: string; version?: string };
  model?: { id: string; version?: string };
  posture: Posture;
  mechanism?: Mechanism;
  skills: ResolvedSkill[];
  invokedSkillIds?: string[];
  taskFamily?: string;
  exitCode: number;
  retryCount?: number;
  recoveryObserved?: boolean;
  churnCount?: number;
  wallClockMs: number;
  usage?: AvailableTokenUsage;
}

/** Generate an unlinkable local session label. The random seed is never exported. */
export function newSessionPseudonym(seed: Uint8Array = randomBytes(32)): string {
  return `szs_${createHash("sha256").update(seed).digest("hex")}`;
}

function availableNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => typeof value === "number" && Number.isFinite(value));
}

function availableTokens(usage: AvailableTokenUsage | undefined): RuntimeObservation["metrics"]["tokens"] {
  if (!usage) return undefined;
  const input = availableNumber(usage.input_tokens, usage.inputTokens);
  const output = availableNumber(usage.output_tokens, usage.outputTokens);
  const cacheCreationInput = availableNumber(
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
  );
  const cacheReadInput = availableNumber(usage.cache_read_input_tokens, usage.cacheReadInputTokens);
  const explicitTotal = availableNumber(usage.total_tokens, usage.totalTokens);
  const measured = [input, output, cacheCreationInput, cacheReadInput];
  const total = explicitTotal ?? (measured.some((value) => value !== undefined)
    ? measured.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : undefined);
  if (total === undefined) return undefined;
  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(cacheCreationInput === undefined ? {} : { cacheCreationInput }),
    ...(cacheReadInput === undefined ? {} : { cacheReadInput }),
    total,
  };
}

export function assembleRuntimeObservation(input: ObservationInput): RuntimeObservation {
  const invoked = new Set(input.invokedSkillIds ?? []);
  const loadedIds = new Set(input.skills.map((skill) => skill.id));
  for (const id of invoked) {
    if (!loadedIds.has(id)) throw new Error(`invocation observation names an unloaded skill: ${id}`);
  }

  const tokens = availableTokens(input.usage);
  const observation: RuntimeObservation = {
    schema: TELEMETRY_SCHEMA,
    sessionPseudonym: input.sessionPseudonym,
    observedAt: input.observedAt,
    harness: {
      name: input.harness.name,
      ...(input.harness.version && input.harness.version !== "unknown"
        ? { version: input.harness.version }
        : {}),
    },
    ...(input.model
      ? {
          model: {
            id: input.model.id,
            ...(input.model.version ? { version: input.model.version } : {}),
          },
        }
      : {}),
    composition: {
      posture: input.posture,
      ...(input.mechanism ? { mechanism: input.mechanism } : {}),
      loadedSkills: input.skills.map((skill) => ({
        id: skill.id,
        contentSha256: skill.contentSha256,
        invocationObserved: invoked.has(skill.id) ? true : null,
      })),
    },
    ...(input.taskFamily === undefined ? {} : { taskFamily: input.taskFamily }),
    signals: {
      outcome: {
        status: input.exitCode === 0 ? "succeeded" : "failed",
        exitCode: input.exitCode,
      },
      retryCount: input.retryCount ?? null,
      recoveryObserved: input.recoveryObserved ?? null,
      churnCount: input.churnCount ?? null,
    },
    metrics: {
      latencyMs: input.wallClockMs,
      ...(tokens ? { tokens } : {}),
    },
  };
  validateRuntimeObservation(observation);
  return observation;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: Record<string, unknown>, allowed: string[], at: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`${at} contains unknown field(s): ${extras.join(", ")}`);
}

function objectAt(value: unknown, at: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${at} must be an object`);
  return value;
}

function stringAt(value: unknown, at: string, max = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`${at} must be a non-empty string of at most ${max} characters`);
  }
  if (containsAbsolutePath(value)) throw new Error(`${at} must not contain an absolute local path`);
  return value;
}

function nonNegativeInteger(value: unknown, at: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${at} must be a non-negative integer`);
  }
  return value as number;
}

/** Covers POSIX, drive-letter, UNC, and file-URL paths, including paths embedded in text. */
export function containsAbsolutePath(value: string): boolean {
  if (isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || /^file:\/\//i.test(value)) {
    return true;
  }
  return /(?:^|[\s"'=,(])\/(?!\/)[^\s]*/.test(value) ||
    /(?:^|[\s"'=,(])[A-Za-z]:[\\/][^\s]*/.test(value) ||
    /(?:^|[\s"'=,(])\\\\[^\s]*/.test(value) ||
    /(?:^|[\s"'=,(])file:\/\/[^\s]*/i.test(value);
}

export function validateRuntimeObservation(value: unknown): asserts value is RuntimeObservation {
  const root = objectAt(value, "observation");
  exactKeys(root, ["schema", "sessionPseudonym", "observedAt", "harness", "model", "composition", "taskFamily", "signals", "metrics"], "observation");
  if (root.schema !== TELEMETRY_SCHEMA) throw new Error(`observation.schema must be ${TELEMETRY_SCHEMA}`);
  if (typeof root.sessionPseudonym !== "string" || !/^szs_[a-f0-9]{64}$/.test(root.sessionPseudonym)) {
    throw new Error("observation.sessionPseudonym must be a Skill Zero SHA-256 pseudonym");
  }
  if (typeof root.observedAt !== "string" || !Number.isFinite(Date.parse(root.observedAt)) ||
      new Date(root.observedAt).toISOString() !== root.observedAt) {
    throw new Error("observation.observedAt must be a canonical ISO-8601 timestamp");
  }

  const harness = objectAt(root.harness, "observation.harness");
  exactKeys(harness, ["name", "version"], "observation.harness");
  stringAt(harness.name, "observation.harness.name", 64);
  if (harness.version !== undefined) stringAt(harness.version, "observation.harness.version", 128);

  if (root.model !== undefined) {
    const model = objectAt(root.model, "observation.model");
    exactKeys(model, ["id", "version"], "observation.model");
    stringAt(model.id, "observation.model.id", 128);
    if (model.version !== undefined) stringAt(model.version, "observation.model.version", 128);
  }

  const composition = objectAt(root.composition, "observation.composition");
  exactKeys(composition, ["posture", "mechanism", "loadedSkills"], "observation.composition");
  if (!["floor", "product-floor", "curated", "native"].includes(composition.posture as string)) {
    throw new Error("observation.composition.posture is invalid");
  }
  if (composition.mechanism !== undefined && !["plugin-dir", "config-dir"].includes(composition.mechanism as string)) {
    throw new Error("observation.composition.mechanism is invalid");
  }
  if (!Array.isArray(composition.loadedSkills)) throw new Error("observation.composition.loadedSkills must be an array");
  const skillIds = new Set<string>();
  for (const [index, candidate] of composition.loadedSkills.entries()) {
    const skill = objectAt(candidate, `observation.composition.loadedSkills[${index}]`);
    exactKeys(skill, ["id", "contentSha256", "invocationObserved"], `observation.composition.loadedSkills[${index}]`);
    const id = stringAt(skill.id, `observation.composition.loadedSkills[${index}].id`, 256);
    if (skillIds.has(id)) throw new Error(`observation contains duplicate loaded skill id: ${id}`);
    skillIds.add(id);
    if (typeof skill.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(skill.contentSha256)) {
      throw new Error(`observation.composition.loadedSkills[${index}].contentSha256 must be a lowercase SHA-256`);
    }
    if (skill.invocationObserved !== true && skill.invocationObserved !== null) {
      throw new Error(`observation.composition.loadedSkills[${index}].invocationObserved must be true or null`);
    }
  }

  if (root.taskFamily !== undefined) stringAt(root.taskFamily, "observation.taskFamily", 128);

  const signals = objectAt(root.signals, "observation.signals");
  exactKeys(signals, ["outcome", "retryCount", "recoveryObserved", "churnCount"], "observation.signals");
  const outcome = objectAt(signals.outcome, "observation.signals.outcome");
  exactKeys(outcome, ["status", "exitCode"], "observation.signals.outcome");
  if (outcome.status !== "succeeded" && outcome.status !== "failed") throw new Error("observation.signals.outcome.status is invalid");
  const exitCode = nonNegativeInteger(outcome.exitCode, "observation.signals.outcome.exitCode");
  if ((exitCode === 0) !== (outcome.status === "succeeded")) throw new Error("observation outcome status contradicts exitCode");
  for (const key of ["retryCount", "churnCount"] as const) {
    if (signals[key] !== null) nonNegativeInteger(signals[key], `observation.signals.${key}`);
  }
  if (signals.recoveryObserved !== null && typeof signals.recoveryObserved !== "boolean") {
    throw new Error("observation.signals.recoveryObserved must be boolean or null");
  }

  const metrics = objectAt(root.metrics, "observation.metrics");
  exactKeys(metrics, ["latencyMs", "tokens"], "observation.metrics");
  nonNegativeInteger(metrics.latencyMs, "observation.metrics.latencyMs");
  if (metrics.tokens !== undefined) {
    const tokens = objectAt(metrics.tokens, "observation.metrics.tokens");
    exactKeys(tokens, ["input", "output", "cacheCreationInput", "cacheReadInput", "total"], "observation.metrics.tokens");
    if (Object.keys(tokens).length === 0) throw new Error("observation.metrics.tokens must not be empty");
    for (const [key, tokenValue] of Object.entries(tokens)) nonNegativeInteger(tokenValue, `observation.metrics.tokens.${key}`);
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

/** Validate first, then emit stable key ordering and exactly one trailing newline. */
export function serializeRuntimeObservation(value: unknown): string {
  validateRuntimeObservation(value);
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}
