// Rendering the Arbor disclosure onto a human surface.
//
// SPEC INV-13: a surface states which lenses informed it and which were absent,
// and unknown is displayed as unknown — never as a neutral default, an empty
// field, or a passing state. The rules that make these lines honest:
//
//   * A claim NEVER appears without its stated conditions on the same surface
//     (SPEC §4.1). `support` and `facet` without conditions is misreporting, so
//     the conditions are rendered on the claim line itself.
//   * `support` is printed exactly as upstream set it. Nothing is relabelled,
//     ranked, coloured by severity, or reduced to a confidence word.
//   * The absence of a record is printed as absence WITH its meaning attached.

import type {
  ArborDisclosure,
  ArborInteractionReport,
  ArborSubjectReport,
} from "./consume.js";
import type { ArborClaim } from "./contract.js";

/** Publication-level lines, printed once per summon. */
export function arborPublicationLines(disclosure: ArborDisclosure): string[] {
  const lines = [`  Arbor: ${disclosure.note}`];
  const provenance = disclosure.provenance;
  if (provenance) {
    lines.push(
      `  Arbor source: ${provenance.upstream}@${provenance.commit} ${provenance.path} (captured ${provenance.capturedAt})`,
    );
  } else if (disclosure.publicationState !== "unavailable") {
    lines.push(
      "  Arbor source: UNKNOWN — the cached publication records no upstream revision, so it cannot be audited back to a source.",
    );
  }
  lines.push(
    `  Arbor contracts: ${disclosure.contracts.runtime} · ${disclosure.contracts.profile} · ${disclosure.contracts.edgeIndex}`,
  );
  for (const problem of disclosure.problems) {
    lines.push(`  Arbor defect: ${problem.where} — ${problem.detail}`);
  }
  return lines;
}

/** Per-candidate lines. Always printed, including when there is nothing to show. */
export function arborSubjectLines(report: ArborSubjectReport): string[] {
  const lines = [`  Arbor: ${report.note}`];
  for (const claim of report.claims) lines.push(`  Arbor claim: ${claimLine(claim)}`);
  for (const interaction of report.interactions) {
    lines.push(`  Arbor edge: ${interactionLine(interaction)}`);
  }
  for (const problem of report.problems) {
    lines.push(`  Arbor defect: ${problem.where} — ${problem.detail}`);
  }
  return lines;
}

/**
 * One claim, with its conditions. The order is deliberate: the conditions are
 * not a trailing footnote, they are part of the claim being stated.
 */
export function claimLine(claim: ArborClaim): string {
  const governance =
    claim.interpretationSource === null
      ? "no governed interpretation (support is the declaration's own state)"
      : `governed interpretation ${short(claim.interpretationSource)}`;
  return (
    `${claim.facet} · support ${claim.support} · ONLY UNDER: ${claim.conditions} ` +
    `· ${governance} · declaration ${short(claim.declarationSource)}` +
    (claim.benchmarkSources.length > 0
      ? ` · ${claim.benchmarkSources.length} benchmark receipt(s), which are observations and never verdicts`
      : "")
  );
}

export function interactionLine(interaction: ArborInteractionReport): string {
  const { edge, direction, counterpart, counterpartPin } = interaction;
  const arrow =
    direction === "subject-acts-on"
      ? `this skill ${edge.relation} ${counterpart.id}`
      : `${counterpart.id} ${edge.relation} this skill`;
  const pin =
    counterpartPin === "verified"
      ? "counterpart content pin verified"
      : counterpartPin === "mismatched"
        ? "counterpart content pin MISMATCHED — this edge describes other bytes"
        : "counterpart content pin UNVERIFIED — applicability unknown";
  return `${arrow} · support ${edge.support} · ONLY UNDER: ${edge.conditions} · ${pin}`;
}

function short(digest: string): string {
  return digest.slice(0, 12);
}
