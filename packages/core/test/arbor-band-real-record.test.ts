// This suite runs against the ACTUAL published Arbor projection — the first
// governed record in the Tree (gaia-skill-tree #2036, which superseded #2028 so
// the interpretation could be issued under a human curator). By default it reads
// the byte-for-byte cache the plugin ships (plugins/skill-heaven/data/arbor),
// which is the exact artifact the runtime consumes, so it runs in CI. It is not a
// fixture. If upstream changes that record, this suite is expected to fail and
// to be updated deliberately, because what it asserts is what the real published
// evidence currently does to a composition.
//
// Why this matters: the synthetic suite proves the gate logic. This one proves
// the gate logic against a real, governed, content-pinned record whose honest
// answer is `inconclusive`. That is the case the whole band judgment was built
// for.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeArbor } from "../src/arbor/consume.js";
import { judgeArborBand, conditionMatcher } from "../src/arbor/band.js";
import { inspectArborComposition, type CompositionMember } from "../src/arbor/composition.js";
import { readArborPublication } from "../src/arbor/publication.js";
import type { BandDirection } from "../src/arbor/band.js";

// GAIA_SKILL_TREE may point at a gaia-skill-tree checkout to test upstream
// directly; otherwise the shipped consumer cache is the source.
const TREE_ARBOR = process.env.GAIA_SKILL_TREE
  ? join(process.env.GAIA_SKILL_TREE, "docs/graph/arbor")
  : join(dirname(fileURLToPath(import.meta.url)), "../../../plugins/skill-heaven/data/arbor");
const HAVE_TREE = existsSync(join(TREE_ARBOR, "runtime/index.json"));
const SKILL = "obra/receiving-code-review";
// The content pin is READ from the published index rather than hardcoded, so
// this suite tracks upstream automatically instead of going stale behind a
// typo. Nothing else about the record is assumed.
const INTERPRETATION = "c8d6b2cb0a8c33b36e498eb22b5770851dc98e4f2297a7ef729908bf11f4c80e";

function realPin(): string {
  const index = JSON.parse(
    readFileSync(join(TREE_ARBOR, "runtime/index.json"), "utf8"),
  ) as { subjects: { id: string; contentSha256: string }[] };
  const subject = index.subjects.find((s) => s.id === SKILL);
  expect(subject, `${SKILL} must be published in the Tree index`).toBeTruthy();
  return subject!.contentSha256;
}

function realPublication() {
  const PIN = realPin();
  const index = JSON.parse(
    readFileSync(join(TREE_ARBOR, "runtime/index.json"), "utf8"),
  ) as { subjects: { id: string; contentSha256: string }[] };
  expect(index.subjects.map((s) => s.id)).toContain(SKILL);
  const runtime = JSON.parse(
    readFileSync(join(TREE_ARBOR, "runtime/obra/receiving-code-review", `${PIN}.json`), "utf8"),
  );
  return readArborPublication({
    provenance: null,
    runtimeIndex: index,
    edgeIndex: JSON.parse(readFileSync(join(TREE_ARBOR, "edges.json"), "utf8")),
    runtimes: [{
      path: `runtime/${SKILL}/${PIN}.json`,
      document: runtime,
    }],
  });
}

function realMember(publication: ReturnType<typeof realPublication>): CompositionMember {
  return {
    role: "proposed",
    report: consumeArbor(publication, {
      skillId: SKILL, contentSha256: realPin(), canonicalSource: true,
    }),
  };
}

describe.skipIf(!HAVE_TREE)("the real published record (gaia-skill-tree #2036)", () => {
  it("is a content-pinned join carrying one governed claim", () => {
    const publication = realPublication();
    const member = realMember(publication);
    expect(member.report.join).toBe("content-pinned");
    expect(member.report.claims).toHaveLength(1);
    const claim = member.report.claims[0]!;
    expect(claim.interpretationSource).toBe(INTERPRETATION);
    expect(claim.support).toBe("inconclusive");
  });

  it("abstains with evidence-inconclusive, even when the conditions DO match", () => {
    // The conditions matcher here matches the real claim's own prose, so this is
    // not a "the task looked nothing like the claim" escape. The record is
    // accepted, content-pinned, condition-matched, and still inconclusive.
    const publication = realPublication();
    const member = realMember(publication);
    const matches = conditionMatcher([
      "adjudicate a plausible code-review suggestion",
      "state-specific nullability",
    ]);
    const result = judgeArborBand(publication.state, [member], { matchesConditions: matches });
    expect(result.members[0]).toMatchObject({
      state: "evidence-inconclusive", matched: true, governedCount: 1,
      support: ["inconclusive"],
    });
    expect(result).toMatchObject({ direction: null, abstained: "evidence-inconclusive" });
  });

  it("cannot be pushed to a direction by a resolver that would say yes", () => {
    // The guard. "Inconclusive is embraced" is a statement about the curator's
    // freedom to say "I don't know", never a licence for a runtime to read
    // "I don't know" as "go ahead".
    const publication = realPublication();
    const member = realMember(publication);
    const forced = judgeArborBand(publication.state, [member], {
      matchesConditions: conditionMatcher(["state-specific nullability"]),
      resolveDirection: (): BandDirection => "explore",
    });
    expect(forced.direction).toBeNull();
    expect(forced.abstained).toBe("evidence-inconclusive");
  });

  it("leaves the relevance-only composition completely untouched", () => {
    const publication = realPublication();
    const member = realMember(publication);
    const plain = inspectArborComposition(publication, [member]);
    const judged = inspectArborComposition(publication, [member], {
      matchesConditions: conditionMatcher(["state-specific nullability"]),
      resolveDirection: (): BandDirection => "converge",
    });
    expect(judged.mode).toBe("relevance-only");
    expect(judged.selectionChanged).toBe(false);
    expect(judged.members).toEqual(plain.members);
    expect(judged.interactions).toEqual(plain.interactions);
    expect(judged.publication).toEqual(plain.publication);
  });

  it("abstains on the HH lens, which still carries no direction", () => {
    // Even if the claim were conclusive, direction could not be read: the
    // Hell-Heaven lens is `absent-no-accepted-record` upstream. Two independent
    // reasons the band does not move, and both are disclosed.
    const publication = realPublication();
    const member = realMember(publication);
    const real = member.report.lenses.hellHeaven;
    expect(real.availability).toBe("absent");
    expect(real.upstreamStatus).toBe("absent-no-accepted-record");
  });
});
