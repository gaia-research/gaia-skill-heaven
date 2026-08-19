// The shipped plugin surface: the /skill-zero command definition, the
// generated P2 gate artifact, and the manifests that describe the door.
//
// These are copy tests. WS4 acceptance says the copy is reviewed against the
// claim-discipline table before merge (B4); the assertions here are the parts of
// that review a machine can hold — the command may not promise a respawn, may
// not price a skill as one number, and may not advertise a surface that does not
// exist yet.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeListingLine, tokenize } from "skill-zero";
import {
  buildLadderArtifact,
  ladderArtifactPath,
  serializeLadderArtifact,
} from "../packages/claude-zero/scripts/generate-ladder.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(REPO, "plugins", "skill-heaven");

/** One mechanic, five entry points (docs/AGENT-PLUGIN.md). Each rung command
 * renders the SAME line through the SAME renderer; only the surface argument
 * differs. `summon` is the manual path and is present at every rung. */
const SURFACES = [
  { file: "skill-zero.md", mode: "zero" },
  { file: "skill-heaven.md", mode: "heaven" },
  { file: "skill-hell.md", mode: "hell" },
  { file: "skill-ultra.md", mode: "ultra" },
  { file: "summon.md", mode: "summon" },
] as const;

const commands = new Map(
  SURFACES.map((s) => [s.file, readFileSync(join(PLUGIN, "commands", s.file), "utf-8")] as const),
);
const command = commands.get("skill-zero.md")!;

/** gate (c): the priced budget for /skill-zero's own standing line. The
 * command's self-dose must not exceed the budget the gate set, including the
 * ~4-tok allowance for a plugin-name-prefixed listing id. */
const GATE_C_BUDGET_TOKENS = 31;

function frontmatter(md: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!m) throw new Error("command file has no frontmatter");
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

describe.each(SURFACES)("$file", ({ file, mode }) => {
  const source = commands.get(file)!;
  const fm = frontmatter(source);
  const slash = file.replace(/\.md$/, "");

  it("declares a description and the narrowest tool grant it needs", () => {
    expect(fm.description).toBeTruthy();
    // Every surface runs exactly one thing: node, on the one shipped renderer.
    // Everything but /skill-zero also calls the summon MCP tool — /skill-zero is
    // the floor, so it is the one surface that must NOT hold that grant.
    expect(fm["allowed-tools"]).toBe(
      mode === "zero" ? "Bash(node:*)" : "Bash(node:*), mcp__skill-summon__summon",
    );
  });

  it("prices at or under the gate (c) budget, prefixed and unprefixed", () => {
    for (const id of [slash, `skill-heaven:${slash}`]) {
      const dose = tokenize(makeListingLine(id, fm.description), "chars4");
      expect(dose, `${id} self-dose`).toBeLessThanOrEqual(GATE_C_BUDGET_TOKENS);
    }
  });

  it("invokes the ONE shipped renderer through the interpolated plugin root", () => {
    // Probed on 2.1.216: ${CLAUDE_PLUGIN_ROOT} is substituted into the command
    // markdown (it is NOT exported to the bash child), and $ARGUMENTS is
    // shell-escaped before substitution.
    expect(source).toContain(
      `node "\${CLAUDE_PLUGIN_ROOT}/scripts/render-ladder.mjs" ${mode}`,
    );
    expect(source).toContain("'$ARGUMENTS'");
    expect(existsSync(join(PLUGIN, "scripts", "render-ladder.mjs"))).toBe(true);
  });

  it("never uses the retired control words", () => {
    expect(source).not.toMatch(/\bslider\b|\bnotch(es)?\b|\bpicker\b/i);
  });

  it("pins the rendered block as verbatim, un-embellished copy", () => {
    expect(source).toMatch(/verbatim/i);
    expect(source).toMatch(/⛔/);
  });

  it("never presents routing as stamp- or trust-gated (stamps are not built)", () => {
    expect(source).not.toMatch(/stamp-gated routing (is|are) (live|running|on)/i);
    if (mode !== "zero") {
      expect(source.replace(/\s+/g, " ")).toContain("Heaven/Hell stamps are not");
    }
  });

  it("never claims a rung is unratified, gated or locked (N13)", () => {
    expect(source).not.toMatch(/\bUNRATIFIED\b/);
    expect(source).not.toMatch(/\bultra is (gated|locked|sealed)\b/i);
  });
});

describe("/skill-zero command definition", () => {
  it("uses the founder-ratified ladder vocabulary", () => {
    expect(command).toMatch(/\bladder\b.*\brung\b/i);
  });

  it("holds the numbers discipline and refuses to route around a refusal", () => {
    expect(command).toMatch(/Do not add posture, token or savings numbers of your own/);
    expect(command).toMatch(/If the block is a `⛔` refusal, print the refusal and nothing else/);
    expect(command.replace(/\s+/g, " ")).toContain("Do not route around a refusal");
  });

  it("never claims the command can restart Claude Code (D12 / B4)", () => {
    expect(command.replace(/\s+/g, " ")).toContain("Nothing can restart Claude Code from inside a session");
    expect(command).not.toMatch(/\b(relaunch|restart)(ing)? (it|the session|claude) for (you|them)\b/i);
  });

  it("never claims the cut emptied an already-loaded session (D12)", () => {
    expect(command.replace(/\s+/g, " ")).toContain("Already-loaded skills cannot be evicted mid-session");
  });
});

describe("the auto-summon protocol", () => {
  it.each(["skill-heaven.md", "skill-hell.md", "skill-ultra.md"] as const)(
    "%s arms a lane and states the disclosure rule",
    (file) => {
      const source = commands.get(file)!;
      const flat = source.replace(/\s+/g, " ");
      expect(flat).toContain("standing instruction for this conversation");
      expect(flat).toContain("never preemptively");
      expect(flat).toContain("`summon` tool");
      expect(flat).toContain("The card is the listing entry, not the skill body");
    },
  );

  it("summon.md makes exactly one call and arms nothing", () => {
    const flat = commands.get("summon.md")!.replace(/\s+/g, " ");
    expect(flat).toContain("call the `summon` tool **once**");
    expect(flat).toContain("`limit: 1`");
    expect(flat).toContain("arms nothing");
  });
});

describe("ladder artifact", () => {
  it("is byte-identical to a fresh generation from core", () => {
    // Regenerate with:
    //   npx tsx packages/claude-zero/scripts/generate-ladder.ts
    expect(readFileSync(ladderArtifactPath(), "utf-8")).toBe(
      serializeLadderArtifact(buildLadderArtifact()),
    );
  });
});

describe("door manifests", () => {
  const pluginJson = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf-8"));
  const marketplace = JSON.parse(
    readFileSync(join(REPO, ".claude-plugin", "marketplace.json"), "utf-8"),
  );
  const entry = marketplace.plugins.find((p: { name: string }) => p.name === "skill-heaven");

  it("labels both public manifests as an actively tested working prototype", () => {
    for (const description of [pluginJson.description, entry.description]) {
      expect(description).toMatch(/working prototype/i);
      expect(description).toMatch(/actively tested for public use/i);
      expect(description).not.toMatch(/no commands wired yet/i);
      expect(description).toContain("/skill-zero");
    }
  });

  it("carries no banned lexicon word in any door description", () => {
    // Slider/notch/picker are the retired "posture control" words (R2). Ladder/rung
    // were de-banned when the entropy ladder was ratified as the product's core
    // noun (docs/LADDER-FLOW.md founder ruling, 2026-08-07; "the split ladder",
    // 44f0e9d) — the command-file test now *requires* them (line 70) and the
    // README/CLAUDE.md use them freely. Door copy may therefore say "ladder".
    for (const description of [pluginJson.description, entry.description]) {
      expect(description).not.toMatch(/\bslider\b|\bnotch(es)?\b|\bpicker\b/i);
    }
  });

  it("advertises every surface it actually ships, and only those", () => {
    for (const { file } of SURFACES) {
      expect(existsSync(join(PLUGIN, "commands", file))).toBe(true);
    }
    for (const description of [pluginJson.description, entry.description]) {
      for (const surface of ["/skill-zero", "/skill-heaven", "/skill-hell", "/skill-ultra"]) {
        expect(description, `door copy omits ${surface}`).toContain(surface);
      }
      expect(description).not.toMatch(/step 3/);
    }
  });

  it("never calls a rung unratified or gated in public copy (N13)", () => {
    for (const description of [pluginJson.description, entry.description]) {
      expect(description).not.toMatch(/\bUNRATIFIED\b/i);
      expect(description).not.toMatch(/\bgated\b/i);
    }
  });
});

// KC2 (Issue #9, Program 1 Arc I). This is the FULL invocation path: the real
// `/skill-zero` command shells out to `node render-posture.mjs`, so a unit
// test that only imports the .mjs's exported functions (see posture.test.ts)
// never proves the disclosure survives an actual process invocation. Spawning
// the real script through the real env-var contract (CLAUDE_ZERO_PROFILE) is
// what the command markdown above actually runs.
describe("standing-dose disclosure survives the real process invocation (KC2)", () => {
  const rendererPath = join(PLUGIN, "scripts", "render-ladder.mjs");
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ch-plugin-kc2-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function runRenderer(manifest: Record<string, unknown>): string {
    const manifestPath = join(dir, `${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const r = spawnSync(process.execPath, [rendererPath, "zero"], {
      env: { ...process.env, CLAUDE_ZERO_PROFILE: manifestPath },
      encoding: "utf-8",
      timeout: 20000,
    });
    expect(r.status).toBe(0);
    return r.stdout;
  }

  it("discloses bundled/plugin exclusion for a user+project (native) launch", () => {
    const text = runRenderer({
      schema: "claude-zero/profile@1",
      posture: "native",
      standingTokens: 4823,
      skillCount: 12,
      scope: "user+project",
      launcherLocked: true,
    });
    expect(text).toContain("bundled CLI skills and plugin-provided skills are not counted");
  });

  // A3/KC4 correction: a "session" scope enumerates the launched skill SET
  // exactly, but a bundled `doctor` skill was MEASURED to survive every
  // posture (probe-kc4-listing-residual.sh) — a permanent, founder-ruled
  // harness residual. The old assertion here ("not counted" never appears)
  // encoded the disproven "session has nothing to disclose" claim; it now
  // asserts the opposite: the residual IS disclosed, honestly.
  it("discloses the measured doctor residual for a fully-enumerated session scope", () => {
    const text = runRenderer({
      schema: "claude-zero/profile@1",
      posture: "product-floor",
      standingTokens: 0,
      skillCount: 0,
      scope: "session",
      launcherLocked: true,
    });
    expect(text).toMatch(/`doctor`.*not counted/);
  });
});
