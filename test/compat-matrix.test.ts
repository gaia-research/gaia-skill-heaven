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

// #35 (pi / codex): the pinned cells must equal the versions the Linux credential-free
// probe record names, so a bump of either side without the other fails here instead of
// drifting silently.
describe("harness compat matrix: pi and codex pins (#35)", () => {
  const probe = read("docs/evidence/linux-41/PROBE.md");
  const probed = {
    pi: /`pi` (\d+\.\d+\.\d+)/.exec(probe)?.[1],
    codex: /codex-cli (\d+\.\d+\.\d+)/.exec(probe)?.[1],
  };
  const wf = read(".github/workflows/harness-compat.yml");
  const jobBlock = (name: string): string => {
    const start = wf.indexOf(`\n  ${name}:\n`);
    expect(start, `job ${name} missing`).toBeGreaterThan(-1);
    const next = wf.slice(start + 1).search(/\n  [a-z-]+:\n/);
    return next < 0 ? wf.slice(start) : wf.slice(start, start + 1 + next);
  };

  for (const [harness, pkg] of [
    ["pi", "@earendil-works/pi-coding-agent"],
    ["codex", "@openai/codex"],
  ] as const) {
    it(`${harness}: workflow pin equals the probed version, latest is informational`, () => {
      expect(probed[harness], `${harness} version not found in linux-41 PROBE.md`).toBeDefined();
      const job = jobBlock(harness);
      expect(job).toContain(`version: '${probed[harness]}'`);
      expect(job).toMatch(/version: 'latest'\n\s+pinned: false/);
      expect(job).toMatch(/continue-on-error: \$\{\{ !matrix\.pinned \}\}/);
      expect(job).toContain(`npm install -g ${pkg}@\${{ matrix.version }}`);
      // the pinned cell asserts the installed version equals the pin
      expect(job).toContain(`node scripts/compat-check.mjs ${harness} --pin \${{ matrix.version }}`);
    });

    it(`${harness}: COMPAT-MATRIX.md states the pin and the package`, () => {
      const doc = read("docs/COMPAT-MATRIX.md");
      expect(doc).toContain(`\`${probed[harness]}\``);
      expect(doc).toContain(`\`${pkg}\``);
      expect(doc).toContain(`node scripts/compat-check.mjs ${harness} --pin ${probed[harness]}`);
    });
  }

  it("has no cell for harnesses without a verified pinned install route, and says why", () => {
    for (const none of ["hermes", "grok", "agy"]) {
      expect(wf, `${none} cell added without a pinned install route`).not.toMatch(new RegExp(`\\n  ${none}:\\n`));
    }
    expect(read("docs/COMPAT-MATRIX.md")).toMatch(/hermes, grok, agy: no CI cell/);
  });

  it("tags the evidence levels and states that no CI cell is a session cell", () => {
    const doc = read("docs/COMPAT-MATRIX.md");
    for (const level of ["structural", "dry-run", "session"]) expect(doc).toContain(`**${level}**`);
    expect(doc).toMatch(/No CI cell is at this level/);
  });

  it("badge points at a workflow file that exists", () => {
    const m = /actions\/workflows\/([\w.-]+\.yml)\/badge\.svg/.exec(read("docs/COMPAT-MATRIX.md"));
    expect(m?.[1]).toBeDefined();
    expect(() => read(`.github/workflows/${m![1]}`)).not.toThrow();
  });
});
