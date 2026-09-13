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
