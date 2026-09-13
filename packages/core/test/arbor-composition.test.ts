// SYNTHETIC protocol fixtures only; these are not behavioral evidence.
import { describe, expect, it } from "vitest";
import { consumeArbor } from "../src/arbor/consume.js";
import { arborCompositionLines, inspectArborComposition, type CompositionMember } from "../src/arbor/composition.js";
import { readArborPublication, unavailableArborPublication } from "../src/arbor/publication.js";
import { edge, OTHER, publicationDocuments, runtime, SUBJECT } from "./fixtures/arbor/protocol.js";

function fixture(entry = edge()) {
  const publication = readArborPublication(publicationDocuments([
    runtime({ subject: SUBJECT }), runtime({ subject: OTHER }),
  ], [entry]));
  const member = (subject: typeof SUBJECT, role: CompositionMember["role"]): CompositionMember => ({
    role,
    report: consumeArbor(publication, { skillId: subject.id, contentSha256: subject.contentSha256, canonicalSource: true }),
  });
  return { publication, members: [member(SUBJECT, "session-record"), member(OTHER, "proposed")] };
}

describe("session-scoped composition inspection", () => {
  it("preserves the ordered edge and its conditions, without pretending to evaluate them", () => {
    const { publication, members } = fixture();
    const result = inspectArborComposition(publication, members);
    expect(result.interactions[0]).toMatchObject({
      edge: edge(), fromRoles: ["session-record"], toRoles: ["proposed"],
      endpointIdentity: "both-pinned", applicability: "conditions-unverified",
    });
    expect(result).toMatchObject({ mode: "relevance-only", selectionChanged: false, conditionsEvaluated: false, deliveryVerified: false });
    expect(arborCompositionLines(result).join("\n")).toContain(edge().conditions);
  });
  it("does not surface unrelated catalogue pairs", () => {
    const { publication, members } = fixture();
    expect(inspectArborComposition(publication, members.slice(0, 1)).interactions).toEqual([]);
  });
  it("does not reverse an ordered edge when the proposal acts on a resident", () => {
    const reversed = edge({ pair: { from: OTHER, to: SUBJECT }, relation: "conflicts" });
    const { publication, members } = fixture(reversed);
    const result = inspectArborComposition(publication, members);
    expect(result.interactions[0]).toMatchObject({ edge: reversed, fromRoles: ["proposed"], toRoles: ["session-record"] });
  });
  it("does not promote publication-time pairApplicable to runtime assurance", () => {
    const { publication, members } = fixture(edge({ pairApplicable: false }));
    expect(inspectArborComposition(publication, members).interactions[0]?.applicability).toBe("publication-inapplicable");
  });
  it("treats colliding source identities as unverified rather than choosing a convenient occurrence", () => {
    const { publication, members } = fixture();
    members.push({ role: "session-record", report: consumeArbor(publication, {
      skillId: OTHER.id, contentSha256: OTHER.contentSha256, canonicalSource: false,
    }) });
    expect(inspectArborComposition(publication, members).interactions[0]?.applicability).toBe("endpoints-unverified");
  });
  it("treats a stale endpoint as unknown", () => {
    const { publication, members } = fixture();
    members[1]!.report = consumeArbor(publication, {
      skillId: OTHER.id, contentSha256: "0".repeat(64), canonicalSource: true,
    });
    expect(inspectArborComposition(publication, members).interactions[0]?.endpointIdentity).toBe("unverified");
  });
  it("an absent publication is not a clean bill of health", () => {
    const result = inspectArborComposition(unavailableArborPublication(), []);
    expect(result.interactions).toEqual([]);
    expect(result.note).toContain("unknown, not compatible or conflict-free");
  });
});
