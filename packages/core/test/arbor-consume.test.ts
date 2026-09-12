// What a join to a published Arbor subject does and does not establish.
//
// SPEC INV-4 (unknown is distinct from negative) and INV-13 (say which lenses
// informed the decision) are the whole point of this file. Everything here runs
// against SYNTHETIC protocol fixtures, because the real canonical publication is
// empty at the pinned revision — that difference is stated in each test's name
// rather than left for a reader to discover.

import { describe, expect, it } from "vitest";

import { consumeArbor, describeArborPublication } from "../src/arbor/consume.js";
import { arborSubjectLines, claimLine, interactionLine } from "../src/arbor/disclose.js";
import {
  readArborPublication,
  unavailableArborPublication,
} from "../src/arbor/publication.js";
import {
  claim,
  digest,
  edge,
  OTHER,
  profile,
  publicationDocuments,
  runtime,
  SUBJECT,
} from "./fixtures/arbor/protocol.js";

const canonical = { skillId: SUBJECT.id, contentSha256: SUBJECT.contentSha256, canonicalSource: true };

function load(runtimes = [runtime()], edges: ReturnType<typeof edge>[] = []) {
  return readArborPublication(publicationDocuments(runtimes, edges));
}

describe("joining a candidate to a published subject", () => {
  it("pins only on id AND exact content bytes (synthetic fixture)", () => {
    const publication = load();
    expect(consumeArbor(publication, canonical).join).toBe("content-pinned");
  });

  it("treats an id match with no provable content pin as UNKNOWN, not a match", () => {
    const report = consumeArbor(load(), { ...canonical, contentSha256: null });
    expect(report.join).toBe("identity-unproven");
    expect(report.lensesConsulted).toEqual([]);
    expect(report.lensesUnknown).toEqual(["claims", "hellHeaven", "interactions"]);
    expect(report.note).toMatch(/neither a denial nor an assurance/u);
    // Never an assurance, and never a denial.
    expect(report.note).not.toMatch(/\bsafe\b|\bunsafe\b|\bno risk\b/iu);
  });

  it("reports a different published content pin as stale-for-this-version, not absent", () => {
    const report = consumeArbor(load(), { ...canonical, contentSha256: digest("9") });
    expect(report.join).toBe("subject-version-unmatched");
    expect(report.lenses.claims.reason).toMatch(/different content bytes/u);
    expect(report.lenses.claims.availability).toBe("unknown");
  });

  it("reports a non-canonical source as outside the corpus, so no record can apply", () => {
    const report = consumeArbor(load(), { ...canonical, canonicalSource: false });
    expect(report.join).toBe("source-not-canonical");
    expect(report.lensesUnknown).toHaveLength(3);
    expect(report.lenses.hellHeaven.reason).toMatch(/a matching id would prove nothing/u);
  });

  it("distinguishes 'nothing is published about this skill' from 'we did not look'", () => {
    const published = consumeArbor(load(), { ...canonical, skillId: "synthetic/gamma" });
    expect(published.join).toBe("no-published-subject");
    expect(published.lenses.claims.reason).toMatch(/not evaluated, not a negative finding/u);

    const nothingToLookAt = consumeArbor(unavailableArborPublication(), canonical);
    expect(nothingToLookAt.join).toBe("publication-unavailable");
    expect(nothingToLookAt.lenses.claims.reason).toMatch(/no readable Arbor publication/u);
  });
});

describe("lens availability", () => {
  it("marks a present lens consulted and carries every claim field verbatim (synthetic)", () => {
    const original = claim({
      support: "benchmark-qualified",
      interpretationSource: digest("e"),
      benchmarkSources: [digest("7")],
    });
    const publication = load([
      runtime({
        claims: { status: "present", sourceDigest: digest("8"), profile: profile([original]) },
      }),
    ]);
    const report = consumeArbor(publication, canonical);
    expect(report.lenses.claims.availability).toBe("consulted");
    expect(report.lenses.claims.upstreamStatus).toBe("present");
    expect(report.lenses.claims.sourceDigest).toBe(digest("8"));
    // Field preservation: byte-identical, not a projection into a local shape.
    expect(report.claims).toHaveLength(1);
    expect(report.claims[0]).toEqual(original);
  });

  it("keeps independent facets independent on one subject (synthetic)", () => {
    const human = claim({ id: "claim.one", facet: "human-led", conditions: "with an operator watching" });
    const model = claim({ id: "claim.two", facet: "model-led", conditions: "inside a sandbox" });
    const report = consumeArbor(
      load([
        runtime({
          claims: { status: "present", sourceDigest: digest("8"), profile: profile([human, model]) },
        }),
      ]),
      canonical,
    );
    expect(report.claims.map((entry) => entry.facet)).toEqual(["human-led", "model-led"]);
    expect(report.claims.map((entry) => entry.conditions)).toEqual([
      "with an operator watching",
      "inside a sandbox",
    ]);
  });

  it("treats `inconclusive` as a consulted result, NOT as absence or a negative (synthetic)", () => {
    const report = consumeArbor(
      load([
        runtime({
          claims: {
            status: "present",
            sourceDigest: digest("8"),
            profile: profile([
              claim({ support: "inconclusive", interpretationSource: digest("e") }),
            ]),
          },
        }),
      ]),
      canonical,
    );
    expect(report.lenses.claims.availability).toBe("consulted");
    expect(report.claims[0]?.support).toBe("inconclusive");
    // An inconclusive governed interpretation is evidence that someone looked.
    // An absent lens is evidence that nobody did. They are different answers.
    expect(report.lensesAbsent).not.toContain("claims");
  });

  it("reports each absent status with the meaning upstream gives it", () => {
    const report = consumeArbor(
      load([
        runtime({
          claims: { status: "absent-no-accepted-record", sourceDigest: null, profile: null },
          hellHeaven: { status: "absent-superseded", sourceDigest: digest("2"), result: null },
          interactions: {
            status: "absent-subject-version-mismatch",
            sourceDigest: digest("3"),
            edges: [],
          },
        }),
      ]),
      canonical,
    );
    expect(report.lensesAbsent).toEqual(["claims", "hellHeaven", "interactions"]);
    expect(report.lenses.claims.reason).toMatch(/not evaluated, not a negative finding/u);
    expect(report.lenses.hellHeaven.reason).toMatch(/superseded/u);
    expect(report.lenses.interactions.reason).toMatch(/different content bytes/u);
  });

  it("treats an unreadable accepted payload as MORE unknown, never as absent", () => {
    // This is the real state of the HH lens today: HH's result contract is
    // research-owned and unpublished, so an accepted envelope projects
    // `unavailable-unsupported-payload`.
    const report = consumeArbor(
      load([
        runtime({
          hellHeaven: {
            status: "unavailable-unsupported-payload",
            sourceDigest: digest("2"),
            result: null,
          },
        }),
      ]),
      canonical,
    );
    expect(report.lenses.hellHeaven.availability).toBe("unknown");
    expect(report.lenses.hellHeaven.upstreamStatus).toBe("unavailable-unsupported-payload");
    expect(report.lenses.hellHeaven.reason).toMatch(/derives nothing from it/u);
    expect(report.lensesAbsent).not.toContain("hellHeaven");
  });
});

describe("interaction edges", () => {
  const withEdge = (entry: ReturnType<typeof edge>) =>
    consumeArbor(
      load([
        runtime({
          interactions: { status: "present", sourceDigest: digest("4"), edges: [entry] },
        }),
      ]),
      canonical,
    );

  it("reads the ordered pair in the right direction (synthetic)", () => {
    const outgoing = withEdge(edge({ pair: { from: SUBJECT, to: OTHER } }));
    expect(outgoing.interactions[0]?.direction).toBe("subject-acts-on");
    expect(outgoing.interactions[0]?.counterpart).toEqual(OTHER);

    const incoming = withEdge(edge({ pair: { from: OTHER, to: SUBJECT } }));
    expect(incoming.interactions[0]?.direction).toBe("acts-on-subject");
    expect(incoming.interactions[0]?.counterpart).toEqual(OTHER);
  });

  it("refuses to guess a direction for an edge naming neither endpoint (synthetic)", () => {
    const unrelated = withEdge(
      edge({ pair: { from: OTHER, to: { id: "synthetic/gamma", contentSha256: digest("5") } } }),
    );
    expect(unrelated.interactions).toEqual([]);
    expect(unrelated.problems[0]?.detail).toMatch(/names neither endpoint/u);
  });

  it("treats a mismatched endpoint pin as describing other bytes (synthetic)", () => {
    const stale = withEdge(edge({ pair: { from: SUBJECT, to: { ...OTHER, contentSha256: digest("6") } } }));
    expect(stale.interactions[0]?.counterpartPin).toBe("unverified");
    const checked = consumeArbor(
      load([
        runtime({
          interactions: {
            status: "present",
            sourceDigest: digest("4"),
            edges: [edge({ pair: { from: SUBJECT, to: { ...OTHER, contentSha256: digest("6") } } })],
          },
        }),
      ]),
      canonical,
      { knownContentSha256: { [OTHER.id]: OTHER.contentSha256 } },
    );
    expect(checked.interactions[0]?.counterpartPin).toBe("mismatched");
    expect(interactionLine(checked.interactions[0]!)).toMatch(/MISMATCHED/u);
  });

  it("never treats publication-time pairApplicable as runtime assurance", () => {
    const report = withEdge(edge({ pairApplicable: true }));
    expect(report.interactions[0]?.counterpartPin).toBe("unverified");
    expect(interactionLine(report.interactions[0]!)).toMatch(/UNVERIFIED — applicability unknown/u);
  });
});

describe("invalid optional data degrades instead of failing", () => {
  it("keeps the other lenses when the embedded profile does not conform", () => {
    const publication = readArborPublication(
      publicationDocuments([
        {
          ...runtime({
            claims: {
              status: "present",
              sourceDigest: digest("8"),
              // A profile shaped like the superseded local schema.
              profile: { schema: "gaia.arbor-profile/v1", polarity: 0.4 } as never,
            },
            interactions: { status: "absent-no-accepted-record", sourceDigest: null, edges: [] },
          }),
        },
      ]),
    );
    expect(publication.state).toBe("loaded");
    expect(publication.problems[0]?.detail).toMatch(/unknown field 'polarity'/u);

    const report = consumeArbor(publication, canonical);
    expect(report.claims).toEqual([]);
    expect(report.problems[0]?.detail).toMatch(/could not be read against/u);
    expect(report.lenses.interactions.availability).toBe("absent");
  });

  it("skips one malformed subject document and still consumes the rest", () => {
    const good = runtime({ subject: { id: "synthetic/beta", contentSha256: OTHER.contentSha256 } });
    const documents = publicationDocuments([runtime(), good]);
    documents.runtimes[0]!.document = { schema: "gaia.arbor-runtime/v1" } as never;
    const publication = readArborPublication(documents);
    expect(publication.state).toBe("loaded");
    expect(publication.runtimes.size).toBe(1);
    expect(publication.problems.length).toBeGreaterThan(0);
    expect(consumeArbor(publication, canonical).join).toBe("identity-unproven");
    expect(
      consumeArbor(publication, {
        skillId: OTHER.id,
        contentSha256: OTHER.contentSha256,
        canonicalSource: true,
      }).join,
    ).toBe("content-pinned");
  });

  it("fails the whole publication closed when the top-level listing does not conform", () => {
    const documents = publicationDocuments([runtime()]);
    (documents.runtimeIndex as Record<string, unknown>).runtimeVersion = "gaia.arbor-runtime/v2";
    const publication = readArborPublication(documents);
    expect(publication.state).toBe("unreadable");
    expect(publication.subjects).toEqual([]);
    expect(consumeArbor(publication, canonical).join).toBe("publication-unavailable");
  });

  it("discloses a claim whose support contradicts its interpretation provenance", () => {
    const publication = readArborPublication(
      publicationDocuments([
        runtime({
          claims: {
            status: "present",
            sourceDigest: digest("8"),
            // Upstream's interpretation rule: only a governed interpretation may
            // move a claim off `expert-declared`.
            profile: profile([claim({ support: "benchmark-confirmed", interpretationSource: null })]),
          },
        }),
      ]),
    );
    expect(publication.problems[0]?.detail).toMatch(/only a governed interpretation may set it/u);
    // Disclosed, not rewritten: the claim is still carried exactly as published.
    expect(consumeArbor(publication, canonical).claims[0]?.support).toBe("benchmark-confirmed");
  });
});

describe("disclosure never becomes a verdict", () => {
  it("states the real empty publication honestly", () => {
    const empty = readArborPublication(publicationDocuments([]));
    const disclosure = describeArborPublication(empty);
    expect(disclosure.subjectsPublished).toBe(0);
    expect(disclosure.edgesPublished).toBe(0);
    expect(disclosure.edgeCoverage).toEqual({ pairsEvaluated: 0, absenceMeaning: "not-evaluated" });
    expect(disclosure.note).toMatch(/EMPTY/u);
    expect(disclosure.note).toMatch(/nothing here is evidence about any skill/u);
  });

  it("carries no score, rank, confidence or polarity anywhere in a subject report", () => {
    const report = consumeArbor(
      load([
        runtime({
          claims: { status: "present", sourceDigest: digest("8"), profile: profile() },
          interactions: { status: "present", sourceDigest: digest("4"), edges: [edge()] },
        }),
      ]),
      canonical,
    );
    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) return void value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key);
          walk(child);
        }
      }
    };
    walk(report);
    for (const forbidden of ["score", "rank", "confidence", "polarity", "trust", "stars", "grade"]) {
      expect([...keys], forbidden).not.toContain(forbidden);
    }
  });

  it("never renders a claim without the conditions it holds under", () => {
    const rendered = claimLine(claim({ conditions: "only against a local checkout" }));
    expect(rendered).toMatch(/ONLY UNDER: only against a local checkout/u);
    expect(rendered).toMatch(/support expert-declared/u);
    expect(rendered).toMatch(/no governed interpretation/u);
  });

  it("says outright that conditions were not evaluated against the task", () => {
    const report = consumeArbor(
      load([
        runtime({ claims: { status: "present", sourceDigest: digest("8"), profile: profile() } }),
      ]),
      canonical,
    );
    expect(report.conditionsEvaluated).toBe(false);
    expect(report.note).toMatch(/those conditions are NOT evaluated here/u);
    expect(arborSubjectLines(report).join("\n")).toMatch(/ONLY UNDER/u);
  });

  it("prints the unknown state even when there is nothing at all to show", () => {
    const lines = arborSubjectLines(consumeArbor(unavailableArborPublication(), canonical));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/consulted: none/u);
    expect(lines[0]).toMatch(/unknown: claims, hellHeaven, interactions/u);
  });
});
