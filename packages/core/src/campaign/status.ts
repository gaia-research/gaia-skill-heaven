import { CAMPAIGN_SCHEMA_IDS } from "./vocabulary.js";
import { immutableSnapshot, parseCampaignState, parseCampaignTraceEntry } from "./schema.js";
import type { CampaignState, CampaignTraceEntry, ControllerStatus } from "./types.js";
/** /v1 preserves the proposed consumer shape; no claim of live availability. */
export function toControllerStatus(state: CampaignState, transition?: CampaignTraceEntry): ControllerStatus {
  if (!parseCampaignState(state)) throw new Error("Invalid campaign state");
  if (transition && (!parseCampaignTraceEntry(transition) || transition.to !== state.state)) throw new Error("Invalid transition");
  return immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.status, state: state.state, effective: state.steering.rung,
    ...(state.total > 0 ? { progress: { completed: state.completed, total: state.total } } : {}),
    ...(transition ? { transition: { from: transition.from, to: transition.to, reason: transition.trigger } } : {}),
  });
}
