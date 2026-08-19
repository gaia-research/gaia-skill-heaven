import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { VERSION } from "../src/index.js";

// gaia-mcp (the upstream this package is ported from) shipped a real bug
// here: dist/version.js was stamped 0.1.0 while package.json said 0.3.0 —
// nothing asserted they stayed in sync. This test is the fix: it fails hard
// the moment src/version.ts and package.json disagree again.
describe("release versioning", () => {
  it("keeps the package and runtime versions synchronized", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(VERSION).toBe(packageJson.version);
  });

  it("stamps the runtime version in the release-please-friendly format", async () => {
    const runtimeVersionSource = await readFile(
      new URL("../src/version.ts", import.meta.url),
      "utf8",
    );
    expect(runtimeVersionSource).toMatch(
      /VERSION = "[^"]+"; \/\/ x-release-please-version/u,
    );
  });
});
