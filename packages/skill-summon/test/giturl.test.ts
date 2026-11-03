import { describe, expect, it } from "vitest";

import { parseGithubUrl } from "../src/summon/giturl.js";

describe("parseGithubUrl", () => {
  it("decodes valid GitHub subpaths without changing explicit source behavior", () => {
    expect(
      parseGithubUrl(
        "https://github.com/example/skills/blob/main/skills%2Freview/SKILL.md",
      ),
    ).toEqual({
      repoUrl: "https://github.com/example/skills.git",
      branch: "main",
      subpath: "skills/review",
    });
    expect(parseGithubUrl("https://example.test/repo.git")).toEqual({
      repoUrl: "https://example.test/repo.git",
      branch: null,
      subpath: "",
    });
  });

  it.each([
    "https://github.com/example/skills/tree/main/../outside",
    "https://github.com/example/skills/tree/main/%2e%2e/outside",
    "https://github.com/example/skills/blob/main/skills/%2e%2e/%2e%2e/outside/SKILL.md",
    "https://github.com/example/skills/tree/main/skills%2F..%2F..%2Foutside",
  ])("rejects URL-decoded repository traversal: %s", (url) => {
    expect(() => parseGithubUrl(url)).toThrow(/escapes the repository/u);
  });
});
