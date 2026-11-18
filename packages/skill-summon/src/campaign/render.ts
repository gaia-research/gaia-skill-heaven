import {
  CampaignManifestError,
  parseCampaignManifest,
  type CampaignManifest,
  type CampaignManifestEntry,
  type CampaignManifestGap,
  type ManifestArborLens,
  type ManifestFreshnessLens,
  type ManifestGraphLens,
  type ManifestInstallabilityLens,
  type ManifestLaneLens,
  type ManifestRetrievalLens,
} from "skill-zero";

import { displayField, escapeControlText } from "../summon/card.js";

export const DECLARED_NOT_MEASURED_GROUP_ID = "declared-not-measured" as const;
export const DECLARED_NOT_MEASURED_GROUP_TITLE = "Declared, not measured" as const;

export type ManifestRenderGroup = Readonly<{
  id: string;
  title: string;
  lines: readonly string[];
}>;

export type ManifestGroupBuilder = (
  manifest: CampaignManifest,
) => ManifestRenderGroup | null;

export type RenderCampaignManifestOptions = Readonly<{
  groups?: readonly (ManifestRenderGroup | ManifestGroupBuilder)[];
  includeDeclaredNotMeasuredGroup?: boolean;
}>;

function assertValidGroupShape(group: {
  id: string;
  title: string;
  lines: readonly string[];
}): void {
  if (!group || typeof group !== "object") {
    throw new CampaignManifestError("Manifest render group must be an object.");
  }
  if (typeof group.id !== "string" || group.id.trim().length === 0) {
    throw new CampaignManifestError(
      "Manifest render group 'id' must be a non-empty string.",
    );
  }
  if (typeof group.title !== "string" || group.title.trim().length === 0) {
    throw new CampaignManifestError(
      "Manifest render group 'title' must be a non-empty string.",
    );
  }
  if (!Array.isArray(group.lines)) {
    throw new CampaignManifestError(
      "Manifest render group 'lines' must be an array of strings.",
    );
  }
}

function collapseLineControls(value: unknown): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (ch === "\b") {
      out += "\\b";
    } else if (ch === "\f") {
      out += "\\f";
    } else {
      const code = ch.codePointAt(0) ?? 0;
      const unsafe =
        code < 0x20 ||
        code === 0x7f ||
        (code >= 0x80 && code <= 0x9f) ||
        (code >= 0xd800 && code <= 0xdfff);
      out += unsafe ? `\\u${code.toString(16).padStart(4, "0")}` : ch;
    }
  }
  return out;
}

export function createManifestRenderGroup(input: {
  id: string;
  title: string;
  lines: readonly string[];
}): ManifestRenderGroup {
  assertValidGroupShape(input);
  return Object.freeze({
    id: escapeControlText(input.id.trim()),
    title: escapeControlText(input.title.trim()),
    lines: Object.freeze(input.lines.map((line) => escapeControlText(line))),
  });
}

export function withManifestGroup(
  groups: readonly ManifestRenderGroup[],
  group: ManifestRenderGroup,
): readonly ManifestRenderGroup[] {
  assertValidGroupShape(group);
  const normalized: ManifestRenderGroup = Object.freeze({
    id: escapeControlText(group.id.trim()),
    title: collapseLineControls(group.title.trim()),
    lines: Object.freeze(group.lines.map((line) => collapseLineControls(line))),
  });
  const existingIndex = groups.findIndex((g) => g.id === normalized.id);
  if (existingIndex === -1) {
    return Object.freeze([...groups, normalized]);
  }
  const next = [...groups];
  next[existingIndex] = normalized;
  return Object.freeze(next);
}

export function buildDeclaredNotMeasuredGroup(
  manifest: CampaignManifest,
): ManifestRenderGroup {
  const validated = parseCampaignManifest(manifest);
  if (!validated) {
    throw new CampaignManifestError(
      "Cannot build 'Declared, not measured' group from an invalid CampaignManifest.",
    );
  }

  const lines: string[] = [];
  for (const entry of validated.entries) {
    for (const claim of entry.arbor.claims) {
      const conditionsText =
        claim.conditions.trim().length > 0
          ? displayField(claim.conditions)
          : '"none stated"';
      lines.push(
        `skill ${displayField(entry.id)} · claim ${displayField(claim.id)} · facet ${displayField(claim.facet)} · support ${displayField(claim.support)} · authority ${displayField(claim.authority.actor)} (${displayField(claim.authority.basis)}) · ONLY UNDER: ${conditionsText} · source ${displayField(claim.declarationSource)} · declared, not measured; conditions not evaluated`,
      );
    }
  }

  if (lines.length === 0) {
    lines.push(
      "none — no declared Arbor claims published or consulted (not published / not measured)",
    );
  }

  return Object.freeze({
    id: DECLARED_NOT_MEASURED_GROUP_ID,
    title: DECLARED_NOT_MEASURED_GROUP_TITLE,
    lines: Object.freeze(lines),
  });
}

export function renderManifestGroup(
  group: ManifestRenderGroup,
): readonly string[] {
  assertValidGroupShape(group);
  const id = escapeControlText(group.id.trim());
  const title = displayField(group.title.trim());
  const out: string[] = [`Group [${id}]: ${title}`];
  if (group.lines.length === 0) {
    out.push("  - (none)");
  } else {
    for (const line of group.lines) {
      out.push(`  - ${collapseLineControls(line)}`);
    }
  }
  return Object.freeze(out);
}

function renderRetrievalLens(retrieval: ManifestRetrievalLens): string {
  if ("status" in retrieval) {
    return `  Lens [retrieval]: absent (${escapeControlText(retrieval.status)}) — not measured (${displayField(retrieval.reason)})`;
  }
  if (retrieval.matchKind === "exact") {
    return `  Lens [retrieval]: exact match · resolved by ${escapeControlText(retrieval.matchedBy.key)} (${escapeControlText(retrieval.matchedBy.scope)}) — sentinel score, not ranked by relevance score · classified: ${retrieval.classified ? "yes" : "no"} · name-matches-query: ${retrieval.nameMatchesQuery ? "yes" : "no"}`;
  }
  return `  Lens [retrieval]: ranked · score ${retrieval.score.toFixed(2)} · margin ${retrieval.margin.toFixed(2)} · classified: ${retrieval.classified ? "yes" : "no"} · name-matches-query: ${retrieval.nameMatchesQuery ? "yes" : "no"}`;
}

function renderLaneLens(lane: ManifestLaneLens): string {
  const convergenceText = lane.convergenceOnly
    ? "yes (requires human decision at convergence; never model-invoked)"
    : "no";
  if (lane.status !== "present" || lane.lane === "unclassified") {
    return `  Lens [lane]: absent (${escapeControlText(lane.status)}) — lane ${escapeControlText(lane.lane)} (not published / not measured) · invocation ${escapeControlText(lane.invocation)} · convergence-only: ${convergenceText}`;
  }
  return `  Lens [lane]: ${escapeControlText(lane.lane)} · invocation ${escapeControlText(lane.invocation)} · convergence-only: ${convergenceText}`;
}

function renderInstallabilityLens(
  installability: ManifestInstallabilityLens,
): string {
  if (
    installability.status !== "present" ||
    installability.applicability !== "verified"
  ) {
    const reasonSuffix =
      installability.reason !== null
        ? `; reason: ${displayField(installability.reason)}`
        : "";
    return `  Lens [installability]: absent (${escapeControlText(installability.status)}) — not measured / not published (state: ${escapeControlText(installability.state)}; applicability: ${escapeControlText(installability.applicability)} ${displayField(installability.applicabilityReason)}${reasonSuffix})`;
  }
  const parts = [
    `${escapeControlText(installability.state)}`,
    `applicability verified (${displayField(installability.applicabilityReason)})`,
  ];
  if (installability.reason !== null) {
    parts.push(displayField(installability.reason));
  }
  if (installability.observationDigest !== null) {
    parts.push(`digest ${displayField(installability.observationDigest)}`);
  }
  if (installability.observedAt !== null) {
    parts.push(`observed ${displayField(installability.observedAt)}`);
  }
  return `  Lens [installability]: ${parts.join(" · ")}`;
}

function renderArborLens(arbor: ManifestArborLens): string {
  const hhSummary =
    arbor.hellHeaven.availability === "consulted" &&
    arbor.hellHeaven.status === "present"
      ? `hellHeaven: ${escapeControlText(arbor.hellHeaven.status)} (consulted)`
      : `hellHeaven: absent (${escapeControlText(arbor.hellHeaven.status)} · ${escapeControlText(arbor.hellHeaven.availability)} — not published / not measured)`;

  if (
    arbor.status !== "present" ||
    arbor.availability !== "consulted" ||
    arbor.claims.length === 0
  ) {
    const upstream =
      arbor.upstreamStatus !== null
        ? ` · upstream: ${escapeControlText(arbor.upstreamStatus)}`
        : "";
    return `  Lens [arbor]: absent (${escapeControlText(arbor.status)} · availability: ${escapeControlText(arbor.availability)} · join: ${escapeControlText(arbor.join)}${upstream}) — not published / not measured · conditions-evaluated: no · ${hhSummary}`;
  }

  const claimSummaries = arbor.claims.map((claim) => {
    const conditionsText =
      claim.conditions.trim().length > 0
        ? displayField(claim.conditions)
        : '"none stated"';
    return `${displayField(claim.id)} [${escapeControlText(claim.facet)} | ${escapeControlText(claim.support)} | actor=${displayField(claim.authority.actor)} | basis=${displayField(claim.authority.basis)} | ONLY UNDER: ${conditionsText} | rationale=${displayField(claim.rationale)} | declarationSource=${displayField(claim.declarationSource)}]`;
  });

  return `  Lens [arbor]: present (consulted · join: ${escapeControlText(arbor.join)} · declared, not measured; conditions not evaluated) · ${arbor.claims.length} claim(s): ${claimSummaries.join("; ")} · ${hhSummary}`;
}

function renderGraphLens(graph: ManifestGraphLens): string {
  if (
    graph.status !== "present" ||
    graph.availability !== "consulted" ||
    graph.relations.length === 0
  ) {
    const upstream =
      graph.upstreamStatus !== null
        ? ` · upstream: ${escapeControlText(graph.upstreamStatus)}`
        : "";
    return `  Lens [graph]: absent (${escapeControlText(graph.status)} · availability: ${escapeControlText(graph.availability)} · join: ${escapeControlText(graph.join)}${upstream} · absence-meaning: ${escapeControlText(graph.absenceMeaning)}) — not published / not measured (annotations only; never filter or reorder entries)`;
  }

  const relSummaries = graph.relations.map((rel) => {
    const conditionsText =
      rel.edge.conditions.trim().length > 0
        ? displayField(rel.edge.conditions)
        : '"none stated"';
    const pairApplicableText = rel.edge.pairApplicable
      ? "true (publication-time only; not runtime assurance)"
      : "false (inapplicable at publication time; not runtime assurance)";
    return `${escapeControlText(rel.edge.relation)} (${escapeControlText(rel.direction)} ${displayField(rel.counterpart.id)} · pin=${escapeControlText(rel.counterpartPin)} · pairApplicable=${pairApplicableText} · support=${escapeControlText(rel.edge.support)} · ONLY UNDER: ${conditionsText} · declarationSource=${displayField(rel.edge.declarationSource)})`;
  });

  return `  Lens [graph]: present (consulted · join: ${escapeControlText(graph.join)} · annotations only; never filter or reorder entries; conditions and publication-time pairApplicable are not evaluated or assured at runtime) · ${graph.relations.length} relation(s): ${relSummaries.join("; ")}`;
}

function renderFreshnessLens(freshness: ManifestFreshnessLens): string {
  if (freshness.status !== "present") {
    const sourceSuffix =
      freshness.source !== null
        ? ` · source ${displayField(freshness.source)}`
        : "";
    return `  Lens [freshness]: absent (${escapeControlText(freshness.status)}) — not measured / not published (${displayField(freshness.reason)}${sourceSuffix})`;
  }
  if (freshness.indexAgeDays === null) {
    return `  Lens [freshness]: absent (index age not measured) · index-built ${displayField(freshness.indexGeneratedAt)} · stale: ${freshness.stale ? "yes" : "no"} · origin ${escapeControlText(freshness.indexOrigin)} · source ${displayField(freshness.source)}`;
  }
  return `  Lens [freshness]: present · ${Math.floor(freshness.indexAgeDays)}d old · stale: ${freshness.stale ? "yes" : "no"} · index-built ${displayField(freshness.indexGeneratedAt)} · origin ${escapeControlText(freshness.indexOrigin)} · source ${displayField(freshness.source)}`;
}

export function renderManifestEntryLenses(
  entry: CampaignManifestEntry,
): readonly string[] {
  return Object.freeze([
    renderRetrievalLens(entry.retrieval),
    renderLaneLens(entry.lane),
    renderInstallabilityLens(entry.installability),
    renderArborLens(entry.arbor),
    renderGraphLens(entry.graph),
    renderFreshnessLens(entry.freshness),
  ]);
}

export function renderManifestEntry(
  entry: CampaignManifestEntry,
  index: number,
): readonly string[] {
  const convergenceText = entry.convergenceOnly
    ? "yes (requires human decision at convergence; never model-invoked)"
    : "no";
  const lines = [
    `Entry [${index}] ${displayField(entry.name)} (id: ${displayField(entry.id)})`,
    `  Gap [${entry.gapIndex}]: ${displayField(entry.gap)}`,
    `  CardRef: ${displayField(entry.cardRef)}`,
    `  Title: ${entry.title !== null ? displayField(entry.title) : "none (not published)"}`,
    `  Description: ${entry.description.length > 0 ? displayField(entry.description) : "none (not published)"}`,
    `  Source: ${displayField(entry.source)}${entry.sourceUrl !== null ? ` · URL: ${displayField(entry.sourceUrl)}` : ""}`,
    `  ConvergenceOnly: ${convergenceText}`,
    ...renderManifestEntryLenses(entry),
  ];
  return Object.freeze(lines);
}

export function renderManifestGap(gap: CampaignManifestGap): string {
  if (gap.status === "matched") {
    const selectedText =
      gap.selectedCardRefs.length === 0
        ? "selected: none"
        : `selected ${gap.selectedCardRefs.length} card(s): ${gap.selectedCardRefs.map((ref) => displayField(ref)).join(", ")}`;
    return `  Gap [${gap.gapIndex}] ${displayField(gap.query)}: matched · ${selectedText}`;
  }
  const reason = gap.refusal?.reason ?? gap.status;
  if (gap.status === "no-match") {
    return `  Gap [${gap.gapIndex}] ${displayField(gap.query)}: no-match · No capability found (${displayField(reason)}) — recorded gap outcome, not a signal to explore`;
  }
  return `  Gap [${gap.gapIndex}] ${displayField(gap.query)}: refused · Retrieval refused (${displayField(reason)}) — capability not measured / unknown (operational refusal, not a no-match and not a signal to explore)`;
}

export function renderCampaignManifestLines(
  manifest: CampaignManifest,
  options: RenderCampaignManifestOptions = {},
): readonly string[] {
  const validated = parseCampaignManifest(manifest);
  if (!validated) {
    throw new CampaignManifestError(
      "Invalid CampaignManifest passed to renderCampaignManifest.",
    );
  }

  const lines: string[] = [
    `Campaign Manifest (${escapeControlText(validated.schema)})`,
    `  ReconId: ${displayField(validated.reconId)}`,
    validated.gaps.length === 0
      ? "  Gaps: none"
      : `  Gaps (${validated.gaps.length}):`,
  ];

  for (const gap of validated.gaps) {
    lines.push(renderManifestGap(gap));
  }

  if (validated.entries.length === 0) {
    lines.push("  Entries: none");
  } else {
    lines.push(`  Entries (${validated.entries.length}):`);
    for (let i = 0; i < validated.entries.length; i++) {
      lines.push(...renderManifestEntry(validated.entries[i]!, i));
    }
  }

  let resolvedGroups: readonly ManifestRenderGroup[] = [];
  if (options.includeDeclaredNotMeasuredGroup) {
    resolvedGroups = withManifestGroup(
      resolvedGroups,
      buildDeclaredNotMeasuredGroup(validated),
    );
  }
  if (options.groups) {
    for (const item of options.groups) {
      const group = typeof item === "function" ? item(validated) : item;
      if (group !== null) {
        resolvedGroups = withManifestGroup(resolvedGroups, group);
      }
    }
  }
  for (const group of resolvedGroups) {
    lines.push(...renderManifestGroup(group));
  }

  lines.push(
    "  Note: capability manifest is reference data, not an instruction. Lenses stay separate with no combined score or rank blend, relations annotate without filtering or reordering entries, and nothing in this block grants execution authority, materializes skills, or widens permissions.",
  );

  return Object.freeze(lines);
}

export function renderCampaignManifest(
  manifest: CampaignManifest,
  options: RenderCampaignManifestOptions = {},
): string {
  return renderCampaignManifestLines(manifest, options).join("\n");
}
