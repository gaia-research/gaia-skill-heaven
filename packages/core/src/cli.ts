// skill-zero CLI (working name — OPEN item 8; flag vocabulary provisional
// pending N4/N5). See README for the full surface.

import { writeFileSync } from "node:fs";
import { compile, HARNESSES, LEVEL_ALIASES, MECHANISMS, POSTURE_ALIASES, POSTURES, SUMMON_ONLY_LEVELS, floorOf, type CompileInput, type Harness, type Mechanism, type Posture } from "./compile.js";
import { exec } from "./exec.js";
import { type HarnessBundlePin } from "./provision.js";
import { assembleRunReceipt } from "./receipt.js";
import {
  assembleRecord,
  TRIAL_RUNGS,
  validateTrialCoordinate,
  validateTrialSkills,
  type RecordOpts,
  type TrialRung,
} from "./record.js";
import { resolveSkill, type ResolvedSkill } from "./skills.js";
import { ARMS, type Arm } from "./vendor/ledger-record.js";

interface CliArgs {
  posture: Posture;
  harness: Harness;
  mechanism?: Mechanism;
  skillPaths: string[];
  recordSkillPaths: string[];
  doorPluginDir?: string;
  print: boolean;
  prompt?: string;
  model?: string;
  effort?: string;
  keepTemp: boolean;
  passthrough: string[];
  record?: RecordOpts;
  receiptOut?: string;
  harnessBundle?: HarnessBundlePin;
}

export function parseArgs(argv: string[]): CliArgs {
  let posture: Posture | undefined;
  let level: string | undefined;
  let harness: Harness = "claude";
  let mechanism: Mechanism | undefined;
  const skillPaths: string[] = [];
  const recordSkillPaths: string[] = [];
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
  let arm: Arm | undefined;
  let rung: TrialRung | undefined;
  let repeat = 0;
  let endpointRegex: string | undefined;
  let recordOut: string | undefined;
  let receiptOut: string | undefined;
  let harnessBundleDir: string | undefined;
  let harnessEntry: string | undefined;
  let pinnedHarnessVersion: string | undefined;
  let harnessSha256: string | undefined;
  let note: string | undefined;

  const need = (flag: string, i: number): string => {
    const v = argv[i];
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
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
    else if (a === "--record-skill") recordSkillPaths.push(need(a, ++i));
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
      if (!ARMS.includes(v as Arm)) throw new Error(`--arm must be one of ${ARMS.join("|")}`);
      arm = v as Arm;
    } else if (a === "--rung") {
      const v = need(a, ++i);
      if (!TRIAL_RUNGS.includes(v as TrialRung)) throw new Error(`--rung must be one of ${TRIAL_RUNGS.join("|")}`);
      rung = v as TrialRung;
    } else if (a === "--repeat") repeat = Number(need(a, ++i));
    else if (a === "--endpoint-regex") endpointRegex = need(a, ++i);
    else if (a === "--record-out") recordOut = need(a, ++i);
    else if (a === "--receipt-out") receiptOut = need(a, ++i);
    else if (a === "--harness-bundle") harnessBundleDir = need(a, ++i);
    else if (a === "--harness-entry") harnessEntry = need(a, ++i);
    else if (a === "--harness-version") pinnedHarnessVersion = need(a, ++i);
    else if (a === "--harness-sha256") harnessSha256 = need(a, ++i);
    else if (a === "--note") note = need(a, ++i);
    else throw new Error(`unknown arg: ${a}`);
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
    if (print) throw new Error("--record cannot be combined with --print because no trial would execute");
    if (!benchmarkId || !task) throw new Error("--record requires --benchmark-id and --task");
    if (!arm || !rung) throw new Error("--record requires an exact --arm and --rung");
    if (!Number.isInteger(repeat) || repeat < 0) throw new Error("--repeat must be a non-negative integer");
    validateTrialCoordinate(arm, rung, posture);
    if (!recordOut || !receiptOut) throw new Error("--record requires --record-out and --receipt-out companion artifact paths");
    if (recordOut === receiptOut) throw new Error("--record-out and --receipt-out must be different paths");
    if (!harnessBundleDir || !harnessEntry || !pinnedHarnessVersion || !harnessSha256) {
      throw new Error(
        "--record requires a clean pinned harness bundle: --harness-bundle, --harness-entry, " +
          "--harness-version, and --harness-sha256",
      );
    }
    recordOpts = { benchmarkId, task, arm, rung, repeatIndex: repeat, endpointRegex, recordOut, note };
  } else if (
    recordSkillPaths.length || receiptOut || harnessBundleDir || harnessEntry || pinnedHarnessVersion || harnessSha256
  ) {
    throw new Error("--record-skill, receipt, and pinned harness bundle flags are only valid with --record");
  }

  const harnessBundle = harnessBundleDir && harnessEntry && pinnedHarnessVersion && harnessSha256
    ? { sourceDir: harnessBundleDir, entry: harnessEntry, pinnedVersion: pinnedHarnessVersion, contentSha256: harnessSha256 }
    : undefined;
  return {
    posture, harness, mechanism, skillPaths, recordSkillPaths, doorPluginDir, print, prompt, model, effort,
    keepTemp, passthrough, record: recordOpts, receiptOut, harnessBundle,
  };
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  const skills: ResolvedSkill[] = args.skillPaths.map(resolveSkill);
  const recordedSkills: ResolvedSkill[] = [...skills];
  for (const skillPath of args.recordSkillPaths) {
    const skill = resolveSkill(skillPath);
    const existing = recordedSkills.find((candidate) => candidate.id === skill.id);
    if (existing && existing.contentSha256 !== skill.contentSha256) {
      throw new Error(`recorded skill id ${skill.id} resolves to more than one content hash`);
    }
    if (!existing) recordedSkills.push(skill);
  }
  if (args.record) validateTrialSkills(args.record, recordedSkills);

  const input: CompileInput = {
    posture: args.posture,
    harness: args.harness,
    mechanism: args.mechanism,
    skills,
    model: args.model,
    effort: args.effort,
    prompt: args.prompt,
    jsonOutput: !!args.record,
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

  if (args.print || compiled.execSupport === "recipe") {
    if (!args.print) {
      console.error(
        `[skill-zero] ${args.harness}: verified cells allow recipe only — printing the compiled profile (as if --print)`,
      );
    }
    console.log(JSON.stringify({ ...compiled, execSupport: undefined, recipe: compiled.execSupport === "recipe" }, null, 2));
    return 0;
  }

  const result = exec(compiled, { keepTemp: args.keepTemp, harnessBundle: args.harnessBundle });
  if (result.keptTemp) console.error(`[skill-zero] kept temp dir: ${result.sessionDir}`);

  if (args.record) {
    if (result.stdout === null) throw new Error("--record requires headless output");
    let usage; let resultText: string | undefined;
    try {
      // claude --output-format json emits an event array (2.1.215); the final
      // "result" event carries result text + usage. Older single-object shape
      // is handled too.
      let parsed = JSON.parse(result.stdout);
      if (Array.isArray(parsed)) parsed = parsed.find((x) => x?.type === "result") ?? parsed[parsed.length - 1];
      usage = parsed?.usage;
      resultText = typeof parsed?.result === "string" ? parsed.result : undefined;
    } catch {
      // non-JSON output: usage stays undefined → perTurn null (unmeasured, never 0)
    }
    const record = assembleRecord({
      opts: args.record,
      posture: args.posture,
      skills: recordedSkills,
      model: args.model ?? "unknown",
      harness: {
        name: args.harness,
        version: result.provision?.reportedVersion ?? "unknown (unprovisioned)",
      },
      usage,
      resultText,
      wallClockMs: result.wallClockMs,
      recordedAt: new Date().toISOString(),
      notes: args.record.note,
    });
    if (!result.provision || !args.receiptOut) {
      throw new Error("--record requires verified provision evidence and a companion receipt path");
    }
    const receipt = assembleRunReceipt({
      record,
      rung: args.record.rung,
      posture: args.posture,
      harnessName: args.harness,
      provision: result.provision,
      keptTemp: result.keptTemp,
    });
    const json = JSON.stringify(record);
    writeFileSync(args.record.recordOut!, json + "\n");
    writeFileSync(args.receiptOut, JSON.stringify(receipt, null, 2) + "\n");
    console.log(json);
    if (resultText !== undefined) console.error(`[skill-zero] result: ${resultText.trim()}`);
  } else if (result.stdout !== null) {
    process.stdout.write(result.stdout);
  }
  return result.status;
}

const isMain = process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("skill-zero.mjs");
if (isMain) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`skill-zero: ${(e as Error).message}`);
    process.exit(2);
  }
}
