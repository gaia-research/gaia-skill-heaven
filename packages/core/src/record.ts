// --record (M2 plan §4): opt-in, headless-only. Wraps the run, parses
// --output-format json usage, assembles an hh-ledger/v1 record.
//
// Field discipline (binding):
//   tokens.system          = null   (M2a unratified — never measured here)
//   either floor → skillStanding = 0, skillInvocation = 0 BY CONSTRUCTION
//            (matches existing placebo records: zero skills loaded is a real
//            zero). Both floors load zero skills; what separates them is the
//            door, whose cost is a standing cost inside perTurn and is NOT
//            attributable to any skill. Every floor record is tagged
//            `floor=benchmark` or `floor=product` in notes so the two arms
//            cannot be pooled (V5-5/B1).
//   curated→ skillStanding = chars4 sum; skillInvocation = null + note
//            (stream-json invocation instrumentation is a follow-up)
//   perTurn = input + cache_creation + cache_read + output from usage
//            (the summation formula, documented in README §record)

import { floorOf, type Posture } from "./compile.js";
import type { ResolvedSkill } from "./skills.js";
import { LEDGER_SCHEMA, validateRecord, type Arm, type LedgerRecord } from "./vendor/ledger-record.js";

export interface RecordOpts {
  benchmarkId: string;
  task: string;
  arm: Arm;
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
  if (opts.arm === "placebo" && posture !== "floor") {
    throw new Error(
      "--arm placebo is only allowed for --posture floor, the doorless benchmark floor (own-placebo anchoring, B2). " +
        "The product floor retains a control surface, so it can never stand in as the placebo-of-record; record it as --arm heaven.",
    );
  }
  const floorKind = floorOf(posture);
  const floor = floorKind !== null;
  const noteParts: string[] = [];
  // FLOOR SPLIT (V5-5): every floor record says WHICH floor produced it, in a
  // stable, greppable form, so the benchmark and product arms can never be
  // pooled at analysis time (B1 — priced separately, never averaged into one
  // number). hh-ledger/v1 has no posture field and this repo does not own that
  // contract, so the tag rides `notes` until the schema carries it upstream.
  if (floorKind === "benchmark") {
    noteParts.push("floor=benchmark (doorless; the placebo-of-record, B2). Separate arm from floor=product — never averaged (B1).");
  } else if (floorKind === "product") {
    noteParts.push("floor=product (doorful; retains the minimum control surface). Separate arm from floor=benchmark — never averaged (B1).");
  }
  if (!floor) noteParts.push("skillInvocation null: stream-json invocation instrumentation is a follow-up (M2).");
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
      skillStanding: floor ? 0 : skills.reduce((a, s) => a + s.standingTokens, 0),
      skillInvocation: floor ? 0 : null,
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
