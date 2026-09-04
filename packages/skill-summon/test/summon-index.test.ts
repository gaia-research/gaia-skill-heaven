import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadCommittedIndex,
  resetCommittedIndexCache,
  expandSource,
} from "../src/data/skill-index-source.js";
import { InMemoryGaiaRegistrySource } from "../src/data/source.js";
import { GaiaService } from "../src/service.js";
import { openSession } from "../src/summon/session.js";
import { summon } from "../src/summon/summon.js";
import { SUMMON_LOG_FILE } from "../src/summon/log.js";
import type { GaiaRegistryDocuments } from "../src/domain/types.js";

const documents: GaiaRegistryDocuments = {
  generic: {
    generatedAt: "2026-07-16T00:00:00Z",
    skills: [
      {
        id: "automated-testing",
        name: "Automated Testing",
        type: "basic",
        description: "Automated testing.",
        prerequisites: [],
        derivatives: [],
        evidence: [],
        status: "awakened",
      },
    ],
  },
  named: {
    generatedAt: "2026-07-16T00:00:00Z",
    buckets: {
      "automated-testing": [
        {
          id: "example/health",
          name: "Health",
          contributor: "example",
          genericSkillRef: "automated-testing",
          status: "named",
          description: "Runs the automated test suite and reports failures.",
          tags: ["testing"],
          links: { github: "https://github.com/example/health/blob/main/SKILL.md" },
          evidence: [],
          installable: false,
        },
      ],
    },
  },
};

const roots: string[] = [];

afterEach(async () => {
  resetCommittedIndexCache();
  delete process.env.SKILL_INDEX_PATH;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function session() {
  const active = await openSession();
  roots.push(active.root);
  return active;
}

describe("the committed index", () => {
  it("loads without a network call and carries the corpus", async () => {
    const index = await loadCommittedIndex();
    expect(index.schema).toBe("gaia.skill-index/v1");
    expect(index.docs.length).toBeGreaterThan(250);
    expect(index.source).toBe("https://gaiaskilltree.com");
  });

  it("reports a calibrated floor, and what that calibration achieved", async () => {
    const index = await loadCommittedIndex();
    expect(index.stats.floor).toBeGreaterThan(0);

    // The floor is calibrated, never guessed, and it always reports BOTH
    // sides of the trade: what fraction of answerable queries it still admits
    // and what fraction of unanswerable ones it rejects. A floor that bought
    // its rejection rate by refusing real queries would be visible here.
    const calibration = index.stats.floorCalibration;

    // The calibration policy is fixed in advance: the highest threshold that
    // still admits >= 90% of the gold set. That is the invariant. The
    // rejection rate is an OUTCOME of it and is asserted only to be reported,
    // never to be met — a test that required G2 to pass here would be a
    // standing invitation to move the floor until it did.
    expect(calibration?.answerableAdmitted).toBeGreaterThanOrEqual(0.9);
    expect(typeof calibration?.unanswerableRejected).toBe("number");

    // When G2 cannot be met at that floor, the index says so in its own stats
    // rather than going quiet about it.
    if ((calibration?.unanswerableRejected ?? 0) < 0.9) {
      expect(calibration?.note).toMatch(/G2/);
    }
  });

  it("honours SKILL_INDEX_PATH, and skips an unreadable candidate rather than throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "skill-index-override-"));
    roots.push(root);
    const override = join(root, "skill-index.json");
    const real = await loadCommittedIndex();
    await writeFile(
      override,
      JSON.stringify({ ...real, source: "https://example.test", docs: real.docs.slice(0, 2) }),
    );

    resetCommittedIndexCache();
    process.env.SKILL_INDEX_PATH = override;
    expect((await loadCommittedIndex()).source).toBe("https://example.test");

    // A path that does not exist falls through to the next candidate — the
    // committed index — rather than failing the summon.
    resetCommittedIndexCache();
    process.env.SKILL_INDEX_PATH = join(root, "nonexistent.json");
    expect((await loadCommittedIndex()).source).toBe("https://gaiaskilltree.com");
  });
});

describe("summon over an injected source", () => {
  it("withholds a registry-only skill with a reason instead of attempting it", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const outcome = await summon(service, await session(), {
      query: "run the test suite",
      surface: "any",
    });

    expect(outcome.summoned).toEqual([]);
    expect(outcome.filtered).toEqual([
      {
        id: "example/health",
        name: "Health",
        why: expect.stringContaining("registry-only"),
      },
    ]);
    expect(outcome.noMatch?.reason).toBe("all_filtered");
    expect(outcome.skipped).toEqual([]);
  });

  it("declines rather than returning the best of a bad set", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const outcome = await summon(service, await session(), {
      query: "zzzz qqqq wwww",
      surface: "any",
    });
    expect(outcome.summoned).toEqual([]);
    expect(outcome.noMatch?.reason).toBe("no_candidates");
    expect(outcome.noMatch?.suggestion).toMatch(/source/);
  });

  it("discloses index freshness and the source on every result", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const outcome = await summon(service, await session(), { query: "testing", surface: "any" });
    expect(outcome.ranking.indexGeneratedAt).toBe("2026-07-16T00:00:00Z");
    expect(outcome.ranking.mode).toBe("relevance-only");
    expect(outcome.ranking.disclosure).toMatch(/no behavioural stamps/);
    expect(outcome.source).toBeTruthy();
  });
});

describe("preview", () => {
  it("ranks and discloses without writing a skill to disk", async () => {
    const previewable: GaiaRegistryDocuments = structuredClone(documents);
    delete previewable.named.buckets["automated-testing"]?.[0]?.installable;
    const service = new GaiaService(new InMemoryGaiaRegistrySource(previewable));
    const openSessionResult = await session();

    const outcome = await summon(service, openSessionResult, {
      query: "run the test suite",
      surface: "any",
      preview: true,
    });

    expect(outcome.summoned).toEqual([]);
    expect(outcome.previewed).toHaveLength(1);
    expect(outcome.previewed[0]?.id).toBe("example/health");
    expect(outcome.previewed[0]?.retrieval.matchKind).toBe("ranked");
    expect(openSessionResult.skills).toEqual([]);
  });
});

describe("summon-log.jsonl", () => {
  it("records the gaps that returned nothing, not just the ones that succeeded", async () => {
    const service = new GaiaService(new InMemoryGaiaRegistrySource(documents));
    const active = await session();
    await summon(service, active, { query: "zzzz qqqq", surface: "any" });
    await summon(service, active, { query: "run the test suite", surface: "any" });

    const lines = (await readFile(join(active.root, SUMMON_LOG_FILE), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ query: "zzzz qqqq", noMatch: "no_candidates" });
    expect(lines[1]).toMatchObject({ noMatch: "all_filtered", filtered: 1 });
  });
});

describe("expandSource", () => {
  it("accepts owner/repo shorthand for a flat fleet", () => {
    expect(expandSource("gaia-research/skill-scout-fleet")).toBe(
      "https://github.com/gaia-research/skill-scout-fleet",
    );
    expect(expandSource("https://gaiaskilltree.com")).toBe("https://gaiaskilltree.com");
  });
});
