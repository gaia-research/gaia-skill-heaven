import { fileURLToPath } from "node:url";
import { resolveArborIdentity, withUnknownInstallability, type SkillIndex } from "skill-zero";
import { GaiaService } from "./service.js";
import { loadArborIdentityContext } from "./data/arbor-identity-source.js";
import {
  DEFAULT_SKILL_SOURCE,
  resolveSkillSource,
  type ResolveSkillSourceOptions,
} from "./data/configured-source.js";
import {
  FileInstallabilitySource,
  GaiaInstallabilityAdapter,
  HttpInstallabilitySource,
  sourceRouteFromUrl,
  type InstallabilityAdapterResult,
  type InstallabilitySourceContext,
} from "./data/installability.js";
import { sameSource } from "./data/skill-index-source.js";

export type ConfiguredServiceOptions = Omit<ResolveSkillSourceOptions, "env"> & {
  env?: (NonNullable<ResolveSkillSourceOptions["env"]> & {
    SKILL_SUMMON_INSTALLABILITY?: string | undefined;
  }) | undefined;
};

/** One constructor for CLI and MCP. Optional evidence never enables network by default. */
export function createConfiguredService(options: ConfiguredServiceOptions = {}): GaiaService {
  const { source, sourceUrl } = resolveSkillSource(options);
  const value = (options.env ?? process.env).SKILL_SUMMON_INSTALLABILITY?.trim();
  const configured = value && !/^\$\{[^}]+\}$/u.test(value) ? value : undefined;
  return new GaiaService(source, {
    sourceUrl,
    ...(configured === undefined ? {} : {
      installabilityAdapter: {
        async apply(index: SkillIndex, context: InstallabilitySourceContext): Promise<InstallabilityAdapterResult> {
          // Do not even load a canonical Tree projection for private/override/fleet
          // corpora. A matching id or an optional URL is not a source boundary.
          if (context.sourceKind !== "tree" ||
              !sameSource(context.source, DEFAULT_SKILL_SOURCE) ||
              !sameSource(index.source, context.source) ||
              !index.sourceWorkflow?.startsWith("gaia-skill-tree/")) {
            return {
              index: withUnknownInstallability(index, null,
                context.sourceKind === "fleet" ? "fleet-source" : "invalid-context"),
              status: { status: "not-applicable" },
            };
          }
          // Construction and loading occur inside GaiaService's optional-data
          // failure boundary, so malformed configuration cannot break retrieval.
          const projectionSource = /^https?:\/\//u.test(configured)
            ? new HttpInstallabilitySource({ url: configured, ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}) })
            : new FileInstallabilitySource(localPath(configured));
          const identity = await loadArborIdentityContext();
          const pins = identity.context !== null &&
            sameSource(identity.context.corpusSource, context.source) &&
            identity.context.upstream === "https://github.com/gaia-research/gaia-skill-tree"
            ? identity.context : null;
          const adapter = new GaiaInstallabilityAdapter({
            source: projectionSource,
            contextFor(skill) {
              const sourceUrl = typeof skill.links.github === "string" ? skill.links.github : null;
              const pin = resolveArborIdentity(pins, {
                skillId: skill.id,
                sourceUrl,
                corpusRevision: index.sourceRevision ?? null,
              });
              const route = sourceUrl === null ? null : sourceRouteFromUrl(sourceUrl);
              return {
                id: skill.id,
                sourceRoute: route,
                skillContentSha256: pin.pinned ? pin.contentSha256 : null,
                // Never borrow the observed remote revision from the projection.
                // Only an immutable candidate route can supply it offline.
                resolvedRevision: route?.ref && /^[a-f0-9]{40}$/iu.test(route.ref) ? route.ref : null,
              };
            },
          });
          return adapter.apply(index, context);
        },
      },
    }),
  });
}

function localPath(value: string): string {
  if (!value.startsWith("file:")) return value;
  const url = new URL(value);
  if (url.search || url.hash || url.username || url.password) {
    throw new Error("Optional installability file URL must not contain query, fragment, or credentials.");
  }
  return fileURLToPath(url);
}
