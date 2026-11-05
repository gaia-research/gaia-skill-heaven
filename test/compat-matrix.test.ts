import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RECEIPT } from "../packages/site/src/release.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

// #35: the compat workflow's pinned Claude Code version must be the version the
// product's live receipt was probed on, so the matrix cannot quietly drift from
// the evidence. RECEIPT.claude (release.ts) is the single source of truth.
describe("harness compat matrix (#35)", () => {
  it("pins the workflow's blocking cell to the live-probed Claude Code version", () => {
    const wf = read(".github/workflows/harness-compat.yml");
    expect(wf).toContain(`version: '${RECEIPT.claude}'`);
    expect(wf).toMatch(/version: 'latest'\n\s+pinned: false/);
    expect(wf).toMatch(/continue-on-error: \$\{\{ !matrix\.pinned \}\}/);
  });

  it("states the pinned version and the session-level limit in docs/COMPAT-MATRIX.md", () => {
    const doc = read("docs/COMPAT-MATRIX.md");
    expect(doc).toContain(RECEIPT.claude);
    expect(doc).toContain("docs/evidence/hooks-123/PROBE.md");
    expect(doc).toMatch(/session-level behaviou?r for `latest` is unverified/i);
  });
});
