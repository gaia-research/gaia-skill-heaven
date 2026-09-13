import {
  consumeArbor, inspectArborComposition,
  type ArborPublication, type ArborSubjectReport, type CompositionMember,
} from "skill-zero";
import type { MaterializedSkillRecord } from "./session.js";

/** Session manifests record deliveries, not proof that those bytes remain loaded. */
export function sessionComposition(
  publication: ArborPublication,
  source: string,
  links: ReadonlyMap<string, string | undefined>,
  before: readonly MaterializedSkillRecord[],
  reportFor: (id: string) => ArborSubjectReport,
  additions: readonly CompositionMember[],
) {
  const members: CompositionMember[] = before.map((record) => {
    const current = reportFor(record.id);
    const sameSource = record.source === source && record.sourceUrl === links.get(record.id);
    const samePin = current.contentSha256 !== null &&
      record.arbor?.canonicalSource === true &&
      record.arbor.contentSha256 === current.contentSha256;
    const report = sameSource && samePin ? current : consumeArbor(publication, {
      skillId: record.id,
      contentSha256: null,
      canonicalSource: sameSource && current.canonicalSource,
      delivery: "delivered-unverified",
      identityNote: "the session record does not prove the current canonical source and content pin; no identity was borrowed by id",
    });
    return { role: "session-record", report };
  });
  return inspectArborComposition(publication, [...members, ...additions]);
}
