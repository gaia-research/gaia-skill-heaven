import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GithubFleetSource,
  readSkillFrontmatter,
  type GithubFleetCheckout,
} from "../src/data/fleet-source.js";
import { GaiaService } from "../src/service.js";

const roots: string[] = [];
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureCheckout(): Promise<{
  root: string;
  checkout: GithubFleetCheckout;
  cleanup: ReturnType<typeof vi.fn>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "fleet-source-test-"));
  roots.push(root);
  const cleanup = vi.fn(async () => undefined);
  return {
    root,
    cleanup,
    checkout: {
      path: root,
      repoUrl: "https://github.com/example/skills.git",
      webUrl: "https://github.com/example/skills",
      commit: COMMIT,
      contributor: "example",
      cleanup,
    },
  };
}

describe("GithubFleetSource", () => {
  it("discovers flat SKILL.md directories and classifies Matt Pocock invocation metadata", async () => {
    const { root, checkout, cleanup } = await fixtureCheckout();
    await mkdir(path.join(root, "skills", "ask-human"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "ask-human", "SKILL.md"),
      `---\nname: ask-human\ndescription: >-\n  Human orchestrator for a deliberate flow.\ndisable-model-invocation: true\n---\n`,
    );
    await mkdir(path.join(root, "skills", "diagnose"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "diagnose", "SKILL.md"),
      `---\nname: diagnosing-bugs\ndescription: Diagnose hard bugs with evidence.\n---\n`,
    );

    const source = new GithubFleetSource("https://github.com/example/skills", {
      checkout: async () => checkout,
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });
    const snapshot = await source.load();
    const skills = snapshot.named.buckets.fleet ?? [];

    expect(skills).toHaveLength(2);
    expect(skills.map(({ name, invocation }) => ({ name, invocation }))).toEqual([
      { name: "ask-human", invocation: "human" },
      { name: "diagnosing-bugs", invocation: "model" },
    ]);
    expect(skills[0]?.genericSkillRef).toBeUndefined();
    expect(skills[0]?.links.github).toBe(
      `https://github.com/example/skills/blob/${COMMIT}/skills/ask-human/SKILL.md`,
    );
    expect(snapshot.source).toMatchObject({
      kind: "fleet",
      commit: COMMIT,
      rootUrl: "https://github.com/example/skills",
    });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("reports collection-only routing and relevance-searches without generic refs", async () => {
    const { root, checkout } = await fixtureCheckout();
    await mkdir(path.join(root, "debug"), { recursive: true });
    await writeFile(
      path.join(root, "debug", "SKILL.md"),
      `---\nname: evidence-debugger\ndescription: Diagnose failing and slow systems.\n---\n`,
    );
    const service = new GaiaService(
      new GithubFleetSource("https://github.com/example/skills", {
        checkout: async () => checkout,
      }),
    );
    const result = await service.search({ query: "diagnose slow failure" });
    expect(result.results[0]).toMatchObject({
      name: "evidence-debugger",
      invocation: "model",
    });
    expect(result.meta).toMatchObject({
      sourceKind: "fleet",
      routingMode: "collection-only",
    });
    expect(result.meta.warnings.join(" ")).toContain("no generic map");
  });

  it("rejects empty fleets and still cleans up", async () => {
    const { checkout, cleanup } = await fixtureCheckout();
    const source = new GithubFleetSource("https://github.com/example/empty", {
      checkout: async () => checkout,
    });
    await expect(source.load()).rejects.toThrow("no discoverable SKILL.md");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe("readSkillFrontmatter", () => {
  it("parses quoted and folded scalar metadata", () => {
    expect(
      readSkillFrontmatter(
        `---\nname: "ask-matt"\ndescription: >-\n  Route to the right\n  reusable skill.\ndisable-model-invocation: true\n---\n`,
      ),
    ).toEqual({
      name: "ask-matt",
      description: "Route to the right reusable skill.",
      "disable-model-invocation": "true",
    });
  });
});
