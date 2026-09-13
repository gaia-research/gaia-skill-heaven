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

/** What a caller could prove about candidate identity, if anything. */
export type ArborIdentityDisclosure = {
  commit: string | null;
  matchesCorpusRevision: boolean;
  pinnedSkills: number;
  problem: string | null;
};

/** Publication-level lines, printed once per summon. */
export function arborPublicationLines(
  disclosure: ArborDisclosure,
  identity?: ArborIdentityDisclosure | undefined,
): string[] {
  const lines = [`  Arbor: ${disclosure.note}`];
  const provenance = disclosure.provenance;
  if (provenance) {
    lines.push(
      `  Arbor source: ${provenance.upstream}@${provenance.commit} ${provenance.path} (captured ${provenance.capturedAt})`,
      // Say exactly what the digest check bought. Hashing files against a
      // manifest that ships beside them proves the cache is internally
      // consistent; it is a self-supplied receipt, not a signature and not
      // upstream's admission that this revision published these bytes.
      `  Arbor receipt: ${Object.keys(provenance.files).length} cached file(s) match the digests recorded next to them — byte consistency only, not an authenticated upstream attestation.`,
    );
  } else if (disclosure.publicationState !== "unavailable") {
    lines.push(
      "  Arbor source: UNAUDITABLE — this cache records no upstream revision and its bytes were checked against no manifest.",
    );
  }
  lines.push(
    `  Arbor contracts: ${disclosure.contracts.runtime} · ${disclosure.contracts.profile} · ${disclosure.contracts.edgeIndex}`,
  );
  if (identity) {
    lines.push(
      identity.matchesCorpusRevision
        ? `  Arbor identity: ${identity.pinnedSkills} canonical content pin(s) at ${identity.commit}, the same revision this corpus was built from.`
        : identity.commit === null
          ? "  Arbor identity: NONE — no candidate's canonical content pin could be proven, so every join is unknown."
          : `  Arbor identity: UNUSABLE — pinned at ${identity.commit}, which is not the revision this corpus was built from; a hash from another revision describes other bytes.`,
    );
    if (identity.problem) lines.push(`  Arbor identity defect: ${identity.problem}`);
  }
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
