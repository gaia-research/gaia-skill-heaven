import { canReceiptCloseUnit, parseVerifyReceipt } from "./receipts.js";
import type { VerifyReceipt } from "./receipts.js";
import {
  CampaignDecisions,
  UnitReportOutcomes,
  WORK_UNIT_STATES,
  WorkUnitStates,
} from "./vocabulary.js";
import type { CampaignDecision, WorkUnitState } from "./vocabulary.js";

export type WorkUnitBounds = Readonly<{
  recoverLimit: number;
  reopenLimit: number;
}>;

export type WorkUnitRecord = Readonly<{
  id: string;
  skill: string;
  reconCitation: string;
  state: WorkUnitState;
  phase: string | null;
  dependsOn: readonly string[];
  charterIndex: number;
  batchId: string | null;
  recoverCount: number;
  reopenCount: number;
  retrievalRefusalCount: number;
  lastReceipt: VerifyReceipt | null;
  blockedReason: string | null;
  humanReason: string | null;
}>;

export type CreateWorkUnitInput = Readonly<{
  id: string;
  skill: string;
  reconCitation: string;
  phase?: string | null;
  dependsOn?: readonly string[];
  charterIndex?: number;
  batchId?: string | null;
  state?: WorkUnitState;
}>;

export type WorkUnitTransitionResult = Readonly<{
  unit: WorkUnitRecord;
  decision: CampaignDecision;
}>;

export type ReportUnitVerificationInput = Readonly<{
  outcome: typeof UnitReportOutcomes.pass | typeof UnitReportOutcomes.fail;
  bounds: WorkUnitBounds;
  charterCommands: readonly string[];
  receipt?: unknown;
}>;

const WORK_UNIT_TRANSITIONS: Readonly<Record<WorkUnitState, readonly WorkUnitState[]>> = Object.freeze({
  [WorkUnitStates.ready]: Object.freeze([
    WorkUnitStates.active,
    WorkUnitStates.blocked,
    WorkUnitStates.needsHuman,
  ]),
  [WorkUnitStates.active]: Object.freeze([
    WorkUnitStates.verifying,
    WorkUnitStates.blocked,
    WorkUnitStates.needsHuman,
  ]),
  [WorkUnitStates.verifying]: Object.freeze([
    WorkUnitStates.done,
    WorkUnitStates.recovering,
    WorkUnitStates.reopened,
    WorkUnitStates.blocked,
    WorkUnitStates.needsHuman,
  ]),
  [WorkUnitStates.recovering]: Object.freeze([
    WorkUnitStates.active,
    WorkUnitStates.reopened,
    WorkUnitStates.blocked,
    WorkUnitStates.needsHuman,
  ]),
  [WorkUnitStates.reopened]: Object.freeze([
    WorkUnitStates.active,
    WorkUnitStates.blocked,
    WorkUnitStates.needsHuman,
  ]),
  [WorkUnitStates.needsHuman]: Object.freeze([
    WorkUnitStates.ready,
    WorkUnitStates.active,
    WorkUnitStates.blocked,
  ]),
  [WorkUnitStates.blocked]: Object.freeze([
    WorkUnitStates.ready,
    WorkUnitStates.active,
    WorkUnitStates.needsHuman,
  ]),
  [WorkUnitStates.done]: Object.freeze([]),
});

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, "value") || !d.enumerable || !isNonEmptyText(d.value)) {
      return false;
    }
  }
  return true;
}

function freezeWorkUnit(unit: WorkUnitRecord): WorkUnitRecord {
  return Object.freeze({
    id: unit.id,
    skill: unit.skill,
    reconCitation: unit.reconCitation,
    state: unit.state,
    phase: unit.phase,
    dependsOn: Object.freeze([...unit.dependsOn]),
    charterIndex: unit.charterIndex,
    batchId: unit.batchId,
    recoverCount: unit.recoverCount,
    reopenCount: unit.reopenCount,
    retrievalRefusalCount: unit.retrievalRefusalCount,
    lastReceipt: unit.lastReceipt ? parseVerifyReceipt(unit.lastReceipt) : null,
    blockedReason: unit.blockedReason,
    humanReason: unit.humanReason,
  });
}

function requireValidUnit(unit: WorkUnitRecord): WorkUnitRecord {
  const parsed = parseWorkUnitRecord(unit);
  if (!parsed) {
    throw new Error("Invalid work unit record");
  }
  return parsed;
}

export function validateWorkUnitBounds(bounds: unknown): WorkUnitBounds {
  if (!isPlainObject(bounds)) {
    throw new Error("WorkUnitBounds must be a plain object");
  }
  if (!Object.hasOwn(bounds, "recoverLimit") || !Object.hasOwn(bounds, "reopenLimit")) {
    throw new Error("WorkUnitBounds requires recoverLimit and reopenLimit");
  }
  if (!isNonNegativeSafeInt(bounds.recoverLimit) || !isNonNegativeSafeInt(bounds.reopenLimit)) {
    throw new Error("WorkUnitBounds recoverLimit and reopenLimit must be non-negative safe integers");
  }
  return Object.freeze({
    recoverLimit: bounds.recoverLimit,
    reopenLimit: bounds.reopenLimit,
  });
}

export function canTransitionWorkUnit(from: WorkUnitState, to: WorkUnitState): boolean {
  if (!(WORK_UNIT_STATES as readonly string[]).includes(from)) return false;
  if (!(WORK_UNIT_STATES as readonly string[]).includes(to)) return false;
  return WORK_UNIT_TRANSITIONS[from].includes(to);
}

export function createWorkUnit(input: CreateWorkUnitInput): WorkUnitRecord {
  if (!isPlainObject(input)) {
    throw new Error("createWorkUnit input must be a plain object");
  }
  if (!isNonEmptyText(input.id)) {
    throw new Error("Work unit id must be a non-empty string");
  }
  if (!isNonEmptyText(input.skill)) {
    throw new Error("Work unit skill must be a non-empty string");
  }
  if (!isNonEmptyText(input.reconCitation)) {
    throw new Error("Work unit reconCitation must be a non-empty string");
  }
  const phase = input.phase === undefined ? null : input.phase;
  if (phase !== null && !isNonEmptyText(phase)) {
    throw new Error("Work unit phase must be null or a non-empty string");
  }
  const dependsOn = input.dependsOn === undefined ? [] : input.dependsOn;
  if (!isStringArray(dependsOn)) {
    throw new Error("Work unit dependsOn must be an array of non-empty strings");
  }
  if (new Set(dependsOn).size !== dependsOn.length) {
    throw new Error("Work unit dependsOn must not contain duplicates");
  }
  if (dependsOn.includes(input.id)) {
    throw new Error("Work unit cannot depend on itself");
  }
  const charterIndex = input.charterIndex === undefined ? 0 : input.charterIndex;
  if (!isNonNegativeSafeInt(charterIndex)) {
    throw new Error("Work unit charterIndex must be a non-negative safe integer");
  }
  const batchId = input.batchId === undefined ? null : input.batchId;
  if (batchId !== null && !isNonEmptyText(batchId)) {
    throw new Error("Work unit batchId must be null or a non-empty string");
  }
  const state = input.state === undefined ? WorkUnitStates.ready : input.state;
  if (!(WORK_UNIT_STATES as readonly string[]).includes(state)) {
    throw new Error(`Invalid work unit state: ${String(state)}`);
  }

  return freezeWorkUnit({
    id: input.id,
    skill: input.skill,
    reconCitation: input.reconCitation,
    state,
    phase,
    dependsOn,
    charterIndex,
    batchId,
    recoverCount: 0,
    reopenCount: 0,
    retrievalRefusalCount: 0,
    lastReceipt: null,
    blockedReason: null,
    humanReason: null,
  });
}

export function activateWorkUnit(unit: WorkUnitRecord): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (
    valid.state !== WorkUnitStates.ready &&
    valid.state !== WorkUnitStates.recovering &&
    valid.state !== WorkUnitStates.reopened
  ) {
    throw new Error(`Cannot activate work unit from state ${valid.state}`);
  }
  return freezeWorkUnit({
    ...valid,
    state: WorkUnitStates.active,
  });
}

export function beginVerifyWorkUnit(unit: WorkUnitRecord): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.active) {
    throw new Error(`Cannot begin verification from state ${valid.state}`);
  }
  return freezeWorkUnit({
    ...valid,
    state: WorkUnitStates.verifying,
  });
}

export function completeWorkUnit(
  unit: WorkUnitRecord,
  receipt: unknown,
  charterCommands: readonly string[],
): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.verifying) {
    throw new Error(`Cannot complete work unit from state ${valid.state}`);
  }
  if (!canReceiptCloseUnit(receipt, valid.id, charterCommands)) {
    throw new Error("Work unit can only close on an attested passing receipt for a charter-named verify command");
  }
  const parsedReceipt = parseVerifyReceipt(receipt)!;
  return freezeWorkUnit({
    ...valid,
    state: WorkUnitStates.done,
    lastReceipt: parsedReceipt,
    blockedReason: null,
    humanReason: null,
  });
}

export function failWorkUnitVerification(
  unit: WorkUnitRecord,
  bounds: WorkUnitBounds,
  receipt?: VerifyReceipt | null,
): WorkUnitTransitionResult {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.verifying) {
    throw new Error(`Cannot fail verification from state ${valid.state}`);
  }
  const validBounds = validateWorkUnitBounds(bounds);

  let nextReceipt = valid.lastReceipt;
  if (receipt !== undefined && receipt !== null) {
    const parsed = parseVerifyReceipt(receipt);
    if (!parsed || parsed.unitId !== valid.id) {
      throw new Error("Invalid verification receipt for work unit");
    }
    nextReceipt = parsed;
  }

  if (valid.recoverCount < validBounds.recoverLimit) {
    return Object.freeze({
      unit: freezeWorkUnit({
        ...valid,
        state: WorkUnitStates.recovering,
        recoverCount: valid.recoverCount + 1,
        lastReceipt: nextReceipt,
      }),
      decision: CampaignDecisions.recover,
    });
  }

  if (valid.reopenCount < validBounds.reopenLimit) {
    return Object.freeze({
      unit: freezeWorkUnit({
        ...valid,
        state: WorkUnitStates.reopened,
        reopenCount: valid.reopenCount + 1,
        lastReceipt: nextReceipt,
      }),
      decision: CampaignDecisions.reopen,
    });
  }

  return Object.freeze({
    unit: freezeWorkUnit({
      ...valid,
      state: WorkUnitStates.needsHuman,
      lastReceipt: nextReceipt,
      humanReason: valid.humanReason ?? "Verification bounds exhausted",
    }),
    decision: CampaignDecisions.convergence,
  });
}

export function escalateRecoveringToReopen(
  unit: WorkUnitRecord,
  bounds: WorkUnitBounds,
): WorkUnitTransitionResult {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.recovering) {
    throw new Error(`Cannot escalate to reopen from state ${valid.state}`);
  }
  const validBounds = validateWorkUnitBounds(bounds);

  if (valid.reopenCount < validBounds.reopenLimit) {
    return Object.freeze({
      unit: freezeWorkUnit({
        ...valid,
        state: WorkUnitStates.reopened,
        reopenCount: valid.reopenCount + 1,
      }),
      decision: CampaignDecisions.reopen,
    });
  }

  return Object.freeze({
    unit: freezeWorkUnit({
      ...valid,
      state: WorkUnitStates.needsHuman,
      humanReason: valid.humanReason ?? "Reopen bound exhausted",
    }),
    decision: CampaignDecisions.convergence,
  });
}

export function reportUnitVerification(
  unit: WorkUnitRecord,
  input: ReportUnitVerificationInput,
): WorkUnitTransitionResult {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.active && valid.state !== WorkUnitStates.verifying) {
    throw new Error(`Cannot report verification from state ${valid.state}`);
  }
  if (!isPlainObject(input)) {
    throw new Error("reportUnitVerification input must be a plain object");
  }
  const verifyingUnit = valid.state === WorkUnitStates.active ? beginVerifyWorkUnit(valid) : valid;

  if (input.outcome === UnitReportOutcomes.pass) {
    const doneUnit = completeWorkUnit(verifyingUnit, input.receipt, input.charterCommands);
    return Object.freeze({
      unit: doneUnit,
      decision: CampaignDecisions.close,
    });
  }

  if (input.outcome === UnitReportOutcomes.fail) {
    const receipt = input.receipt === undefined || input.receipt === null ? null : parseVerifyReceipt(input.receipt);
    if (input.receipt !== undefined && input.receipt !== null && !receipt) {
      throw new Error("Invalid failure receipt");
    }
    return failWorkUnitVerification(verifyingUnit, input.bounds, receipt);
  }

  throw new Error(`Unsupported report outcome: ${String(input.outcome)}`);
}

export function blockWorkUnit(unit: WorkUnitRecord, reason: string): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (!canTransitionWorkUnit(valid.state, WorkUnitStates.blocked)) {
    throw new Error(`Cannot block work unit from state ${valid.state}`);
  }
  if (!isNonEmptyText(reason)) {
    throw new Error("Blocking a work unit requires a non-empty reason");
  }
  return freezeWorkUnit({
    ...valid,
    state: WorkUnitStates.blocked,
    blockedReason: reason.trim(),
  });
}

export function unblockWorkUnit(
  unit: WorkUnitRecord,
  target: typeof WorkUnitStates.ready | typeof WorkUnitStates.active | typeof WorkUnitStates.needsHuman = WorkUnitStates.ready,
): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.blocked) {
    throw new Error(`Cannot unblock work unit from state ${valid.state}`);
  }
  if (!canTransitionWorkUnit(WorkUnitStates.blocked, target)) {
    throw new Error(`Cannot unblock work unit to state ${target}`);
  }
  return freezeWorkUnit({
    ...valid,
    state: target,
    blockedReason: null,
  });
}

export function markWorkUnitNeedsHuman(unit: WorkUnitRecord, reason: string): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (!canTransitionWorkUnit(valid.state, WorkUnitStates.needsHuman)) {
    throw new Error(`Cannot mark work unit needs-human from state ${valid.state}`);
  }
  if (!isNonEmptyText(reason)) {
    throw new Error("Marking work unit needs-human requires a non-empty reason");
  }
  return freezeWorkUnit({
    ...valid,
    state: WorkUnitStates.needsHuman,
    humanReason: reason.trim(),
  });
}

export function resumeWorkUnitFromHuman(
  unit: WorkUnitRecord,
  target: typeof WorkUnitStates.ready | typeof WorkUnitStates.active | typeof WorkUnitStates.blocked = WorkUnitStates.ready,
): WorkUnitRecord {
  const valid = requireValidUnit(unit);
  if (valid.state !== WorkUnitStates.needsHuman) {
    throw new Error(`Cannot resume work unit from human from state ${valid.state}`);
  }
  if (!canTransitionWorkUnit(WorkUnitStates.needsHuman, target)) {
    throw new Error(`Cannot resume work unit from human to state ${target}`);
  }
  return freezeWorkUnit({
    ...valid,
    state: target,
    humanReason: null,
  });
}

export function recordRetrievalRefusal(
  unit: WorkUnitRecord,
): Readonly<{ unit: WorkUnitRecord; decision: typeof CampaignDecisions.hold }> {
  const valid = requireValidUnit(unit);
  return Object.freeze({
    unit: freezeWorkUnit({
      ...valid,
      retrievalRefusalCount: valid.retrievalRefusalCount + 1,
    }),
    decision: CampaignDecisions.hold,
  });
}

export function parseWorkUnitRecord(value: unknown): WorkUnitRecord | null {
  try {
    if (!isPlainObject(value)) return null;
    const required = [
      "id",
      "skill",
      "reconCitation",
      "state",
      "phase",
      "dependsOn",
      "charterIndex",
      "batchId",
      "recoverCount",
      "reopenCount",
      "retrievalRefusalCount",
      "lastReceipt",
      "blockedReason",
      "humanReason",
    ] as const;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== required.length) return null;
    if (keys.some((k) => typeof k !== "string" || !(required as readonly string[]).includes(k))) return null;
    for (const key of required) {
      const d = descriptors[key];
      if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) return null;
    }

    if (!isNonEmptyText(value.id)) return null;
    if (!isNonEmptyText(value.skill)) return null;
    if (!isNonEmptyText(value.reconCitation)) return null;
    if (typeof value.state !== "string" || !(WORK_UNIT_STATES as readonly string[]).includes(value.state)) {
      return null;
    }
    if (value.phase !== null && !isNonEmptyText(value.phase)) return null;
    if (!isStringArray(value.dependsOn)) return null;
    if (new Set(value.dependsOn).size !== value.dependsOn.length) return null;
    if (value.dependsOn.includes(value.id)) return null;
    if (!isNonNegativeSafeInt(value.charterIndex)) return null;
    if (value.batchId !== null && !isNonEmptyText(value.batchId)) return null;
    if (!isNonNegativeSafeInt(value.recoverCount)) return null;
    if (!isNonNegativeSafeInt(value.reopenCount)) return null;
    if (!isNonNegativeSafeInt(value.retrievalRefusalCount)) return null;

    let lastReceipt: VerifyReceipt | null = null;
    if (value.lastReceipt !== null) {
      lastReceipt = parseVerifyReceipt(value.lastReceipt);
      if (!lastReceipt || lastReceipt.unitId !== value.id) return null;
    }

    if (value.blockedReason !== null && !isNonEmptyText(value.blockedReason)) return null;
    if (value.humanReason !== null && !isNonEmptyText(value.humanReason)) return null;

    return freezeWorkUnit({
      id: value.id,
      skill: value.skill,
      reconCitation: value.reconCitation,
      state: value.state as WorkUnitState,
      phase: value.phase,
      dependsOn: value.dependsOn,
      charterIndex: value.charterIndex,
      batchId: value.batchId,
      recoverCount: value.recoverCount,
      reopenCount: value.reopenCount,
      retrievalRefusalCount: value.retrievalRefusalCount,
      lastReceipt,
      blockedReason: value.blockedReason,
      humanReason: value.humanReason,
    });
  } catch {
    return null;
  }
}
