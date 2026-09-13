import type { ArborEdge, ArborSubjectRef } from "./contract.js";
import type { ArborSubjectReport } from "./consume.js";
import type { ArborPublication } from "./publication.js";

/** Consumer disclosure, NOT an upstream ontology or a runtime steering event. */
export type CompositionRole = "session-record" | "proposed" | "materialized";
export type CompositionMember = {
  role: CompositionRole;
  report: ArborSubjectReport;
};
export type CompositionInteraction = {
  /** Verbatim ordered edge, with conditions and provenance intact. */
  edge: ArborEdge;
  fromRoles: CompositionRole[];
  toRoles: CompositionRole[];
  endpointIdentity: "both-pinned" | "unverified";
  applicability: "conditions-unverified" | "endpoints-unverified" | "publication-inapplicable";
};
export type ArborCompositionReport = {
  mode: "relevance-only";
  selectionChanged: false;
  conditionsEvaluated: false;
  deliveryVerified: false;
  members: { id: string; role: CompositionRole; join: ArborSubjectReport["join"] }[];
  interactions: CompositionInteraction[];
  note: string;
};

/**
 * Inspect the actual proposed/session set, not all pairs in the catalogue.
 * Even two canonical endpoint pins are NOT execution or condition assurance.
 * This function deliberately cannot filter candidates or issue steering events.
 */
export function inspectArborComposition(
  publication: ArborPublication,
  members: readonly CompositionMember[],
): ArborCompositionReport {
  const byId = new Map<string, CompositionMember[]>();
  for (const member of members) {
    const group = byId.get(member.report.skillId) ?? [];
    group.push(member);
    byId.set(member.report.skillId, group);
  }
  const interactions: CompositionInteraction[] = [];
  if (publication.state === "loaded") {
    for (const edge of publication.edgeIndex?.edges ?? []) {
      const from = byId.get(edge.pair.from.id);
      const to = byId.get(edge.pair.to.id);
      if (!from || !to) continue;
      // If two sources collide on an id, every occurrence must prove the same
      // canonical endpoint. Never silently choose the convenient occurrence.
      const pinned = from.every((member) => matches(member.report, edge.pair.from)) &&
        to.every((member) => matches(member.report, edge.pair.to));
      interactions.push({
        edge,
        fromRoles: roles(from),
        toRoles: roles(to),
        endpointIdentity: pinned ? "both-pinned" : "unverified",
        applicability: !edge.pairApplicable ? "publication-inapplicable"
          : pinned ? "conditions-unverified" : "endpoints-unverified",
      });
    }
  }
  const note = interactions.length > 0
    ? `${interactions.length} ordered interaction record(s) concern this set. Conditions and delivered artifacts are unverified; records are reference material, not instructions or compatibility verdicts. Selection remains relevance-only.`
    : "No usable interaction record was found for this set. This means unknown, not compatible or conflict-free; selection remains relevance-only.";
  return {
    mode: "relevance-only", selectionChanged: false,
    conditionsEvaluated: false, deliveryVerified: false,
    members: members.map(({ role, report }) => ({ id: report.skillId, role, join: report.join })),
    interactions, note,
  };
}

export function arborCompositionLines(report: ArborCompositionReport): string[] {
  const lines = [`Composition: ${report.note}`];
  for (const item of report.interactions) {
    lines.push(`  ${item.edge.pair.from.id} → ${item.edge.pair.to.id}: ${item.edge.relation} (${item.edge.support}; ${item.applicability})`);
    lines.push(`    conditions (not evaluated): ${item.edge.conditions}`);
    lines.push(`    declaration: ${item.edge.declarationSource}`);
    if (item.edge.interpretationSource !== null) {
      lines.push(`    interpretation: ${item.edge.interpretationSource}`);
    }
  }
  return lines;
}

function matches(report: ArborSubjectReport, subject: ArborSubjectRef): boolean {
  return report.canonicalSource && report.join === "content-pinned" &&
    report.skillId === subject.id && report.contentSha256 === subject.contentSha256 &&
    report.matchedSubject?.id === subject.id &&
    report.matchedSubject.contentSha256 === subject.contentSha256;
}

function roles(members: readonly CompositionMember[]): CompositionRole[] {
  return [...new Set(members.map((member) => member.role))];
}
