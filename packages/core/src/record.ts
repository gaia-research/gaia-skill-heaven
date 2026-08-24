// --record (M2 plan §4): opt-in, headless-only. Wraps the run, parses
// --output-format json usage, assembles an hh-ledger/v1 record.
//
// Field discipline (binding):
//   tokens.system          = null   (M2a unratified — never measured here)
//   benchmark-floor / zero rung → skillStanding = 0, skillInvocation = 0
//            BY CONSTRUCTION. The upper treatment rungs may boot from the
//            product-floor posture and summon skills in-session; for those,
//            loaded skill doses are recorded normally. The door itself remains
//            a standing cost inside perTurn, never a skill cost. Every floor
//            posture is tagged `floor=benchmark` or `floor=product` in notes so
//            the two bases cannot be pooled (V5-5/B1).
//   treatment rung → skillStanding = chars4 sum; skillInvocation = null + note
//            (stream-json invocation instrumentation is a follow-up)
//   perTurn = input + cache_creation + cache_read + output from usage
//            (the summation formula, documented in README §record)

import { floorOf, type Posture } from "./compile.js";
import type { ResolvedSkill } from "./skills.js";
import { LEDGER_SCHEMA, validateRecord, type Arm, type LedgerRecord } from "./vendor/ledger-record.js";

/**
 * The v1 ledger deliberately keeps a coarse, frozen arm enum. Runtime receipts
 * carry the exact coordinate separately. `benchmark-floor` is not a product
 * rung: it names the doorless internal instrument used only by placebo.
 */
export const TRIAL_RUNGS = ["benchmark-floor", "zero", "low", "med", "high", "xhigh", "max", "ultra"] as const;
export type TrialRung = (typeof TRIAL_RUNGS)[number];

const ARM_RUNGS: Record<Arm, readonly TrialRung[]> = {
  placebo: ["benchmark-floor"],
  heaven: ["zero", "low", "med"],
  hell: ["high", "xhigh", "max"],
  ultra: ["ultra"],
};

export function validateTrialCoordinate(arm: Arm, rung: TrialRung, posture: Posture): void {
  if (!ARM_RUNGS[arm].includes(rung)) {
    throw new Error(`--arm ${arm} cannot record --rung ${rung}; valid rungs: ${ARM_RUNGS[arm].join("|")}`);
  }
  if (posture === "floor" && (arm !== "placebo" || rung !== "benchmark-floor")) {
    throw new Error(
      "--posture floor is doorless and only allows --arm placebo with --rung benchmark-floor; " +
        "treatment coordinates require a doorful posture",
    );
  }
  if (arm === "placebo" && posture !== "floor") {
    throw new Error(
      "--arm placebo is only allowed for --posture floor, the doorless benchmark floor (own-placebo anchoring, B2). " +
        "The product floor retains a control surface, so it can never stand in as the placebo-of-record.",
    );
  }
  if (rung === "zero" && posture !== "product-floor") {
    throw new Error("--rung zero is the doorful product floor and requires --posture product-floor; it is not placebo");
  }
  if (["high", "xhigh", "max", "ultra"].includes(rung) && posture !== "product-floor") {
    throw new Error(
      `--rung ${rung} is activated by in-session summon behavior, not a boot posture; ` +
        "record it over --posture product-floor so the door remains available",
    );
  }
}

export function validateTrialSkills(opts: Pick<RecordOpts, "arm" | "rung">, skills: ResolvedSkill[]): void {
  if (opts.arm === "placebo" && skills.length > 0) {
    throw new Error("--arm placebo cannot record loaded skills; the doorless own-placebo has skillsLoaded: []");
  }
  if (opts.rung !== "benchmark-floor" && opts.rung !== "zero" && skills.length === 0) {
    throw new Error(`--rung ${opts.rung} requires at least one exact loaded skill hash (--skill or --record-skill)`);
  }
}

export interface RecordOpts {
  benchmarkId: string;
  task: string;
  arm: Arm;
  rung: TrialRung;
  repeatIndex: number;
  endpointRegex?: string;
  recordOut?: string;
  note?: string;
}

export interface ClaudeJsonUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export function perTurnFromUsage(u: ClaudeJsonUsage | undefined): number | null {
  if (!u) return null;
  const parts = [
    u.input_tokens,
    u.cache_creation_input_tokens,
    u.cache_read_input_tokens,
    u.output_tokens,
  ];
  if (parts.every((p) => p === undefined)) return null;
  return parts.reduce<number>((a, p) => a + (p ?? 0), 0);
}

export function assembleRecord(args: {
  opts: RecordOpts;
  posture: Posture;
  skills: ResolvedSkill[];
  model: string;
  harness: { name: string; version: string };
  usage: ClaudeJsonUsage | undefined;
  resultText: string | undefined;
  wallClockMs: number;
  recordedAt: string;
  notes?: string;
}): LedgerRecord {
  const { opts, posture, skills } = args;
  validateTrialCoordinate(opts.arm, opts.rung, posture);
  validateTrialSkills(opts, skills);
  const floorKind = floorOf(posture);
  const zeroDose = opts.rung === "benchmark-floor" || opts.rung === "zero";
  const noteParts: string[] = [];
  // FLOOR SPLIT (V5-5): every floor record says WHICH floor produced it, in a
  // stable, greppable form, so the benchmark and product arms can never be
  // pooled at analysis time (B1 — priced separately, never averaged into one
  // number). hh-ledger/v1 has no posture field and this repo does not own that
  // contract, so the tag rides `notes` until the schema carries it upstream.
  // hh-ledger/v1 has no rung field. Keep a stable tag in its existing notes
  // while the structured companion receipt owns the typed coordinate.
  noteParts.push(`rung=${opts.rung}.`);
  if (floorKind === "benchmark") {
    noteParts.push("floor=benchmark (doorless; the placebo-of-record, B2). Separate arm from floor=product — never averaged (B1).");
  } else if (floorKind === "product") {
    noteParts.push("floor=product (doorful; retains the minimum control surface). Separate arm from floor=benchmark — never averaged (B1).");
  }
  if (!zeroDose) noteParts.push("skillInvocation null: stream-json invocation instrumentation is a follow-up (M2).");
  if (args.notes) noteParts.push(args.notes);

  const record: LedgerRecord = {
    schema: LEDGER_SCHEMA,
    recordedAt: args.recordedAt,
    benchmarkId: opts.benchmarkId,
    task: opts.task,
    arm: opts.arm,
    skillsLoaded: skills.map((s) => ({ id: s.id, contentSha256: s.contentSha256 })),
    model: args.model,
    harness: args.harness,
    repeatIndex: opts.repeatIndex,
    tokens: {
      system: null, // M2a unratified — stays honestly null
      skillStanding: zeroDose ? 0 : skills.reduce((a, s) => a + s.standingTokens, 0),
      skillInvocation: zeroDose ? 0 : null,
      perTurn: perTurnFromUsage(args.usage),
    },
    wallClockMs: args.wallClockMs,
    objectiveEndpoint: opts.endpointRegex
      ? {
          kind: "regex-match",
          pass: args.resultText !== undefined ? new RegExp(opts.endpointRegex).test(args.resultText.trim()) : null,
          detail: `/${opts.endpointRegex}/ vs final result text`,
        }
      : { kind: "unscored", pass: null },
    judgeVerdict: null,
    ...(noteParts.length ? { notes: noteParts.join(" ") } : {}),
  };
  validateRecord(record);
  return record;
}
