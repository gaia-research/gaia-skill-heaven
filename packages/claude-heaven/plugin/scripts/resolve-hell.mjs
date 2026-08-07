// Locates the skill-hell summon-engine binary (lives in the sibling `gaia-mcp`
// repo, built to dist/bin/skill-hell.js — see docs/SKILL-HELL.md there). This
// package never imports that repo (D6-style boundary: it is a sibling
// product, not a vendored dependency), so discovery happens at runtime
// against whatever the operator has on disk.
//
// ZERO DEPENDENCIES BY NECESSITY, same reason as render-posture.mjs: once
// claude-heaven is installed from the marketplace there is no node_modules
// next to it, so this file runs on plain Node with only `node:` builtins.
//
// Founder requirement: /skill-hell must work whether or not claude-heaven or
// pi-heaven launched the session — so resolution never reads a door's launch
// manifest or session directory, only environment + filesystem facts that
// hold regardless of which harness (or none) is running.

import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** Thrown when none of the four resolution rules find a usable binary. The
 * message is the actionable, human-facing text — callers print it as-is. */
export class HellEngineNotFoundError extends Error {
  constructor(/** @type {string[]} */ checked) {
    super(
      [
        "skill-hell binary not found. Checked, in order:",
        ...checked.map((line, i) => `  ${i + 1}. ${line}`),
        "",
        "Fix one of:",
        "  - export SKILL_HELL_BIN=/path/to/skill-hell        (or .../skill-hell.js)",
        "  - put skill-hell on PATH (e.g. npm link in the gaia-mcp checkout)",
        "  - export GAIA_MCP_HOME=/path/to/gaia-mcp          (a built checkout)",
        "  - build gaia-mcp at ~/gaia-mcp                    (npm run build)",
      ].join("\n"),
    );
    this.name = "HellEngineNotFoundError";
  }
}

/** @typedef {{ command: string, args: string[], source: string, binPath: string }} HellEngine */

/**
 * @param {string} binPath
 * @param {string} source
 * @returns {HellEngine}
 */
function toEngine(binPath, source) {
  // A `.js` file is not directly executable via spawn on every platform (no
  // shebang guarantee once copied/symlinked), so run it through the same
  // Node that is running this script. Anything else (a real `skill-hell`
  // executable found on PATH or named explicitly) is invoked directly.
  if (binPath.endsWith(".js")) {
    return { command: process.execPath, args: [binPath], source, binPath };
  }
  return { command: binPath, args: [], source, binPath };
}

/** @param {string} name @param {string} pathEnv @returns {string | null} */
function findOnPath(name, pathEnv) {
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here, keep looking
    }
  }
  return null;
}

/**
 * Resolves the skill-hell binary, first hit wins:
 *   1. $SKILL_HELL_BIN
 *   2. `skill-hell` on $PATH
 *   3. $GAIA_MCP_HOME/dist/bin/skill-hell.js
 *   4. ~/gaia-mcp/dist/bin/skill-hell.js
 * Throws HellEngineNotFoundError (never silently no-ops) if none resolve.
 * @param {{ env?: NodeJS.ProcessEnv, home?: string }} [opts]
 * @returns {HellEngine}
 */
export function resolveHellEngine(opts = {}) {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const checked = [];

  const explicit = env.SKILL_HELL_BIN;
  if (explicit) {
    if (existsSync(explicit)) return toEngine(explicit, "SKILL_HELL_BIN");
    checked.push(`$SKILL_HELL_BIN — set to ${explicit}, but nothing exists there`);
  } else {
    checked.push("$SKILL_HELL_BIN — not set");
  }

  const onPath = findOnPath("skill-hell", env.PATH ?? "");
  if (onPath) return toEngine(onPath, "PATH");
  checked.push("`skill-hell` on $PATH — not found");

  const mcpHome = env.GAIA_MCP_HOME;
  if (mcpHome) {
    const candidate = join(mcpHome, "dist", "bin", "skill-hell.js");
    if (existsSync(candidate)) return toEngine(candidate, "GAIA_MCP_HOME");
    checked.push(`$GAIA_MCP_HOME/dist/bin/skill-hell.js — not found at ${candidate}`);
  } else {
    checked.push("$GAIA_MCP_HOME — not set");
  }

  const fallback = join(home, "gaia-mcp", "dist", "bin", "skill-hell.js");
  if (existsSync(fallback)) return toEngine(fallback, "~/gaia-mcp");
  checked.push(`~/gaia-mcp/dist/bin/skill-hell.js — not found at ${fallback}`);

  throw new HellEngineNotFoundError(checked);
}
