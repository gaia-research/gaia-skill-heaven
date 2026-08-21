import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { materialize, type Posture } from "skill-zero";
import { planLaunch } from "../src/launcher.js";

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        out[relative(root, full)] = sha(readFileSync(full, "utf-8"));
      }
    }
  };
  walk(root);
  return out;
}

describe("pi-zero no-shared-mutation (P3)", () => {
  let scratchRoot: string;
  let fakeHome: string;
  let fakeSkillDir: string;

  beforeAll(() => {
    scratchRoot = mkdtempSync(join(tmpdir(), "pi-zero-no-mutation-"));
    fakeHome = join(scratchRoot, "home");
    fakeSkillDir = join(scratchRoot, "skills", "fixture");
    mkdirSync(join(fakeHome, ".pi", "agent"), { recursive: true });
    writeFileSync(join(fakeHome, ".pi", "agent", "settings.json"), '{"model": "test"}\n');
    mkdirSync(fakeSkillDir, { recursive: true });
    writeFileSync(join(fakeSkillDir, "SKILL.md"), "---\nname: fixture\ndescription: test\n---\n# fixture\n");
  });

  afterAll(() => {
    if (scratchRoot && existsSync(scratchRoot)) {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });

  const postures: Posture[] = ["floor", "product-floor", "curated", "native"];

  for (const posture of postures) {
    it(`guarantees zero mutation on fixture tree for posture ${posture}`, () => {
      const before = snapshotTree(scratchRoot);
      const sessionDir = mkdtempSync(join(tmpdir(), `pi-zero-sess-${posture}-`));

      try {
        const plan = planLaunch({
          posture,
          skillPaths: posture === "curated" ? [fakeSkillDir] : [],
          sessionDir,
        });

        materialize(plan.fsPlan, sessionDir);
        const after = snapshotTree(scratchRoot);
        expect(after).toEqual(before);
      } finally {
        rmSync(sessionDir, { recursive: true, force: true });
      }
    });
  }
});
