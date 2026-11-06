// skill-zero CLI (working name — OPEN item 8; flag vocabulary provisional
// pending N4/N5). See README for the full surface.

import { readFileSync, writeFileSync } from "node:fs";
import { compile, DEFAULT_CLAUDE_MECHANISM, HARNESSES, LEVEL_ALIASES, MECHANISMS, POSTURE_ALIASES, POSTURES, SUMMON_ONLY_LEVELS, floorOf, type CompileInput, type Harness, type Mechanism, type Posture } from "./compile.js";
import { exec, harnessVersion } from "./exec.js";
import { assembleRecord, type RecordOpts } from "./record.js";
import { resolveSkill, type ResolvedSkill } from "./skills.js";
import { contentSha256 } from "./vendor/census-pure.js";
import { applyAdvisory, claudeHaikuRunner, stampTranscript, validateUltraStamp } from "./ultra-stamp/index.js";
import {
  assembleRuntimeObservation,
  newSessionPseudonym,
  serializeRuntimeObservation,
  validateRuntimeObservation,
  type AvailableTokenUsage,
} from "./telemetry.js";
import type { Arm } from "./vendor/ledger-record.js";
import {
  DEFAULT_STEERING_POLICY,
  createOperatorEvent,
  initialSteeringState,
  parseOperatorCommand,
  parseSteeringPolicy,
  parseSteeringState,
  stepSteering,
  verifySteeringRecord,
} from "./steering.js";

interface CliArgs {
  posture: Posture;
  harness: Harness;
  mechanism?: Mechanism;
  skillPaths: string[];
  doorPluginDir?: string;
  print: boolean;
  prompt?: string;
  model?: string;
  effort?: string;
  keepTemp: boolean;
  passthrough: string[];
  record?: RecordOpts;
  telemetry?: {
    out: string;
    taskFamily?: string;
    invokedSkillIds: string[];
    modelVersion?: string;
    retryCount?: number;
    recoveryObserved?: boolean;
    churnCount?: number;
  };
  telemetryValidate?: string;
  ultraStamp?: { file: string; saltEnv: string; skills: string[]; out?: string; advisory?: { runner: string; maxChars?: number; timeoutMs?: number; only: string[] } };
  ultraStampValidate?: string;
  steeringEvent?: string;
  steeringState?: string;
  steeringPolicy?: string;
  steeringVerify?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  let posture: Posture | undefined;
  let level: string | undefined;
  let harness: Harness = "claude";
  let mechanism: Mechanism | undefined;
  const skillPaths: string[] = [];
  let doorPluginDir: string | undefined;
  let print = false;
  let prompt: string | undefined;
  let model: string | undefined;
  let effort: string | undefined;
  let keepTemp = false;
  const passthrough: string[] = [];
  let record = false;
  let benchmarkId: string | undefined;
  let task: string | undefined;
  let arm: Arm = "heaven";
  let repeat = 0;
  let endpointRegex: string | undefined;
  let recordOut: string | undefined;
  let note: string | undefined;
  let telemetryOut: string | undefined;
  let telemetryTaskFamily: string | undefined;
  const telemetryInvokedSkillIds: string[] = [];
  let telemetryModelVersion: string | undefined;
  let telemetryRetryCount: number | undefined;
  let telemetryRecoveryObserved: boolean | undefined;
  let telemetryChurnCount: number | undefined;
  let telemetryValidate: string | undefined;
  let ultraStampFile: string | undefined;
  let ultraStampSaltEnv: string | undefined;
  let ultraStampOut: string | undefined;
  let ultraStampValidate: string | undefined;
  const ultraStampSkills: string[] = [];
  let advisoryOn = false;
  let advisoryRunner: string | undefined;
  let advisoryMaxChars: number | undefined;
  let advisoryTimeoutMs: number | undefined;
  const advisorySkills: string[] = [];
  let steeringEvent: string | undefined;
  let steeringState: string | undefined;
  let steeringPolicy: string | undefined;
  let steeringVerify: string | undefined;
  const suppliedFlags = new Set<string>();

  const need = (flag: string, i: number): string => {
    const v = argv[i];
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    suppliedFlags.add(a);
    if (a === "--") { passthrough.push(...argv.slice(i + 1)); break; }
    else if (a === "--posture") {
      const raw = need(a, ++i);
      // "benchmark-floor" is the unambiguous spelling of the doorless floor;
      // "floor" remains its canonical value (V5-5 floor split).
      const v = POSTURE_ALIASES[raw] ?? raw;
      if (!POSTURES.includes(v as Posture)) {
        throw new Error(`--posture must be one of ${POSTURES.join("|")} (alias: benchmark-floor = floor)`);
      }
      posture = v as Posture;
    } else if (a === "--door-plugin-dir") doorPluginDir = need(a, ++i);
    else if (a === "--level") level = need(a, ++i);
    else if (a === "--harness") {
      const v = need(a, ++i);
      if (!HARNESSES.includes(v as Harness)) throw new Error(`--harness must be one of ${HARNESSES.join("|")}`);
      harness = v as Harness;
    } else if (a === "--mechanism") {
      const v = need(a, ++i);
      if (!MECHANISMS.includes(v as Mechanism)) throw new Error(`--mechanism must be one of ${MECHANISMS.join("|")}`);
      mechanism = v as Mechanism;
    } else if (a === "--skill") skillPaths.push(need(a, ++i));
    else if (a === "--print") print = true;
    else if (a === "-p") prompt = need(a, ++i);
    else if (a === "--model") model = need(a, ++i);
    else if (a === "--effort") effort = need(a, ++i);
    else if (a === "--keep-temp") keepTemp = true;
    else if (a === "--record") record = true;
    else if (a === "--benchmark-id") benchmarkId = need(a, ++i);
    else if (a === "--task") task = need(a, ++i);
    else if (a === "--arm") {
      const v = need(a, ++i);
      if (v !== "heaven" && v !== "placebo") throw new Error("--arm must be heaven or placebo");
      arm = v;
    } else if (a === "--repeat") repeat = Number(need(a, ++i));
    else if (a === "--endpoint-regex") endpointRegex = need(a, ++i);
    else if (a === "--record-out") recordOut = need(a, ++i);
    else if (a === "--note") note = need(a, ++i);
    else if (a === "--telemetry-out") telemetryOut = need(a, ++i);
    else if (a === "--telemetry-task-family") telemetryTaskFamily = need(a, ++i);
    else if (a === "--telemetry-invoked-skill") telemetryInvokedSkillIds.push(need(a, ++i));
    else if (a === "--telemetry-model-version") telemetryModelVersion = need(a, ++i);
    else if (a === "--telemetry-retry-count") telemetryRetryCount = Number(need(a, ++i));
    else if (a === "--telemetry-recovery") {
      const value = need(a, ++i);
      if (value !== "observed" && value !== "not-observed") {
        throw new Error("--telemetry-recovery must be observed or not-observed");
      }
      telemetryRecoveryObserved = value === "observed";
    } else if (a === "--telemetry-churn-count") telemetryChurnCount = Number(need(a, ++i));
    else if (a === "--telemetry-validate") telemetryValidate = need(a, ++i);
    else if (a === "--ultra-stamp") ultraStampFile = need(a, ++i);
    else if (a === "--ultra-stamp-salt-env") ultraStampSaltEnv = need(a, ++i);
    else if (a === "--ultra-stamp-skill") ultraStampSkills.push(need(a, ++i));
    else if (a === "--ultra-stamp-out") ultraStampOut = need(a, ++i);
    else if (a === "--ultra-stamp-validate") ultraStampValidate = need(a, ++i);
    else if (a === "--advisory") advisoryOn = true;
    else if (a === "--advisory-runner") advisoryRunner = need(a, ++i);
    else if (a === "--advisory-max-chars") advisoryMaxChars = Number(need(a, ++i));
    else if (a === "--advisory-timeout-ms") advisoryTimeoutMs = Number(need(a, ++i));
    else if (a === "--advisory-skill") advisorySkills.push(need(a, ++i));
    else if (a === "--steering-event" || a === "--steer-event") steeringEvent = need(a, ++i);
    else if (a === "--steering-state") steeringState = need(a, ++i);
    else if (a === "--steering-policy") steeringPolicy = need(a, ++i);
    else if (a === "--steering-verify") steeringVerify = need(a, ++i);
    else throw new Error(`unknown arg: ${a}`);
  }

  const ultraFlags = new Set(["--ultra-stamp", "--ultra-stamp-salt-env", "--ultra-stamp-skill", "--ultra-stamp-out", "--ultra-stamp-validate", "--advisory", "--advisory-runner", "--advisory-max-chars", "--advisory-timeout-ms", "--advisory-skill"]);
  if ([...suppliedFlags].some((f) => ultraFlags.has(f))) {
    if ([...suppliedFlags].some((f) => !ultraFlags.has(f))) throw new Error("ultra-stamp flags are standalone and cannot be combined with launch, record, telemetry, or steering flags");
    if (ultraStampValidate !== undefined && ultraStampFile !== undefined) throw new Error("--ultra-stamp-validate cannot be combined with --ultra-stamp");
    const advisoryFlags = ["--advisory-runner", "--advisory-max-chars", "--advisory-timeout-ms", "--advisory-skill"];
    if (!advisoryOn && advisoryFlags.some((f) => suppliedFlags.has(f))) throw new Error("--advisory-* options require --advisory");
    if (advisoryOn && ultraStampFile === undefined) throw new Error("--advisory requires --ultra-stamp");
    if (advisoryOn && advisoryRunner !== "claude-haiku") throw new Error("--advisory requires an explicit --advisory-runner claude-haiku (the only built-in runner; it makes a model call)");
    for (const [n, v] of [["--advisory-max-chars", advisoryMaxChars], ["--advisory-timeout-ms", advisoryTimeoutMs]] as const) {
      if (v !== undefined && (!Number.isSafeInteger(v) || v < 1)) throw new Error(`${n} must be a positive integer`);
    }
    if (ultraStampValidate === undefined && (ultraStampFile === undefined || ultraStampSaltEnv === undefined)) {
      throw new Error("--ultra-stamp <transcript.jsonl> requires --ultra-stamp-salt-env <ENV_VAR_NAME> (the salt is read from the environment, never argv)");
    }
  }

  const steeringRequested = steeringEvent !== undefined || steeringState !== undefined || steeringPolicy !== undefined || steeringVerify !== undefined;
  if (steeringRequested) {
    const steeringFlags = new Set(["--steering-event", "--steer-event", "--steering-state", "--steering-policy", "--steering-verify"]);
    const unrelated = [...suppliedFlags].filter((flag) => !steeringFlags.has(flag));
    if (unrelated.length > 0) {
      throw new Error("steering flags are standalone; do not combine them with launch, record, or telemetry flags");
    }
    if (steeringVerify !== undefined && (steeringEvent !== undefined || steeringState !== undefined || steeringPolicy !== undefined)) {
      throw new Error("--steering-verify cannot be combined with steering event, state, or policy flags");
    }
    if (steeringVerify === undefined && steeringEvent === undefined) {
      throw new Error("--steering-state and --steering-policy require --steering-event");
    }
  }

  // Heaven levels select boot postures. The upper band — high · xhigh · max ·
  // ultra — is armed live, in-session, and deliberately has no posture mapping.
  // This is a redirect, not a gate: nothing on the line refuses (N13).
  if (level !== undefined) {
    if ((SUMMON_ONLY_LEVELS as readonly string[]).includes(level)) {
      const arm = level === "ultra" ? "/skill-ultra" : `/skill-hell ${level}`;
      throw new Error(
        `--level ${level} is a live summon rung, not a boot posture — launch a Heaven rung (zero|low|med), then arm ${arm}`,
      );
    }
    const aliased = LEVEL_ALIASES[level];
    if (!aliased) throw new Error(`--level must be one of zero|low|med (or native)`);
    if (posture !== undefined && posture !== aliased) {
      throw new Error(`--level ${level} (= ${aliased}) contradicts --posture ${posture}`);
    }
    posture = aliased;
  }
  posture ??= "floor";

  let recordOpts: RecordOpts | undefined;
  if (record) {
    if (prompt === undefined) throw new Error("--record is headless-only: -p <text> is required");
    if (!benchmarkId || !task) throw new Error("--record requires --benchmark-id and --task");
    if (!Number.isInteger(repeat) || repeat < 0) throw new Error("--repeat must be a non-negative integer");
    // B2/V5-5: the placebo-of-record is the DOORLESS floor and only the doorless
    // floor. The product floor keeps a control surface, so it can never stand in
    // as the placebo — and the two floors are never averaged into one arm (B1).
    if (arm === "placebo" && posture !== "floor") {
      throw new Error(
        `--arm placebo is only valid with --posture floor, the doorless benchmark floor (got ${posture}). ` +
          "The product floor is a separate arm (B1) and is recorded as --arm heaven.",
      );
    }
    recordOpts = { benchmarkId, task, arm, repeatIndex: repeat, endpointRegex, recordOut, note };
  }

  const telemetryDetailUsed = telemetryTaskFamily !== undefined || telemetryInvokedSkillIds.length > 0 ||
    telemetryModelVersion !== undefined || telemetryRetryCount !== undefined ||
    telemetryRecoveryObserved !== undefined || telemetryChurnCount !== undefined;
  if (telemetryDetailUsed && telemetryOut === undefined) {
    throw new Error("telemetry detail flags require --telemetry-out <local-file>");
  }
  if (telemetryOut !== undefined) {
    if (telemetryModelVersion !== undefined && model === undefined) {
      throw new Error("--telemetry-model-version requires --model");
    }
    if (record) throw new Error("--telemetry-out cannot be combined with --record; runtime observations are not benchmark arms");
    if (print) throw new Error("--telemetry-out records an execution and cannot be combined with --print");
    for (const [flag, value] of [
      ["--telemetry-retry-count", telemetryRetryCount],
      ["--telemetry-churn-count", telemetryChurnCount],
    ] as const) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        throw new Error(`${flag} must be a non-negative integer`);
      }
    }
  }
  if (telemetryValidate !== undefined && (telemetryOut !== undefined || telemetryDetailUsed || record)) {
    throw new Error("--telemetry-validate is standalone and cannot be combined with export or benchmark flags");
  }

  return {
    posture,
    harness,
    mechanism,
    skillPaths,
    doorPluginDir,
    print,
    prompt,
    model,
    effort,
    keepTemp,
    passthrough,
    record: recordOpts,
    ...(telemetryOut === undefined ? {} : {
      telemetry: {
        out: telemetryOut,
        ...(telemetryTaskFamily === undefined ? {} : { taskFamily: telemetryTaskFamily }),
        invokedSkillIds: telemetryInvokedSkillIds,
        ...(telemetryModelVersion === undefined ? {} : { modelVersion: telemetryModelVersion }),
        ...(telemetryRetryCount === undefined ? {} : { retryCount: telemetryRetryCount }),
        ...(telemetryRecoveryObserved === undefined ? {} : { recoveryObserved: telemetryRecoveryObserved }),
        ...(telemetryChurnCount === undefined ? {} : { churnCount: telemetryChurnCount }),
      },
    }),
    ...(telemetryValidate === undefined ? {} : { telemetryValidate }),
    ...(ultraStampFile === undefined ? {} : { ultraStamp: { file: ultraStampFile, saltEnv: ultraStampSaltEnv!, skills: ultraStampSkills, ...(ultraStampOut === undefined ? {} : { out: ultraStampOut }), ...(advisoryOn ? { advisory: { runner: advisoryRunner!, ...(advisoryMaxChars === undefined ? {} : { maxChars: advisoryMaxChars }), ...(advisoryTimeoutMs === undefined ? {} : { timeoutMs: advisoryTimeoutMs }), only: advisorySkills } } : {}) } }),
    ...(ultraStampValidate === undefined ? {} : { ultraStampValidate }),
    ...(steeringEvent === undefined ? {} : { steeringEvent }),
    ...(steeringState === undefined ? {} : { steeringState }),
    ...(steeringPolicy === undefined ? {} : { steeringPolicy }),
    ...(steeringVerify === undefined ? {} : { steeringVerify }),
  };
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.steeringVerify !== undefined) {
    const verification = verifySteeringRecord(JSON.parse(readFileSync(args.steeringVerify, "utf8")) as unknown);
    if (!verification.valid) throw new Error(`invalid steering record: ${verification.error}`);
    console.log(JSON.stringify({
      valid: true,
      schema: verification.record.schema,
      initial: verification.record.initial,
      final: verification.record.final,
      traceLength: verification.record.trace.length,
    }, null, 2));
    return 0;
  }
  if (args.steeringEvent !== undefined) {
    const command = parseOperatorCommand(JSON.parse(args.steeringEvent) as unknown);
    if (command === null) {
      throw new Error("--steering-event accepts only an explicit operator control; runtime behavioral events are host-adapter-only");
    }
    const state = args.steeringState === undefined
      ? initialSteeringState()
      : parseSteeringState(JSON.parse(args.steeringState) as unknown);
    if (state === null) throw new Error("--steering-state must be JSON with rung and search from the steering state contract");
    const policy = args.steeringPolicy === undefined
      ? DEFAULT_STEERING_POLICY
      : parseSteeringPolicy(JSON.parse(args.steeringPolicy) as unknown);
    if (policy === null) throw new Error("--steering-policy must be JSON with version, floor, and ceiling from the steering policy contract");
    const event = createOperatorEvent(command.type, command.eventId);
    console.log(JSON.stringify(stepSteering(state, event, policy), null, 2));
    return 0;
  }
  if (args.ultraStampValidate !== undefined) {
    const value: unknown = JSON.parse(readFileSync(args.ultraStampValidate, "utf8"));
    validateUltraStamp(value);
    console.error(`[skill-zero] valid ${String((value as { schema?: unknown }).schema)}`);
    return 0;
  }
  if (args.ultraStamp !== undefined) {
    if (args.ultraStamp.advisory) throw new Error("--advisory runs through the async entry point (mainAsync)");
    const salt = process.env[args.ultraStamp.saltEnv];
    if (!salt) throw new Error(`environment variable ${args.ultraStamp.saltEnv} is unset or empty; supply a salt (it is never stored)`);
    const skills = args.ultraStamp.skills.map((spec) => {
      const eq = spec.indexOf("=");
      if (eq < 1) throw new Error("--ultra-stamp-skill must be ID=PATH/to/SKILL.md");
      return { id: spec.slice(0, eq), sha256: contentSha256(readFileSync(spec.slice(eq + 1), "utf8")) };
    });
    const doc = stampTranscript(readFileSync(args.ultraStamp.file, "utf8"), { salt, skills });
    const out = JSON.stringify(doc, null, 2) + "\n";
    if (args.ultraStamp.out) writeFileSync(args.ultraStamp.out, out);
    else process.stdout.write(out);
    return 0;
  }
  if (args.telemetryValidate) {
    const value: unknown = JSON.parse(readFileSync(args.telemetryValidate, "utf8"));
    validateRuntimeObservation(value);
    console.error(`[skill-zero] valid ${String((value as { schema?: unknown }).schema)}`);
    return 0;
  }
  const skills: ResolvedSkill[] = args.skillPaths.map(resolveSkill);

  const input: CompileInput = {
    posture: args.posture,
    harness: args.harness,
    mechanism: args.mechanism,
    skills,
    model: args.model,
    effort: args.effort,
    prompt: args.prompt,
    jsonOutput: !!args.record || !!args.telemetry,
    passthrough: args.passthrough,
    doorPluginDir: args.doorPluginDir,
  };
  const compiled = compile(input);

  // The two floors are named separately on every surface that reports them
  // (V5-5/B1) — a reader must never have to guess which floor a run was.
  const kind = floorOf(args.posture);
  if (kind === "benchmark") {
    console.error("[skill-zero] benchmark floor (doorless) — the placebo-of-record. Not the product floor; never average the two.");
  } else if (kind === "product") {
    console.error("[skill-zero] product floor (doorful) — retains the minimum control surface. Its own arm, priced separately from the benchmark floor.");
  }

  if (args.posture === "curated") {
    const d = compiled.doseSummary;
    console.error(
      `[skill-zero] curated loadout dose (${d.tokenizer}): standing=${d.standingTotal} invocation=${d.invocationTotal} ` +
        `(${d.skills.map((s) => `${s.id}: ${s.standingTokens}/${s.invocationTokens}`).join(", ")})`,
    );
  }

  if (args.telemetry && compiled.execSupport === "recipe") {
    throw new Error(`--telemetry-out requires a verified execution route; ${args.harness} compiled as recipe-only`);
  }
  if (args.print || compiled.execSupport === "recipe") {
    if (!args.print) {
      console.error(
        `[skill-zero] ${args.harness}: verified cells allow recipe only — printing the compiled profile (as if --print)`,
      );
    }
    console.log(JSON.stringify({ ...compiled, execSupport: undefined, recipe: compiled.execSupport === "recipe" }, null, 2));
    return 0;
  }

  const result = exec(compiled, { keepTemp: args.keepTemp });
  if (result.keptTemp) console.error(`[skill-zero] kept temp dir: ${result.sessionDir}`);

  let usage: AvailableTokenUsage | undefined;
  let resultText: string | undefined;
  if (result.stdout !== null) {
    try {
      // Known JSON headless shapes expose usage on the final result object.
      // Result text is retained only for the legacy explicit benchmark export;
      // runtime telemetry never receives or serializes it.
      let parsed = JSON.parse(result.stdout);
      if (Array.isArray(parsed)) parsed = parsed.find((x) => x?.type === "result") ?? parsed[parsed.length - 1];
      usage = parsed?.usage;
      resultText = typeof parsed?.result === "string" ? parsed.result : undefined;
    } catch {
      // Non-JSON output has no already-available token fields.
    }
  }

  if (args.record) {
    if (result.stdout === null) throw new Error("--record requires headless output");
    const record = assembleRecord({
      opts: args.record,
      posture: args.posture,
      skills,
      model: args.model ?? "unknown",
      harness: { name: args.harness, version: harnessVersion(compiled.command) },
      usage,
      resultText,
      wallClockMs: result.wallClockMs,
      recordedAt: new Date().toISOString(),
      notes: args.record.note,
    });
    const json = JSON.stringify(record);
    if (args.record.recordOut) writeFileSync(args.record.recordOut, json + "\n");
    console.log(json);
    if (resultText !== undefined) console.error(`[skill-zero] result: ${resultText.trim()}`);
  } else {
    if (args.telemetry) {
      const version = harnessVersion(compiled.command);
      const selectedMechanism = args.mechanism ??
        (args.harness === "claude" && args.posture === "curated" ? DEFAULT_CLAUDE_MECHANISM : undefined);
      const observation = assembleRuntimeObservation({
        sessionPseudonym: newSessionPseudonym(),
        observedAt: new Date().toISOString(),
        harness: { name: args.harness, ...(version === "unknown" ? {} : { version }) },
        ...(args.model ? { model: { id: args.model, ...(args.telemetry.modelVersion ? { version: args.telemetry.modelVersion } : {}) } } : {}),
        posture: args.posture,
        ...(selectedMechanism ? { mechanism: selectedMechanism } : {}),
        skills,
        invokedSkillIds: args.telemetry.invokedSkillIds,
        ...(args.telemetry.taskFamily === undefined ? {} : { taskFamily: args.telemetry.taskFamily }),
        exitCode: result.status,
        ...(args.telemetry.retryCount === undefined ? {} : { retryCount: args.telemetry.retryCount }),
        ...(args.telemetry.recoveryObserved === undefined ? {} : { recoveryObserved: args.telemetry.recoveryObserved }),
        ...(args.telemetry.churnCount === undefined ? {} : { churnCount: args.telemetry.churnCount }),
        wallClockMs: result.wallClockMs,
        usage,
      });
      writeFileSync(args.telemetry.out, serializeRuntimeObservation(observation));
      console.error(`[skill-zero] wrote local telemetry: ${args.telemetry.out}`);
    }
    if (result.stdout !== null) process.stdout.write(result.stdout);
  }
  return result.status;
}

/** Async entry: handles --advisory (one opt-in model call per eligible skill); everything else is main(). */
export async function mainAsync(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const adv = args.ultraStamp?.advisory;
  if (!args.ultraStamp || !adv) return main(argv);
  const salt = process.env[args.ultraStamp.saltEnv];
  if (!salt) throw new Error(`environment variable ${args.ultraStamp.saltEnv} is unset or empty; supply a salt (it is never stored)`);
  const skills = args.ultraStamp.skills.map((spec) => {
    const eq = spec.indexOf("=");
    if (eq < 1) throw new Error("--ultra-stamp-skill must be ID=PATH/to/SKILL.md");
    return { id: spec.slice(0, eq), sha256: contentSha256(readFileSync(spec.slice(eq + 1), "utf8")) };
  });
  const jsonl = readFileSync(args.ultraStamp.file, "utf8");
  const base = stampTranscript(jsonl, { salt, skills });
  let usage: Record<string, unknown> | undefined;
  const real = claudeHaikuRunner();
  const doc = await applyAdvisory(base, jsonl, {
    runner: async (i) => { const o = await real(i); usage = o.usage; return o; },
    maxExcerptChars: adv.maxChars, timeoutMs: adv.timeoutMs, only: adv.only.length ? adv.only : undefined,
  });
  const out = JSON.stringify(doc, null, 2) + "\n";
  if (args.ultraStamp.out) writeFileSync(args.ultraStamp.out, out);
  else process.stdout.write(out);
  // Usage from the model's own JSON result goes to stderr only; it is not a cost basis (skill-cost is).
  if (usage) console.error(`[skill-zero] advisory usage (model-reported, not a cost basis): ${JSON.stringify(usage)}`);
  return 0;
}

const isMain = process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("skill-zero.mjs");
if (isMain) {
  mainAsync(process.argv.slice(2)).then((code) => process.exit(code), (e: unknown) => {
    console.error(`skill-zero: ${(e as Error).message}`);
    process.exit(2);
  });
}
