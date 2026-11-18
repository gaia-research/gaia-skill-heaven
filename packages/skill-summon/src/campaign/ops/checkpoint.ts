import {
  AgentOps,
  CampaignStates,
  OperatorVerbs,
  buildWorkUnitQueue,
  campaignSha256Hex,
  canonicalCampaignJson,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  immutableSnapshot,
  regroupWorkUnits,
  toControllerStatus,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
  type QueueBatch,
  type WorkUnitQueueState,
} from "skill-zero";

import { CampaignStore } from "../store.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./status.js";

const operatorAdapter = createCampaignOperatorAdapter();

export type CampaignCheckpointResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof OperatorVerbs.checkpoint;
      checkpointWritten: boolean;
      queue?: WorkUnitQueueState;
      entry?: CampaignTraceEntry;
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof OperatorVerbs.checkpoint;
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

export async function loadOrInitializeWorkUnitQueue(
  store: CampaignStore,
): Promise<{ queue: WorkUnitQueueState; initialized: boolean }> {
  const existing = await store.loadUnitsState();
  if (existing) {
    return { queue: existing, initialized: false };
  }
  const charter = store.state.charter;
  if (!charter) {
    throw new Error("Campaign has no charter.");
  }
  const charterStrategy = await store.loadCharterStrategy();
  const arsenal = charterStrategy?.charterTemplate.arsenal;
  const itemPhases: Record<string, string> = {};
  if (arsenal) {
    for (let i = 0; i < charter.queue.length; i++) {
      const qItem = charter.queue[i]!;
      const matched =
        (arsenal[i]?.skillId === qItem.skill ? arsenal[i] : undefined) ??
        arsenal.find((a) => a.skillId === qItem.skill);
      if (matched?.phase) {
        itemPhases[qItem.id] = matched.phase;
      }
    }
  }
  const phases = charterStrategy?.charterTemplate.phases;
  const queue = buildWorkUnitQueue(charter, {
    ...(phases && phases.length > 0 ? { phases } : {}),
    ...(Object.keys(itemPhases).length > 0 ? { itemPhases } : {}),
    decisionsApproved: store.state.approved,
  });
  return { queue, initialized: true };
}

export async function executeCheckpoint(
  session: { readonly root: string },
  rawArgs?: unknown,
): Promise<CampaignCheckpointResult> {
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
      op: OperatorVerbs.checkpoint,
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
  const rawBatches = hasBatches ? (rawArgs.batches as readonly QueueBatch[]) : undefined;

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
        op: OperatorVerbs.checkpoint,
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

    return immutableSnapshot({
      ok: true,
      refused: false,
      op: OperatorVerbs.checkpoint,
      checkpointWritten: false,
      queue: regroupedQueue,
      state: appended.state,
      status: appended.status,
      digest: nextDigest,
    });
  }

  if (
    !store.state.approved ||
    (store.state.state !== CampaignStates.executing &&
      store.state.state !== CampaignStates.convergence)
  ) {
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: OperatorVerbs.checkpoint,
      checkpointWritten: false,
      state: store.state,
      status,
      digest,
      error: {
        code: "campaign-not-executing",
        message: `Cannot checkpoint in state ${store.state.state} (approved=${store.state.approved}).`,
        retryable: false,
      },
    });
  }

  let updatedQueue: WorkUnitQueueState | undefined;
  if (hasBatches) {
    try {
      const { queue } = await loadOrInitializeWorkUnitQueue(store);
      const regrouped = regroupWorkUnits(queue, rawBatches!, true);
      updatedQueue = regrouped.queue;
    } catch (error) {
      return immutableSnapshot({
        ok: false,
        refused: true,
        op: OperatorVerbs.checkpoint,
        checkpointWritten: false,
        state: store.state,
        status,
        digest,
        error: {
          code: "invalid-batches",
          message:
            error instanceof Error
              ? error.message
              : "Invalid batches for checkpoint regrouping.",
          retryable: false,
        },
      });
    }
  }

  const event = createCampaignOperatorEvent(operatorAdapter, {
    channel: "operator",
    op: OperatorVerbs.checkpoint,
  });
  const appended = await store.append(
    event,
    updatedQueue ? { unitsState: updatedQueue } : undefined,
  );
  const nextDigest = buildCampaignDigest(
    appended.state,
    appended.status,
    latestAcceptedOperator,
  );

  return immutableSnapshot({
    ok: true,
    refused: false,
    op: OperatorVerbs.checkpoint,
    checkpointWritten: true,
    ...(updatedQueue ? { queue: updatedQueue } : {}),
    entry: appended.entry,
    state: appended.state,
    status: appended.status,
    digest: nextDigest,
  });
}
