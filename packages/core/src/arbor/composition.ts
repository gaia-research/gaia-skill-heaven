import type { ArborEdge, ArborSubjectRef } from "./contract.js";
import type { ArborSubjectReport } from "./consume.js";
import type { ArborProblem, ArborPublication } from "./publication.js";

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
export type ArborCompositionPublication = {
  /** Whether the optional publication was loaded, absent, or unreadable. */
  state: ArborPublication["state"];
  subjectsPublished: number;
  edgesPublished: number;
  /** Edges admitted after both ordered endpoints passed the current join. */
  matchedEdges: number;
  problems: readonly ArborProblem[];
};

export type ArborCompositionReport = {
  mode: "relevance-only";
  selectionChanged: false;
  conditionsEvaluated: false;
  deliveryVerified: false;
  publication: ArborCompositionPublication;
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
      // Do not surface an edge merely because its endpoint ids occur in the
      // set. Every occurrence for both ordered endpoints must be a current
      // canonical content-pinned join, or the edge text stays undisclosed.
      if (!from.every((member) => matches(member.report, edge.pair.from)) ||
          !to.every((member) => matches(member.report, edge.pair.to))) {
        continue;
      }
      interactions.push({
        edge,
        fromRoles: roles(from),
        toRoles: roles(to),
        endpointIdentity: "both-pinned",
        applicability: edge.pairApplicable
          ? "conditions-unverified"
          : "publication-inapplicable",
      });
    }
  }
  const compositionPublication: ArborCompositionPublication = {
    state: publication.state,
    subjectsPublished: publication.subjects.length,
    edgesPublished: publication.edgeIndex?.edges.length ?? 0,
    matchedEdges: interactions.length,
    problems: publication.problems,
  };
  const note = compositionNote(compositionPublication);
  return {
    mode: "relevance-only", selectionChanged: false,
    conditionsEvaluated: false, deliveryVerified: false,
    publication: compositionPublication,
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

function compositionNote(publication: ArborCompositionPublication): string {
  if (publication.state === "unavailable") {
    return "Arbor composition is unavailable because no publication was readable by this runtime. This is unknown, not compatible or conflict-free; selection remains relevance-only.";
  }
  if (publication.state === "unreadable") {
    return `Arbor composition is unavailable because the publication was unreadable. ${publication.problems.length} defect(s) are disclosed; this is unknown, not compatible or conflict-free. Selection remains relevance-only.`;
  }
  if (publication.edgesPublished === 0) {
    return `Arbor publication loaded with ${publication.subjectsPublished} subject(s) and no interaction edges. Edge absence means not-evaluated, not compatible or conflict-free; selection remains relevance-only.`;
  }
  if (publication.matchedEdges === 0) {
    return `Arbor publication loaded with ${publication.subjectsPublished} subject(s) and ${publication.edgesPublished} interaction edge(s), but none has two current canonical content-pinned endpoints in this set. This is unknown, not compatible or conflict-free; selection remains relevance-only.`;
  }
  return `${publication.matchedEdges} ordered interaction record(s) concern this set. Conditions and delivered artifacts are unverified; records are reference material, not instructions or compatibility verdicts. Selection remains relevance-only.`;
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
