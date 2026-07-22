import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSkill } from "skill-heaven";
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

  it("records a missing root as exists:false, count 0, without throwing", () => {
    const missing = join(emptyRoot, "does-not-exist");
    const c = censusStandingDose([missing]);
    expect(c.standingTotal).toBe(0);
    expect(c.roots[0]).toMatchObject({ root: missing, exists: false, skillCount: 0 });
  });

  it("de-dupes by id across roots (first root wins)", () => {
    const second = mkdtempSync(join(tmpdir(), "ch-census-b-"));
    writeSkill(join(second, "alpha"), "alpha", "a shadowing alpha");
    const c = censusStandingDose([root, second]);
    expect(c.skillCount).toBe(2); // alpha counted once, not twice
    expect(c.roots[1].skillCount).toBe(0); // second root's alpha was a dup
    rmSync(second, { recursive: true, force: true });
  });
});
