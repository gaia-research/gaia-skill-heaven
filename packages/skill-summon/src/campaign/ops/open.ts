import { lstat } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  AgentOps,
  CampaignStates,
  immutableSnapshot,
  toControllerStatus,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
} from "skill-zero";

import { assertConfinedPath } from "../../summon/session.js";

import {
  CampaignStore,
  parseCampaignGoalContract,
  type CampaignGoalContract,
} from "../store.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./status.js";

export type CampaignOpenResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof AgentOps.open;
      state: CampaignState;
      entry: CampaignTraceEntry;
      status: ControllerStatus;
      goalContract: CampaignGoalContract;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof AgentOps.open;
      state: CampaignState;
      entry?: CampaignTraceEntry;
      status: ControllerStatus;
      goalContract: CampaignGoalContract | null;
      digest: CampaignDigest;
      error: CampaignRefusalError;
    }>;

const ALIASED_FIELDS = [
  ["workUniverse", "work_universe"],
  ["acceptanceCommands", "acceptance_commands"],
  ["humanOnlyOperations", "human_only_operations"],
  ["stopConditions", "stop_conditions"],
] as const;

export function normalizeGoalContractInput(
  raw: unknown,
): { ok: true; contract: CampaignGoalContract } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      message:
        "Invalid goal contract: goal must be a non-empty string and workUniverse, repositories, acceptanceCommands, humanOnlyOperations, and stopConditions must be non-empty string arrays.",
    };
  }
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) {
    return {
      ok: false,
      message:
        "Invalid goal contract: goal must be a non-empty string and workUniverse, repositories, acceptanceCommands, humanOnlyOperations, and stopConditions must be non-empty string arrays.",
    };
  }

  const record = raw as Record<string, unknown>;
  for (const [camel, snake] of ALIASED_FIELDS) {
    const hasCamel =
      Object.hasOwn(record, camel) && record[camel] !== undefined;
    const hasSnake =
      Object.hasOwn(record, snake) && record[snake] !== undefined;
    if (hasCamel && hasSnake && !isDeepStrictEqual(record[camel], record[snake])) {
      return {
        ok: false,
        message: `Invalid goal contract: conflicting values provided for ${camel} and ${snake}.`,
      };
    }
  }

  const candidate = {
    goal: record.goal,
    workUniverse: record.workUniverse ?? record.work_universe,
    repositories: record.repositories,
    acceptanceCommands: record.acceptanceCommands ?? record.acceptance_commands,
    humanOnlyOperations:
      record.humanOnlyOperations ?? record.human_only_operations,
    stopConditions: record.stopConditions ?? record.stop_conditions,
  };

  const contract = parseCampaignGoalContract(candidate);
  if (!contract) {
    return {
      ok: false,
      message:
        "Invalid goal contract: goal must be a non-empty string and workUniverse, repositories, acceptanceCommands, humanOnlyOperations, and stopConditions must be non-empty string arrays.",
    };
  }

  return { ok: true, contract };
}

export async function executeOpen(
  session: { readonly root: string },
  rawInput: unknown,
): Promise<CampaignOpenResult> {
  const store = await CampaignStore.load(session.root);

  if (store.corrupted) {
    const status = toControllerStatus(store.state, store.trace.at(-1));
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.open,
      state: store.state,
      status,
      goalContract: null,
      digest: buildCampaignDigest(store.state, status),
      error: {
        code: "campaign-corrupted",
        message: store.error ?? "Campaign trace is in FAILED_SAFE state.",
        retryable: false,
      },
    });
  }

  if (store.state.state !== CampaignStates.unarmed) {
    const appended = await store.append({ channel: "agent", op: AgentOps.open });
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.open,
      state: appended.state,
      entry: appended.entry,
      status: appended.status,
      goalContract: await store.loadGoalContract().catch(() => null),
      digest: buildCampaignDigest(appended.state, appended.status),
      error: {
        code: "invalid-campaign-state",
        message:
          "Campaign open is refused because a campaign is already active or terminated in this session.",
        retryable: false,
      },
    });
  }

  const normalized = normalizeGoalContractInput(rawInput);
  if (!normalized.ok) {
    const status = toControllerStatus(store.state, store.trace.at(-1));
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.open,
      state: store.state,
      status,
      goalContract: null,
      digest: buildCampaignDigest(store.state, status),
      error: {
        code: "invalid-goal-contract",
        message: normalized.message,
        retryable: false,
      },
    });
  }

  try {
    await assertConfinedPath(
      session.root,
      store.goalPath,
      "Campaign goal contract",
    );
    try {
      const goalStat = await lstat(store.goalPath);
      if (goalStat.isSymbolicLink() || !goalStat.isFile()) {
        throw new Error(
          `Campaign goal contract must be a regular file: ${store.goalPath}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  } catch (error) {
    const status = toControllerStatus(store.state, store.trace.at(-1));
    const message = error instanceof Error ? error.message : String(error);
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.open,
      state: store.state,
      status,
      goalContract: null,
      digest: buildCampaignDigest(store.state, status),
      error: {
        code: "invalid-goal-artifact",
        message,
        retryable: false,
      },
    });
  }

  const appended = await store.append({ channel: "agent", op: AgentOps.open });
  let savedContract: CampaignGoalContract;
  try {
    savedContract = await store.saveGoalContract(normalized.contract);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.open,
      state: appended.state,
      entry: appended.entry,
      status: appended.status,
      goalContract: null,
      digest: buildCampaignDigest(appended.state, appended.status),
      error: {
        code: "invalid-goal-artifact",
        message,
        retryable: false,
      },
    });
  }

  return immutableSnapshot({
    ok: true,
    refused: false,
    op: AgentOps.open,
    state: appended.state,
    entry: appended.entry,
    status: appended.status,
    goalContract: savedContract,
    digest: buildCampaignDigest(appended.state, appended.status),
  });
}
