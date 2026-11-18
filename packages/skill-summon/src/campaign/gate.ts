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
  /** True when retrieved from an unreviewed external source rather than committed/memory catalog. */
  externalUnreviewedSource?: boolean;
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

  // Rule 3: Publish-class deny-list or unreviewed external source -> refuse on automatic path (K3, T8).
  if (
    input.requestPath === "automatic" &&
    (isPublishDenyListed(input.card.denyListClass) ||
      input.card.externalUnreviewedSource === true)
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

/**
 * Reviewed T8 publish-class / secret-write classification covering the committed
 * 400-skill catalog (`plugins/skill-heaven/data/skill-index.json`).
 */
const COMMITTED_PUBLISH_DENY_LIST: Readonly<Record<string, PublishDenyListClass>> =
  Object.freeze({
    "favorchurch/export-attendees":
      PublishDenyListClasses.publishToExternalChannels,
    "favorchurch/financial-assistance":
      PublishDenyListClasses.publishToExternalChannels,
    "favorchurch/resend-conference-emails-carefully-with-smtp":
      PublishDenyListClasses.publishToExternalChannels,
    "favorchurch/ticket-transfer":
      PublishDenyListClasses.publishToExternalChannels,
    "favorchurch/triage-conference":
      PublishDenyListClasses.publishToExternalChannels,
    "favorchurch/update-unique-churches":
      PublishDenyListClasses.publishToExternalChannels,
    "gaia-research/fuse":
      PublishDenyListClasses.publishToExternalChannels,
    "garrytan/gstack-upgrade":
      PublishDenyListClasses.publishToExternalChannels,
    "garrytan/land-and-deploy":
      PublishDenyListClasses.publishToExternalChannels,
    "garrytan/remote-mcp":
      PublishDenyListClasses.publishToExternalChannels,
    "garrytan/ship":
      PublishDenyListClasses.publishToExternalChannels,
    "garrytan/skillify":
      PublishDenyListClasses.publishToExternalChannels,
    "gsd-build/gsd-ship":
      PublishDenyListClasses.publishToExternalChannels,
    "hikari9/office-submit":
      PublishDenyListClasses.publishToExternalChannels,
    "huggingface/hf-cli":
      PublishDenyListClasses.publishToExternalChannels,
    "intelligentcode-ai/devops-engineer":
      PublishDenyListClasses.publishToExternalChannels,
    "intelligentcode-ai/release":
      PublishDenyListClasses.publishToExternalChannels,
    "mattpocock/to-spec":
      PublishDenyListClasses.publishToExternalChannels,
    "mattpocock/to-tickets":
      PublishDenyListClasses.publishToExternalChannels,
    "mattpocock/triage":
      PublishDenyListClasses.publishToExternalChannels,
    "mattpocock/wayfinder":
      PublishDenyListClasses.publishToExternalChannels,
    "mbtiongson1/gaia-audit":
      PublishDenyListClasses.publishToExternalChannels,
    "mbtiongson1/gaia-bot-curate":
      PublishDenyListClasses.publishToExternalChannels,
    "mbtiongson1/gaia-curate":
      PublishDenyListClasses.publishToExternalChannels,
    "mbtiongson1/gaia-wiki-sync":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/flow-nexus":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/flow-nexus-platform":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/github-multi-repo":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/github-project-management":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/github-release-management":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/github-suite":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/ruflo":
      PublishDenyListClasses.publishToExternalChannels,
    "ruvnet/skill-builder":
      PublishDenyListClasses.publishToExternalChannels,
    "wheresryan22/anatomy":
      PublishDenyListClasses.publishToExternalChannels,
    "xquik-dev/hermes-tweet":
      PublishDenyListClasses.publishToExternalChannels,
    "firecrawl/firecrawl-build-onboarding":
      PublishDenyListClasses.secretBearingWrites,
    "firecrawl/firecrawl-skills":
      PublishDenyListClasses.secretBearingWrites,
    "garrytan/setup-browser-cookies":
      PublishDenyListClasses.secretBearingWrites,
    "garrytan/setup-deploy":
      PublishDenyListClasses.secretBearingWrites,
    "gooseworks/browser-automation-notte":
      PublishDenyListClasses.secretBearingWrites,
    "mattpocock/wizard":
      PublishDenyListClasses.secretBearingWrites,
  });

const HAS_DRY_RUN_OR_READONLY_GUARD =
  /\b(dry[- ]run|plan[- ]preview|read[- ]only|audit[- ]only|never writes?|no mutation|with verifiable undo|canonical down[- ]migrations?|never auto[- ]posts)\b/i;

const EXTERNAL_PUBLISH_RE =
  /\b(transactional[- ]email|send(?:ing)?\s+(?:conference\s+|confirmation\s+)?(?:emails?|replies)|draft\/send\s+replies|resend.*emails?|smtp|post(?:ing)?\s+(?:to\s+)?(?:x\.com|twitter|slack|discord|social|mastodon|bluesky|linkedin)|(?:x\/twitter|twitter)[^\n.]*write\s+actions?|publish(?:es|ing)?\s+(?:it\s+)?(?:to\s+(?:external|the\s+[^\n.]*(?:gallery|issue\s+tracker)|[^\n.]*community\s+gallery)|structured\s+issues|announcements?|social|newsletters?|over\s+mcp)|(?:sync(?:ing)?\s+and\s+)?export(?:ing)?[^\n.]*(?:google\s+sheets?|masterlist|external)|updat(?:e|ing)[^\n.]*google\s+sheets?|upload(?:ing)?[^\n.]*(?:repos?|to\s+hugging\s*face)|(?:open(?:s|ing)?|creat(?:e|es|ing)|fil(?:e|es|ing))[^\n.]*\b(?:pull\s+requests?|prs?)\b|github\s+release\s+creation|release\s+note\s+publishing|app\s+store\s+deployment|payment\s+processing|publish-to-external-channels)\b/i;

const SECRET_BEARING_WRITE_RE =
  /\b((?:write|persist|commit|embed|store|append|export|creat(?:e|ing)|set(?:ting)?\s+up|configur(?:e|ing)|manag(?:ed|ing)|inject(?:s|ing)?)\s+(?:discovered\s+|raw\s+|pre-authenticated\s+|firecrawl\s+|ci\s+)?(?:credentials?|secrets?|session\s+cookies?|api[- ]?keys?|private[- ]?keys?|access[- ]?tokens?)|secret-bearing-writes)\b/i;

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

  const skillId = doc?.id ?? skill?.id;
  if (skillId && Object.hasOwn(COMMITTED_PUBLISH_DENY_LIST, skillId)) {
    return COMMITTED_PUBLISH_DENY_LIST[skillId]!;
  }

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

export function isExternalUnreviewedSource(params: {
  skillId: string;
  indexOrigin?: "committed" | "fetched" | null;
  source?: string | null;
  canonical?: boolean | null;
  hasReviewedDenyListClass?: boolean;
}): boolean {
  if (params.indexOrigin === "committed" || params.canonical === true) {
    return false;
  }
  if (params.source?.startsWith("memory://")) {
    return false;
  }
  if (Object.hasOwn(COMMITTED_PUBLISH_DENY_LIST, params.skillId)) {
    return false;
  }
  if (params.hasReviewedDenyListClass) {
    return false;
  }
  return params.indexOrigin === "fetched";
}

export function resolveGateCard(params: {
  skillId: string;
  doc?: IndexedSkill | null;
  skill?: NamedSkill | null;
  arbor?: ArborSubjectReport | null;
  manifest?: CampaignManifest | null;
  externalUnreviewedSource?: boolean;
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
    ...(params.externalUnreviewedSource ? { externalUnreviewedSource: true } : {}),
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
