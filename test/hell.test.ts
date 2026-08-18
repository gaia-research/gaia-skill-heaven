import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUNG_BUDGETS, renderCard, renderHell } from "../plugins/skill-heaven/scripts/render-hell.mjs";

let root: string;
let previousBin: string | undefined;
let previousSkill: string | undefined;
let previousArgs: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skill-hell-card-"));
  const skill = join(root, "skill");
  mkdirSync(join(skill, "reference"), { recursive: true });
  writeFileSync(join(skill, "SKILL.md"), "# Canary\n\nCARD_BODY_MUST_NOT_BE_PASTED\n");
  writeFileSync(join(skill, "reference", "note.md"), "sibling survives\n");
  const engine = join(root, "skill-hell");
  writeFileSync(
    engine,
    `#!/usr/bin/env node\nconst fs=require("node:fs"); fs.writeFileSync(process.env.FAKE_ARGS, JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify({query:"code review",summoned:[{id:"canary",name:"Canary",path:process.env.FAKE_SKILL,fileCount:3,totalSeconds:0.42,cacheState:"warm",trustFields:{stars:9,source:"tree"}}]}));\n`,
  );
  chmodSync(engine, 0o755);
  previousBin = process.env.SKILL_HELL_BIN;
  previousSkill = process.env.FAKE_SKILL;
  previousArgs = process.env.FAKE_ARGS;
  process.env.SKILL_HELL_BIN = engine;
  process.env.FAKE_SKILL = skill;
  process.env.FAKE_ARGS = join(root, "args.json");
});

afterEach(() => {
  if (previousBin === undefined) delete process.env.SKILL_HELL_BIN;
  else process.env.SKILL_HELL_BIN = previousBin;
  if (previousSkill === undefined) delete process.env.FAKE_SKILL;
  else process.env.FAKE_SKILL = previousSkill;
  if (previousArgs === undefined) delete process.env.FAKE_ARGS;
  else process.env.FAKE_ARGS = previousArgs;
  rmSync(root, { recursive: true, force: true });
});

describe("/skill-hell chooser and budgets", () => {
  it("defaults the chooser to high and keeps ultra unratified", () => {
    const text = renderHell([]).text;
    expect(text).toContain("high · xhigh · max · ultra");
    expect(text).toContain("● high    default");
    expect(text).toContain("⊘ ultra   UNRATIFIED");
    expect(text).not.toMatch(/P2|gated/i);
  });

  it("arms each ratified rung with a bounded per-gap budget", () => {
    expect(RUNG_BUDGETS).toEqual({
      high: { count: 1, band: "tight", relevance: "best relevant match only" },
      xhigh: { count: 3, band: "balanced", relevance: "matches within 10% of the best score" },
      max: { count: 5, band: "wide", relevance: "matches within 25% of the best score" },
    });
    for (const [level, budget] of Object.entries(RUNG_BUDGETS)) {
      const text = renderHell([level]).text;
      expect(text).toContain(`armed: ${level}`);
      expect(text).toContain(`up to ${budget.count} skill`);
      expect(text).toContain("lane remains armed");
    }
  });

  it("refuses ultra only because it is unratified", () => {
    const result = renderHell(["ultra"]);
    expect(result.ok).toBe(false);
    expect(result.text).toContain("UNRATIFIED");
    expect(result.text).not.toMatch(/P2|gated/i);
  });
});

describe("manual summon cards", () => {
  it("prints a card, carries arbitrary tree trust fields, and never pastes the body", () => {
    const result = renderHell(["code", "review"]);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("┌ summoned · Canary");
    expect(result.text).toContain("stars: 9");
    expect(result.text).toContain("source: tree");
    expect(result.text).toContain("install: 0.42s · warm");
    expect(result.text).toContain("files: 3");
    expect(result.text).toContain("path:");
    expect(result.text).toContain("inspect: file://");
    expect(result.text).not.toContain("CARD_BODY_MUST_NOT_BE_PASTED");
    expect(JSON.parse(readFileSync(process.env.FAKE_ARGS!, "utf8"))).toEqual([
      "summon",
      "code review",
      "--limit",
      "1",
      "--json",
    ]);
  });

  it("passes the armed rung count through the bounded engine seam", () => {
    expect(renderHell(["--summon-level", "xhigh", "code review"]).ok).toBe(true);
    expect(JSON.parse(readFileSync(process.env.FAKE_ARGS!, "utf8"))).toContain("3");
  });

  it("omits trust and cost fields that the tree did not publish", () => {
    const text = renderCard({ name: "Identity only", path: join(root, "skill") });
    expect(text).toContain("summoned · Identity only");

    // Assert on the card's LABELS, not on substrings anywhere in the text. The
    // card embeds an absolute path, and a loose case-insensitive /TM/ matches
    // the literal "tm" in Linux's /tmp — so the obvious version of this test
    // passes on macOS (/var/folders/.../T/) and fails for every Linux user.
    const labels = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z][\w ]*:/.test(line))
      .map((line) => line.split(":")[0]);
    expect(labels).toEqual(["path", "inspect", "status"]);
    expect(text).not.toContain("n/a");
  });

  it("never shows timing without cache state or cache state without timing", () => {
    expect(renderCard({ id: "a", path: join(root, "skill"), totalSeconds: 1.2 })).not.toContain("install:");
    expect(renderCard({ id: "b", path: join(root, "skill"), cacheState: "cold" })).not.toContain("install:");
  });
});
