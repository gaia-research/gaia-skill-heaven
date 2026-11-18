/** Campaign control values live here; consumers use named members, never offsets. */
export const CampaignStates = Object.freeze({
  unarmed: "UNARMED",
  recon: "RECON",
  decisions: "DECISIONS",
  executing: "EXECUTING",
  convergence: "CONVERGENCE",
  completed: "COMPLETED",
  stoppedByUser: "STOPPED_BY_USER",
  stoppedByPolicy: "STOPPED_BY_POLICY",
  blocked: "BLOCKED",
  failedSafe: "FAILED_SAFE",
  endedWithSession: "ENDED_WITH_SESSION",
} as const);
export const CampaignDecisions = Object.freeze({
  hold: "HOLD",
  explore: "EXPLORE",
  recover: "RECOVER",
  reopen: "REOPEN",
  checkpoint: "CHECKPOINT",
  close: "CLOSE",
  stop: "STOP",
  recon: "RECON",
  decisions: "DECISIONS",
  convergence: "CONVERGENCE",
} as const);
export const OperatorVerbs = Object.freeze({
  decide: "decide", amend: "amend", answer: "answer", checkpoint: "checkpoint", stop: "stop",
} as const);
export const AgentOps = Object.freeze({
  open: "open", recon: "recon", propose: "propose", next: "next", report: "report", incident: "incident", status: "status",
} as const);
export const EngineOps = Object.freeze({
  verify: "verify", complete: "complete", policyStop: "policy-stop", block: "block", fail: "fail", sessionEnd: "session-end",
} as const);
export const DecisionActions = Object.freeze({ approve: "approve", decline: "decline" } as const);
export const OPERATOR_ATTRIBUTION = "terminal-input, unauthenticated" as const;
export const OPERATOR_CHANNEL_MCP_ELICITATION = "mcp-elicitation" as const;
export const MULTIPLEXER_ENV_VARS = Object.freeze(["HERDR_ENV", "HERDR_SOCKET_PATH", "TMUX"] as const);
export const OPERATOR_MULTIPLEXED_OPT_IN_ENV = "SKILL_ULTRA_MULTIPLEXED_DECISIONS" as const;
export const OPERATOR_MULTIPLEXED_OPT_IN_VALUE = "accept-risk" as const;
export const ElicitationActions = Object.freeze({ accept: "accept", decline: "decline", cancel: "cancel" } as const);
export const OperatorDecisionChoices = Object.freeze({
  approve: DecisionActions.approve,
  amend: OperatorVerbs.amend,
  decline: DecisionActions.decline,
} as const);
export const UltraSubcommands = Object.freeze({
  decide: OperatorVerbs.decide,
  amend: OperatorVerbs.amend,
  answer: OperatorVerbs.answer,
  status: AgentOps.status,
  stop: OperatorVerbs.stop,
} as const);
export const ULTRA_SUBCOMMANDS = Object.freeze(Object.values(UltraSubcommands));
export const CAMPAIGN_STATES = Object.freeze(Object.values(CampaignStates));
export const CAMPAIGN_DECISIONS = Object.freeze(Object.values(CampaignDecisions));
export const OPERATOR_VERBS = Object.freeze(Object.values(OperatorVerbs));
export const AGENT_OPS = Object.freeze(Object.values(AgentOps));
export const ENGINE_OPS = Object.freeze(Object.values(EngineOps));
export const CAMPAIGN_CHANNELS = Object.freeze(["operator", "agent", "engine", "none"] as const);
export const CAMPAIGN_SIGNALS = Object.freeze([
  "none", "invalid-input", "open-request", "recon-complete", "proposal", "decision", "amendment", "answer",
  "checkpoint-request", "stop-request", "work-ready", "work-reported", "incident-reported", "policy-refusal",
  "session-ended", "behavioral-failure", "behavioral-recovery", "completed", "blocked", "failed-safe", "person-required",
] as const);
export const CampaignPhases = Object.freeze({
  recon: "recon", decisions: "decisions", execution: "execution", convergence: "convergence", terminal: "terminal",
} as const);
export const CampaignSignals = Object.freeze({ answer: "answer", personRequired: "person-required" } as const);
export const CAMPAIGN_PHASES = Object.freeze(Object.values(CampaignPhases));
export const TERMINAL_STATES = Object.freeze([
  CampaignStates.completed, CampaignStates.stoppedByUser, CampaignStates.stoppedByPolicy,
  CampaignStates.blocked, CampaignStates.failedSafe, CampaignStates.endedWithSession,
]);
export type CampaignStateName = typeof CAMPAIGN_STATES[number];
export type CampaignDecision = typeof CAMPAIGN_DECISIONS[number];
export type OperatorVerb = typeof OPERATOR_VERBS[number];
export type AgentOp = typeof AGENT_OPS[number];
export type CampaignChannel = typeof CAMPAIGN_CHANNELS[number];
export type CampaignSignal = typeof CAMPAIGN_SIGNALS[number];
export type CampaignPhase = typeof CAMPAIGN_PHASES[number];
export type ElicitationAction = typeof ElicitationActions[keyof typeof ElicitationActions];
export type OperatorDecisionChoice = typeof OperatorDecisionChoices[keyof typeof OperatorDecisionChoices];
export type UltraSubcommand = typeof ULTRA_SUBCOMMANDS[number];
export const CAMPAIGN_SCHEMA_IDS = Object.freeze({
  trace: "skill-heaven/campaign-trace/v1",
  charter: "skill-heaven/campaign-charter/v1",
  recon: "skill-heaven/campaign-recon/v1",
  manifest: "skill-heaven/campaign-manifest/v1",
  incident: "skill-heaven/convergence-incident/v1",
  status: "skill-heaven/controller-status/v1",
} as const);
