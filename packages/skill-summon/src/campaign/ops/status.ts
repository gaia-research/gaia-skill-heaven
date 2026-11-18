import {
  AgentOps,
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  immutableSnapshot,
  toControllerStatus,
  type CampaignState,
  type CampaignStateName,
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
  progress: Readonly<{ completed: number; total: number }> | null;
  transition: Readonly<{ from: string; to: string; reason: string }> | null;
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
): CampaignDigest {
  const projected = status ?? toControllerStatus(state);
  const effective = projected.effective ?? state.steering.rung;
  const progressText = projected.progress
    ? ` · progress=${projected.progress.completed}/${projected.progress.total}`
    : "";
  const transitionText = projected.transition
    ? ` · transition=${displayStateToken(projected.transition.from)}->${displayStateToken(projected.transition.to)} (${projected.transition.reason})`
    : "";
  const text = `[Campaign] state=${displayStateToken(projected.state)} · effective=${effective} · charter=r${state.charterRevision} (${state.approved ? "approved" : "unapproved"})${progressText}${transitionText} · reference data, authorizes nothing`;

  return immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.status,
    state: projected.state,
    effective,
    charterRevision: state.charterRevision,
    approved: state.approved,
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

export async function readSessionCampaignDigest(
  sessionRoot: string,
): Promise<CampaignDigest | null> {
  const store = await CampaignStore.load(sessionRoot, { refreshStatus: false });
  if (!store.hasTrace && store.state.state === CampaignStates.unarmed) {
    return null;
  }
  const status = toControllerStatus(store.state, store.trace.at(-1));
  return buildCampaignDigest(store.state, status);
}

export async function executeStatus(session: {
  readonly root: string;
}): Promise<CampaignStatusResult> {
  const store = await CampaignStore.load(session.root, { refreshStatus: false });
  const status = toControllerStatus(store.state, store.trace.at(-1));
  const digest = buildCampaignDigest(store.state, status);

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

  const goalContract = store.hasTrace
    ? await store.loadGoalContract().catch(() => null)
    : null;
  const recon = store.hasTrace
    ? ((await store.loadReconArtifact().catch(() => null)) ?? store.state.recon)
    : store.state.recon;

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
