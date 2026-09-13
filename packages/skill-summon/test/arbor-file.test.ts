import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfinedArborFile } from "../src/data/arbor-file.js";
import * as session from "../src/summon/session.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Arbor kernel-enforced file opening", () => {
  async function fixture() {
    const base = await mkdtemp(join(tmpdir(), "arbor-atomic-test-"));
    roots.push(base);
    const parent = join(base, "parent");
    const root = join(parent, "publication");
    const sub = join(root, "sub");
    const file = join(sub, "file.json");
    await mkdir(sub, { recursive: true });
    await writeFile(file, "inside");
    const outside = join(base, "outside");
    await mkdir(join(outside, "publication", "sub"), { recursive: true });
    await writeFile(join(outside, "publication", "sub", "file.json"), "outside");
    return { base, parent, root, sub, file, outside };
  }

  it("reads an ordinary regular file", async () => {
    const { root, file } = await fixture();
    expect((await readConfinedArborFile(root, file)).toString()).toBe("inside");
  });

  it.each(["leaf", "directory", "ancestor"])(
    "refuses a %s replaced with a symlink AFTER successful confinement checks",
    async (kind) => {
      const f = await fixture();
      const original = session.assertConfinedPath;
      const replaced = kind === "leaf" ? f.file : kind === "directory" ? f.sub : f.parent;
      const destination = kind === "leaf"
        ? join(f.outside, "publication", "sub", "file.json")
        : kind === "directory" ? join(f.outside, "publication", "sub") : f.outside;
      vi.spyOn(session, "assertConfinedPath").mockImplementationOnce(async (...args) => {
        await original(...args);
        await rename(replaced, join(f.base, "held"));
        await symlink(destination, replaced);
        // Prove a plain post-check read WOULD follow the substituted path.
        expect(await readFile(f.file, "utf8")).toBe("outside");
      });
      await expect(readConfinedArborFile(f.root, f.file)).rejects.toThrow();
    },
  );
});
