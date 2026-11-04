// Founder ruling, 2026-11-04: the core plugin installs no hooks. Anything that
// fires in a session where Skill Heaven is not being used counts as bloat, and
// a hook bundled into a plugin cannot be removed without removing the plugin.
// The zero cut is enforced by the summon server instead (#123,
// packages/skill-summon/src/zero-cut.ts).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "plugins", "skill-heaven");
const json = (rel: string) => JSON.parse(readFileSync(join(PLUGIN, rel), "utf-8"));

describe("core skill-heaven plugin — no hooks", () => {
  it("ships no hooks directory, at the conventional path or any other", () => {
    expect(existsSync(join(PLUGIN, "hooks"))).toBe(false);
  });

  it("declares no hooks in any client manifest", () => {
    for (const manifest of [".claude-plugin/plugin.json", "plugin.json", ".codex-plugin/plugin.json"]) {
      expect(json(manifest).hooks, manifest).toBeUndefined();
    }
  });
});
