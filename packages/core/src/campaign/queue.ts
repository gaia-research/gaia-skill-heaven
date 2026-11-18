import type { CampaignCharter } from "./types.js";
import {
  createWorkUnit,
  parseWorkUnitRecord,
  validateWorkUnitBounds,
} from "./units.js";
import type { WorkUnitBounds, WorkUnitRecord } from "./units.js";
import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignDecisions,
  WorkUnitStates,
} from "./vocabulary.js";

export type QueueBatch = Readonly<{
  id: string;
  unitIds: readonly string[];
}>;

export type WorkUnitQueueState = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.units;
  bounds: WorkUnitBounds;
  phases: readonly string[];
  units: readonly WorkUnitRecord[];
  batches: readonly QueueBatch[];
  decisionsApproved: boolean;
  checkpointCount: number;
}>;

export type QueueSummaryCounts = Readonly<{
  total: number;
  ready: number;
  active: number;
  verifying: number;
  recovering: number;
  reopened: number;
  done: number;
  blocked: number;
  needsHuman: number;
  waitingOnDependencies: number;
}>;

export type NextUnitSelection = Readonly<{
  next: WorkUnitRecord | null;
  orderedReady: readonly WorkUnitRecord[];
  counts: QueueSummaryCounts;
}>;

export type QueueCheckpointEntry = Readonly<{
  decision: typeof CampaignDecisions.checkpoint;
  signal: "checkpoint-request";
  checkpointCount: number;
  batchIds: readonly string[];
}>;

export type RegroupResult = Readonly<{
  queue: WorkUnitQueueState;
  checkpointRequired: boolean;
  checkpoint: QueueCheckpointEntry | null;
}>;

export type BuildWorkUnitQueueOptions = Readonly<{
  phases?: readonly string[];
  itemPhases?: Readonly<Record<string, string>>;
  dependencies?: Readonly<Record<string, readonly string[]>>;
  decisionsApproved?: boolean;
}>;

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

function freezeBatch(batch: QueueBatch): QueueBatch {
  return Object.freeze({
    id: batch.id,
    unitIds: Object.freeze([...batch.unitIds]),
  });
}

function freezeQueueState(state: WorkUnitQueueState): WorkUnitQueueState {
  return Object.freeze({
    schema: state.schema,
    bounds: Object.freeze({
      recoverLimit: state.bounds.recoverLimit,
      reopenLimit: state.bounds.reopenLimit,
    }),
    phases: Object.freeze([...state.phases]),
    units: Object.freeze([...state.units]),
    batches: Object.freeze(state.batches.map(freezeBatch)),
    decisionsApproved: state.decisionsApproved,
    checkpointCount: state.checkpointCount,
  });
}

function computeDependencyDepths(units: readonly WorkUnitRecord[]): Map<string, number> {
  const byId = new Map<string, WorkUnitRecord>();
  for (const unit of units) {
    if (byId.has(unit.id)) {
      throw new Error(`Duplicate work unit id: ${unit.id}`);
    }
    byId.set(unit.id, unit);
  }

  for (const unit of units) {
    for (const depId of unit.dependsOn) {
      if (!byId.has(depId)) {
        throw new Error(`Work unit "${unit.id}" depends on unknown unit "${depId}"`);
      }
      if (depId === unit.id) {
        throw new Error(`Work unit "${unit.id}" cannot depend on itself`);
      }
    }
  }

  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) {
      throw new Error(`Dependency cycle detected involving work unit "${id}"`);
    }
    visiting.add(id);
    const unit = byId.get(id)!;
    let maxDepDepth = -1;
    for (const depId of unit.dependsOn) {
      const depDepth = visit(depId);
      if (depDepth > maxDepDepth) {
        maxDepDepth = depDepth;
      }
    }
    visiting.delete(id);
    const depth = maxDepDepth + 1;
    depths.set(id, depth);
    return depth;
  };

  for (const unit of units) {
    visit(unit.id);
  }

  return depths;
}

function compareUtf16(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function buildWorkUnitQueue(
  charter: CampaignCharter,
  options: BuildWorkUnitQueueOptions = {},
): WorkUnitQueueState {
  if (!isPlainObject(charter)) {
    throw new Error("Charter must be a plain object");
  }
  const bounds = validateWorkUnitBounds({
    recoverLimit: charter.recoverLimit,
    reopenLimit: charter.reopenLimit,
  });

  if (!Array.isArray(charter.queue) || charter.queue.length === 0) {
    throw new Error("Charter queue must be a non-empty array");
  }

  const explicitPhases = options.phases;
  if (explicitPhases !== undefined) {
    if (!isStringArray(explicitPhases) || new Set(explicitPhases).size !== explicitPhases.length) {
      throw new Error("Queue phases must be unique non-empty strings");
    }
  }

  const itemIds = new Set<string>();
  const units: WorkUnitRecord[] = [];
  const discoveredPhases: string[] = [];

  for (let i = 0; i < charter.queue.length; i++) {
    const item = charter.queue[i]!;
    if (!isNonEmptyText(item.id)) {
      throw new Error(`Charter queue item at index ${i} has invalid id`);
    }
    if (itemIds.has(item.id)) {
      throw new Error(`Duplicate charter queue item id: ${item.id}`);
    }
    itemIds.add(item.id);

    const phase = options.itemPhases?.[item.id] ?? item.phase ?? null;
    if (phase !== null) {
      if (!isNonEmptyText(phase)) {
        throw new Error(`Invalid phase for work unit "${item.id}"`);
      }
      if (explicitPhases !== undefined && !explicitPhases.includes(phase)) {
        throw new Error(`Work unit "${item.id}" references unknown phase "${phase}"`);
      }
      if (explicitPhases === undefined && !discoveredPhases.includes(phase)) {
        discoveredPhases.push(phase);
      }
    }

    const dependsOn = options.dependencies?.[item.id] ?? item.dependsOn ?? [];
    units.push(
      createWorkUnit({
        id: item.id,
        skill: item.skill,
        reconCitation: item.reconCitation,
        phase,
        dependsOn,
        charterIndex: i,
      }),
    );
  }

  computeDependencyDepths(units);

  const phases = explicitPhases !== undefined ? [...explicitPhases] : discoveredPhases;
  const decisionsApproved = options.decisionsApproved ?? false;
  if (typeof decisionsApproved !== "boolean") {
    throw new Error("decisionsApproved must be a boolean");
  }

  return freezeQueueState({
    schema: CAMPAIGN_SCHEMA_IDS.units,
    bounds,
    phases,
    units,
    batches: [],
    decisionsApproved,
    checkpointCount: 0,
  });
}

export function orderReadyWorkUnits(queueState: WorkUnitQueueState): readonly WorkUnitRecord[] {
  const parsed = parseWorkUnitQueueState(queueState);
  if (!parsed) {
    throw new Error("Invalid work unit queue state");
  }

  const depths = computeDependencyDepths(parsed.units);
  const byId = new Map(parsed.units.map((u) => [u.id, u] as const));
  const phaseOrder = new Map(parsed.phases.map((p, idx) => [p, idx] as const));
  const fallbackPhaseIndex = parsed.phases.length;

  const readyUnits = parsed.units.filter((unit) => {
    if (unit.state !== WorkUnitStates.ready) return false;
    return unit.dependsOn.every((depId) => byId.get(depId)?.state === WorkUnitStates.done);
  });

  readyUnits.sort((a, b) => {
    const depthDiff = depths.get(a.id)! - depths.get(b.id)!;
    if (depthDiff !== 0) return depthDiff;

    const phaseA = a.phase !== null ? (phaseOrder.get(a.phase) ?? fallbackPhaseIndex) : fallbackPhaseIndex;
    const phaseB = b.phase !== null ? (phaseOrder.get(b.phase) ?? fallbackPhaseIndex) : fallbackPhaseIndex;
    if (phaseA !== phaseB) return phaseA - phaseB;

    const indexDiff = a.charterIndex - b.charterIndex;
    if (indexDiff !== 0) return indexDiff;

    return compareUtf16(a.id, b.id);
  });

  return Object.freeze(readyUnits);
}

export function selectNextWorkUnit(queueState: WorkUnitQueueState): NextUnitSelection {
  const parsed = parseWorkUnitQueueState(queueState);
  if (!parsed) {
    throw new Error("Invalid work unit queue state");
  }

  const orderedReady = orderReadyWorkUnits(parsed);
  const readyCount = parsed.units.filter((u) => u.state === WorkUnitStates.ready).length;

  const counts: QueueSummaryCounts = Object.freeze({
    total: parsed.units.length,
    ready: readyCount,
    active: parsed.units.filter((u) => u.state === WorkUnitStates.active).length,
    verifying: parsed.units.filter((u) => u.state === WorkUnitStates.verifying).length,
    recovering: parsed.units.filter((u) => u.state === WorkUnitStates.recovering).length,
    reopened: parsed.units.filter((u) => u.state === WorkUnitStates.reopened).length,
    done: parsed.units.filter((u) => u.state === WorkUnitStates.done).length,
    blocked: parsed.units.filter((u) => u.state === WorkUnitStates.blocked).length,
    needsHuman: parsed.units.filter((u) => u.state === WorkUnitStates.needsHuman).length,
    waitingOnDependencies: readyCount - orderedReady.length,
  });

  return Object.freeze({
    next: orderedReady[0] ?? null,
    orderedReady,
    counts,
  });
}

export function regroupWorkUnits(
  queueState: WorkUnitQueueState,
  batches: readonly QueueBatch[],
  approved: boolean,
): RegroupResult {
  const parsed = parseWorkUnitQueueState(queueState);
  if (!parsed) {
    throw new Error("Invalid work unit queue state");
  }
  if (typeof approved !== "boolean") {
    throw new Error("approved must be a boolean");
  }
  if (!Array.isArray(batches)) {
    throw new Error("batches must be an array");
  }

  const knownUnitIds = new Set(parsed.units.map((u) => u.id));
  const seenBatchIds = new Set<string>();
  const unitToBatch = new Map<string, string>();
  const normalizedBatches: QueueBatch[] = [];

  for (const batch of batches) {
    if (!isPlainObject(batch) || !isNonEmptyText(batch.id) || !isStringArray(batch.unitIds) || batch.unitIds.length === 0) {
      throw new Error("Each batch must have a non-empty id and non-empty unitIds array");
    }
    if (seenBatchIds.has(batch.id)) {
      throw new Error(`Duplicate batch id: ${batch.id}`);
    }
    seenBatchIds.add(batch.id);

    for (const unitId of batch.unitIds) {
      if (!knownUnitIds.has(unitId)) {
        throw new Error(`Batch "${batch.id}" references unknown unit "${unitId}"`);
      }
      if (unitToBatch.has(unitId)) {
        throw new Error(`Unit "${unitId}" is assigned to multiple batches`);
      }
      unitToBatch.set(unitId, batch.id);
    }

    normalizedBatches.push(freezeBatch({ id: batch.id, unitIds: batch.unitIds }));
  }

  const updatedUnits = parsed.units.map((unit) =>
    Object.freeze({
      ...unit,
      batchId: unitToBatch.get(unit.id) ?? null,
    }),
  );

  const nextCheckpointCount = approved ? parsed.checkpointCount + 1 : parsed.checkpointCount;
  const nextQueue = freezeQueueState({
    ...parsed,
    units: updatedUnits,
    batches: normalizedBatches,
    decisionsApproved: approved ? true : parsed.decisionsApproved,
    checkpointCount: nextCheckpointCount,
  });

  if (!approved) {
    return Object.freeze({
      queue: nextQueue,
      checkpointRequired: false,
      checkpoint: null,
    });
  }

  return Object.freeze({
    queue: nextQueue,
    checkpointRequired: true,
    checkpoint: Object.freeze({
      decision: CampaignDecisions.checkpoint,
      signal: "checkpoint-request",
      checkpointCount: nextCheckpointCount,
      batchIds: Object.freeze(normalizedBatches.map((b) => b.id)),
    }),
  });
}

export function updateWorkUnitInQueue(
  queueState: WorkUnitQueueState,
  updatedUnit: WorkUnitRecord,
): WorkUnitQueueState {
  const parsedQueue = parseWorkUnitQueueState(queueState);
  if (!parsedQueue) {
    throw new Error("Invalid work unit queue state");
  }
  const parsedUnit = parseWorkUnitRecord(updatedUnit);
  if (!parsedUnit) {
    throw new Error("Invalid work unit record");
  }

  const index = parsedQueue.units.findIndex((u) => u.id === parsedUnit.id);
  if (index === -1) {
    throw new Error(`Work unit "${parsedUnit.id}" not found in queue`);
  }

  const nextUnits = parsedQueue.units.map((u, i) => (i === index ? parsedUnit : u));
  return freezeQueueState({
    ...parsedQueue,
    units: nextUnits,
  });
}

export function parseWorkUnitQueueState(value: unknown): WorkUnitQueueState | null {
  try {
    if (!isPlainObject(value)) return null;
    const required = [
      "schema",
      "bounds",
      "phases",
      "units",
      "batches",
      "decisionsApproved",
      "checkpointCount",
    ] as const;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== required.length) return null;
    if (keys.some((k) => typeof k !== "string" || !(required as readonly string[]).includes(k))) return null;
    for (const key of required) {
      const d = descriptors[key];
      if (!d || !Object.hasOwn(d, "value") || d.enumerable !== true) return null;
    }

    if (value.schema !== CAMPAIGN_SCHEMA_IDS.units) return null;
    const bounds = validateWorkUnitBounds(value.bounds);
    if (!isStringArray(value.phases) || new Set(value.phases).size !== value.phases.length) return null;
    if (typeof value.decisionsApproved !== "boolean") return null;
    if (!isNonNegativeSafeInt(value.checkpointCount)) return null;

    if (!Array.isArray(value.units) || Object.getPrototypeOf(value.units) !== Array.prototype) return null;
    if (Reflect.ownKeys(value.units).length !== value.units.length + 1) return null;
    const units: WorkUnitRecord[] = [];
    for (let i = 0; i < value.units.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value.units, String(i));
      if (!d || !Object.hasOwn(d, "value") || !d.enumerable) return null;
      const parsedUnit = parseWorkUnitRecord(d.value);
      if (!parsedUnit) return null;
      units.push(parsedUnit);
    }

    computeDependencyDepths(units);
    const knownUnitIds = new Set(units.map((u) => u.id));

    if (!Array.isArray(value.batches) || Object.getPrototypeOf(value.batches) !== Array.prototype) return null;
    if (Reflect.ownKeys(value.batches).length !== value.batches.length + 1) return null;
    const batches: QueueBatch[] = [];
    const seenBatchIds = new Set<string>();
    const seenBatchUnits = new Set<string>();
    for (let i = 0; i < value.batches.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value.batches, String(i));
      if (!d || !Object.hasOwn(d, "value") || !d.enumerable || !isPlainObject(d.value)) return null;
      const b = d.value;
      const bKeys = Reflect.ownKeys(b);
      if (bKeys.length !== 2 || !Object.hasOwn(b, "id") || !Object.hasOwn(b, "unitIds")) return null;
      if (!isNonEmptyText(b.id) || seenBatchIds.has(b.id)) return null;
      if (!isStringArray(b.unitIds) || b.unitIds.length === 0) return null;
      seenBatchIds.add(b.id);
      for (const unitId of b.unitIds) {
        if (!knownUnitIds.has(unitId) || seenBatchUnits.has(unitId)) return null;
        seenBatchUnits.add(unitId);
      }
      batches.push({ id: b.id, unitIds: b.unitIds });
    }

    return freezeQueueState({
      schema: CAMPAIGN_SCHEMA_IDS.units,
      bounds,
      phases: value.phases,
      units,
      batches,
      decisionsApproved: value.decisionsApproved,
      checkpointCount: value.checkpointCount,
    });
  } catch {
    return null;
  }
}
