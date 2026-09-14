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
    expect(result).toMatchObject({
      mode: "relevance-only", selectionChanged: false, conditionsEvaluated: false,
      deliveryVerified: false,
      publication: { state: "loaded", subjectsPublished: 2, edgesPublished: 1, matchedEdges: 1, problems: [] },
    });
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
  it("does not surface canonical edge text for colliding source identities", () => {
    const { publication, members } = fixture();
    members.push({ role: "session-record", report: consumeArbor(publication, {
      skillId: OTHER.id, contentSha256: OTHER.contentSha256, canonicalSource: false,
    }) });
    const result = inspectArborComposition(publication, members);
    expect(result.interactions).toEqual([]);
    expect(arborCompositionLines(result).join("\n")).not.toContain(edge().conditions);
    expect(result.publication.matchedEdges).toBe(0);
  });
  it("does not surface canonical edge text for a stale endpoint", () => {
    const { publication, members } = fixture();
    members[1]!.report = consumeArbor(publication, {
      skillId: OTHER.id, contentSha256: "0".repeat(64), canonicalSource: true,
    });
    const result = inspectArborComposition(publication, members);
    expect(result.interactions).toEqual([]);
    expect(arborCompositionLines(result).join("\n")).not.toContain(edge().conditions);
  });

  it("does not surface canonical edge text when a listed aggregate is missing", () => {
    const documents = publicationDocuments([runtime({ subject: SUBJECT })], [edge()]);
    const publication = readArborPublication({
      ...documents,
      runtimeIndex: {
        ...documents.runtimeIndex,
        subjects: [SUBJECT, OTHER],
      },
    });
    const members: CompositionMember[] = [
      {
        role: "session-record",
        report: consumeArbor(publication, {
          skillId: SUBJECT.id, contentSha256: SUBJECT.contentSha256, canonicalSource: true,
        }),
      },
      {
        role: "proposed",
        report: consumeArbor(publication, {
          skillId: OTHER.id, contentSha256: OTHER.contentSha256, canonicalSource: true,
        }),
      },
    ];
    const result = inspectArborComposition(publication, members);
    expect(result.interactions).toEqual([]);
    expect(result.publication).toMatchObject({
      state: "loaded", edgesPublished: 1, matchedEdges: 0,
    });
    expect(result.publication.problems.length).toBeGreaterThan(0);
    expect(result.note).toContain("none has two current canonical content-pinned endpoints");
    expect(arborCompositionLines(result).join("\n")).not.toContain(edge().conditions);
  });
  it("distinguishes an unavailable publication from a loaded empty one", () => {
    const result = inspectArborComposition(unavailableArborPublication(), []);
    expect(result.interactions).toEqual([]);
    expect(result.publication).toMatchObject({
      state: "unavailable", subjectsPublished: 0, edgesPublished: 0, matchedEdges: 0,
    });
    expect(result.note).toContain("no publication was readable");
    expect(result.note).toContain("unknown, not compatible or conflict-free");

    const broken = publicationDocuments([]);
    (broken.runtimeIndex as Record<string, unknown>).runtimeVersion = "gaia.arbor-runtime/v2";
    const unreadableResult = inspectArborComposition(readArborPublication(broken), []);
    expect(unreadableResult.publication).toMatchObject({
      state: "unreadable", subjectsPublished: 0, edgesPublished: 0, matchedEdges: 0,
    });
    expect(unreadableResult.publication.problems.length).toBeGreaterThan(0);
    expect(unreadableResult.note).toContain("publication was unreadable");

    const emptyResult = inspectArborComposition(
      readArborPublication(publicationDocuments([])),
      [],
    );
    expect(emptyResult.publication).toMatchObject({
      state: "loaded", subjectsPublished: 0, edgesPublished: 0, matchedEdges: 0,
    });
    expect(emptyResult.note).toContain("no interaction edges");
  });
});
