import {
  AgentOps,
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  immutableSnapshot,
  toControllerStatus,
  type CampaignState,
  type CampaignStateName,
  type CampaignTraceEntry,
  type ControllerStatus,
  type SteeringRung,
} from "skill-zero";

import { CampaignStore, type CampaignGoalContract } from "../store.js";

export type CampaignDigest = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.status;
  state: CampaignStateName;
  effective: SteeringRung;
  charterRevision: number;
  approved: boolean;
  multiplexed?: boolean;
  optIn?: boolean;
  progress: Readonly<{ completed: number; total: number }> | null;
  transition: Readonly<{ from: string; to: string; reason: string }> | null;
  text: string;
}>;

export type CampaignUnavailableDigest = Readonly<{
  schema: typeof CAMPAIGN_SCHEMA_IDS.status;
  state: "UNAVAILABLE";
  effective: null;
  charterRevision: null;
  approved: null;
  progress: null;
  transition: null;
  text: string;
}>;

export type CampaignRefusalError = Readonly<{
  code: string;
  message: string;
  retryable: false;
}>;

export type CampaignStatusResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof AgentOps.status;
      hasCampaign: boolean;
      state: CampaignState;
      status: ControllerStatus;
      goalContract: CampaignGoalContract | null;
      recon: unknown;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof AgentOps.status;
      hasCampaign: boolean;
      state: CampaignState;
      status: ControllerStatus;
      goalContract: null;
      recon: null;
      digest: CampaignDigest;
      error: CampaignRefusalError;
    }>;

function displayStateToken(token: string): string {
  return token === CampaignStates.unarmed ? "IDLE" : token;
}

export function buildCampaignDigest(
  state: CampaignState,
  status?: ControllerStatus,
  latestOperatorEntry?: CampaignTraceEntry,
): CampaignDigest {
  const projected = status ?? toControllerStatus(state);
  const effective = projected.effective ?? state.steering.rung;
  const progressText = projected.progress
    ? ` · progress=${projected.progress.completed}/${projected.progress.total}`
    : "";
  const transitionText = projected.transition
    ? ` · transition=${displayStateToken(projected.transition.from)}->${displayStateToken(projected.transition.to)} (${projected.transition.reason})`
    : "";
  const operatorProvenanceText =
    latestOperatorEntry?.channel === "operator"
      ? `${latestOperatorEntry.multiplexed !== undefined ? ` · multiplexed=${latestOperatorEntry.multiplexed}` : ""}${latestOperatorEntry.optIn === true ? " · optIn=true" : ""}`
      : "";
  const text = `[Campaign] state=${displayStateToken(projected.state)} · effective=${effective} · charter=r${state.charterRevision} (${state.approved ? "approved" : "unapproved"})${progressText}${transitionText}${operatorProvenanceText} · reference data, authorizes nothing`;

  return immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.status,
    state: projected.state,
    effective,
    charterRevision: state.charterRevision,
    approved: state.approved,
    ...(latestOperatorEntry?.channel === "operator" &&
    latestOperatorEntry.multiplexed !== undefined
      ? { multiplexed: latestOperatorEntry.multiplexed }
      : {}),
    ...(latestOperatorEntry?.channel === "operator" &&
    latestOperatorEntry.optIn === true
      ? { optIn: true }
      : {}),
    progress: projected.progress
      ? {
          completed: projected.progress.completed,
          total: projected.progress.total,
        }
      : null,
    transition: projected.transition
      ? {
          from: projected.transition.from,
          to: projected.transition.to,
          reason: projected.transition.reason,
        }
      : null,
    text,
  });
}

export function buildUnavailableCampaignDigest(): CampaignUnavailableDigest {
  return immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.status,
    state: "UNAVAILABLE" as const,
    effective: null,
    charterRevision: null,
    approved: null,
    progress: null,
    transition: null,
    text: "[Campaign] state=UNAVAILABLE · campaign state could not be read · reference data, authorizes nothing",
  });
}

export async function readSafeCampaignStateAndDigest(
  sessionRoot: string | undefined,
): Promise<
  | Readonly<{
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      state: null;
      status: null;
      digest: CampaignUnavailableDigest;
    }>
> {
  if (!sessionRoot) {
    return {
      state: null,
      status: null,
      digest: buildUnavailableCampaignDigest(),
    };
  }
  try {
    const store = await CampaignStore.load(sessionRoot, {
      refreshStatus: false,
    });
    const status = toControllerStatus(store.state, store.trace.at(-1));
    const latestAcceptedOperator = [...store.trace]
      .reverse()
      .find((entry) => entry.channel === "operator" && entry.accepted);
    return {
      state: store.state,
      status,
      digest: buildCampaignDigest(store.state, status, latestAcceptedOperator),
    };
  } catch {
    return {
      state: null,
      status: null,
      digest: buildUnavailableCampaignDigest(),
    };
  }
}

export async function readSessionCampaignDigest(
  sessionRoot: string,
): Promise<CampaignDigest | null> {
  const store = await CampaignStore.load(sessionRoot, { refreshStatus: false });
  if (!store.hasTrace && store.state.state === CampaignStates.unarmed) {
    return null;
  }
  const status = toControllerStatus(store.state, store.trace.at(-1));
  return buildCampaignDigest(
    store.state,
    status,
    [...store.trace]
      .reverse()
      .find((entry) => entry.channel === "operator" && entry.accepted),
  );
}

export async function executeStatus(session: {
  readonly root: string;
}): Promise<CampaignStatusResult> {
  const store = await CampaignStore.load(session.root, { refreshStatus: false });
  const status = toControllerStatus(store.state, store.trace.at(-1));
  const latestAcceptedOperator = [...store.trace]
    .reverse()
    .find((entry) => entry.channel === "operator" && entry.accepted);
  const digest = buildCampaignDigest(
    store.state,
    status,
    latestAcceptedOperator,
  );

  if (store.corrupted) {
    return immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.status,
      hasCampaign: store.hasTrace,
      state: store.state,
      status,
      goalContract: null,
      recon: null,
      digest,
      error: {
        code: "campaign-corrupted",
        message:
          store.error ?? "Campaign trace failed verification (FAILED_SAFE).",
        retryable: false,
      },
    });
  }

  let goalContract: CampaignGoalContract | null = null;
  let recon: unknown = store.state.recon;
  if (store.hasTrace) {
    try {
      goalContract = await store.loadGoalContract();
      recon = (await store.loadReconArtifact()) ?? store.state.recon;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Campaign artifact failed verification (FAILED_SAFE).";
      const failedState = immutableSnapshot({
        ...store.state,
        state: CampaignStates.failedSafe,
      });
      const failedStatus = toControllerStatus(failedState);
      return immutableSnapshot({
        ok: false,
        refused: true,
        op: AgentOps.status,
        hasCampaign: true,
        state: failedState,
        status: failedStatus,
        goalContract: null,
        recon: null,
        digest: buildCampaignDigest(failedState, failedStatus),
        error: {
          code: "campaign-corrupted",
          message,
          retryable: false,
        },
      });
    }

    if (store.state.state !== CampaignStates.unarmed && goalContract === null) {
      const failedState = immutableSnapshot({
        ...store.state,
        state: CampaignStates.failedSafe,
      });
      const failedStatus = toControllerStatus(failedState);
      return immutableSnapshot({
        ok: false,
        refused: true,
        op: AgentOps.status,
        hasCampaign: true,
        state: failedState,
        status: failedStatus,
        goalContract: null,
        recon: null,
        digest: buildCampaignDigest(failedState, failedStatus),
        error: {
          code: "campaign-corrupted",
          message:
            "Campaign trace is in active/RECON state without a committed goal contract (FAILED_SAFE).",
          retryable: false,
        },
      });
    }
  }

  return immutableSnapshot({
    ok: true,
    refused: false,
    op: AgentOps.status,
    hasCampaign: store.hasTrace,
    state: store.state,
    status,
    goalContract,
    recon,
    digest,
  });
}
