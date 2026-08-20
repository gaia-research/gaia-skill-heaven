import { GithubFleetSource } from "./fleet-source.js";
import {
  HttpGaiaRegistrySource,
  type GaiaRegistrySource,
} from "./source.js";

export const DEFAULT_SKILL_SOURCE = "https://gaiaskilltree.com";
const GENERIC_PROJECTION_PATH = "graph/gaia.json";
const NAMED_PROJECTION_PATH = "graph/named/index.json";

type SourceEnvironment = {
  SKILL_SOURCE?: string | undefined;
  TREE_URL?: string | undefined;
  TREE_NAMED_URL?: string | undefined;
};

export type SkillSourceResolution = {
  source: GaiaRegistrySource;
  kind: "tree" | "fleet";
  sourceUrl: string;
  legacy: boolean;
};

export type ResolveSkillSourceOptions = {
  env?: SourceEnvironment | undefined;
  fetchFn?: typeof fetch | undefined;
  fleetFactory?: ((sourceUrl: string) => GaiaRegistrySource) | undefined;
};

/** Resolve one public source link, retaining the two-URL pair only as migration compatibility. */
export function resolveSkillSource(
  options: ResolveSkillSourceOptions = {},
): SkillSourceResolution {
  const env = options.env ?? process.env;
  const configuredSource = configuredValue(env.SKILL_SOURCE);
  if (configuredSource) {
    if (isGithubRepository(configuredSource)) {
      return {
        source:
          options.fleetFactory?.(configuredSource) ??
          new GithubFleetSource(configuredSource),
        kind: "fleet",
        sourceUrl: configuredSource,
        legacy: false,
      };
    }
    const rootUrl = normalizeTreeRoot(configuredSource);
    const projections = treeProjectionUrls(rootUrl);
    return {
      source: new HttpGaiaRegistrySource({
        ...projections,
        rootUrl,
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
      }),
      kind: "tree",
      sourceUrl: rootUrl,
      legacy: false,
    };
  }

  const legacyGeneric = configuredValue(env.TREE_URL);
  const legacyNamed = configuredValue(env.TREE_NAMED_URL);
  if (legacyGeneric || legacyNamed) {
    if (!legacyGeneric || !legacyNamed) {
      throw new Error(
        "Legacy TREE_URL and TREE_NAMED_URL must be configured together. Prefer one SKILL_SOURCE root URL.",
      );
    }
    return {
      source: new HttpGaiaRegistrySource({
        genericUrl: legacyGeneric,
        namedUrl: legacyNamed,
        legacy: true,
        ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
      }),
      kind: "tree",
      sourceUrl: legacyGeneric,
      legacy: true,
    };
  }

  const rootUrl = DEFAULT_SKILL_SOURCE;
  return {
    source: new HttpGaiaRegistrySource({
      ...treeProjectionUrls(rootUrl),
      rootUrl,
      ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    }),
    kind: "tree",
    sourceUrl: rootUrl,
    legacy: false,
  };
}

export function treeProjectionUrls(rootUrl: string): {
  genericUrl: string;
  namedUrl: string;
} {
  const normalized = normalizeTreeRoot(rootUrl);
  return {
    genericUrl: `${normalized}/${GENERIC_PROJECTION_PATH}`,
    namedUrl: `${normalized}/${NAMED_PROJECTION_PATH}`,
  };
}

function configuredValue(value: string | undefined): string | undefined {
  const configured = value?.trim();
  if (!configured || /^\$\{[^}]+\}$/u.test(configured)) return undefined;
  return configured;
}

function normalizeTreeRoot(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SKILL_SOURCE must be an absolute website or GitHub URL, got: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`SKILL_SOURCE must use http or https, got: ${url.protocol}`);
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
}

function isGithubRepository(value: string): boolean {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return url.hostname.toLocaleLowerCase("en-US") === "github.com" && parts.length >= 2;
  } catch {
    return false;
  }
}
