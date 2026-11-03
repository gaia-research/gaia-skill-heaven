// SYNTHETIC records: no inference about real skill interactions.
import { describe, expect, it } from "vitest";
import { consumeArbor, readArborPublication } from "skill-zero";
import { edge, OTHER, publicationDocuments, runtime, SUBJECT } from "../../core/test/fixtures/arbor/protocol.js";
import { sessionComposition } from "../src/summon/composition.js";
import type { MaterializedSkillRecord } from "../src/summon/session.js";

const source = "https://gaiaskilltree.com";
const sourceUrl = "https://github.com/synthetic/alpha/blob/main/SKILL.md";
const publication = readArborPublication(publicationDocuments([
  runtime({ subject: SUBJECT }), runtime({ subject: OTHER }),
], [edge()]));
const reportFor = (id: string) => consumeArbor(publication, {
  skillId: id, canonicalSource: true,
  contentSha256: id === SUBJECT.id ? SUBJECT.contentSha256 : OTHER.contentSha256,
  delivery: "delivered-unverified",
});
const addition = { role: "proposed" as const, report: reportFor(OTHER.id) };

function record(): MaterializedSkillRecord {
  return {
    id: SUBJECT.id, name: "Synthetic alpha", contributor: "synthetic",
    source, sourceUrl, repoUrl: "https://github.com/synthetic/alpha",
    branch: null, subpath: "", path: "/synthetic/not-a-delivery",
    fileCount: 1, sha256: "1".repeat(64), cacheState: "cold", cache: "cold", cacheSource: "remote",
    inspectUrl: "https://example.invalid/synthetic", arbor: reportFor(SUBJECT.id), card: "",
    cloneSeconds: 0, materializeSeconds: 0, totalSeconds: 0, materializedAt: "2026-09-01T00:00:00Z",
  };
}
const inspect = (resident: MaterializedSkillRecord) => sessionComposition(
  publication, source, new Map([[SUBJECT.id, sourceUrl]]), [resident], reportFor, [addition],
);

describe("session composition source isolation", () => {
  it("joins matching canonical session metadata without verifying delivery", () => {
    const result = inspect(record());
    expect(result.interactions[0]?.endpointIdentity).toBe("both-pinned");
    expect(result.deliveryVerified).toBe(false);
  });
  it("does not surface canonical edge text for a fleet resident with the same id", () => {
    const result = inspect({ ...record(), source: "https://github.com/private/fleet" });
    expect(result.interactions).toEqual([]);
    expect(result.note).toContain("none has two current canonical content-pinned endpoints");
  });
  it("does not surface canonical edge text for old session metadata", () => {
    const resident = record();
    resident.arbor = { ...resident.arbor!, contentSha256: "0".repeat(64) };
    expect(inspect(resident).interactions).toEqual([]);
  });
  it("keeps legacy manifests without canonical metadata unknown", () => {
    const resident = record();
    delete resident.arbor;
    expect(inspect(resident).interactions).toEqual([]);
  });
});
