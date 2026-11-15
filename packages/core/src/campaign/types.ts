import type { SteeringState, SteeringRung } from "../steering.js";
import { AgentOps as A, OperatorVerbs as O, EngineOps as E, DecisionActions as D } from "./vocabulary.js";
import type { CampaignChannel, CampaignDecision, CampaignPhase, CampaignSignal, CampaignStateName } from "./vocabulary.js";

export type CampaignQueueItem = Readonly<{
  id: string;
  skill: string;
  reconCitation: string;
}>;
export type CampaignCharter = Readonly<{
  schema: string;
  revision: number;
  goal: string;
  allowedSkills: readonly string[];
  queue: readonly CampaignQueueItem[];
  recoverLimit: number;
  reopenLimit: number;
  sessionRetention: number;
  clauses: readonly string[];
}>;
export type CampaignRecon = Readonly<{
  schema: string;
  findings: readonly string[];
  citations: readonly string[];
}>;
export type CampaignManifest = Readonly<{
  schema: string;
  campaignId: string;
  sessionId: string;
  charterRevision: number;
  queue: readonly CampaignQueueItem[];
}>;
export type ConvergenceIncident = Readonly<{
  schema: string;
  id: string;
  description: string;
  skills: readonly string[];
  requiresPerson: boolean;
}>;
export type CampaignState = Readonly<{
  state: CampaignStateName;
  charter: CampaignCharter | null;
  recon: CampaignRecon | null;
  queue: readonly CampaignQueueItem[];
  charterRevision: number;
  approved: boolean;
  incident: ConvergenceIncident | null;
  steering: SteeringState;
  completed: number;
  total: number;
}>;

export type AgentCampaignEvent =
  | Readonly<{ channel: "agent"; op: typeof A.open | typeof A.next | typeof A.report | typeof A.status }>
  | Readonly<{ channel: "agent"; op: typeof A.recon; recon: CampaignRecon }>
  | Readonly<{ channel: "agent"; op: typeof A.propose; charter: CampaignCharter }>
  | Readonly<{ channel: "agent"; op: typeof A.incident; incident: ConvergenceIncident }>;
export type CampaignOperatorCommand =
  | Readonly<{ channel: "operator"; op: typeof O.decide; action: typeof D[keyof typeof D]; charterRevision: number }>
  | Readonly<{ channel: "operator"; op: typeof O.amend; charter: CampaignCharter }>
  | Readonly<{ channel: "operator"; op: typeof O.answer; incidentId: string; answer: string }>
  | Readonly<{ channel: "operator"; op: typeof O.checkpoint | typeof O.stop }>;
export type EngineCommand =
  | Readonly<{ channel: "engine"; op: typeof E.verify; passed: boolean; clause: string }>
  | Readonly<{ channel: "engine"; op: Exclude<typeof E[keyof typeof E], typeof E.verify>; clause: string }>;

/** These are data claims, not authority. Parsing never produces a live event. */
export type CampaignEventDescriptor = AgentCampaignEvent | CampaignOperatorCommand | EngineCommand;
// Type-only brands do not exist as reflectable properties. Runtime membership
// is held privately by the engine, never by the serialized state or record.
declare const operatorBrand: unique symbol;
declare const engineBrand: unique symbol;
export type OperatorEventCapability = Readonly<{ [operatorBrand]: true }>;
export type EngineEventCapability = Readonly<{ [engineBrand]: true }>;
export type OperatorCampaignEvent = CampaignOperatorCommand & Readonly<{ [operatorBrand]: true }>;
export type EngineCampaignEvent = EngineCommand & Readonly<{ [engineBrand]: true }>;
export type CampaignEvent = AgentCampaignEvent | OperatorCampaignEvent | EngineCampaignEvent;

export type CampaignTraceEntry = Readonly<{
  seq: number;
  from: CampaignStateName;
  to: CampaignStateName;
  trigger: CampaignEventDescriptor["op"] | "none";
  decision: CampaignDecision;
  signal: CampaignSignal;
  charterRevision: number;
  charterClause: string | null;
  skills: readonly string[];
  phase: CampaignPhase;
  workUnit: string | null;
  /** True if this row attempts an operator-only command, or its before/after
   * state awaits a charter decision or a human-required convergence answer.
   * Includes refused/no-op rows and the row resolving/ending a human gate.
   * False for automatic convergence alone and for later terminal observations,
   * even if terminal snapshots retain an incident. Not proof of authority,
   * acceptance, or that a person actually acted; consult channel/accepted and
   * trusted evidence for those separate questions. */
  personRequired: boolean;
  channel: CampaignChannel;
  accepted: boolean;
}>;
export type CampaignTraceRecord = Readonly<{
  schema: string;
  initial: CampaignState;
  final: CampaignState;
  events: readonly (CampaignEventDescriptor | null)[];
  trace: readonly CampaignTraceEntry[];
}>;
export type CampaignStep = Readonly<{ state: CampaignState; entry: CampaignTraceEntry }>;
export type CampaignReplay = Readonly<{
  initial: CampaignState;
  final: CampaignState;
  trace: readonly CampaignTraceEntry[];
  record: CampaignTraceRecord;
}>;
export type CampaignVerificationOptions = Readonly<{
  /** External trusted evidence, bound to the exact event AND its position. Never use channel alone. */
  authorize?: (event: CampaignOperatorCommand | EngineCommand, index: number) => boolean;
  /** Independently retained canonical record commitment; detects even removal of trailing no-ops. */
  expectedRecord?: string;
}>;
export type CampaignVerification =
  | Readonly<{ valid: true; record: CampaignTraceRecord }>
  | Readonly<{ valid: false; error: string }>;
export type ControllerStatus = Readonly<{
  schema: string;
  state: CampaignStateName;
  effective?: SteeringRung;
  progress?: Readonly<{ completed: number; total: number }>;
  transition?: Readonly<{ from: string; to: string; reason: string }>;
}>;
