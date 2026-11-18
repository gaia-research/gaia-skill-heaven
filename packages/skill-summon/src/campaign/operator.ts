import { lstat } from "node:fs/promises";

import {
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  DecisionActions,
  ElicitationActions,
  MULTIPLEXER_ENV_VARS,
  OPERATOR_ATTRIBUTION,
  OPERATOR_CHANNEL_MCP_ELICITATION,
  OPERATOR_MULTIPLEXED_OPT_IN_ENV,
  OPERATOR_MULTIPLEXED_OPT_IN_VALUE,
  OperatorDecisionChoices,
  OperatorVerbs,
  campaignSha256Hex,
  canonicalCampaignJson,
  createCampaignOperatorAdapter,
  createCampaignOperatorEvent,
  immutableSnapshot,
  toControllerStatus,
  type CampaignCharter,
  type CampaignReconRecordInput,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
  type ElicitationAction,
  type OperatorDecisionChoice,
} from "skill-zero";

import { assertConfinedPath } from "../summon/session.js";
import { type CampaignProposeResult } from "./ops/propose.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./ops/status.js";
import { renderControlStrategy } from "./render.js";
import {
  CampaignStore,
  computeCharterCoreSha256,
  formatCharterSha256Clause,
  stripSelfCharterShaClause,
  type CampaignCharterTemplate,
  type PersistedCampaignCharterStrategy,
} from "./store.js";

export type OperatorEnvironment = Readonly<{
  attribution: typeof OPERATOR_ATTRIBUTION;
  channel: typeof OPERATOR_CHANNEL_MCP_ELICITATION;
  multiplexed: boolean;
  optIn: boolean;
  detectedMultiplexerVars: readonly string[];
}>;

export type ElicitationFormRequest = Readonly<{
  message: string;
  requestedSchema: Record<string, unknown>;
}>;

export type ElicitationResponse = Readonly<{
  action: ElicitationAction;
  content?: Record<string, unknown>;
}>;

export type ElicitationClient = (
  request: ElicitationFormRequest,
) => Promise<ElicitationResponse>;

export type OperatorCharterAmendment = Readonly<{
  goal?: string;
  recoverLimit?: number;
  recoverBound?: number;
  reopenLimit?: number;
  reopenBound?: number;
  sessionRetention?: number;
  pauseWindow?: number;
  allowedSkills?: readonly string[];
  clauses?: readonly string[];
  checkpoints?: readonly string[];
  stops?: readonly string[];
  authority?: {
    automatic?: readonly string[];
    humanOnly?: readonly string[];
  };
  queue?: unknown;
}>;

export type OperatorDecisionOptions = Readonly<{
  elicit: ElicitationClient;
  env?: NodeJS.ProcessEnv;
  amendment?: OperatorCharterAmendment;
  stopOnContentDecline?: boolean;
}>;

export type OperatorLogEntry = Readonly<{
  seq: number;
  op: typeof OperatorVerbs[keyof typeof OperatorVerbs];
  decision?: OperatorDecisionChoice | "cancel";
  charterRevision: number;
  charterSha256?: string;
  shortDigest?: string;
  attribution: typeof OPERATOR_ATTRIBUTION;
  channel: typeof OPERATOR_CHANNEL_MCP_ELICITATION;
  multiplexed: boolean;
  optIn: boolean;
  elicitationAction: ElicitationAction;
  accepted: boolean;
  refused: boolean;
  reason?: string;
  recordedAt: string;
}>;

export type OperatorDecisionResult =
  | Readonly<{
      ok: true;
      refused: false;
      noDecision: false;
      op: typeof OperatorVerbs.decide | typeof OperatorVerbs.amend;
      decision: OperatorDecisionChoice;
      elicitationAction: typeof ElicitationActions.accept;
      operatorEntry: OperatorLogEntry;
      charter?: CampaignCharter;
      charterTemplate?: CampaignCharterTemplate;
      charterSha256?: string;
      shortDigest?: string;
      rendered: string;
      state: CampaignState;
      entry: CampaignTraceEntry;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: boolean;
      noDecision: boolean;
      reason?: string;
      elicitationAction?: ElicitationAction;
      decision?: OperatorDecisionChoice | "cancel";
      operatorEntry?: OperatorLogEntry;
      rendered?: string;
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
      error?: CampaignRefusalError;
    }>;

export function inspectOperatorEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): OperatorEnvironment {
  const detectedVars = MULTIPLEXER_ENV_VARS.filter((key) => {
    const val = env[key];
    return typeof val === "string" && val.trim().length > 0;
  });
  const multiplexed = detectedVars.length > 0;
  const rawOptIn = env[OPERATOR_MULTIPLEXED_OPT_IN_ENV];
  const optIn = rawOptIn === OPERATOR_MULTIPLEXED_OPT_IN_VALUE;
  return Object.freeze({
    attribution: OPERATOR_ATTRIBUTION,
    channel: OPERATOR_CHANNEL_MCP_ELICITATION,
    multiplexed,
    optIn,
    detectedMultiplexerVars: Object.freeze(detectedVars),
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function parseNonEmptyStringArray(
  v: unknown,
  field: string,
): { ok: true; value: readonly string[] } | { ok: false; message: string } {
  if (!Array.isArray(v)) {
    return { ok: false, message: `Amended '${field}' must be an array of strings.` };
  }
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return {
        ok: false,
        message: `Amended '${field}' must contain non-empty strings.`,
      };
    }
    out.push(item.trim());
  }
  return { ok: true, value: Object.freeze(out) };
}

function resolveAmendedBound(
  primary: unknown,
  alias: unknown,
  fallback: number,
  primaryName: string,
  aliasName: string,
): { ok: true; value: number } | { ok: false; message: string } {
  if (primary === undefined && alias === undefined) {
    return { ok: true, value: fallback };
  }
  const parseBound = (v: unknown, name: string): number | null =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;

  let pVal: number | undefined;
  if (primary !== undefined) {
    const parsed = parseBound(primary, primaryName);
    if (parsed === null) {
      return {
        ok: false,
        message: `Amended bound '${primaryName}' must be a non-negative integer.`,
      };
    }
    pVal = parsed;
  }

  let aVal: number | undefined;
  if (alias !== undefined) {
    const parsed = parseBound(alias, aliasName);
    if (parsed === null) {
      return {
        ok: false,
        message: `Amended bound '${aliasName}' must be a non-negative integer.`,
      };
    }
    aVal = parsed;
  }

  if (pVal !== undefined && aVal !== undefined && pVal !== aVal) {
    return {
      ok: false,
      message: `Conflicting amended values for '${primaryName}' (${pVal}) and '${aliasName}' (${aVal}).`,
    };
  }
  return { ok: true, value: (pVal ?? aVal)! };
}

const AMENDMENT_KEYS = [
  "goal",
  "recoverLimit",
  "recoverBound",
  "reopenLimit",
  "reopenBound",
  "sessionRetention",
  "pauseWindow",
  "allowedSkills",
  "clauses",
  "checkpoints",
  "stops",
  "authority",
  "queue",
] as const;

function hasAmendmentFields(
  amendment: OperatorCharterAmendment | Record<string, unknown> | undefined,
): amendment is OperatorCharterAmendment | Record<string, unknown> {
  if (!isPlainObject(amendment)) return false;
  return AMENDMENT_KEYS.some(
    (key) => Object.hasOwn(amendment, key) && amendment[key] !== undefined,
  );
}

function parseStringListOrArray(v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    if (v.trim().length === 0) return undefined;
    return v
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return v;
}

function parseBoundOrString(v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.length === 0) return undefined;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    return v;
  }
  return v;
}

function mergeOperatorAmendment(
  optionsAmendment: OperatorCharterAmendment | Record<string, unknown> | undefined,
  content: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = isPlainObject(optionsAmendment)
    ? { ...optionsAmendment }
    : {};
  const opFields: Record<string, unknown> = {};

  if (Object.hasOwn(content, "goal") && content.goal !== undefined) {
    if (typeof content.goal === "string") {
      if (content.goal.trim().length > 0) {
        opFields.goal = content.goal.trim();
      }
    } else {
      opFields.goal = content.goal;
    }
  }

  const recoverLimit = parseBoundOrString(content.recoverLimit);
  if (recoverLimit !== undefined) {
    opFields.recoverLimit = recoverLimit;
    if (content.recoverBound === undefined) delete base.recoverBound;
  }
  const recoverBound = parseBoundOrString(content.recoverBound);
  if (recoverBound !== undefined) {
    opFields.recoverBound = recoverBound;
    if (content.recoverLimit === undefined) delete base.recoverLimit;
  }

  const reopenLimit = parseBoundOrString(content.reopenLimit);
  if (reopenLimit !== undefined) {
    opFields.reopenLimit = reopenLimit;
    if (content.reopenBound === undefined) delete base.reopenBound;
  }
  const reopenBound = parseBoundOrString(content.reopenBound);
  if (reopenBound !== undefined) {
    opFields.reopenBound = reopenBound;
    if (content.reopenLimit === undefined) delete base.reopenLimit;
  }

  const sessionRetention = parseBoundOrString(content.sessionRetention);
  if (sessionRetention !== undefined) {
    opFields.sessionRetention = sessionRetention;
    if (content.pauseWindow === undefined) delete base.pauseWindow;
  }
  const pauseWindow = parseBoundOrString(content.pauseWindow);
  if (pauseWindow !== undefined) {
    opFields.pauseWindow = pauseWindow;
    if (content.sessionRetention === undefined) delete base.sessionRetention;
  }

  for (const listKey of ["allowedSkills", "clauses", "checkpoints", "stops"] as const) {
    if (Object.hasOwn(content, listKey)) {
      const parsed = parseStringListOrArray(content[listKey]);
      if (parsed !== undefined) {
        opFields[listKey] = parsed;
      }
    }
  }

  if (Object.hasOwn(content, "queue") && content.queue !== undefined) {
    opFields.queue = content.queue;
  }

  if (
    Object.hasOwn(content, "authority") &&
    content.authority !== undefined &&
    !isPlainObject(content.authority)
  ) {
    opFields.authority = content.authority;
  } else {
    const baseAuth = isPlainObject(base.authority) ? base.authority : {};
    const contentAuth = isPlainObject(content.authority) ? content.authority : {};
    const opAuto = parseStringListOrArray(
      content.automatic !== undefined ? content.automatic : contentAuth.automatic,
    );
    const opHumanOnly = parseStringListOrArray(
      content.humanOnly !== undefined ? content.humanOnly : contentAuth.humanOnly,
    );
    if (
      opAuto !== undefined ||
      opHumanOnly !== undefined ||
      isPlainObject(base.authority) ||
      isPlainObject(content.authority)
    ) {
      opFields.authority = {
        ...baseAuth,
        ...contentAuth,
        ...(opAuto !== undefined ? { automatic: opAuto } : {}),
        ...(opHumanOnly !== undefined ? { humanOnly: opHumanOnly } : {}),
      };
    }
  }

  return {
    ...base,
    ...opFields,
  };
}

function hasOperatorAmendmentOverrides(
  content: Record<string, unknown>,
): boolean {
  if (Object.hasOwn(content, "goal") && content.goal !== undefined) {
    if (typeof content.goal !== "string" || content.goal.trim().length > 0) {
      return true;
    }
  }
  for (const boundKey of [
    "recoverLimit",
    "recoverBound",
    "reopenLimit",
    "reopenBound",
    "sessionRetention",
    "pauseWindow",
  ] as const) {
    if (parseBoundOrString(content[boundKey]) !== undefined) {
      return true;
    }
  }
  for (const listKey of [
    "allowedSkills",
    "clauses",
    "checkpoints",
    "stops",
  ] as const) {
    if (
      Object.hasOwn(content, listKey) &&
      parseStringListOrArray(content[listKey]) !== undefined
    ) {
      return true;
    }
  }
  if (Object.hasOwn(content, "queue") && content.queue !== undefined) {
    return true;
  }
  if (Object.hasOwn(content, "authority") && content.authority !== undefined) {
    if (!isPlainObject(content.authority)) {
      return true;
    }
    if (
      parseStringListOrArray(content.authority.automatic) !== undefined ||
      parseStringListOrArray(content.authority.humanOnly) !== undefined
    ) {
      return true;
    }
  }
  if (
    parseStringListOrArray(content.automatic) !== undefined ||
    parseStringListOrArray(content.humanOnly) !== undefined
  ) {
    return true;
  }
  return false;
}

function buildElicitationPrompt(
  charter: CampaignCharter,
  shortDigest: string,
  rendered: string,
  opEnv: OperatorEnvironment,
  defaultChoice: OperatorDecisionChoice,
  candidateAmendment?: {
    nextCharter: CampaignCharter;
    nextStrategy: PersistedCampaignCharterStrategy;
    nextRendered: string;
  },
): ElicitationFormRequest {
  const candidateSection = candidateAmendment
    ? `\n\nProposed Amendment (r${candidateAmendment.nextCharter.revision}, resulting shortDigest: ${candidateAmendment.nextStrategy.shortDigest}):\n${candidateAmendment.nextRendered}\n\nTo confirm this proposed amendment, type its resulting short digest (${candidateAmendment.nextStrategy.shortDigest}) in 'digest' (or enter replacement amendment fields directly in the form).`
    : "";
  const digestOptions = candidateAmendment
    ? `${shortDigest} or ${candidateAmendment.nextStrategy.shortDigest}`
    : shortDigest;
  const digestInstruction =
    opEnv.multiplexed && opEnv.optIn
      ? `\n\nMultiplexed opt-in is active: type the charter short digest (${digestOptions}) in 'digest' to confirm.`
      : "";
  const message =
    `Campaign charter decision (r${charter.revision})\n` +
    `Short digest: ${shortDigest}\n` +
    `Channel: ${opEnv.channel} · Attribution: ${opEnv.attribution} · Multiplexed: ${opEnv.multiplexed}\n\n` +
    rendered +
    candidateSection +
    digestInstruction;

  const properties: Record<string, unknown> = {
    decision: {
      type: "string",
      title: "Decision",
      description: "Choose approve, amend, or decline.",
      enum: [
        OperatorDecisionChoices.approve,
        OperatorDecisionChoices.amend,
        OperatorDecisionChoices.decline,
      ],
      default: defaultChoice,
    },
    goal: {
      type: "string",
      title: "Amended goal",
      description: "Optional replacement goal (used when decision is amend).",
    },
    recoverLimit: {
      type: "integer",
      minimum: 0,
      title: "Amended recoverLimit",
      description: "Optional non-negative integer recoverLimit (used when decision is amend).",
    },
    reopenLimit: {
      type: "integer",
      minimum: 0,
      title: "Amended reopenLimit",
      description: "Optional non-negative integer reopenLimit (used when decision is amend).",
    },
    sessionRetention: {
      type: "integer",
      minimum: 0,
      title: "Amended sessionRetention",
      description: "Optional non-negative integer sessionRetention (used when decision is amend).",
    },
    allowedSkills: {
      type: "string",
      title: "Amended allowedSkills",
      description: "Optional comma- or newline-separated skill IDs (used when decision is amend).",
    },
    clauses: {
      type: "string",
      title: "Amended clauses",
      description: "Optional comma- or newline-separated charter clauses (used when decision is amend).",
    },
    checkpoints: {
      type: "string",
      title: "Amended checkpoints",
      description: "Optional comma- or newline-separated checkpoints (used when decision is amend).",
    },
    stops: {
      type: "string",
      title: "Amended stops",
      description: "Optional comma- or newline-separated stop conditions (used when decision is amend).",
    },
    automatic: {
      type: "string",
      title: "Amended automatic authority",
      description: "Optional comma- or newline-separated automatic operations (used when decision is amend).",
    },
    humanOnly: {
      type: "string",
      title: "Amended humanOnly authority",
      description: "Optional comma- or newline-separated human-only operations (used when decision is amend).",
    },
  };
  const required = ["decision"];

  if (candidateAmendment !== undefined || (opEnv.multiplexed && opEnv.optIn)) {
    properties.digest = {
      type: "string",
      title: "Charter short digest",
      description: candidateAmendment
        ? `Type ${candidateAmendment.nextStrategy.shortDigest} to confirm the proposed amendment (or ${shortDigest} if approving current charter).`
        : `Type ${shortDigest} to confirm.`,
    };
    required.push("digest");
  }

  return {
    message,
    requestedSchema: {
      type: "object",
      properties,
      required,
    },
  };
}

function buildAmendmentConfirmationPrompt(
  currentCharter: CampaignCharter,
  currentShortDigest: string,
  opEnv: OperatorEnvironment,
  resultingCharter: CampaignCharter,
  resultingStrategy: PersistedCampaignCharterStrategy,
  resultingRendered: string,
): ElicitationFormRequest {
  const message =
    `Campaign charter amendment confirmation (r${currentCharter.revision} -> r${resultingCharter.revision})\n` +
    `Previous short digest: ${currentShortDigest}\n` +
    `Channel: ${opEnv.channel} · Attribution: ${opEnv.attribution} · Multiplexed: ${opEnv.multiplexed}\n\n` +
    `Resulting Amended Charter (r${resultingCharter.revision}, resulting shortDigest: ${resultingStrategy.shortDigest}):\n` +
    `${resultingRendered}\n\n` +
    `To confirm this resulting amended charter, type its resulting short digest (${resultingStrategy.shortDigest}) in 'digest'.`;

  return {
    message,
    requestedSchema: {
      type: "object",
      properties: {
        decision: {
          type: "string",
          title: "Decision",
          description: "Choose amend or decline.",
          enum: [
            OperatorDecisionChoices.amend,
            OperatorDecisionChoices.decline,
          ],
          default: OperatorDecisionChoices.amend,
        },
        digest: {
          type: "string",
          title: "Resulting charter short digest",
          description: `Type ${resultingStrategy.shortDigest} to confirm the resulting amended charter.`,
        },
      },
      required: ["decision", "digest"],
    },
  };
}

function applyAmendment(
  currentStrategy: PersistedCampaignCharterStrategy,
  currentState: CampaignState,
  reconRecord: CampaignReconRecordInput,
  amendment: OperatorCharterAmendment | Record<string, unknown>,
):
  | {
      ok: true;
      nextCharter: CampaignCharter;
      nextStrategy: PersistedCampaignCharterStrategy;
    }
  | { ok: false; code: string; message: string } {
  const currentCharter = currentState.charter!;
  if (
    Object.hasOwn(amendment, "queue") &&
    amendment.queue !== undefined &&
    canonicalCampaignJson(amendment.queue) !==
      canonicalCampaignJson(currentState.queue)
  ) {
    return {
      ok: false,
      code: "cannot-alter-queue-on-amend",
      message: "Amending a charter must keep the existing queue intact.",
    };
  }

  let nextGoal = currentCharter.goal;
  if (amendment.goal !== undefined) {
    if (typeof amendment.goal !== "string" || amendment.goal.trim().length === 0) {
      return {
        ok: false,
        code: "invalid-amendment",
        message: "Amended 'goal' must be a non-empty string.",
      };
    }
    nextGoal = amendment.goal.trim();
  }

  const recover = resolveAmendedBound(
    amendment.recoverLimit,
    amendment.recoverBound,
    currentCharter.recoverLimit,
    "recoverLimit",
    "recoverBound",
  );
  if (!recover.ok) {
    return { ok: false, code: "invalid-charter-bound", message: recover.message };
  }

  const reopen = resolveAmendedBound(
    amendment.reopenLimit,
    amendment.reopenBound,
    currentCharter.reopenLimit,
    "reopenLimit",
    "reopenBound",
  );
  if (!reopen.ok) {
    return { ok: false, code: "invalid-charter-bound", message: reopen.message };
  }

  const retention = resolveAmendedBound(
    amendment.sessionRetention,
    amendment.pauseWindow,
    currentCharter.sessionRetention,
    "sessionRetention",
    "pauseWindow",
  );
  if (!retention.ok) {
    return { ok: false, code: "invalid-charter-bound", message: retention.message };
  }

  const nextRevision = currentState.charterRevision + 1;

  let nextClauses: readonly string[] = currentCharter.clauses.filter(
    (c) => !/^charter-sha256:r\d+:[0-9a-f]{64}$/.test(c),
  );
  if (amendment.clauses !== undefined) {
    const parsed = parseNonEmptyStringArray(amendment.clauses, "clauses");
    if (!parsed.ok) {
      return { ok: false, code: "invalid-amendment", message: parsed.message };
    }
    if (parsed.value.length === 0) {
      return {
        ok: false,
        code: "invalid-amendment",
        message: "Amended 'clauses' cannot be empty.",
      };
    }
    nextClauses = stripSelfCharterShaClause(nextRevision, parsed.value);
  }

  let nextCheckpoints = currentStrategy.charterTemplate.checkpoints;
  if (amendment.checkpoints !== undefined) {
    const parsed = parseNonEmptyStringArray(amendment.checkpoints, "checkpoints");
    if (!parsed.ok) {
      return { ok: false, code: "invalid-amendment", message: parsed.message };
    }
    nextCheckpoints = parsed.value;
  }

  let nextStops = currentStrategy.charterTemplate.stops;
  if (amendment.stops !== undefined) {
    const parsed = parseNonEmptyStringArray(amendment.stops, "stops");
    if (!parsed.ok) {
      return { ok: false, code: "invalid-amendment", message: parsed.message };
    }
    nextStops = parsed.value;
  }

  let nextAuthority = currentStrategy.charterTemplate.authority;
  if (amendment.authority !== undefined) {
    if (!isPlainObject(amendment.authority)) {
      return {
        ok: false,
        code: "invalid-amendment",
        message: "Amended 'authority' must be a plain object.",
      };
    }
    let auto = currentStrategy.charterTemplate.authority.automatic;
    if (amendment.authority.automatic !== undefined) {
      const parsed = parseNonEmptyStringArray(
        amendment.authority.automatic,
        "authority.automatic",
      );
      if (!parsed.ok) {
        return { ok: false, code: "invalid-amendment", message: parsed.message };
      }
      auto = parsed.value;
    }
    let humanOnly = currentStrategy.charterTemplate.authority.humanOnly;
    if (amendment.authority.humanOnly !== undefined) {
      const parsed = parseNonEmptyStringArray(
        amendment.authority.humanOnly,
        "authority.humanOnly",
      );
      if (!parsed.ok) {
        return { ok: false, code: "invalid-amendment", message: parsed.message };
      }
      if (parsed.value.length === 0) {
        return {
          ok: false,
          code: "invalid-amendment",
          message: "Amended 'authority.humanOnly' cannot be empty.",
        };
      }
      humanOnly = [...new Set(parsed.value)];
    }
    nextAuthority = { automatic: auto, humanOnly };
  }

  const reconCandidateIds = new Set<string>();
  for (const gap of reconRecord.gaps) {
    if (gap.status === "matched" && !gap.refused) {
      for (const c of gap.candidates) {
        reconCandidateIds.add(c.id);
      }
    }
  }

  let nextAllowedSkills = currentCharter.allowedSkills;
  if (amendment.allowedSkills !== undefined) {
    const parsed = parseNonEmptyStringArray(
      amendment.allowedSkills,
      "allowedSkills",
    );
    if (!parsed.ok) {
      return { ok: false, code: "invalid-amendment", message: parsed.message };
    }
    const deduped = [...new Set(parsed.value)];
    for (const skill of deduped) {
      if (!reconCandidateIds.has(skill)) {
        return {
          ok: false,
          code: "untraced-allowed-skill",
          message: `Amended allowedSkills entry "${skill}" does not trace to recon "${reconRecord.reconId}".`,
        };
      }
    }
    for (const q of currentState.queue) {
      if (!deduped.includes(q.skill)) {
        return {
          ok: false,
          code: "invalid-amendment",
          message: `Queue skill "${q.skill}" must remain in allowedSkills.`,
        };
      }
    }
    nextAllowedSkills = deduped;
  }

  const baseCharter: CampaignCharter = {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: nextRevision,
    goal: nextGoal,
    allowedSkills: [...nextAllowedSkills],
    queue: [...currentState.queue],
    recoverLimit: recover.value,
    reopenLimit: reopen.value,
    sessionRetention: retention.value,
    clauses: [...nextClauses],
  };

  const templateBase = {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: nextRevision,
    reconId: currentStrategy.reconId,
    goal: baseCharter.goal,
    phases: [...currentStrategy.charterTemplate.phases],
    arsenal: [...currentStrategy.charterTemplate.arsenal],
    allowedSkills: [...baseCharter.allowedSkills],
    queue: [...baseCharter.queue],
    authority: nextAuthority,
    recoverLimit: baseCharter.recoverLimit,
    reopenLimit: baseCharter.reopenLimit,
    sessionRetention: baseCharter.sessionRetention,
    checkpoints: [...nextCheckpoints],
    stops: [...nextStops],
    clauses: [...baseCharter.clauses],
  };

  const charterSha256 = campaignSha256Hex(
    canonicalCampaignJson({
      charter: baseCharter,
      templateBase,
      manifest: currentStrategy.manifest,
    }),
  );
  const shortDigest = charterSha256.slice(0, 12);

  const baseCharterTemplate: CampaignCharterTemplate = {
    ...templateBase,
    charterSha256,
    shortDigest,
  };

  const coreSha256 = computeCharterCoreSha256({
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    reconId: currentStrategy.reconId,
    charter: baseCharter,
    charterTemplate: baseCharterTemplate,
    manifest: currentStrategy.manifest,
  });
  const shaClause = formatCharterSha256Clause(nextRevision, coreSha256);

  const nextCharter: CampaignCharter = immutableSnapshot({
    ...baseCharter,
    clauses: [...baseCharter.clauses, shaClause],
  });

  const charterTemplate: CampaignCharterTemplate = immutableSnapshot({
    ...baseCharterTemplate,
    clauses: [...baseCharterTemplate.clauses, shaClause],
  });

  const nextStrategy: PersistedCampaignCharterStrategy = immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    charter: nextCharter,
    charterTemplate,
    manifest: currentStrategy.manifest,
    reconId: currentStrategy.reconId,
    charterSha256,
    shortDigest,
  });

  return { ok: true, nextCharter, nextStrategy };
}

async function runOperatorDecisionFlow(
  session: { readonly root: string },
  mode: typeof OperatorVerbs.decide | typeof OperatorVerbs.amend,
  options: OperatorDecisionOptions,
): Promise<OperatorDecisionResult> {
  const store = await CampaignStore.load(session.root);
  const currentStatus = toControllerStatus(store.state, store.trace.at(-1));
  const currentDigest = buildCampaignDigest(store.state, currentStatus);
  const opEnv = inspectOperatorEnvironment(options.env);

  const simpleRefuse = (
    code: string,
    message: string,
    reason?: string,
  ): OperatorDecisionResult =>
    immutableSnapshot({
      ok: false,
      refused: true,
      noDecision: true,
      ...(reason !== undefined ? { reason } : {}),
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
      error: { code, message, retryable: false },
    });

  if (store.corrupted) {
    return simpleRefuse(
      "campaign-corrupted",
      store.error ?? "Campaign trace failed verification (FAILED_SAFE).",
    );
  }

  if (mode === OperatorVerbs.decide) {
    if (
      store.state.state !== CampaignStates.decisions ||
      store.state.charter === null
    ) {
      return simpleRefuse(
        "invalid-campaign-state",
        `Operator decide requires DECISIONS state with a proposed charter (current state: ${store.state.state}).`,
      );
    }
  } else {
    if (
      store.state.charter === null ||
      (store.state.state !== CampaignStates.decisions &&
        store.state.state !== CampaignStates.executing &&
        store.state.state !== CampaignStates.convergence)
    ) {
      return simpleRefuse(
        "invalid-campaign-state",
        `Operator amend requires an active charter in DECISIONS, EXECUTING, or CONVERGENCE (current state: ${store.state.state}).`,
      );
    }
  }

  const strategy = await store.loadCharterStrategy();
  if (!strategy) {
    return simpleRefuse(
      "missing-charter-strategy",
      "Persisted charter strategy could not be loaded.",
    );
  }

  const rendered = renderControlStrategy({
    charterTemplate: strategy.charterTemplate,
    manifest: strategy.manifest,
    multiplexed: opEnv.multiplexed,
    optIn: opEnv.optIn,
  });

  // Check 2 (FD-11 / D-010): multiplexed environment without opt-in fails closed.
  if (opEnv.multiplexed && !opEnv.optIn) {
    const operatorEntry: OperatorLogEntry = immutableSnapshot({
      seq: store.trace.length,
      op: mode,
      charterRevision: store.state.charterRevision,
      charterSha256: strategy.charterSha256,
      shortDigest: strategy.shortDigest,
      attribution: opEnv.attribution,
      channel: opEnv.channel,
      multiplexed: true,
      optIn: false,
      elicitationAction: ElicitationActions.cancel,
      accepted: false,
      refused: true,
      reason: "multiplexed-fail-closed",
      recordedAt: new Date().toISOString(),
    });
    await store.appendOperatorLog(operatorEntry);
    return immutableSnapshot({
      ok: false,
      refused: true,
      noDecision: true,
      reason: "multiplexed-fail-closed",
      operatorEntry,
      rendered,
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
      error: {
        code: "multiplexed-fail-closed",
        message:
          "A terminal multiplexer was detected in the server environment; operator decisions fail closed by default when multiplexed.",
        retryable: false,
      },
    });
  }

  // Check 3: Pre-compute candidate amendment (if options.amendment has fields) before elicitation.
  let reconRaw: Awaited<ReturnType<typeof store.loadReconArtifact>> = null;
  let candidateAmendment:
    | {
        nextCharter: CampaignCharter;
        nextStrategy: PersistedCampaignCharterStrategy;
        nextRendered: string;
      }
    | undefined;

  if (hasAmendmentFields(options.amendment)) {
    reconRaw = await store.loadReconArtifact(strategy.reconId);
    if (!reconRaw) {
      return simpleRefuse(
        "unknown-recon-record",
        `No committed recon record found for "${strategy.reconId}".`,
      );
    }
    const precomputed = applyAmendment(
      strategy,
      store.state,
      reconRaw as unknown as CampaignReconRecordInput,
      options.amendment,
    );
    if (!precomputed.ok) {
      return simpleRefuse(precomputed.code, precomputed.message);
    }
    const nextRendered = renderControlStrategy({
      charterTemplate: precomputed.nextStrategy.charterTemplate,
      manifest: precomputed.nextStrategy.manifest,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
    });
    candidateAmendment = {
      nextCharter: precomputed.nextCharter,
      nextStrategy: precomputed.nextStrategy,
      nextRendered,
    };
  }

  // MCP elicitation prompt.
  const defaultChoice =
    mode === OperatorVerbs.amend
      ? OperatorDecisionChoices.amend
      : OperatorDecisionChoices.approve;
  const promptRequest = buildElicitationPrompt(
    store.state.charter,
    strategy.shortDigest,
    rendered,
    opEnv,
    defaultChoice,
    candidateAmendment,
  );

  let response: ElicitationResponse;
  try {
    response = await options.elicit(promptRequest);
  } catch {
    response = { action: ElicitationActions.cancel };
  }

  if (
    response.action === ElicitationActions.cancel ||
    response.action === ElicitationActions.decline
  ) {
    const operatorEntry: OperatorLogEntry = immutableSnapshot({
      seq: store.trace.length,
      op: mode,
      decision:
        response.action === ElicitationActions.decline
          ? OperatorDecisionChoices.decline
          : "cancel",
      charterRevision: store.state.charterRevision,
      charterSha256: strategy.charterSha256,
      shortDigest: strategy.shortDigest,
      attribution: opEnv.attribution,
      channel: opEnv.channel,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
      elicitationAction: response.action,
      accepted: false,
      refused: false,
      reason: `elicitation-${response.action}`,
      recordedAt: new Date().toISOString(),
    });
    await store.appendOperatorLog(operatorEntry);
    return immutableSnapshot({
      ok: false,
      refused: false,
      noDecision: true,
      elicitationAction: response.action,
      decision:
        response.action === ElicitationActions.decline
          ? OperatorDecisionChoices.decline
          : "cancel",
      operatorEntry,
      rendered,
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
    });
  }

  if (response.action !== ElicitationActions.accept) {
    return simpleRefuse(
      "invalid-elicitation-action",
      `Unsupported elicitation action: ${String(response.action)}.`,
    );
  }

  const content = isPlainObject(response.content) ? response.content : {};
  const rawDigest =
    content.digest ??
    content.amendmentDigest ??
    content.charterDigest ??
    content.shortDigest;
  const typedDigest = typeof rawDigest === "string" ? rawDigest.trim() : "";

  const refuseInvalidDigest = async (
    message: string,
  ): Promise<OperatorDecisionResult> => {
    const operatorEntry: OperatorLogEntry = immutableSnapshot({
      seq: store.trace.length,
      op: mode,
      charterRevision: store.state.charterRevision,
      charterSha256: strategy.charterSha256,
      shortDigest: strategy.shortDigest,
      attribution: opEnv.attribution,
      channel: opEnv.channel,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
      elicitationAction: ElicitationActions.accept,
      accepted: false,
      refused: true,
      reason: "invalid-charter-digest",
      recordedAt: new Date().toISOString(),
    });
    await store.appendOperatorLog(operatorEntry);
    return immutableSnapshot({
      ok: false,
      refused: true,
      noDecision: true,
      reason: "invalid-charter-digest",
      elicitationAction: ElicitationActions.accept,
      operatorEntry,
      rendered,
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
      error: {
        code: "invalid-charter-digest",
        message,
        retryable: false,
      },
    });
  };

  // Check 4: Decision choice on accept.
  const rawChoice =
    content.decision ??
    content.action ??
    content.choice ??
    (mode === OperatorVerbs.amend ? OperatorDecisionChoices.amend : undefined);

  if (
    rawChoice !== OperatorDecisionChoices.approve &&
    rawChoice !== OperatorDecisionChoices.amend &&
    rawChoice !== OperatorDecisionChoices.decline
  ) {
    return simpleRefuse(
      "invalid-operator-decision",
      `Unsupported operator decision choice: ${JSON.stringify(rawChoice)}. Expected approve, amend, or decline.`,
    );
  }

  if (rawChoice === OperatorDecisionChoices.decline) {
    if (options.stopOnContentDecline === true) {
      const cap = createCampaignOperatorAdapter();
      const event = createCampaignOperatorEvent(cap, {
        channel: "operator",
        op: OperatorVerbs.decide,
        action: DecisionActions.decline,
        charterRevision: store.state.charterRevision,
        attribution: opEnv.attribution,
        operatorChannel: opEnv.channel,
        multiplexed: opEnv.multiplexed,
        optIn: opEnv.optIn,
      });
      const appended = await store.append(event);
      const operatorEntry: OperatorLogEntry = immutableSnapshot({
        seq: appended.entry.seq,
        op: OperatorVerbs.decide,
        decision: OperatorDecisionChoices.decline,
        charterRevision: appended.state.charterRevision,
        charterSha256: strategy.charterSha256,
        shortDigest: strategy.shortDigest,
        attribution: opEnv.attribution,
        channel: opEnv.channel,
        multiplexed: opEnv.multiplexed,
        optIn: opEnv.optIn,
        elicitationAction: ElicitationActions.accept,
        accepted: appended.entry.accepted,
        refused: !appended.entry.accepted,
        recordedAt: new Date().toISOString(),
      });
      await store.appendOperatorLog(operatorEntry);
      return immutableSnapshot({
        ok: true,
        refused: false,
        noDecision: false,
        op: OperatorVerbs.decide,
        decision: OperatorDecisionChoices.decline,
        elicitationAction: ElicitationActions.accept,
        operatorEntry,
        rendered,
        state: appended.state,
        entry: appended.entry,
        status: appended.status,
        digest: buildCampaignDigest(
          appended.state,
          appended.status,
          appended.entry,
        ),
      });
    }

    const operatorEntry: OperatorLogEntry = immutableSnapshot({
      seq: store.trace.length,
      op: mode,
      decision: OperatorDecisionChoices.decline,
      charterRevision: store.state.charterRevision,
      charterSha256: strategy.charterSha256,
      shortDigest: strategy.shortDigest,
      attribution: opEnv.attribution,
      channel: opEnv.channel,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
      elicitationAction: ElicitationActions.accept,
      accepted: false,
      refused: false,
      reason: "operator-declined-approval",
      recordedAt: new Date().toISOString(),
    });
    await store.appendOperatorLog(operatorEntry);
    return immutableSnapshot({
      ok: false,
      refused: false,
      noDecision: true,
      elicitationAction: ElicitationActions.accept,
      decision: OperatorDecisionChoices.decline,
      operatorEntry,
      rendered,
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
    });
  }

  if (rawChoice === OperatorDecisionChoices.approve) {
    if (opEnv.multiplexed && opEnv.optIn) {
      const matchesCurrent =
        typedDigest.length > 0 &&
        (typedDigest === strategy.shortDigest ||
          typedDigest === strategy.charterSha256);
      if (!matchesCurrent) {
        return refuseInvalidDigest(
          "The typed charter digest did not match the presented charter short digest.",
        );
      }
    }
    if (store.state.state !== CampaignStates.decisions) {
      return simpleRefuse(
        "invalid-campaign-state",
        `Operator approve requires DECISIONS state (current state: ${store.state.state}).`,
      );
    }
    // Mint U0a operator capability ONLY here, after elicitation accept + all checks.
    const cap = createCampaignOperatorAdapter();
    const event = createCampaignOperatorEvent(cap, {
      channel: "operator",
      op: OperatorVerbs.decide,
      action: DecisionActions.approve,
      charterRevision: store.state.charterRevision,
      attribution: opEnv.attribution,
      operatorChannel: opEnv.channel,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
    });
    const appended = await store.append(event);
    const operatorEntry: OperatorLogEntry = immutableSnapshot({
      seq: appended.entry.seq,
      op: OperatorVerbs.decide,
      decision: OperatorDecisionChoices.approve,
      charterRevision: appended.state.charterRevision,
      charterSha256: strategy.charterSha256,
      shortDigest: strategy.shortDigest,
      attribution: opEnv.attribution,
      channel: opEnv.channel,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
      elicitationAction: ElicitationActions.accept,
      accepted: appended.entry.accepted,
      refused: !appended.entry.accepted,
      recordedAt: new Date().toISOString(),
    });
    await store.appendOperatorLog(operatorEntry);
    return immutableSnapshot({
      ok: true,
      refused: false,
      noDecision: false,
      op: OperatorVerbs.decide,
      decision: OperatorDecisionChoices.approve,
      elicitationAction: ElicitationActions.accept,
      operatorEntry,
      charter: strategy.charter,
      charterTemplate: strategy.charterTemplate,
      charterSha256: strategy.charterSha256,
      shortDigest: strategy.shortDigest,
      rendered,
      state: appended.state,
      entry: appended.entry,
      status: appended.status,
      digest: buildCampaignDigest(
        appended.state,
        appended.status,
        appended.entry,
      ),
    });
  }

  // rawChoice === OperatorDecisionChoices.amend
  const resolvedReconRaw =
    reconRaw ?? (await store.loadReconArtifact(strategy.reconId));
  if (!resolvedReconRaw) {
    return simpleRefuse(
      "unknown-recon-record",
      `No committed recon record found for "${strategy.reconId}".`,
    );
  }

  const mergedAmendment = mergeOperatorAmendment(options.amendment, content);
  const amended = applyAmendment(
    strategy,
    store.state,
    resolvedReconRaw as unknown as CampaignReconRecordInput,
    mergedAmendment,
  );
  if (!amended.ok) {
    return simpleRefuse(amended.code, amended.message);
  }

  // Check 5 (FD-11 / D-010 & options.amendment confirmation gate):
  // Model-proposed options.amendment can NEVER be applied without explicit digest confirmation.
  const matchesCurrent =
    typedDigest.length > 0 &&
    (typedDigest === strategy.shortDigest ||
      typedDigest === strategy.charterSha256);
  const matchesCandidate =
    candidateAmendment !== undefined &&
    typedDigest.length > 0 &&
    (typedDigest === candidateAmendment.nextStrategy.shortDigest ||
      typedDigest === candidateAmendment.nextStrategy.charterSha256);
  const matchesAmended =
    typedDigest.length > 0 &&
    (typedDigest === amended.nextStrategy.shortDigest ||
      typedDigest === amended.nextStrategy.charterSha256);

  if (candidateAmendment !== undefined) {
    if (!matchesCandidate) {
      return refuseInvalidDigest(
        "Proposed amendment requires typing the resulting charter short digest shown in the prompt to confirm.",
      );
    }

    if (
      amended.nextStrategy.charterSha256 !==
      candidateAmendment.nextStrategy.charterSha256
    ) {
      // Operator edits produced a materially different resulting charter than the displayed candidate.
      // Present and confirm the resulting merged charter before applying.
      const resultingRendered = renderControlStrategy({
        charterTemplate: amended.nextStrategy.charterTemplate,
        manifest: amended.nextStrategy.manifest,
        multiplexed: opEnv.multiplexed,
        optIn: opEnv.optIn,
      });
      const confirmPrompt = buildAmendmentConfirmationPrompt(
        store.state.charter,
        strategy.shortDigest,
        opEnv,
        amended.nextCharter,
        amended.nextStrategy,
        resultingRendered,
      );

      let confirmResponse: ElicitationResponse;
      try {
        confirmResponse = await options.elicit(confirmPrompt);
      } catch {
        confirmResponse = { action: ElicitationActions.cancel };
      }

      if (
        confirmResponse.action === ElicitationActions.cancel ||
        confirmResponse.action === ElicitationActions.decline
      ) {
        const operatorEntry: OperatorLogEntry = immutableSnapshot({
          seq: store.trace.length,
          op: mode,
          decision:
            confirmResponse.action === ElicitationActions.decline
              ? OperatorDecisionChoices.decline
              : "cancel",
          charterRevision: store.state.charterRevision,
          charterSha256: strategy.charterSha256,
          shortDigest: strategy.shortDigest,
          attribution: opEnv.attribution,
          channel: opEnv.channel,
          multiplexed: opEnv.multiplexed,
          optIn: opEnv.optIn,
          elicitationAction: confirmResponse.action,
          accepted: false,
          refused: false,
          reason: `elicitation-${confirmResponse.action}`,
          recordedAt: new Date().toISOString(),
        });
        await store.appendOperatorLog(operatorEntry);
        return immutableSnapshot({
          ok: false,
          refused: false,
          noDecision: true,
          elicitationAction: confirmResponse.action,
          decision:
            confirmResponse.action === ElicitationActions.decline
              ? OperatorDecisionChoices.decline
              : "cancel",
          operatorEntry,
          rendered,
          state: store.state,
          status: currentStatus,
          digest: currentDigest,
        });
      }

      if (confirmResponse.action !== ElicitationActions.accept) {
        return simpleRefuse(
          "invalid-elicitation-action",
          `Unsupported elicitation action: ${String(confirmResponse.action)}.`,
        );
      }

      const confirmContent = isPlainObject(confirmResponse.content)
        ? confirmResponse.content
        : {};
      const confirmChoice =
        confirmContent.decision ??
        confirmContent.action ??
        confirmContent.choice ??
        OperatorDecisionChoices.amend;

      if (confirmChoice === OperatorDecisionChoices.decline) {
        const operatorEntry: OperatorLogEntry = immutableSnapshot({
          seq: store.trace.length,
          op: mode,
          decision: OperatorDecisionChoices.decline,
          charterRevision: store.state.charterRevision,
          charterSha256: strategy.charterSha256,
          shortDigest: strategy.shortDigest,
          attribution: opEnv.attribution,
          channel: opEnv.channel,
          multiplexed: opEnv.multiplexed,
          optIn: opEnv.optIn,
          elicitationAction: ElicitationActions.accept,
          accepted: false,
          refused: false,
          reason: "operator-declined-approval",
          recordedAt: new Date().toISOString(),
        });
        await store.appendOperatorLog(operatorEntry);
        return immutableSnapshot({
          ok: false,
          refused: false,
          noDecision: true,
          elicitationAction: ElicitationActions.accept,
          decision: OperatorDecisionChoices.decline,
          operatorEntry,
          rendered,
          state: store.state,
          status: currentStatus,
          digest: currentDigest,
        });
      }

      if (confirmChoice !== OperatorDecisionChoices.amend) {
        return refuseInvalidDigest(
          "Resulting amended charter requires confirming with decision 'amend' and the presented short digest.",
        );
      }

      if (hasOperatorAmendmentOverrides(confirmContent)) {
        const remerged = mergeOperatorAmendment(mergedAmendment, confirmContent);
        const reapplied = applyAmendment(
          strategy,
          store.state,
          resolvedReconRaw as unknown as CampaignReconRecordInput,
          remerged,
        );
        if (
          !reapplied.ok ||
          reapplied.nextStrategy.charterSha256 !==
            amended.nextStrategy.charterSha256
        ) {
          return refuseInvalidDigest(
            "Resulting amended charter cannot be modified during confirmation; confirm the presented short digest.",
          );
        }
      }

      const rawConfirmDigest =
        confirmContent.digest ??
        confirmContent.amendmentDigest ??
        confirmContent.charterDigest ??
        confirmContent.shortDigest;
      const confirmTypedDigest =
        typeof rawConfirmDigest === "string" ? rawConfirmDigest.trim() : "";
      const confirmMatchesAmended =
        confirmTypedDigest.length > 0 &&
        (confirmTypedDigest === amended.nextStrategy.shortDigest ||
          confirmTypedDigest === amended.nextStrategy.charterSha256);

      if (!confirmMatchesAmended) {
        return refuseInvalidDigest(
          "Resulting amended charter requires typing its presented short digest to confirm.",
        );
      }
    }
  } else if (opEnv.multiplexed && opEnv.optIn) {
    if (!matchesCurrent && !matchesAmended) {
      return refuseInvalidDigest(
        "The typed charter digest did not match the presented charter short digest.",
      );
    }
  }

  try {
    await assertConfinedPath(
      session.root,
      store.charterPath,
      "Campaign charter strategy",
    );
    const stat = await lstat(store.charterPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return simpleRefuse(
        "invalid-charter-artifact",
        `Campaign charter strategy must be a regular file: ${store.charterPath}`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return simpleRefuse(
        "invalid-charter-artifact",
        error instanceof Error
          ? error.message
          : "Campaign charter strategy path failed confinement check.",
      );
    }
  }

  // Mint U0a operator capability ONLY here, after elicitation accept + all checks.
  const cap = createCampaignOperatorAdapter();
  const appended = await store.amendCharter(
    cap,
    {
      channel: "operator",
      op: OperatorVerbs.amend,
      charter: amended.nextCharter,
      attribution: opEnv.attribution,
      operatorChannel: opEnv.channel,
      multiplexed: opEnv.multiplexed,
      optIn: opEnv.optIn,
    },
    amended.nextStrategy,
  );
  const nextRendered = renderControlStrategy({
    charterTemplate: amended.nextStrategy.charterTemplate,
    manifest: amended.nextStrategy.manifest,
    multiplexed: opEnv.multiplexed,
    optIn: opEnv.optIn,
  });
  const operatorEntry: OperatorLogEntry = immutableSnapshot({
    seq: appended.entry.seq,
    op: OperatorVerbs.amend,
    decision: OperatorDecisionChoices.amend,
    charterRevision: appended.state.charterRevision,
    charterSha256: amended.nextStrategy.charterSha256,
    shortDigest: amended.nextStrategy.shortDigest,
    attribution: opEnv.attribution,
    channel: opEnv.channel,
    multiplexed: opEnv.multiplexed,
    optIn: opEnv.optIn,
    elicitationAction: ElicitationActions.accept,
    accepted: appended.entry.accepted,
    refused: !appended.entry.accepted,
    recordedAt: new Date().toISOString(),
  });
  await store.appendOperatorLog(operatorEntry);

  return immutableSnapshot({
    ok: true,
    refused: false,
    noDecision: false,
    op: OperatorVerbs.amend,
    decision: OperatorDecisionChoices.amend,
    elicitationAction: ElicitationActions.accept,
    operatorEntry,
    charter: amended.nextCharter,
    charterTemplate: amended.nextStrategy.charterTemplate,
    charterSha256: amended.nextStrategy.charterSha256,
    shortDigest: amended.nextStrategy.shortDigest,
    rendered: nextRendered,
    state: appended.state,
    entry: appended.entry,
    status: appended.status,
    digest: buildCampaignDigest(
      appended.state,
      appended.status,
      appended.entry,
    ),
  });
}

export async function executeOperatorDecide(
  session: { readonly root: string },
  options: OperatorDecisionOptions,
): Promise<OperatorDecisionResult> {
  return runOperatorDecisionFlow(session, OperatorVerbs.decide, options);
}

export async function executeOperatorAmend(
  session: { readonly root: string },
  options: OperatorDecisionOptions,
): Promise<OperatorDecisionResult> {
  return runOperatorDecisionFlow(session, OperatorVerbs.amend, options);
}

export async function executeOperatorAnswer(
  session: { readonly root: string },
  _options: OperatorDecisionOptions,
): Promise<OperatorDecisionResult> {
  const store = await CampaignStore.load(session.root, { refreshStatus: false });
  const status = toControllerStatus(store.state, store.trace.at(-1));
  return immutableSnapshot({
    ok: false,
    refused: true,
    noDecision: true,
    state: store.state,
    status,
    digest: buildCampaignDigest(store.state, status),
    error: {
      code: "not-implemented-until-u6",
      message: "Operator answer is scheduled for U6.",
      retryable: false,
    },
  });
}

export async function executeOperatorStop(
  session: { readonly root: string },
  _options: OperatorDecisionOptions,
): Promise<OperatorDecisionResult> {
  const store = await CampaignStore.load(session.root, { refreshStatus: false });
  const status = toControllerStatus(store.state, store.trace.at(-1));
  return immutableSnapshot({
    ok: false,
    refused: true,
    noDecision: true,
    state: store.state,
    status,
    digest: buildCampaignDigest(store.state, status),
    error: {
      code: "not-implemented-until-u6",
      message: "Operator stop is scheduled for U6.",
      retryable: false,
    },
  });
}

export async function executeOperatorCheckpoint(
  session: { readonly root: string },
  _options: OperatorDecisionOptions,
): Promise<OperatorDecisionResult> {
  const store = await CampaignStore.load(session.root, { refreshStatus: false });
  const status = toControllerStatus(store.state, store.trace.at(-1));
  return immutableSnapshot({
    ok: false,
    refused: true,
    noDecision: true,
    state: store.state,
    status,
    digest: buildCampaignDigest(store.state, status),
    error: {
      code: "not-implemented-until-u6",
      message: "Operator checkpoint is scheduled for U6.",
      retryable: false,
    },
  });
}

export type { CampaignProposeResult };
