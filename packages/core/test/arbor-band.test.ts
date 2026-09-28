// SYNTHETIC protocol fixtures only; these are not behavioral evidence.
import { describe, expect, it } from "vitest";
import { consumeArbor } from "../src/arbor/consume.js";
import {
  judgeArborBand, arborBandLines, conditionMatcher, type BandDirection,
} from "../src/arbor/band.js";
import { inspectArborComposition, type CompositionMember } from "../src/arbor/composition.js";
import { readArborPublication, unavailableArborPublication } from "../src/arbor/publication.js";
import {
  claim, profile, publicationDocuments, runtime, SUBJECT,
} from "./fixtures/arbor/protocol.js";
import type { ArborClaim } from "../src/arbor/contract.js";

const CONDITIONS = "An agent must verify a review recommendation against the implementation.";

function governedClaim(overrides: Partial<ArborClaim> = {}): ArborClaim {
  return claim({
    id: "claim.governed",
    conditions: CONDITIONS,
    support: "benchmark-confirmed",
    interpretationSource: "b".repeat(64),
    ...overrides,
  });
}

function withClaims(claims: ArborClaim[]) {
  const publication = readArborPublication(publicationDocuments([
    runtime({
      subject: SUBJECT,
      claims: { status: "present", sourceDigest: "b".repeat(64), profile: profile(claims) },
    }),
  ], []));
  const member: CompositionMember = {
    role: "proposed",
    report: consumeArbor(publication, {
      skillId: SUBJECT.id, contentSha256: SUBJECT.contentSha256, canonicalSource: true,
    }),
  };
  return { publication, members: [member] };
}

const matchThese = conditionMatcher(["verify a review recommendation"]);

describe("the band abstains unless every gate is passed", () => {
  it("abstains when no publication was readable", () => {
    const { members } = withClaims([governedClaim()]);
    const result = judgeArborBand("unavailable", members, { matchesConditions: matchThese });
    expect(result).toMatchObject({ direction: null, abstained: "publication-unavailable" });
    expect(result.relevanceUntouched).toBe(true);
  });

  it("abstains distinctly when the publication was present but unreadable", () => {
    const { members } = withClaims([governedClaim()]);
    expect(judgeArborBand("unreadable", members, { matchesConditions: matchThese }).abstained)
      .toBe("publication-unreadable");
  });

  it("treats an expert-declared claim as absence, not as evidence", () => {
    // `expert-declared` with a null interpretationSource is what the claim looks
    // like the instant a receipt is imported and BEFORE any curator acts. A
    // declaration must never be laundered into governed evidence.
    const { members } = withClaims([claim({ support: "expert-declared", interpretationSource: null })]);
    const result = judgeArborBand("loaded", members, { matchesConditions: matchThese });
    expect(result).toMatchObject({ direction: null, abstained: "no-governed-claim" });
    expect(result.members[0]).toMatchObject({ state: "evidence-absent", governedCount: 0, claimCount: 1 });
  });

  it("abstains when the caller supplied no conditions matcher", () => {
    const { members } = withClaims([governedClaim()]);
    const result = judgeArborBand("loaded", members, {});
    expect(result).toMatchObject({ direction: null, abstained: "conditions-unverified" });
  });

  it("abstains when the claim's stated conditions do not describe this task", () => {
    const { members } = withClaims([governedClaim()]);
    const other = judgeArborBand("loaded", members, { matchesConditions: conditionMatcher(["deploy a rollback"]) });
    expect(other).toMatchObject({ direction: null, abstained: "no-matching-claim" });
    // A non-match is absence, and is reported as such rather than as disagreement.
    expect(other.members[0]?.state).toBe("evidence-governed");
  });

  it("abstains when matching governed evidence is inconclusive, and never reads it as support", () => {
    const { members } = withClaims([
      governedClaim({ support: "inconclusive" }),
    ]);
    const result = judgeArborBand("loaded", members, { matchesConditions: matchThese });
    expect(result).toMatchObject({ direction: null, abstained: "evidence-inconclusive" });
    expect(result.members[0]).toMatchObject({ state: "evidence-inconclusive", matched: true });
    // The guard that keeps "inconclusive is embraced" from decaying into
    // "inconclusive means permitted": an inconclusive record cannot license a
    // direction even when a direction resolver is supplied and would say yes.
    const forced = judgeArborBand("loaded", members, {
      matchesConditions: matchThese,
      resolveDirection: (): BandDirection => "explore",
    });
    expect(forced.direction).toBeNull();
  });

  it("abstains when evidence is conclusive but no direction can be read from it", () => {
    const { members } = withClaims([governedClaim()]);
    const result = judgeArborBand("loaded", members, { matchesConditions: matchThese });
    expect(result).toMatchObject({ direction: null, abstained: "direction-unavailable" });
    expect(result.members[0]).toMatchObject({ state: "evidence-governed", matched: true, support: ["benchmark-confirmed"] });
  });
});

describe("the band moves only when every gate is passed", () => {
  it("produces a direction from matched, governed, conclusive evidence", () => {
    const { members } = withClaims([governedClaim()]);
    const seen: string[] = [];
    const result = judgeArborBand("loaded", members, {
      matchesConditions: matchThese,
      resolveDirection: (ev) => { seen.push(...ev.map((e) => e.id)); return "converge"; },
    });
    expect(result).toMatchObject({ direction: "converge", abstained: null });
    // Only MATCHED, governed, conclusive members are offered to the resolver.
    expect(seen).toEqual([SUBJECT.id]);
  });

  it("still abstains when the resolver declines to return a direction", () => {
    const { members } = withClaims([governedClaim()]);
    const result = judgeArborBand("loaded", members, {
      matchesConditions: matchThese, resolveDirection: () => null,
    });
    expect(result).toMatchObject({ direction: null, abstained: "direction-unavailable" });
  });
});

describe("the band never touches relevance", () => {
  it("leaves selection ordering, filtering, and scoring untouched", () => {
    const { publication, members } = withClaims([governedClaim()]);
    const plain = inspectArborComposition(publication, members);
    const judged = inspectArborComposition(publication, members, {
      matchesConditions: matchThese, resolveDirection: () => "explore",
    });
    // Type-pinned false, at runtime too.
    expect(judged.selectionChanged).toBe(false);
    expect(judged.mode).toBe("relevance-only");
    // Everything the relevance layer produced is identical, member for member.
    expect(judged.members).toEqual(plain.members);
    expect(judged.interactions).toEqual(plain.interactions);
    expect(judged.publication).toEqual(plain.publication);
    // Only the band differs.
    expect(judged.band.direction).toBe("explore");
    expect(plain.band.direction).toBeNull();
  });
});

describe("fail-closed behaviour", () => {
  it("treats a throwing conditions matcher as no match, never as a match", () => {
    const { members } = withClaims([governedClaim()]);
    const result = judgeArborBand("loaded", members, {
      matchesConditions: () => { throw new Error("matcher blew up"); },
    });
    expect(result).toMatchObject({ direction: null, abstained: "no-matching-claim" });
  });

  it("treats an empty signal list as matching nothing", () => {
    const { members } = withClaims([governedClaim()]);
    const result = judgeArborBand("loaded", members, { matchesConditions: conditionMatcher([]) });
    expect(result).toMatchObject({ direction: null, abstained: "no-matching-claim" });
  });

  it("ignores claims on a member that is not content-pinned", () => {
    const publication = readArborPublication(publicationDocuments([
      runtime({
        subject: SUBJECT,
        claims: { status: "present", sourceDigest: "b".repeat(64), profile: profile([governedClaim()]) },
      }),
    ], []));
    const member: CompositionMember = {
      role: "proposed",
      report: consumeArbor(publication, { skillId: SUBJECT.id, contentSha256: null, canonicalSource: false }),
    };
    const result = judgeArborBand("loaded", [member], {
      matchesConditions: matchThese, resolveDirection: () => "explore",
    });
    expect(result).toMatchObject({ direction: null, abstained: "no-governed-claim" });
    expect(result.members[0]?.join).not.toBe("content-pinned");
  });

  it("does not borrow claims across members by id", () => {
    const { publication } = withClaims([governedClaim()]);
    const impostor: CompositionMember = {
      role: "proposed",
      report: consumeArbor(publication, {
        skillId: SUBJECT.id, contentSha256: "0".repeat(64), canonicalSource: true,
      }),
    };
    const result = judgeArborBand("loaded", [impostor], { matchesConditions: matchThese });
    expect(result).toMatchObject({ direction: null, abstained: "no-governed-claim" });
  });
});

describe("the human surface", () => {
  it("names the abstain reason and the per-member evidence state", () => {
    const { members } = withClaims([governedClaim({ support: "inconclusive" })]);
    const text = arborBandLines(judgeArborBand("loaded", members, { matchesConditions: matchThese })).join("\n");
    expect(text).toContain("abstained: evidence-inconclusive");
    expect(text).toContain("evidence-inconclusive");
    expect(text).toContain("condition-matched");
  });

  it("says so plainly when nothing is readable", () => {
    const { members } = withClaims([]);
    const result = judgeArborBand("unavailable", members, {});
    expect(arborBandLines(result)[0]).toContain("Band: unchanged");
  });
});

describe("an unreadable publication cannot reach the band", () => {
  it("abstains for the unavailable-publication sentinel too", () => {
    const publication = unavailableArborPublication([{ where: "test", detail: "no publication on disk" }]);
    const result = judgeArborBand(publication.state, [], {});
    expect(result).toMatchObject({ direction: null, abstained: "publication-unavailable" });
  });
});
