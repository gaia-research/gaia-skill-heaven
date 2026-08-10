import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSkill } from "skill-zero";
import { censusStandingDose } from "../src/census.js";

let root: string;
let emptyRoot: string;

function writeSkill(dir: string, name: string, description: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\nbody\n`);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ch-census-a-"));
  emptyRoot = mkdtempSync(join(tmpdir(), "ch-census-empty-"));
  writeSkill(join(root, "alpha"), "alpha", "does alpha things");
  writeSkill(join(root, "beta"), "beta", "does beta things");
  mkdirSync(join(root, "not-a-skill")); // no SKILL.md → ignored
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(emptyRoot, { recursive: true, force: true });
});

describe("censusStandingDose", () => {
  it("cross-checks core resolveSkill exactly (the census.ts method)", () => {
    const c = censusStandingDose([root]);
    const expected = resolveSkill(join(root, "alpha")).standingTokens + resolveSkill(join(root, "beta")).standingTokens;
    expect(c.standingTotal).toBe(expected);
    expect(c.skillCount).toBe(2);
    expect(c.tokenizer).toBe("chars4");
    expect(c.scope).toBe("user+project");
  });

  it("ignores dirs without SKILL.md", () => {
    const c = censusStandingDose([root]);
    expect(c.skills.map((s) => s.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("records a missing root as exists:false, readable:true, not incomplete", () => {
    const missing = join(emptyRoot, "does-not-exist");
    const c = censusStandingDose([missing]);
    expect(c.standingTotal).toBe(0);
    expect(c.roots[0]).toMatchObject({ root: missing, exists: false, readable: true, skillCount: 0 });
    expect(c.incomplete).toBe(false); // absent ≠ unreadable
  });

  it("flags an unreadable (but existing) root as incomplete — a 0 it did not verify", () => {
    // chmod 000 makes readdir throw EACCES for a non-root user. Root bypasses
    // perms, so skip there; also skip if the chmod didn't actually block us.
    const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
    if (isRoot) return;
    const locked = mkdtempSync(join(tmpdir(), "ch-census-locked-"));
    writeSkill(join(locked, "hidden"), "hidden", "unreadable skill");
    chmodSync(locked, 0o000);
    try {
      readdirSync(locked);
      return; // chmod didn't block (unusual fs) — skip rather than assert falsely
    } catch {
      /* good: it's unreadable */
    }
    try {
      const c = censusStandingDose([locked]);
      expect(c.roots[0]).toMatchObject({ exists: true, readable: false, skillCount: 0 });
      expect(c.incomplete).toBe(true);
    } finally {
      chmodSync(locked, 0o700);
      rmSync(locked, { recursive: true, force: true });
    }
  });

  it("de-dupes by id across roots (first root wins)", () => {
    const second = mkdtempSync(join(tmpdir(), "ch-census-b-"));
    writeSkill(join(second, "alpha"), "alpha", "a shadowing alpha");
    const c = censusStandingDose([root, second]);
    expect(c.skillCount).toBe(2); // alpha counted once, not twice
    expect(c.roots[1].skillCount).toBe(0); // second root's alpha was a dup
    rmSync(second, { recursive: true, force: true });
  });

  // KC2 (Issue #9): the literal "user+project" is the join point two
  // independent downstream renderers key off (src/statusline.ts's
  // `scopeCaveat`, plugin/scripts/render-posture.mjs's `scopeNote`) to decide
  // whether to disclose bundled/plugin skills as excluded. Neither renderer
  // re-derives this from census.ts's roots — they branch on the string value
  // alone — so a silent rename here would silently drop the KC2 disclosure on
  // BOTH surfaces with no test in either renderer file catching it (their
  // tests hand-construct manifests, they don't call censusStandingDose). This
  // pins the literal so a rename fails loudly, here, first.
  it("emits the exact scope literal the KC2 disclosure logic keys off, even for zero roots", () => {
    const c = censusStandingDose([]);
    expect(c.scope).toBe("user+project");
    expect(c.standingTotal).toBe(0);
  });
});
