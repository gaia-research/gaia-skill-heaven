import {
  CAMPAIGN_GATE_REFUSAL_TEXT,
  CampaignGateDecisions,
  CampaignGateRefusalCodes,
  CampaignStates,
  PUBLISH_CLASS_DENY_LIST,
  PublishDenyListClasses,
  WorkUnitStates,
  type ArborSubjectReport,
  type CampaignGateRefusalCode,
  type CampaignManifest,
  type CampaignManifestEntry,
  type CampaignState,
  type CampaignTraceEntry,
  type IndexedSkill,
  type PublishDenyListClass,
  type WorkUnitQueueState,
  type WorkUnitRecord,
  type WorkUnitState,
} from "skill-zero";

import type { NamedSkill } from "../domain/types.js";

export type GateRequestPath = "automatic" | "person-requested";
export type GateCardLane = "human-led" | "model-led" | "unclassified";

export type SummonGateCard = Readonly<{
  skillId: string;
  lane: GateCardLane;
  denyListClass?: PublishDenyListClass | null;
}>;

export type SummonGateUnit = Readonly<{
  id: string;
  state: WorkUnitState;
}>;

export type SummonGateInput = Readonly<{
  hasCampaign: boolean;
  campaignState: CampaignState | null;
  unit: SummonGateUnit | null;
  card: SummonGateCard;
  requestPath: GateRequestPath;
  manifest?: CampaignManifest | null;
}>;

export type SummonGateDecision =
  | Readonly<{
      decision: typeof CampaignGateDecisions.allow;
      allowed: true;
      unplanned: false;
      passthrough: boolean;
      code: "no-live-campaign" | "person-requested" | "in-manifest";
      reason: null;
    }>
  | Readonly<{
      decision: typeof CampaignGateDecisions.allowUnplanned;
      allowed: true;
      unplanned: true;
      passthrough: false;
      code: "unplanned-model-led";
      reason: null;
    }>
  | Readonly<{
      decision: typeof CampaignGateDecisions.refuse;
      allowed: false;
      unplanned: false;
      passthrough: false;
      code: CampaignGateRefusalCode;
      reason: string;
    }>;

const DENY_LIST_SET = new Set<string>(PUBLISH_CLASS_DENY_LIST);

function refuseGate(code: CampaignGateRefusalCode): SummonGateDecision {
  return Object.freeze({
    decision: CampaignGateDecisions.refuse,
    allowed: false,
    unplanned: false,
    passthrough: false,
    code,
    reason: CAMPAIGN_GATE_REFUSAL_TEXT[code],
  });
}

function isPublishDenyListed(
  denyListClass: PublishDenyListClass | null | undefined,
): denyListClass is PublishDenyListClass {
  return (
    typeof denyListClass === "string" && DENY_LIST_SET.has(denyListClass)
  );
}

function isSkillInManifest(
  skillId: string,
  campaignState: CampaignState,
  manifest: CampaignManifest | null | undefined,
): boolean {
  if (campaignState.charter) {
    return campaignState.charter.allowedSkills.includes(skillId);
  }
  return manifest?.entries.some((entry) => entry.id === skillId) ?? false;
}

/**
 * Pure campaign summon gate (U5).
 *
 * Evaluates rules in strict order before any skill materialization:
 * 1. No live campaign -> pass through unchanged.
 * 2. Human-led skill on the automatic path -> refuse in every state.
 * 3. Publish-class deny-list on the automatic path -> refuse in every state.
 * 4. Charter exclusion -> refuse in every state.
 * 5. Automatic summon outside EXECUTING, or for a unit waiting on a person -> refuse.
 * 6. Model-led skill in manifest -> allow; not in manifest -> allow-unplanned.
 */
export function evaluateSummonGate(
  input: SummonGateInput,
): SummonGateDecision {
  // Rule 1: No live campaign -> today's behaviour unchanged.
  if (!input.hasCampaign || input.campaignState === null) {
    return Object.freeze({
      decision: CampaignGateDecisions.allow,
      allowed: true,
      unplanned: false,
      passthrough: true,
      code: "no-live-campaign",
      reason: null,
    });
  }

  const manifestEntry = input.manifest?.entries.find(
    (entry) => entry.id === input.card.skillId,
  );
  const effectiveLane: GateCardLane =
    manifestEntry?.convergenceOnly === true ||
    manifestEntry?.lane.lane === "human-led"
      ? "human-led"
      : input.card.lane;

  // Rule 2: Human-led skill on the automatic path -> refuse in every state (FD-3, INV-U6).
  if (input.requestPath === "automatic" && effectiveLane === "human-led") {
    return refuseGate(CampaignGateRefusalCodes.humanLedAutomatic);
  }

  // Rule 3: Publish-class deny-list -> refuse on the automatic path in every state (K3, T8).
  if (
    input.requestPath === "automatic" &&
    isPublishDenyListed(input.card.denyListClass)
  ) {
    return refuseGate(CampaignGateRefusalCodes.publishDenyList);
  }

  // Rule 4: Charter exclusion -> refuse in every state (INV-U8).
  const excludedSkills = input.campaignState.charter?.excludedSkills ?? [];
  if (excludedSkills.includes(input.card.skillId)) {
    return refuseGate(CampaignGateRefusalCodes.charterExcluded);
  }

  // Rule 5: Automatic summon outside EXECUTING, or for a unit waiting on a person -> refuse.
  if (input.requestPath === "automatic") {
    if (
      input.campaignState.state !== CampaignStates.executing ||
      !input.campaignState.approved
    ) {
      return refuseGate(CampaignGateRefusalCodes.notExecuting);
    }
    if (input.unit?.state === WorkUnitStates.needsHuman) {
      return refuseGate(CampaignGateRefusalCodes.unitWaitingOnPerson);
    }
  }

  // Explicit user invocation (/summon) is unchanged after Rules 1-4.
  if (input.requestPath === "person-requested") {
    return Object.freeze({
      decision: CampaignGateDecisions.allow,
      allowed: true,
      unplanned: false,
      passthrough: false,
      code: "person-requested",
      reason: null,
    });
  }

  // Rule 6: In manifest -> allow; outside manifest -> allow-unplanned.
  if (isSkillInManifest(input.card.skillId, input.campaignState, input.manifest)) {
    return Object.freeze({
      decision: CampaignGateDecisions.allow,
      allowed: true,
      unplanned: false,
      passthrough: false,
      code: "in-manifest",
      reason: null,
    });
  }

  return Object.freeze({
    decision: CampaignGateDecisions.allowUnplanned,
    allowed: true,
    unplanned: true,
    passthrough: false,
    code: "unplanned-model-led",
    reason: null,
  });
}

export function classifyCardLane(params: {
  doc?: Pick<IndexedSkill, "invocation"> | null;
  skill?: Pick<NamedSkill, "invocation" | "frontmatter"> | null;
  arbor?: Pick<ArborSubjectReport, "lenses" | "claims"> | null;
  manifestEntry?: Pick<CampaignManifestEntry, "lane" | "convergenceOnly"> | null;
}): GateCardLane {
  const { doc, skill, arbor, manifestEntry } = params;
  const frontmatterDisableModel =
    skill?.frontmatter?.["disable-model-invocation"] === true ||
    skill?.frontmatter?.["disable-model-invocation"] === "true";

  if (
    doc?.invocation === "human" ||
    skill?.invocation === "human" ||
    frontmatterDisableModel ||
    manifestEntry?.convergenceOnly === true ||
    manifestEntry?.lane.lane === "human-led"
  ) {
    return "human-led";
  }

  if (
    arbor?.lenses?.claims?.availability === "consulted" &&
    arbor.claims.length > 0
  ) {
    const hasHuman = arbor.claims.some((claim) => claim.facet === "human-led");
    const hasModel = arbor.claims.some((claim) => claim.facet === "model-led");
    if (hasHuman && !hasModel) {
      return "human-led";
    }
  }

  if (
    doc?.invocation === "model" ||
    skill?.invocation === "model" ||
    manifestEntry?.lane.lane === "model-led" ||
    arbor?.claims.some((claim) => claim.facet === "model-led")
  ) {
    return "model-led";
  }

  return "unclassified";
}

function asDenyListClass(value: unknown): PublishDenyListClass | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return DENY_LIST_SET.has(trimmed) ? (trimmed as PublishDenyListClass) : null;
}

const HAS_DRY_RUN_OR_READONLY_GUARD =
  /\b(dry[- ]run|plan[- ]preview|read[- ]only|audit[- ]only|never writes?|no mutation|with verifiable undo|canonical down[- ]migrations?)\b/i;

const EXTERNAL_PUBLISH_RE =
  /\b(transactional[- ]email|send(?:ing)?\s+(?:conference\s+)?emails?|resend.*emails?|smtp|post(?:ing)?\s+(?:to\s+)?(?:x\.com|twitter|slack|discord|social|mastodon|bluesky|linkedin)|(?:x\/twitter|twitter)[^\n.]*write\s+actions?|publish\s+(?:to\s+external|announcements?|social|newsletters?)|publish-to-external-channels)\b/i;

const SECRET_BEARING_WRITE_RE =
  /\b(write|persist|commit|embed|store|append|export)\s+(?:discovered\s+|raw\s+)?(?:credentials?|secrets?|api[- ]?keys?|private[- ]?keys?|access[- ]?tokens?)\b/i;

const DESTRUCTIVE_INFRA_RE =
  /\b(drop(?:ping)?\s+(?:databases?|tables?|queues?|dns|storage)|terraform\s+(?:destroy|apply)|delete\s+(?:production\s+)?(?:database|dns|bucket|cluster)|destructive[- ]infra[- ]mutation)\b/i;

const IRREVERSIBLE_MIGRATION_RE =
  /\b(irreversible\s+(?:schema|queue)\s+migrations?|schema[- ]queue[- ]migrations?)\b/i;

export function classifyPublishDenyListClass(params: {
  doc?: Pick<
    IndexedSkill,
    "id" | "name" | "description" | "tags" | "genericSkillRef" | "denyListClass"
  > | null;
  skill?: Pick<
    NamedSkill,
    | "id"
    | "name"
    | "description"
    | "tags"
    | "genericSkillRef"
    | "frontmatter"
    | "denyListClass"
  > | null;
}): PublishDenyListClass | null {
  const { doc, skill } = params;

  const explicit =
    asDenyListClass(doc?.denyListClass) ??
    asDenyListClass(skill?.denyListClass) ??
    asDenyListClass(skill?.frontmatter?.["deny-list-class"]) ??
    asDenyListClass(skill?.frontmatter?.["publish-class"]) ??
    asDenyListClass(skill?.frontmatter?.["denyListClass"]);
  if (explicit) return explicit;

  const allTags = [...(doc?.tags ?? []), ...(skill?.tags ?? [])];
  for (const tag of allTags) {
    const direct = asDenyListClass(tag);
    if (direct) return direct;
    const prefixed = tag.replace(/^(?:publish-class|deny-list):/u, "");
    const fromPrefix = asDenyListClass(prefixed);
    if (fromPrefix) return fromPrefix;
  }

  const corpus = [
    doc?.id ?? skill?.id ?? "",
    doc?.name ?? skill?.name ?? "",
    doc?.genericSkillRef ?? skill?.genericSkillRef ?? "",
    ...allTags,
    doc?.description ?? skill?.description ?? "",
  ].join(" ");

  if (EXTERNAL_PUBLISH_RE.test(corpus) && !HAS_DRY_RUN_OR_READONLY_GUARD.test(corpus)) {
    return PublishDenyListClasses.publishToExternalChannels;
  }

  if (SECRET_BEARING_WRITE_RE.test(corpus)) {
    return PublishDenyListClasses.secretBearingWrites;
  }

  if (DESTRUCTIVE_INFRA_RE.test(corpus) && !HAS_DRY_RUN_OR_READONLY_GUARD.test(corpus)) {
    return PublishDenyListClasses.destructiveInfraMutation;
  }

  if (
    IRREVERSIBLE_MIGRATION_RE.test(corpus) &&
    !HAS_DRY_RUN_OR_READONLY_GUARD.test(corpus)
  ) {
    return PublishDenyListClasses.schemaQueueMigrations;
  }

  return null;
}

export function resolveGateCard(params: {
  skillId: string;
  doc?: IndexedSkill | null;
  skill?: NamedSkill | null;
  arbor?: ArborSubjectReport | null;
  manifest?: CampaignManifest | null;
}): SummonGateCard {
  const manifestEntry = params.manifest?.entries.find(
    (entry) => entry.id === params.skillId,
  );
  return Object.freeze({
    skillId: params.skillId,
    lane: classifyCardLane({
      doc: params.doc,
      skill: params.skill,
      arbor: params.arbor,
      manifestEntry,
    }),
    denyListClass: classifyPublishDenyListClass({
      doc: params.doc,
      skill: params.skill,
    }),
  });
}

const IN_PROGRESS_UNIT_STATES = new Set<WorkUnitState>([
  WorkUnitStates.active,
  WorkUnitStates.verifying,
  WorkUnitStates.recovering,
  WorkUnitStates.reopened,
]);

export function resolveActiveWorkUnit(
  unitsState: WorkUnitQueueState | null,
  trace: readonly CampaignTraceEntry[],
): WorkUnitRecord | null {
  if (!unitsState) return null;

  for (let i = trace.length - 1; i >= 0; i--) {
    const workUnitId = trace[i]?.workUnit;
    if (!workUnitId) continue;
    const unit = unitsState.units.find((u) => u.id === workUnitId);
    if (
      unit &&
      (IN_PROGRESS_UNIT_STATES.has(unit.state) ||
        unit.state === WorkUnitStates.needsHuman)
    ) {
      return unit;
    }
  }

  const active = unitsState.units.find((u) =>
    IN_PROGRESS_UNIT_STATES.has(u.state),
  );
  if (active) return active;

  return (
    unitsState.units.find((u) => u.state === WorkUnitStates.needsHuman) ?? null
  );
}
