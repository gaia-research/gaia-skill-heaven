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

import {
  CHARTER_AUTHORITY_SPLIT_TEMPLATE,
  type CampaignProposeResult,
} from "./ops/propose.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./ops/status.js";
import { renderControlStrategy } from "./render.js";
import {
  CampaignStore,
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
  const normalizedOptIn =
    typeof rawOptIn === "string" ? rawOptIn.trim().toLowerCase() : "";
  const optIn =
    normalizedOptIn === OPERATOR_MULTIPLEXED_OPT_IN_VALUE ||
    normalizedOptIn === "1" ||
    normalizedOptIn === "true";
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

function buildElicitationPrompt(
  charter: CampaignCharter,
  shortDigest: string,
  opEnv: OperatorEnvironment,
  defaultChoice: OperatorDecisionChoice,
): ElicitationFormRequest {
  const digestInstruction =
    opEnv.multiplexed && opEnv.optIn
      ? `\nMultiplexed opt-in is active: type the charter short digest (${shortDigest}) in 'digest' to confirm.`
      : "";
  const message =
    `Campaign charter decision (r${charter.revision})\n` +
    `Goal: ${charter.goal}\n` +
    `Short digest: ${shortDigest}\n` +
    `Channel: ${opEnv.channel} · Attribution: ${opEnv.attribution} · Multiplexed: ${opEnv.multiplexed}` +
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
  };
  const required = ["decision"];

  if (opEnv.multiplexed && opEnv.optIn) {
    properties.digest = {
      type: "string",
      title: "Charter short digest",
      description: `Type ${shortDigest} to confirm.`,
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

  let nextClauses = currentCharter.clauses;
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
    nextClauses = parsed.value;
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
      humanOnly = [
        ...new Set([
          ...CHARTER_AUTHORITY_SPLIT_TEMPLATE.humanOnly,
          ...parsed.value,
        ]),
      ];
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

  const nextRevision = currentState.charterRevision + 1;
  const nextCharter: CampaignCharter = immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: nextRevision,
    goal: nextGoal,
    allowedSkills: [...nextAllowedSkills],
    queue: [...currentState.queue],
    recoverLimit: recover.value,
    reopenLimit: reopen.value,
    sessionRetention: retention.value,
    clauses: [...nextClauses],
  });

  const templateBase = {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: nextRevision,
    reconId: currentStrategy.reconId,
    goal: nextCharter.goal,
    phases: [...currentStrategy.charterTemplate.phases],
    arsenal: [...currentStrategy.charterTemplate.arsenal],
    authority: nextAuthority,
    recoverLimit: nextCharter.recoverLimit,
    reopenLimit: nextCharter.reopenLimit,
    sessionRetention: nextCharter.sessionRetention,
    checkpoints: [...nextCheckpoints],
    stops: [...nextStops],
    clauses: [...nextCharter.clauses],
  };

  const charterSha256 = campaignSha256Hex(
    canonicalCampaignJson({
      charter: nextCharter,
      templateBase,
      manifest: currentStrategy.manifest,
    }),
  );
  const shortDigest = charterSha256.slice(0, 12);

  const charterTemplate: CampaignCharterTemplate = immutableSnapshot({
    ...templateBase,
    charterSha256,
    shortDigest,
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

  // Check 3: MCP elicitation prompt.
  const defaultChoice =
    mode === OperatorVerbs.amend
      ? OperatorDecisionChoices.amend
      : OperatorDecisionChoices.approve;
  const promptRequest = buildElicitationPrompt(
    store.state.charter,
    strategy.shortDigest,
    opEnv,
    defaultChoice,
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

  // Check 4 (FD-11 / D-010): Under multiplexed opt-in, typed digest must match shortDigest.
  if (opEnv.multiplexed && opEnv.optIn) {
    const content = isPlainObject(response.content) ? response.content : {};
    const rawDigest =
      content.digest ?? content.charterDigest ?? content.shortDigest;
    const typed = typeof rawDigest === "string" ? rawDigest.trim() : "";
    if (
      typed.length === 0 ||
      (typed !== strategy.shortDigest && typed !== strategy.charterSha256)
    ) {
      const operatorEntry: OperatorLogEntry = immutableSnapshot({
        seq: store.trace.length,
        op: mode,
        charterRevision: store.state.charterRevision,
        charterSha256: strategy.charterSha256,
        shortDigest: strategy.shortDigest,
        attribution: opEnv.attribution,
        channel: opEnv.channel,
        multiplexed: true,
        optIn: true,
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
          message:
            "The typed charter digest did not match the presented charter short digest.",
          retryable: false,
        },
      });
    }
  }

  // Check 5: Decision choice on accept.
  const content = isPlainObject(response.content) ? response.content : {};
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
  const reconRaw = await store.loadReconArtifact(strategy.reconId);
  if (!reconRaw) {
    return simpleRefuse(
      "unknown-recon-record",
      `No committed recon record found for "${strategy.reconId}".`,
    );
  }

  const mergedAmendment: Record<string, unknown> = {
    ...(isPlainObject(content) ? content : {}),
    ...(options.amendment ?? {}),
  };
  const amended = applyAmendment(
    strategy,
    store.state,
    reconRaw as unknown as CampaignReconRecordInput,
    mergedAmendment,
  );
  if (!amended.ok) {
    return simpleRefuse(amended.code, amended.message);
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
