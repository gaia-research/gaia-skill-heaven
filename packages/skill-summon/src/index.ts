export {
  DEFAULT_SKILL_SOURCE,
  resolveSkillSource,
  treeProjectionUrls,
} from "./data/configured-source.js";
export type {
  ResolveSkillSourceOptions,
  SkillSourceResolution,
} from "./data/configured-source.js";
export {
  GithubFleetSource,
  checkoutGithubFleet,
  readSkillFrontmatter,
  readVerifiedSkillFrontmatter,
} from "./data/fleet-source.js";
export {
  FileInstallabilitySource,
  GaiaInstallabilityAdapter,
  HttpInstallabilitySource,
  StaticInstallabilitySource,
  parseInstallabilityProjection,
  sourceRouteFromUrl,
} from "./data/installability.js";
export type {
  GaiaInstallabilityAdapterOptions,
  InstallabilityAdapterResult,
  InstallabilityAdapterStatus,
  InstallabilityContextFor,
  InstallabilitySource,
  InstallabilitySourceContext,
} from "./data/installability.js";
export type {
  GithubFleetCheckout,
  GithubFleetSourceOptions,
} from "./data/fleet-source.js";
export {
  DEFAULT_GENERIC_REGISTRY_URL,
  DEFAULT_NAMED_REGISTRY_URL,
  GaiaDataError,
  HttpGaiaRegistrySource,
  InMemoryGaiaRegistrySource,
  resolveConfiguredRegistryUrl,
} from "./data/source.js";
export type {
  GaiaRegistrySource,
  HttpGaiaRegistrySourceOptions,
} from "./data/source.js";
export * from "./domain/types.js";
export { createSkillSummonMcpServer } from "./mcp/server.js";
export { ZERO_CUT_ENV, ZERO_CUT_REFUSAL, normalizeZeroCut, zeroCutFromEnv } from "./zero-cut.js";
export type { ZeroCut } from "./zero-cut.js";
export type { CreateSkillSummonMcpServerOptions } from "./mcp/server.js";
export {
  SKILLS_EXTENSION_ID,
  SKILL_RESOURCE_TEMPLATE,
  skillUri,
} from "./mcp/skills.js";
export type {
  DescribeSkill,
  ReadSkillResource,
  SkillEntry,
  SkillResourceManifestEntry,
  SkillResourceRead,
} from "./mcp/skills.js";
export { GaiaService } from "./service.js";
export type { GaiaServiceOptions } from "./service.js";
export { VERSION } from "./version.js";
export {
  CAMPAIGN_DIR_NAME,
  CAMPAIGN_TRACE_FILE,
  CAMPAIGN_EVIDENCE_FILE,
  CAMPAIGN_STATUS_FILE,
  CAMPAIGN_GOAL_FILE,
  CAMPAIGN_RECON_FILE,
  CAMPAIGN_CHARTER_FILE,
  CAMPAIGN_OPERATOR_LOG_FILE,
  CampaignStore,
  computeCharterCoreSha256,
  computeCharterStrategySha256,
  formatCharterSha256Clause,
  parseCampaignGoalContract,
  stripSelfCharterShaClause,
  type CampaignCharterArsenalItem,
  type CampaignCharterAuthoritySplit,
  type CampaignCharterTemplate,
  type CampaignGoalContract,
  type CampaignStoreAppendResult,
  type CampaignStoreLoadOptions,
  type PersistedCampaignCharterStrategy,
} from "./campaign/store.js";
export {
  CHARTER_AUTHORITY_SPLIT_TEMPLATE,
  buildCharterTemplate,
  executePropose,
  parseCharterProposalInput,
  type CampaignProposeResult,
  type CharterArsenalProposalItem,
  type CharterProposalInput,
} from "./campaign/ops/propose.js";
export {
  executeOperatorAmend,
  executeOperatorAnswer,
  executeOperatorCheckpoint,
  executeOperatorDecide,
  executeOperatorStop,
  inspectOperatorEnvironment,
  type ElicitationClient,
  type ElicitationFormRequest,
  type ElicitationResponse,
  type OperatorCharterAmendment,
  type OperatorDecisionOptions,
  type OperatorDecisionResult,
  type OperatorEnvironment,
  type OperatorLogEntry,
} from "./campaign/operator.js";
export {
  buildCampaignDigest,
  readSessionCampaignDigest,
  executeStatus,
  type CampaignDigest,
  type CampaignRefusalError,
  type CampaignStatusResult,
} from "./campaign/ops/status.js";
export {
  normalizeGoalContractInput,
  executeOpen,
  type CampaignOpenResult,
} from "./campaign/ops/open.js";
export {
  executeRecon,
  readPersistedReconRecord,
  type CampaignReconRecord,
  type ReconGapRecord,
  type ReconCandidateCard,
  type ReconGapRefusal,
  type ReconLaneClassification,
  type ReconCandidateLaneLens,
  type ReconFreshnessLens,
  type ReconCandidateInstallabilityLens,
  type ReconGapInstallabilityLens,
  type ReconCandidateArborLens,
  type ReconCandidateGraphLens,
  type ReconGapArborLens,
  type ReconGapGraphLens,
  type CampaignReconResult,
} from "./campaign/ops/recon.js";
export {
  CONTROL_STRATEGY_GROUP_ID,
  CONTROL_STRATEGY_GROUP_TITLE,
  DECLARED_NOT_MEASURED_GROUP_ID,
  DECLARED_NOT_MEASURED_GROUP_TITLE,
  buildControlStrategyGroup,
  buildDeclaredNotMeasuredGroup,
  createManifestRenderGroup,
  renderCampaignManifest,
  renderCampaignManifestLines,
  renderControlStrategy,
  renderControlStrategyLines,
  renderManifestEntry,
  renderManifestEntryLenses,
  renderManifestGap,
  renderManifestGroup,
  withManifestGroup,
  type ControlStrategyRenderInput,
  type ManifestGroupBuilder,
  type ManifestRenderGroup,
  type RenderCampaignManifestOptions,
} from "./campaign/render.js";
export {
  CAMPAIGN_TOOL_NAME,
  CAMPAIGN_TOOL_TITLE,
  CAMPAIGN_TOOL_DESCRIPTION,
  campaignInputSchema,
  getCampaignToolInputJsonSchema,
  measureCampaignToolStandingDose,
  executeCampaignTool,
  registerCampaignTool,
  type CampaignToolStandingDose,
} from "./campaign/tool.js";
