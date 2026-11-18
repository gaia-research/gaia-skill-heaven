import {
  AgentOps,
  CAMPAIGN_SCHEMA_IDS,
  CampaignStates,
  campaignSha256Hex,
  canonicalCampaignJson,
  immutableSnapshot,
  toControllerStatus,
  tryBuildCampaignManifest,
  type CampaignCharter,
  type CampaignManifest,
  type CampaignQueueItem,
  type CampaignReconRecordInput,
  type CampaignState,
  type CampaignTraceEntry,
  type ControllerStatus,
  type ReconCandidateCardInput,
  type ReconGapRecordInput,
} from "skill-zero";

import { renderControlStrategy } from "../render.js";
import {
  CampaignStore,
  type CampaignCharterArsenalItem,
  type CampaignCharterAuthoritySplit,
  type CampaignCharterTemplate,
  type PersistedCampaignCharterStrategy,
} from "../store.js";
import {
  buildCampaignDigest,
  type CampaignDigest,
  type CampaignRefusalError,
} from "./status.js";

export const CHARTER_AUTHORITY_SPLIT_TEMPLATE = Object.freeze({
  automatic: Object.freeze([
    "local commits",
    "pushes to campaign branches",
    "draft pull requests",
  ]),
  humanOnly: Object.freeze([
    "merge",
    "close",
    "release",
    "force-push",
    "deletion",
    "anything the charter lists as irreversible",
  ]),
});

const CARD_REF_RE = /^recon:([^:]+):gap:(\d+):card:(.+)$/;

export type CharterArsenalProposalItem = Readonly<{
  cardRef: string;
  id?: string;
  skill?: string;
  phase?: string;
}>;

export type CharterProposalInput = Readonly<{
  reconId?: string;
  goal?: string;
  phases?: readonly string[];
  arsenal: readonly CharterArsenalProposalItem[];
  allowedSkills?: readonly string[];
  recoverLimit: number;
  reopenLimit: number;
  sessionRetention: number;
  authority?: Partial<CampaignCharterAuthoritySplit>;
  checkpoints?: readonly string[];
  stops?: readonly string[];
  clauses?: readonly string[];
}>;

export type CampaignProposeResult =
  | Readonly<{
      ok: true;
      refused: false;
      op: typeof AgentOps.propose;
      charter: CampaignCharter;
      charterTemplate: CampaignCharterTemplate;
      manifest: CampaignManifest;
      charterSha256: string;
      shortDigest: string;
      rendered: string;
      state: CampaignState;
      entry: CampaignTraceEntry;
      status: ControllerStatus;
      digest: CampaignDigest;
    }>
  | Readonly<{
      ok: false;
      refused: true;
      op: typeof AgentOps.propose;
      state: CampaignState;
      status: ControllerStatus;
      digest: CampaignDigest;
      error: CampaignRefusalError;
    }>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseOptionalStringArray(
  v: unknown,
  fieldName: string,
): { ok: true; value: readonly string[] | undefined } | { ok: false; error: string } {
  if (v === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(v)) {
    return { ok: false, error: `Charter field '${fieldName}' must be an array of strings.` };
  }
  const out: string[] = [];
  for (const item of v) {
    if (!isNonEmptyString(item)) {
      return { ok: false, error: `Charter field '${fieldName}' must contain non-empty strings.` };
    }
    out.push(item.trim());
  }
  return { ok: true, value: Object.freeze(out) };
}

function resolveRequiredBound(
  primary: unknown,
  alias: unknown,
  primaryName: string,
  aliasName: string,
): { ok: true; value: number } | { ok: false; code: string; message: string } {
  const hasPrimary = primary !== undefined;
  const hasAlias = alias !== undefined;
  if (!hasPrimary && !hasAlias) {
    return {
      ok: false,
      code: "missing-charter-bound",
      message: `Charter bound '${primaryName}' (or '${aliasName}') is required and has no compiled default.`,
    };
  }
  const checkBound = (val: unknown, name: string): number | null => {
    if (typeof val !== "number" || !Number.isSafeInteger(val) || val < 0) {
      return null;
    }
    return val;
  };

  let resolvedPrimary: number | undefined;
  if (hasPrimary) {
    const parsed = checkBound(primary, primaryName);
    if (parsed === null) {
      return {
        ok: false,
        code: "invalid-charter-bound",
        message: `Charter bound '${primaryName}' must be a non-negative integer (no compiled default).`,
      };
    }
    resolvedPrimary = parsed;
  }

  let resolvedAlias: number | undefined;
  if (hasAlias) {
    const parsed = checkBound(alias, aliasName);
    if (parsed === null) {
      return {
        ok: false,
        code: "invalid-charter-bound",
        message: `Charter bound '${aliasName}' must be a non-negative integer (no compiled default).`,
      };
    }
    resolvedAlias = parsed;
  }

  if (
    resolvedPrimary !== undefined &&
    resolvedAlias !== undefined &&
    resolvedPrimary !== resolvedAlias
  ) {
    return {
      ok: false,
      code: "conflicting-charter-bound",
      message: `Conflicting values for '${primaryName}' (${resolvedPrimary}) and '${aliasName}' (${resolvedAlias}).`,
    };
  }

  return { ok: true, value: (resolvedPrimary ?? resolvedAlias)! };
}

function normalizeArsenalItem(
  raw: unknown,
  index: number,
):
  | { ok: true; item: CharterArsenalProposalItem }
  | { ok: false; code: string; message: string } {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        code: "invalid-arsenal-entry",
        message: `Arsenal entry ${index} must not be empty.`,
      };
    }
    return { ok: true, item: { cardRef: trimmed } };
  }
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      code: "invalid-arsenal-entry",
      message: `Arsenal entry ${index} must be a cardRef string or object.`,
    };
  }
  const rawCardRef = raw.cardRef ?? raw.reconCitation;
  if (!isNonEmptyString(rawCardRef)) {
    return {
      ok: false,
      code: "missing-recon-citation",
      message: `Arsenal entry ${index} is missing a recon cardRef / reconCitation.`,
    };
  }
  const rawId = raw.id;
  const rawSkill = raw.skill;
  const rawPhase = raw.phase;
  if (rawId !== undefined && !isNonEmptyString(rawId)) {
    return {
      ok: false,
      code: "invalid-arsenal-entry",
      message: `Arsenal entry ${index} 'id' must be a non-empty string when provided.`,
    };
  }
  if (rawSkill !== undefined && !isNonEmptyString(rawSkill)) {
    return {
      ok: false,
      code: "invalid-arsenal-entry",
      message: `Arsenal entry ${index} 'skill' must be a non-empty string when provided.`,
    };
  }
  if (rawPhase !== undefined && !isNonEmptyString(rawPhase)) {
    return {
      ok: false,
      code: "invalid-arsenal-entry",
      message: `Arsenal entry ${index} 'phase' must be a non-empty string when provided.`,
    };
  }
  return {
    ok: true,
    item: {
      cardRef: rawCardRef.trim(),
      ...(rawId !== undefined ? { id: rawId.trim() } : {}),
      ...(rawSkill !== undefined ? { skill: rawSkill.trim() } : {}),
      ...(rawPhase !== undefined ? { phase: rawPhase.trim() } : {}),
    },
  };
}

export function parseCharterProposalInput(
  rawArgs: unknown,
):
  | { ok: true; value: CharterProposalInput }
  | { ok: false; code: string; message: string } {
  if (!isPlainObject(rawArgs)) {
    return {
      ok: false,
      code: "invalid-proposal-input",
      message: "Proposal input must be a plain object.",
    };
  }

  const nestedCharter = isPlainObject(rawArgs.charter) ? rawArgs.charter : undefined;
  const source = nestedCharter ? { ...nestedCharter, ...rawArgs } : rawArgs;

  // Reject explicit empty/null reconId immediately.
  if (
    Object.hasOwn(rawArgs, "reconId") &&
    (rawArgs.reconId === null || rawArgs.reconId === "")
  ) {
    return {
      ok: false,
      code: "missing-recon-citation",
      message: "Proposal must cite a valid non-empty reconId.",
    };
  }
  if (
    nestedCharter &&
    Object.hasOwn(nestedCharter, "reconId") &&
    (nestedCharter.reconId === null || nestedCharter.reconId === "")
  ) {
    return {
      ok: false,
      code: "missing-recon-citation",
      message: "Proposal charter must cite a valid non-empty reconId.",
    };
  }

  let explicitReconId: string | undefined;
  if (rawArgs.reconId !== undefined) {
    if (!isNonEmptyString(rawArgs.reconId)) {
      return {
        ok: false,
        code: "missing-recon-citation",
        message: "Proposal reconId must be a non-empty string.",
      };
    }
    explicitReconId = rawArgs.reconId.trim();
  } else if (nestedCharter?.reconId !== undefined) {
    if (!isNonEmptyString(nestedCharter.reconId)) {
      return {
        ok: false,
        code: "missing-recon-citation",
        message: "Proposal charter.reconId must be a non-empty string.",
      };
    }
    explicitReconId = nestedCharter.reconId.trim();
  }

  const recover = resolveRequiredBound(
    source.recoverLimit,
    source.recoverBound,
    "recoverLimit",
    "recoverBound",
  );
  if (!recover.ok) return recover;

  const reopen = resolveRequiredBound(
    source.reopenLimit,
    source.reopenBound,
    "reopenLimit",
    "reopenBound",
  );
  if (!reopen.ok) return reopen;

  const retention = resolveRequiredBound(
    source.sessionRetention,
    source.pauseWindow,
    "sessionRetention",
    "pauseWindow",
  );
  if (!retention.ok) return retention;

  const rawArsenal = source.arsenal ?? source.queue;
  if (!Array.isArray(rawArsenal) || rawArsenal.length === 0) {
    return {
      ok: false,
      code: "empty-arsenal",
      message: "Proposal must include a non-empty arsenal or queue citing recon cards.",
    };
  }

  const arsenal: CharterArsenalProposalItem[] = [];
  for (let i = 0; i < rawArsenal.length; i++) {
    const normalized = normalizeArsenalItem(rawArsenal[i], i);
    if (!normalized.ok) return normalized;
    arsenal.push(normalized.item);
  }

  let inferredReconId = explicitReconId;
  if (inferredReconId === undefined) {
    const citedIds = new Set<string>();
    for (const entry of arsenal) {
      const match = CARD_REF_RE.exec(entry.cardRef);
      if (match) citedIds.add(match[1]!);
    }
    if (citedIds.size === 1) {
      inferredReconId = [...citedIds][0]!;
    } else if (citedIds.size > 1) {
      return {
        ok: false,
        code: "ambiguous-recon-citation",
        message: "Proposal arsenal cites multiple recon records; specify reconId explicitly.",
      };
    } else {
      return {
        ok: false,
        code: "missing-recon-citation",
        message: "Proposal must cite a reconId or valid recon cardRef citations.",
      };
    }
  }

  const phases = parseOptionalStringArray(source.phases, "phases");
  if (!phases.ok) {
    return { ok: false, code: "invalid-proposal-input", message: phases.error };
  }
  if (phases.value !== undefined && phases.value.length === 0) {
    return {
      ok: false,
      code: "invalid-proposal-input",
      message: "Charter 'phases' cannot be empty when provided.",
    };
  }

  const allowedSkills = parseOptionalStringArray(
    source.allowedSkills,
    "allowedSkills",
  );
  if (!allowedSkills.ok) {
    return { ok: false, code: "invalid-proposal-input", message: allowedSkills.error };
  }

  const checkpoints = parseOptionalStringArray(source.checkpoints, "checkpoints");
  if (!checkpoints.ok) {
    return { ok: false, code: "invalid-proposal-input", message: checkpoints.error };
  }

  const stops = parseOptionalStringArray(source.stops, "stops");
  if (!stops.ok) {
    return { ok: false, code: "invalid-proposal-input", message: stops.error };
  }

  const clauses = parseOptionalStringArray(source.clauses, "clauses");
  if (!clauses.ok) {
    return { ok: false, code: "invalid-proposal-input", message: clauses.error };
  }
  if (clauses.value !== undefined && clauses.value.length === 0) {
    return {
      ok: false,
      code: "invalid-proposal-input",
      message: "Charter 'clauses' cannot be empty when provided.",
    };
  }

  let authority: Partial<CampaignCharterAuthoritySplit> | undefined;
  if (source.authority !== undefined) {
    if (!isPlainObject(source.authority)) {
      return {
        ok: false,
        code: "invalid-proposal-input",
        message: "Charter 'authority' must be a plain object.",
      };
    }
    const auto = parseOptionalStringArray(source.authority.automatic, "authority.automatic");
    if (!auto.ok) {
      return { ok: false, code: "invalid-proposal-input", message: auto.error };
    }
    const humanOnly = parseOptionalStringArray(
      source.authority.humanOnly,
      "authority.humanOnly",
    );
    if (!humanOnly.ok) {
      return { ok: false, code: "invalid-proposal-input", message: humanOnly.error };
    }
    authority = {
      ...(auto.value !== undefined ? { automatic: auto.value } : {}),
      ...(humanOnly.value !== undefined ? { humanOnly: humanOnly.value } : {}),
    };
  }

  if (source.goal !== undefined && !isNonEmptyString(source.goal)) {
    return {
      ok: false,
      code: "invalid-proposal-input",
      message: "Charter 'goal' must be a non-empty string when provided.",
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      reconId: inferredReconId,
      ...(source.goal !== undefined ? { goal: (source.goal as string).trim() } : {}),
      ...(phases.value !== undefined ? { phases: phases.value } : {}),
      arsenal: Object.freeze(arsenal),
      ...(allowedSkills.value !== undefined ? { allowedSkills: allowedSkills.value } : {}),
      recoverLimit: recover.value,
      reopenLimit: reopen.value,
      sessionRetention: retention.value,
      ...(authority !== undefined ? { authority } : {}),
      ...(checkpoints.value !== undefined ? { checkpoints: checkpoints.value } : {}),
      ...(stops.value !== undefined ? { stops: stops.value } : {}),
      ...(clauses.value !== undefined ? { clauses: clauses.value } : {}),
    }),
  };
}

export function buildCharterTemplate(
  reconRecord: CampaignReconRecordInput,
  input: CharterProposalInput,
  fallbackGoal?: string,
  fallbackStops?: readonly string[],
):
  | {
      ok: true;
      charter: CampaignCharter;
      charterTemplate: CampaignCharterTemplate;
      manifest: CampaignManifest;
      charterSha256: string;
      shortDigest: string;
    }
  | { ok: false; code: string; message: string } {
  const reconId = reconRecord.reconId;
  if (input.reconId !== undefined && input.reconId !== reconId) {
    return {
      ok: false,
      code: "unknown-recon-record",
      message: `Proposal reconId "${input.reconId}" does not match recon record "${reconId}".`,
    };
  }

  const candidateByRef = new Map<
    string,
    { gap: ReconGapRecordInput; candidate: ReconCandidateCardInput }
  >();
  for (const gap of reconRecord.gaps) {
    for (const candidate of gap.candidates) {
      candidateByRef.set(candidate.cardRef, { gap, candidate });
    }
  }

  const phases = input.phases ?? ["recon", "decisions", "execution", "convergence"];
  const defaultPhase = phases.includes("execution") ? "execution" : phases[0]!;

  const selectedCardRefs: string[] = [];
  const queueItems: CampaignQueueItem[] = [];
  const arsenalItems: CampaignCharterArsenalItem[] = [];
  const selectedSkillIds = new Set<string>();
  const usedQueueIds = new Set<string>();

  for (let i = 0; i < input.arsenal.length; i++) {
    const item = input.arsenal[i]!;
    const match = CARD_REF_RE.exec(item.cardRef);
    if (!match) {
      return {
        ok: false,
        code: "untraced-arsenal-entry",
        message: `Arsenal entry "${item.cardRef}" is not a valid recon cardRef citation.`,
      };
    }
    const [, refReconId, refGapIdxStr, refSkillId] = match;
    if (refReconId !== reconId) {
      return {
        ok: false,
        code: "untraced-arsenal-entry",
        message: `Arsenal entry "${item.cardRef}" cites recon "${refReconId}" instead of "${reconId}".`,
      };
    }

    const found = candidateByRef.get(item.cardRef);
    if (!found) {
      return {
        ok: false,
        code: "untraced-arsenal-entry",
        message: `Arsenal entry "${item.cardRef}" does not trace to any candidate card in recon "${reconId}".`,
      };
    }

    const { gap, candidate } = found;
    if (gap.status !== "matched" || gap.refused) {
      return {
        ok: false,
        code: "unmatched-recon-gap",
        message: `Arsenal entry "${item.cardRef}" references gap ${gap.gapIndex} with status "${gap.status}".`,
      };
    }
    if (String(gap.gapIndex) !== refGapIdxStr || candidate.id !== refSkillId) {
      return {
        ok: false,
        code: "untraced-arsenal-entry",
        message: `Arsenal entry "${item.cardRef}" does not match candidate "${candidate.id}" at gap ${gap.gapIndex}.`,
      };
    }
    if (item.skill !== undefined && item.skill !== candidate.id) {
      return {
        ok: false,
        code: "untraced-arsenal-entry",
        message: `Arsenal entry skill "${item.skill}" does not match cited candidate "${candidate.id}".`,
      };
    }

    const convergenceOnly =
      candidate.lane.lane === "human-led" || candidate.lane.invocation === "human";
    const itemPhase =
      item.phase ??
      (convergenceOnly && phases.includes("convergence") ? "convergence" : defaultPhase);

    if (!phases.includes(itemPhase)) {
      return {
        ok: false,
        code: "invalid-proposal-input",
        message: `Arsenal entry phase "${itemPhase}" is not in charter phases.`,
      };
    }

    let queueId = item.id ?? `q-${i + 1}-${candidate.id}`;
    if (usedQueueIds.has(queueId)) {
      queueId = `${queueId}-${i + 1}`;
    }
    usedQueueIds.add(queueId);

    selectedCardRefs.push(candidate.cardRef);
    selectedSkillIds.add(candidate.id);
    queueItems.push({
      id: queueId,
      skill: candidate.id,
      reconCitation: candidate.cardRef,
    });
    arsenalItems.push({
      gapIndex: gap.gapIndex,
      gap: gap.query,
      cardRef: candidate.cardRef,
      skillId: candidate.id,
      name: candidate.name,
      lane: candidate.lane.lane,
      invocation: candidate.lane.invocation,
      convergenceOnly,
      phase: itemPhase,
    });
  }

  const allowedSkills = input.allowedSkills
    ? [...new Set(input.allowedSkills)]
    : [...selectedSkillIds];

  for (const skill of allowedSkills) {
    if (!selectedSkillIds.has(skill)) {
      return {
        ok: false,
        code: "untraced-allowed-skill",
        message: `allowedSkills entry "${skill}" does not trace to any selected recon card.`,
      };
    }
  }
  for (const q of queueItems) {
    if (!allowedSkills.includes(q.skill)) {
      return {
        ok: false,
        code: "invalid-proposal-input",
        message: `Queue skill "${q.skill}" must be included in allowedSkills.`,
      };
    }
  }

  const manifestResult = tryBuildCampaignManifest(reconRecord, selectedCardRefs);
  if (!manifestResult.ok) {
    return {
      ok: false,
      code: "invalid-manifest",
      message: manifestResult.error,
    };
  }

  const goal = input.goal ?? fallbackGoal;
  if (!goal || goal.trim().length === 0) {
    return {
      ok: false,
      code: "missing-goal",
      message: "Proposal must include a non-empty goal or an open campaign goal contract.",
    };
  }

  const clauses = input.clauses ?? [
    "authority-split-enforced",
    "bounds-enforced",
    "recon-cited",
  ];

  const charter: CampaignCharter = immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: 1,
    goal: goal.trim(),
    allowedSkills,
    queue: queueItems,
    recoverLimit: input.recoverLimit,
    reopenLimit: input.reopenLimit,
    sessionRetention: input.sessionRetention,
    clauses: [...clauses],
  });

  const authority: CampaignCharterAuthoritySplit = {
    automatic: input.authority?.automatic ?? [...CHARTER_AUTHORITY_SPLIT_TEMPLATE.automatic],
    humanOnly: [
      ...new Set([
        ...CHARTER_AUTHORITY_SPLIT_TEMPLATE.humanOnly,
        ...(input.authority?.humanOnly ?? []),
      ]),
    ],
  };

  const checkpoints = input.checkpoints ?? [];
  const stops = input.stops ?? fallbackStops ?? [];

  const templateBase = {
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    revision: 1,
    reconId,
    goal: charter.goal,
    phases: [...phases],
    arsenal: arsenalItems,
    authority,
    recoverLimit: charter.recoverLimit,
    reopenLimit: charter.reopenLimit,
    sessionRetention: charter.sessionRetention,
    checkpoints: [...checkpoints],
    stops: [...stops],
    clauses: [...charter.clauses],
  };

  const charterSha256 = campaignSha256Hex(
    canonicalCampaignJson({
      charter,
      templateBase,
      manifest: manifestResult.manifest,
    }),
  );
  const shortDigest = charterSha256.slice(0, 12);

  const charterTemplate: CampaignCharterTemplate = immutableSnapshot({
    ...templateBase,
    charterSha256,
    shortDigest,
  });

  return {
    ok: true,
    charter,
    charterTemplate,
    manifest: manifestResult.manifest,
    charterSha256,
    shortDigest,
  };
}

export async function executePropose(
  session: { readonly root: string },
  rawArgs: unknown,
): Promise<CampaignProposeResult> {
  const store = await CampaignStore.load(session.root);
  const currentStatus = toControllerStatus(store.state, store.trace.at(-1));
  const currentDigest = buildCampaignDigest(store.state, currentStatus);

  const refuse = (code: string, message: string): CampaignProposeResult =>
    immutableSnapshot({
      ok: false,
      refused: true,
      op: AgentOps.propose,
      state: store.state,
      status: currentStatus,
      digest: currentDigest,
      error: { code, message, retryable: false },
    });

  if (store.corrupted) {
    return refuse(
      "campaign-corrupted",
      store.error ?? "Campaign trace failed verification (FAILED_SAFE).",
    );
  }

  if (store.state.state !== CampaignStates.recon || store.state.recon === null) {
    return refuse(
      "invalid-campaign-state",
      `Campaign must be in RECON with a committed recon record before proposing a charter (current state: ${store.state.state}).`,
    );
  }

  const parsedInput = parseCharterProposalInput(rawArgs);
  if (!parsedInput.ok) {
    return refuse(parsedInput.code, parsedInput.message);
  }

  const reconId = parsedInput.value.reconId!;
  const reconRecordRaw = await store.loadReconArtifact(reconId);
  if (!reconRecordRaw) {
    return refuse(
      "unknown-recon-record",
      `No committed recon record found for reconId "${reconId}".`,
    );
  }

  const goalContract = await store.loadGoalContract();
  const built = buildCharterTemplate(
    reconRecordRaw as unknown as CampaignReconRecordInput,
    parsedInput.value,
    goalContract?.goal,
    goalContract?.stopConditions,
  );
  if (!built.ok) {
    return refuse(built.code, built.message);
  }

  const strategy: PersistedCampaignCharterStrategy = immutableSnapshot({
    schema: CAMPAIGN_SCHEMA_IDS.charter,
    charter: built.charter,
    charterTemplate: built.charterTemplate,
    manifest: built.manifest,
    reconId,
    charterSha256: built.charterSha256,
    shortDigest: built.shortDigest,
  });

  const appended = await store.proposeCharter(built.charter, strategy);
  if (!appended.entry.accepted) {
    return refuse(
      "propose-rejected",
      "Campaign engine rejected the charter proposal.",
    );
  }

  const rendered = renderControlStrategy({
    charterTemplate: built.charterTemplate,
    manifest: built.manifest,
  });

  return immutableSnapshot({
    ok: true,
    refused: false,
    op: AgentOps.propose,
    charter: built.charter,
    charterTemplate: built.charterTemplate,
    manifest: built.manifest,
    charterSha256: built.charterSha256,
    shortDigest: built.shortDigest,
    rendered,
    state: appended.state,
    entry: appended.entry,
    status: appended.status,
    digest: buildCampaignDigest(appended.state, appended.status, appended.entry),
  });
}
