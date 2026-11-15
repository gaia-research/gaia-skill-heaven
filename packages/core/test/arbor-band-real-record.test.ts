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
import { resolveArborIdentity, type ArborIdentityContext } from "../src/arbor/identity.js";
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
  it("is a content-pinned join whose inapplicable runtime is disclosed and not treated as applicable evidence", () => {
    const publication = realPublication();
    const member = realMember(publication);
    expect(member.report.join).toBe("content-pinned");
    expect(member.report.applicability).toMatchObject({
      applicable: false,
      identityVersion: "gaia.arbor-behavioral-identity/v1",
      canonical: "behavior-equivalent",
      instruction: { status: "mutable-ref-unobserved", refKind: "mutable", baselineSha256: null },
    });
    expect(member.report.lenses.claims.availability).toBe("unknown");
    expect(member.report.lenses.claims.upstreamStatus).toBe("present");
    expect(member.report.lenses.claims.reason).toMatch(/inapplicable.*mutable-ref-unobserved/u);
    expect(member.report.lensesConsulted).not.toContain("claims");
    expect(member.report.claims).toEqual([]);
    expect(member.report.note).toMatch(/inapplicable.*mutable-ref-unobserved/u);
  });

  it("abstains with no-governed-claim when the runtime is marked inapplicable, even when conditions match", () => {
    const publication = realPublication();
    const member = realMember(publication);
    const matches = conditionMatcher([
      "adjudicate a plausible code-review suggestion",
      "state-specific nullability",
    ]);
    const result = judgeArborBand(publication.state, [member], { matchesConditions: matches });
    expect(result.members[0]).toMatchObject({
      state: "evidence-absent", matched: false, governedCount: 0,
      support: [],
    });
    expect(result).toMatchObject({ direction: null, abstained: "no-governed-claim" });
  });

  it("cannot be pushed to a direction by a resolver that would say yes", () => {
    const publication = realPublication();
    const member = realMember(publication);
    const forced = judgeArborBand(publication.state, [member], {
      matchesConditions: conditionMatcher(["state-specific nullability"]),
      resolveDirection: (): BandDirection => "explore",
    });
    expect(forced.direction).toBeNull();
    expect(forced.abstained).toBe("no-governed-claim");
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

describe.skipIf(!HAVE_TREE)("refreshed Arbor I seed publication and identity joins", () => {
  const IDENTITY_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../plugins/skill-heaven/data/arbor-identity.json",
  );

  function fullPublication() {
    const index = JSON.parse(
      readFileSync(join(TREE_ARBOR, "runtime/index.json"), "utf8"),
    ) as { subjects: { id: string; contentSha256: string }[] };
    const runtimes = index.subjects.map((s) => ({
      path: `runtime/${s.id}/${s.contentSha256}.json`,
      document: JSON.parse(
        readFileSync(join(TREE_ARBOR, "runtime", ...s.id.split("/"), `${s.contentSha256}.json`), "utf8"),
      ),
    }));
    return readArborPublication({
      provenance: null,
      runtimeIndex: index,
      edgeIndex: JSON.parse(readFileSync(join(TREE_ARBOR, "edges.json"), "utf8")),
      runtimes,
    });
  }

  it("loads all 22 subjects and 3 declared edges with zero validation problems", () => {
    const publication = fullPublication();
    expect(publication.state).toBe("loaded");
    expect(publication.problems).toEqual([]);
    expect(publication.subjects).toHaveLength(22);
    expect(publication.edgeIndex?.edges).toHaveLength(3);
  });

  it("joins 16 refreshed subjects content-pinned against arbor-identity.json and reports 6 version mismatches", () => {
    const publication = fullPublication();
    const identity = JSON.parse(readFileSync(IDENTITY_PATH, "utf8")) as ArborIdentityContext;
    const pinned: string[] = [];
    const mismatched: string[] = [];

    for (const subject of publication.subjects) {
      const idResolution = resolveArborIdentity(identity, {
        skillId: subject.id,
        sourceUrl: identity.skills[subject.id]?.sourceUrl,
        corpusRevision: identity.commit,
      });
      expect(idResolution.pinned).toBe(true);
      const report = consumeArbor(publication, {
        skillId: subject.id,
        contentSha256: idResolution.pinned ? idResolution.contentSha256 : null,
        canonicalSource: true,
      });
      if (report.join === "content-pinned") pinned.push(subject.id);
      else mismatched.push(`${subject.id}:${report.join}`);
    }

    expect(pinned).toHaveLength(16);
    expect(mismatched).toHaveLength(6);
    expect(pinned).toContain("obra/receiving-code-review");
    expect(pinned).toContain("garrytan/context-save");
    expect(pinned).toContain("garrytan/context-restore");
  });

  it("abstains on expert-declared claims (no-governed-claim) and surfaces declared edge hypotheses", () => {
    const publication = fullPublication();
    const identity = JSON.parse(readFileSync(IDENTITY_PATH, "utf8")) as ArborIdentityContext;
    const memberFor = (id: string): CompositionMember => ({
      role: "proposed",
      report: consumeArbor(publication, {
        skillId: id,
        contentSha256: identity.skills[id]!.contentSha256,
        canonicalSource: true,
      }),
    });

    const save = memberFor("garrytan/context-save");
    const restore = memberFor("garrytan/context-restore");
    expect(save.report.claims.every((c) => c.support === "expert-declared" && c.interpretationSource === null)).toBe(true);

    const composition = inspectArborComposition(publication, [save, restore], {
      matchesConditions: () => true,
      resolveDirection: () => "explore",
    });
    expect(composition.mode).toBe("relevance-only");
    expect(composition.selectionChanged).toBe(false);
    expect(composition.band.direction).toBeNull();
    expect(composition.band.abstained).toBe("no-governed-claim");
    expect(composition.interactions).toHaveLength(1);
    expect(composition.interactions[0]).toMatchObject({
      endpointIdentity: "both-pinned",
      applicability: "conditions-unverified",
      edge: {
        relation: "unlocks",
        support: "expert-declared",
        pairApplicable: true,
        interpretationSource: null,
      },
    });
  });
});
