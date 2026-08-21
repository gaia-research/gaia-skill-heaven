import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTHORITY_PHRASES,
  MODES,
  readLadderData,
  renderLadder,
} from "../plugins/skill-heaven/scripts/render-ladder.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "plugins", "skill-heaven");

const COMMAND_FILES = [
  "skill-zero.md",
  "skill-heaven.md",
  "skill-hell.md",
  "skill-ultra.md",
  "summon.md",
];

const SKILL_FILES = [
  "skill-zero/SKILL.md",
  "skill-heaven/SKILL.md",
  "skill-hell/SKILL.md",
  "skill-ultra/SKILL.md",
  "summon/SKILL.md",
];

const data = readLadderData();

describe("Issue #91 static authority regression tests", () => {
  describe("render-ladder.mjs output contains zero authority-shaped phrases", () => {
    it.each(MODES)("concise mode for surface '%s' contains no authority phrases", (mode) => {
      const { text } = renderLadder({ mode, target: "", data, env: {}, manifest: null, detail: "concise" });
      for (const phrase of AUTHORITY_PHRASES) {
        expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });

    it.each(["low", "med"])("concise mode for heaven with target '%s' contains no authority phrases", (target) => {
      const { text } = renderLadder({ mode: "heaven", target, data, env: {}, manifest: null, detail: "concise" });
      for (const phrase of AUTHORITY_PHRASES) {
        expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });

    it.each(["high", "xhigh", "max"])("concise mode for hell with target '%s' contains no authority phrases", (target) => {
      const { text } = renderLadder({ mode: "hell", target, data, env: {}, manifest: null, detail: "concise" });
      for (const phrase of AUTHORITY_PHRASES) {
        expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });

    it("concise mode for summon with intent contains no authority phrases", () => {
      const { text } = renderLadder({ mode: "summon", target: "review a rust pr", data, env: {}, manifest: null, detail: "concise" });
      for (const phrase of AUTHORITY_PHRASES) {
        expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });

    it.each(["zero", "heaven", "hell", "ultra"] as const)(
      "full mode for surface '%s' contains no authority phrases",
      (mode) => {
        const { text } = renderLadder({ mode, target: "", data, env: {}, manifest: null, detail: "full" });
        for (const phrase of AUTHORITY_PHRASES) {
          expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
        }
      },
    );
  });

  describe("concise output brevity (K7)", () => {
    it.each(["zero", "heaven", "hell", "ultra"] as const)(
      "concise output for '%s' fits within 1-3 non-empty lines",
      (mode) => {
        const { text } = renderLadder({ mode, target: "", data, env: {}, manifest: null, detail: "concise" });
        const nonBlankLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        expect(nonBlankLines.length).toBeGreaterThanOrEqual(1);
        expect(nonBlankLines.length).toBeLessThanOrEqual(3);
      },
    );
  });

  describe("command markdown files contain zero authority-shaped phrases", () => {
    it.each(COMMAND_FILES)("command file %s has no authority phrases", (file) => {
      const content = readFileSync(join(PLUGIN, "commands", file), "utf-8");
      for (const phrase of AUTHORITY_PHRASES) {
        expect(content.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });
  });

  describe("skill markdown files contain zero authority-shaped phrases", () => {
    it.each(SKILL_FILES)("skill file %s has no authority phrases", (file) => {
      const content = readFileSync(join(PLUGIN, "skills", file), "utf-8");
      for (const phrase of AUTHORITY_PHRASES) {
        expect(content.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    });
  });

  describe("postures represent routing policy as plain state (K10)", () => {
    it("heaven concise output identifies posture, rung, and direction", () => {
      const { text } = renderLadder({ mode: "heaven", target: "low", data, env: {}, manifest: null, detail: "concise" });
      expect(text).toContain("Skill Heaven");
      expect(text).toContain("low");
      expect(text).toContain("converge");
      expect(text).toContain("human-led");
    });

    it("hell concise output identifies posture, rung, and direction", () => {
      const { text } = renderLadder({ mode: "hell", target: "high", data, env: {}, manifest: null, detail: "concise" });
      expect(text).toContain("Skill Hell");
      expect(text).toContain("high");
      expect(text).toContain("explore");
      expect(text).toContain("model-led");
    });

    it("ultra concise output identifies posture and adaptive routing", () => {
      const { text } = renderLadder({ mode: "ultra", target: "", data, env: {}, manifest: null, detail: "concise" });
      expect(text).toContain("Skill Ultra");
      expect(text).toContain("adaptive routing");
    });
  });
});
