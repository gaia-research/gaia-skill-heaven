// The shipped plugin surface: the /skill-heaven command definition, the
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
import { makeListingLine, tokenize } from "skill-heaven";
import { buildP2Gate, p2GatePath, serializeP2Gate } from "../scripts/generate-p2-gate.js";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(PKG, "plugin");
const commandPath = join(PLUGIN, "commands", "skill-heaven.md");
const command = readFileSync(commandPath, "utf-8");

/** gate (c): the priced budget for /skill-heaven's own standing line. The
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

describe("/skill-heaven command definition", () => {
  const fm = frontmatter(command);

  it("declares a description and the narrowest tool grant it needs", () => {
    expect(fm.description).toBeTruthy();
    // The command runs exactly one thing: node, on the shipped renderer.
    expect(fm["allowed-tools"]).toBe("Bash(node:*)");
  });

  it("prices at or under the gate (c) budget, prefixed and unprefixed", () => {
    for (const id of ["skill-heaven", "claude-heaven:skill-heaven"]) {
      const dose = tokenize(makeListingLine(id, fm.description), "chars4");
      expect(dose, `${id} self-dose`).toBeLessThanOrEqual(GATE_C_BUDGET_TOKENS);
    }
  });

  it("invokes the shipped renderer through the interpolated plugin root", () => {
    // Probed on 2.1.216: ${CLAUDE_PLUGIN_ROOT} is substituted into the command
    // markdown (it is NOT exported to the bash child), and $ARGUMENTS is
    // shell-escaped before substitution.
    expect(command).toContain('node "${CLAUDE_PLUGIN_ROOT}/scripts/render-posture.mjs"');
    expect(command).toContain("'$ARGUMENTS'");
    expect(existsSync(join(PLUGIN, "scripts", "render-posture.mjs"))).toBe(true);
  });

  it("names the control with no noun — no banned lexicon word in the command copy", () => {
    // `slider`/`notch` are banned (retired 2026-07-24, oracle N1/N5); their
    // replacements name the off…max ladder, a different control; and the name
    // of this surface is OPEN (founder ruling R2). So the command markdown
    // carries none of them, and no coined substitute either.
    expect(command).not.toMatch(/\bslider\b|\bnotch(es)?\b|\bladder\b|\brung(s)?\b|\bpicker\b/i);
  });

  it("pins the rendered block as verbatim, un-embellished copy", () => {
    expect(command).toMatch(/verbatim/i);
    expect(command).toMatch(/Do not add posture, token or savings numbers of your own/);
    expect(command).toMatch(/If the block is a `⛔` refusal, print the refusal and nothing else/);
  });

  it("never claims the command can restart Claude Code (D12 / B4)", () => {
    expect(command.replace(/\s+/g, " ")).toContain("Nothing can restart Claude Code from inside a session");
    expect(command).not.toMatch(/\b(relaunch|restart)(ing)? (it|the session|claude) for (you|them)\b/i);
  });
});

describe("P2 gate artifact", () => {
  it("is byte-identical to a fresh generation from core", () => {
    // Regenerate with:
    //   npx tsx packages/claude-heaven/scripts/generate-p2-gate.ts
    expect(readFileSync(p2GatePath(), "utf-8")).toBe(serializeP2Gate(buildP2Gate()));
  });
});

describe("door manifests", () => {
  const pluginJson = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf-8"));
  const marketplace = JSON.parse(
    readFileSync(join(PKG, "..", "..", ".claude-plugin", "marketplace.json"), "utf-8"),
  );
  const entry = marketplace.plugins.find((p: { name: string }) => p.name === "claude-heaven");

  it("stops advertising the door as command-less now that /skill-heaven ships", () => {
    for (const description of [pluginJson.description, entry.description]) {
      expect(description).not.toMatch(/no commands wired yet/i);
      expect(description).toContain("/skill-heaven");
    }
  });

  it("carries no banned lexicon word in any door description", () => {
    for (const description of [pluginJson.description, entry.description]) {
      expect(description).not.toMatch(/\bslider\b|\bnotch(es)?\b|\bladder\b|\brung(s)?\b|\bpicker\b/i);
    }
  });

  it("does not advertise /skill-hell as shipped — it lands in step 3", () => {
    // P2 keeps /skill-hell a locked door, but the door must exist before the
    // manifests name it as a surface the user can reach.
    expect(existsSync(join(PLUGIN, "commands", "skill-hell.md"))).toBe(false);
    for (const description of [pluginJson.description, entry.description]) {
      expect(description).toMatch(/step 3/);
    }
  });
});

// KC2 (Issue #9, Program 1 Arc I). This is the FULL invocation path: the real
// `/skill-heaven` command shells out to `node render-posture.mjs`, so a unit
// test that only imports the .mjs's exported functions (see posture.test.ts)
// never proves the disclosure survives an actual process invocation. Spawning
// the real script through the real env-var contract (CLAUDE_HEAVEN_PROFILE) is
// what the command markdown above actually runs.
describe("standing-dose disclosure survives the real process invocation (KC2)", () => {
  const rendererPath = join(PLUGIN, "scripts", "render-posture.mjs");
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ch-plugin-kc2-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function runRenderer(manifest: Record<string, unknown>): string {
    const manifestPath = join(dir, `${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const r = spawnSync(process.execPath, [rendererPath], {
      env: { ...process.env, CLAUDE_HEAVEN_PROFILE: manifestPath },
      encoding: "utf-8",
      timeout: 20000,
    });
    expect(r.status).toBe(0);
    return r.stdout;
  }

  it("discloses bundled/plugin exclusion for a user+project (native) launch", () => {
    const text = runRenderer({
      schema: "claude-heaven/profile@1",
      posture: "native",
      standingTokens: 4823,
      skillCount: 12,
      scope: "user+project",
      launcherLocked: true,
    });
    expect(text).toContain("bundled CLI skills and plugin-provided skills are not counted");
  });

  it("does not fabricate an exclusion for a fully-enumerated session scope", () => {
    const text = runRenderer({
      schema: "claude-heaven/profile@1",
      posture: "product-floor",
      standingTokens: 0,
      skillCount: 0,
      scope: "session",
      launcherLocked: true,
    });
    expect(text).not.toMatch(/not counted/);
  });
});
