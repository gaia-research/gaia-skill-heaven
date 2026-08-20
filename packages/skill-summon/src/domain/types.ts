export const TREE_CONTRACT_VERSION = "gaia-public-v1" as const;

export type GaiaEvidence = {
  class?: string | undefined;
  grade?: string | undefined;
  type?: string | undefined;
  source: string;
  evaluator?: string | undefined;
  date?: string | undefined;
  notes?: string | undefined;
  trustNumber?: number | undefined;
};

export type GenericSkill = {
  id: string;
  name: string;
  type: string;
  title?: string | undefined;
  summary?: string | undefined;
  description: string;
  prerequisites: string[];
  derivatives: string[];
  evidence: GaiaEvidence[];
  status: string;
  namedMaxLevel?: string | undefined;
  overallTrustGrade?: string | undefined;
  updatedAt?: string | undefined;
};

export type TrustScalar = string | number | boolean;

export type TrustFieldDescriptor = {
  value: TrustScalar;
  /** Optional comparable score; larger values rank first. */
  score?: number | undefined;
  /** Optional human-facing label used by result cards. */
  label?: string | undefined;
};

export type TrustFieldValue = TrustScalar | TrustFieldDescriptor;
export type TrustFields = Record<string, TrustFieldValue>;

export type SkillInvocation = "human" | "model" | "any";

export type NamedSkill = {
  id: string;
  name: string;
  title?: string | undefined;
  contributor: string;
  genericSkillRef?: string | undefined;
  /** Human-led = Skill Heaven; model-led = Skill Hell; any = tree did not classify it. */
  invocation?: SkillInvocation | undefined;
  origin?: "tree" | "fleet" | undefined;
  status: string;
  level?: string | undefined;
  description: string;
  catalogRef?: string | undefined;
  tags: string[];
  links: Record<string, unknown>;
  evidence: GaiaEvidence[];
  trustMagnitude?: number | undefined;
  overallTrustGrade?: string | undefined;
  /** Open tree-published trust dimensions; unknown keys pass through unchanged. */
  trust?: TrustFields | undefined;
  type?: string | undefined;
  updatedAt?: string | undefined;
  /** Registry-only guard: `false` means this skill must refuse to install. */
  installable?: boolean | undefined;
  /** Skill ids/catalogRefs/bare-names installed recursively as a suite. */
  suiteComponents?: string[] | undefined;
};

export type GenericRegistryDocument = {
  $schema?: string | undefined;
  contractVersion?: string | undefined;
  schemaVersion?: string | undefined;
  generatedAt: string;
  skills: GenericSkill[];
};

export type NamedRegistryDocument = {
  contractVersion?: string | undefined;
  schemaVersion?: string | undefined;
  generatedAt: string;
  buckets: Record<string, NamedSkill[]>;
};

export type GaiaRegistryDocuments = {
  generic: GenericRegistryDocument;
  named: NamedRegistryDocument;
};

export type RegistrySourceInfo = {
  kind?: "tree" | "fleet" | undefined;
  rootUrl?: string | undefined;
  genericUrl: string;
  namedUrl: string;
  commit?: string | undefined;
  legacy?: boolean | undefined;
  fetchedAt: string;
};

export type GaiaRegistrySnapshot = GaiaRegistryDocuments & {
  source: RegistrySourceInfo;
};

export type ResultMetadata = {
  serverVersion: string;
  mode: "registry";
  sourceKind: "tree" | "fleet";
  routingMode: "generic-map+collection" | "collection-only";
  contractVersion: typeof TREE_CONTRACT_VERSION;
  supportedContractVersions: [typeof TREE_CONTRACT_VERSION];
  upstreamDeclaresContractVersion: boolean;
  freshness: "fresh" | "stale";
  dataAgeSeconds: number | null;
  genericGeneratedAt: string;
  namedGeneratedAt: string;
  fetchedAt: string;
  sources: {
    generic: string;
    named: string;
  };
  compatibility: CompatibilityInfo;
  warnings: string[];
};

export type CompatibilityInfo = {
  mcpSdk: "@modelcontextprotocol/sdk@1.29.0";
  mcpProtocolVersions: string[];
  gaiaPublicData: [typeof TREE_CONTRACT_VERSION];
  gaiaCli: "none";
  node: ">=22.14.0";
  transports: ["stdio"];
};

export type SearchInput = {
  query: string;
  limit?: number | undefined;
  kinds?: Array<"generic" | "named"> | undefined;
  types?: string[] | undefined;
  tiers?: string[] | undefined;
  minStars?: number | undefined;
  minTrustMagnitude?: number | undefined;
  contributors?: string[] | undefined;
  installable?: boolean | undefined;
};

export type SearchResultItem = {
  kind: "generic" | "named";
  id: string;
  name: string;
  title?: string;
  description: string;
  type?: string;
  status: string;
  genericSkillRef?: string;
  invocation?: SkillInvocation;
  level?: string;
  trustMagnitude?: number;
  overallTrustGrade?: string;
  trust?: TrustFields;
  evidenceCount: number;
  sourceUrl?: string;
  contributor?: string;
  installable?: boolean;
};

export type SearchResult = {
  query: string;
  results: SearchResultItem[];
  meta: ResultMetadata;
};

export type NamedSkillSummary = {
  id: string;
  name: string;
  title?: string;
  contributor: string;
  level?: string;
  description: string;
  catalogRef?: string | undefined;
  invocation?: SkillInvocation;
  trustMagnitude?: number;
  overallTrustGrade?: string;
  trust?: TrustFields;
  sourceUrl?: string;
};

export type GenericSkillDossier = GenericSkill & {
  kind: "generic";
  namedImplementations: NamedSkillSummary[];
};

export type NamedSkillDossier = NamedSkill & {
  kind: "named";
  genericSkill?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
};

export type SkillDossier = GenericSkillDossier | NamedSkillDossier;

export type InspectResult = {
  skill: SkillDossier;
  meta: ResultMetadata;
};

export type StatusResult = ResultMetadata & {
  counts: {
    genericSkills: number;
    namedSkills: number;
  };
  tools: ["summon"];
  bondedCapabilities: false;
  missingCapabilities: [
    "bonded-local-context",
    "workspace-analysis",
    "progression-paths",
  ];
};
