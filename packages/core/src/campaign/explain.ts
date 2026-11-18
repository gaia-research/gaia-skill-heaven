import { CampaignDecisions as D, CampaignSignals } from "./vocabulary.js";
import type { CampaignDecision, CampaignSignal, CampaignStateName } from "./vocabulary.js";
const descriptions: Record<CampaignDecision, string> = {
  [D.hold]: "No campaign change was applied.",
  [D.explore]: "The campaign continued execution or exploration.",
  [D.recover]: "The working rung converged after a verification pass.",
  [D.reopen]: "The campaign reopened a path.",
  [D.checkpoint]: "The operator recorded a checkpoint.",
  [D.close]: "The runtime reported campaign completion.",
  [D.stop]: "The campaign ended.",
  [D.recon]: "The campaign gathered reconnaissance.",
  [D.decisions]: "The campaign awaits an operator decision.",
  [D.convergence]: "The campaign entered convergence.",
};
/** personPending describes the resulting convergence gate, not the broader
 * trace personRequired flag (which also covers a human gate just resolved). */
export function explainCampaignTransition(
  from: CampaignStateName, to: CampaignStateName, decision: CampaignDecision,
  signal: CampaignSignal, personPending = false,
): string {
  const description = decision === D.hold && signal === CampaignSignals.personRequired
    ? "Automatic continuation was refused; an operator answer is required."
    : signal === CampaignSignals.unplanned
      ? "An unplanned model-led skill was summoned during execution."
      : `${descriptions[decision]}${personPending ? " An operator answer is required." : ""}`;
  return `${description} ${from} → ${to} (${signal}).`;
}
