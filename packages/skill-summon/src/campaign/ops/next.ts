import {
  AgentOps,
  CampaignStates,
  activateWorkUnit,
  campaignSha256Hex,
  canonicalCampaignJson,
  immutableSnapshot,
  regroupWorkUnits,
  selectNextWorkUnit,
  toControllerStatus,
  updateWorkUnitInQueue,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
  type QueueBatch,
  type QueueSummaryCounts,
  type WorkUnitQueueState,
  type WorkUnitRecord,
} from "skill-zero";

import { CampaignStore } from "../store.js";
import {
  executeCheckpoint,
  loadOrInitializeWorkUnitQueue,
} from "./checkpoint.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./status.js";

export type CampaignNextResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof AgentOps.next;
      unit: WorkUnitRecord | null;
      queue: WorkUnitQueueState;
      queueCounts: QueueSummaryCounts;
      checkpointWritten: boolean;
      checkpointEntry?: CampaignTraceEntry;
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof AgentOps.next;
      unit: null;
      checkpointWritten: false;
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
      error: CampaignRefusalError;
    }>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function getLatestAcceptedOperator(
  trace: readonly CampaignTraceEntry[],
): CampaignTraceEntry | undefined {
  return [...trace]
    .reverse()
    .find((entry) => entry.channel === "operator" && entry.accepted);
}

export async function executeNext(
  session: { readonly root: string },
  rawArgs?: unknown,
): Promise<CampaignNextResult> {
  const store = await CampaignStore.load(session.root);
  const status = toControllerStatus(store.state, store.trace.at(-1));
  const latestAcceptedOperator = getLatestAcceptedOperator(store.trace);
  const digest = buildCampaignDigest(
    store.state,
    status,
    latestAcceptedOperator,
  );

  if (store.corrupted) {
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.next,
      unit: null,
      checkpointWritten: false,
      state: store.state,
      status,
      digest,
      error: {
        code: "campaign-corrupted",
        message:
          store.error ?? "Campaign trace failed verification (FAILED_SAFE).",
        retryable: false,
      },
    });
  }

  const hasBatches = isPlainObject(rawArgs) && rawArgs.batches !== undefined;
  const rawBatches = hasBatches
    ? (rawArgs.batches as readonly QueueBatch[])
    : undefined;

  if (!store.state.approved && store.state.charter !== null && hasBatches) {
    let regroupedQueue: WorkUnitQueueState;
    try {
      const { queue } = await loadOrInitializeWorkUnitQueue(store);
      const regrouped = regroupWorkUnits(queue, rawBatches!, false);
      regroupedQueue = regrouped.queue;
    } catch (error) {
      return immutableSnapshot({
        ok: false,
        refused: true,
        op: AgentOps.next,
        unit: null,
        checkpointWritten: false,
        state: store.state,
        status,
        digest,
        error: {
          code: "invalid-batches",
          message:
            error instanceof Error
              ? error.message
              : "Invalid batches for pre-decisions regrouping.",
          retryable: false,
        },
      });
    }

    const unitsSha256 = campaignSha256Hex(canonicalCampaignJson(regroupedQueue));
    const appended = await store.append(
      { channel: "agent", op: AgentOps.next, unitsSha256 },
      { unitsState: regroupedQueue },
    );
    const nextDigest = buildCampaignDigest(
      appended.state,
      appended.status,
      latestAcceptedOperator,
    );
    const counts = selectNextWorkUnit(regroupedQueue).counts;
    return immutableSnapshot({
      ok: true,
      refused: false,
      op: AgentOps.next,
      unit: null,
      queue: regroupedQueue,
      queueCounts: counts,
      checkpointWritten: false,
      state: appended.state,
      status: appended.status,
      digest: nextDigest,
    });
  }

  if (
    store.state.state !== CampaignStates.executing ||
    !store.state.approved ||
    store.state.charter === null
  ) {
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.next,
      unit: null,
      checkpointWritten: false,
      state: store.state,
      status,
      digest,
      error: {
        code: "campaign-not-executing",
        message: `Cannot select next work unit in state ${store.state.state} (approved=${store.state.approved}).`,
        retryable: false,
      },
    });
  }

  let activeStore = store;
  let currentState = store.state;
  let currentStatus = status;
  let currentDigest = digest;
  let checkpointWritten = false;
  let checkpointEntry: CampaignTraceEntry | undefined;

  if (hasBatches) {
    const checkpointResult = await executeCheckpoint(session, {
      batches: rawBatches,
    });
    if (!checkpointResult.ok) {
      return immutableSnapshot({
        ok: false,
        refused: true,
        op: AgentOps.next,
        unit: null,
        checkpointWritten: false,
        state: checkpointResult.state,
        status: checkpointResult.status,
        digest: checkpointResult.digest,
        error: checkpointResult.error,
      });
    }
    checkpointWritten = checkpointResult.checkpointWritten;
    checkpointEntry = checkpointResult.entry;
    currentState = checkpointResult.state;
    currentStatus = checkpointResult.status;
    currentDigest = checkpointResult.digest;
    activeStore = await CampaignStore.load(session.root);
  }

  let queue: WorkUnitQueueState;
  let initializedNow = false;
  try {
    const loaded = await loadOrInitializeWorkUnitQueue(activeStore);
    queue = loaded.queue;
    initializedNow = loaded.initialized;
  } catch (error) {
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.next,
      unit: null,
      checkpointWritten: false,
      state: currentState,
      status: currentStatus,
      digest: currentDigest,
      error: {
        code: "campaign-corrupted",
        message:
          error instanceof Error
            ? error.message
            : "Failed to load or initialize work unit queue.",
        retryable: false,
      },
    });
  }

  const selection = selectNextWorkUnit(queue);
  if (selection.next !== null) {
    const activatedUnit = activateWorkUnit(selection.next);
    const updatedQueue = updateWorkUnitInQueue(queue, activatedUnit);
    const unitsSha256 = campaignSha256Hex(canonicalCampaignJson(updatedQueue));
    const appended = await activeStore.append(
      {
        channel: "agent",
        op: AgentOps.next,
        workUnit: activatedUnit.id,
        unitsSha256,
      },
      { unitsState: updatedQueue },
    );
    const nextDigest = buildCampaignDigest(
      appended.state,
      appended.status,
      latestAcceptedOperator,
    );
    const updatedCounts = selectNextWorkUnit(updatedQueue).counts;
    return immutableSnapshot({
      ok: true,
      refused: false,
      op: AgentOps.next,
      unit: activatedUnit,
      queue: updatedQueue,
      queueCounts: updatedCounts,
      checkpointWritten,
      ...(checkpointEntry ? { checkpointEntry } : {}),
      state: appended.state,
      status: appended.status,
      digest: nextDigest,
    });
  }

  let finalState = currentState;
  let finalStatus = currentStatus;
  let finalDigest = currentDigest;
  if (initializedNow) {
    const unitsSha256 = campaignSha256Hex(canonicalCampaignJson(queue));
    const appended = await activeStore.append(
      { channel: "agent", op: AgentOps.next, unitsSha256 },
      { unitsState: queue },
    );
    finalState = appended.state;
    finalStatus = appended.status;
    finalDigest = buildCampaignDigest(
      appended.state,
      appended.status,
      latestAcceptedOperator,
    );
  }

  return immutableSnapshot({
    ok: true,
    refused: false,
    op: AgentOps.next,
    unit: null,
    queue,
    queueCounts: selection.counts,
    checkpointWritten,
    ...(checkpointEntry ? { checkpointEntry } : {}),
    state: finalState,
    status: finalStatus,
    digest: finalDigest,
  });
}
