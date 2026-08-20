import { describe, expect, it } from "vitest";

import { renderSummonCard } from "../src/summon/card.js";
import type { InstalledSkill } from "../src/summon/session.js";

const base: Omit<InstalledSkill, "card"> = {
  id: "fixture/review",
  name: "Fixture Review",
  contributor: "fixture",
  sourceUrl: "https://github.com/example/review/blob/main/SKILL.md",
  repoUrl: "https://github.com/example/review.git",
  branch: "main",
  subpath: "",
  path: "/tmp/skill-summon-session-fixture/skills/fixture__review",
  fileCount: 4,
  sha256: "abc",
  cacheState: "warm",
  cache: "warm",
  cacheSource: "session",
  inspectUrl: "https://github.com/example/review/blob/main/SKILL.md",
  cloneSeconds: 0,
  materializeSeconds: 0,
  totalSeconds: 0.012,
};

describe("summon result card", () => {
  it("renders arbitrary trust fields without field-specific card code", () => {
    const card = renderSummonCard(
      {
        ...base,
        trust: {
          assuranceIndex: { value: "aurora", score: 9 },
          curatorRank: "first-light",
        },
      },
      {
        mode: "trust-then-relevance",
        trustFields: ["assuranceIndex"],
        disclosure: "trust",
      },
    );

    expect(card).toContain("Assurance Index aurora · Curator Rank first-light");
    expect(card).toContain("Install: 0.012s · warm/session · 4 files");
    expect(card).toContain(`Inspect: ${base.inspectUrl}`);
  });

  it("omits the trust row and discloses relevance-only ranking", () => {
    const card = renderSummonCard(base, {
      mode: "relevance-only",
      trustFields: [],
      disclosure: "relevance",
    });

    expect(card).not.toContain("Trust:");
    expect(card).not.toContain("n/a");
    expect(card).toContain(
      "Ranking: relevance only — tree published no comparable trust signals",
    );
    expect(card).toContain("Invocation: unclassified");
  });

  it("discloses human-led Heaven and model-led Hell classification", () => {
    const ranking = {
      mode: "relevance-only" as const,
      trustFields: [],
      disclosure: "relevance",
    };
    expect(renderSummonCard({ ...base, invocation: "human" }, ranking)).toContain(
      "Invocation: human-led · Skill Heaven · explicit invocation only",
    );
    expect(renderSummonCard({ ...base, invocation: "model" }, ranking)).toContain(
      "Invocation: model-led · Skill Hell · may be reached automatically",
    );
  });
});
