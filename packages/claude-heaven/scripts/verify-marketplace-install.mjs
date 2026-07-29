#!/usr/bin/env node
// KC1 fresh-environment check: "claude-heaven installs cleanly from the
// marketplace, verified from a fresh environment."
//
// .claude-plugin/marketplace.json declares this plugin's `source` as
// `./packages/claude-heaven/plugin` — a marketplace install copies ONLY that
// directory. `packages/claude-heaven/src/`, `bin/`, `package.json` and
// `node_modules/` are never shipped to an installed user. This script proves
// that claim by *doing* the copy a marketplace install does — into a clean
// temp dir, with no repo, no node_modules, nothing beside it — and then
// exercising the two things a user actually touches:
//
//   1. the `/skill-heaven` command file resolves its script path the way
//      Claude Code resolves it (via `${CLAUDE_PLUGIN_ROOT}`, which becomes
//      the copied plugin dir on a real install);
//   2. `scripts/render-posture.mjs` runs standalone under plain `node`, with
//      no `node_modules` beside it, and produces the real posture block.
//
// A negative control ("the command didn't error") is not a positive result,
// so this asserts on actual stdout content, not just exit codes.
//
// Run directly: `node packages/claude-heaven/scripts/verify-marketplace-install.mjs`
// Wrapped in CI by: packages/claude-heaven/test/verify-marketplace-install.test.ts

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, ".."); // packages/claude-heaven
const PLUGIN_SRC = join(PKG_ROOT, "plugin");

/** Everything a real marketplace install must NOT bring along. If any of
 * these leak into the copy, the "fresh environment" is a fiction. */
const FORBIDDEN_SIBLINGS = ["node_modules", "src", "bin", "package.json", "tsconfig.json"];

/**
 * @param {(msg: string) => void} log
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function verifyMarketplaceInstall(log = /** @param {string} _msg */ (_msg) => {}) {
  /** @type {string[]} */
  const failures = [];
  /** @param {boolean} cond @param {string} msg */
  const assert = (cond, msg) => {
    if (cond) {
      log(`  ok   ${msg}`);
    } else {
      log(`  FAIL ${msg}`);
      failures.push(msg);
    }
  };

  if (!existsSync(PLUGIN_SRC)) {
    failures.push(`plugin source dir missing: ${PLUGIN_SRC}`);
    return { ok: false, failures };
  }

  // A clean temp dir with NO repo around it — the closest thing to a real
  // user's plugin cache we can build without an actual `claude plugin
  // install`. Named to make it obvious in `ps`/tmp listings what it is.
  const fresh = mkdtempSync(join(tmpdir(), "claude-heaven-marketplace-install-"));
  const installedPluginRoot = join(fresh, "claude-heaven-plugin");

  try {
    log(`Copying ${PLUGIN_SRC}`);
    log(`     -> ${installedPluginRoot}`);
    cpSync(PLUGIN_SRC, installedPluginRoot, { recursive: true });

    // --- Prove the copy is actually isolated -----------------------------
    for (const sibling of FORBIDDEN_SIBLINGS) {
      assert(
        !existsSync(join(installedPluginRoot, sibling)),
        `copied plugin does NOT contain '${sibling}' (would mean the copy leaked repo internals)`,
      );
    }
    assert(
      !existsSync(join(fresh, "node_modules")),
      "fresh temp dir has no node_modules anywhere beside the plugin (no npm install ran here)",
    );

    // --- plugin.json is present and minimally valid ----------------------
    const pluginJsonPath = join(installedPluginRoot, ".claude-plugin", "plugin.json");
    assert(existsSync(pluginJsonPath), "plugin.json shipped at .claude-plugin/plugin.json");
    let pluginJson = null;
    try {
      pluginJson = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
    } catch (/** @type {any} */ err) {
      failures.push(`plugin.json did not parse as JSON: ${err.message}`);
    }
    if (pluginJson) {
      assert(typeof pluginJson.name === "string" && pluginJson.name.length > 0, "plugin.json has a non-empty 'name'");
    }

    // --- the command file resolves its script path under ${CLAUDE_PLUGIN_ROOT} ---
    const commandPath = join(installedPluginRoot, "commands", "skill-heaven.md");
    assert(existsSync(commandPath), "commands/skill-heaven.md shipped");
    const commandBody = existsSync(commandPath) ? readFileSync(commandPath, "utf-8") : "";
    // Claude Code interpolates ${CLAUDE_PLUGIN_ROOT} to the installed plugin
    // root before running the bash line (probed on 2.1.216, see
    // render-posture.mjs header comment). We don't have the harness here, so
    // we do the same substitution by hand and confirm the resulting path is
    // real, exactly proving what the harness would resolve to.
    const scriptRefMatch = /\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[a-zA-Z0-9._-]+\.mjs)/.exec(commandBody);
    assert(scriptRefMatch !== null, "command file references a script via ${CLAUDE_PLUGIN_ROOT}/scripts/*.mjs");
    const resolvedScript = scriptRefMatch ? join(installedPluginRoot, scriptRefMatch[1]) : null;
    assert(
      resolvedScript !== null && existsSync(resolvedScript),
      `the script the command references resolves to a real file under the installed plugin root${
        resolvedScript ? ` (${resolvedScript})` : ""
      }`,
    );

    // --- render-posture.mjs actually runs standalone, with real output ---
    if (resolvedScript && existsSync(resolvedScript)) {
      let stdout = "";
      let ranOk = false;
      try {
        stdout = execFileSync(process.execPath, [resolvedScript], {
          cwd: fresh, // nowhere near the repo
          env: { PATH: process.env.PATH }, // minimal env: no repo-derived vars
          encoding: "utf-8",
        });
        ranOk = true;
      } catch (/** @type {any} */ err) {
        failures.push(`render-posture.mjs exited non-zero or threw when run standalone: ${err.message}`);
      }
      assert(ranOk, "scripts/render-posture.mjs runs under plain `node` with zero node_modules beside it");
      if (ranOk) {
        log("--- actual stdout of the standalone run ---");
        for (const line of stdout.split("\n")) log(`  | ${line}`);
        log("--- end stdout ---");
        assert(stdout.includes("Skill Heaven"), "output contains the posture block header");
        assert(stdout.includes("native"), "output renders the 'native' posture row");
        assert(stdout.includes("clean room"), "output renders the 'clean room' (product-floor) posture row");
        assert(stdout.includes("hell"), "output renders the locked 'hell' row");
        // No CLAUDE_HEAVEN_PROFILE env var was set (this is a session with no
        // launcher-written manifest, i.e. vanilla claude) — the script must
        // say so honestly rather than fabricate a standing-dose number.
        assert(
          stdout.includes("vanilla claude"),
          "with no launch manifest present, output honestly reports 'vanilla claude' rather than inventing a standing dose",
        );
      }
    }

    // --- data/p2-gate.json shipped, so the script isn't reading it from ---
    // --- outside the copied dir (would be a false pass off the real repo) ---
    const gatePath = join(installedPluginRoot, "data", "p2-gate.json");
    assert(existsSync(gatePath), "data/p2-gate.json shipped inside the copied plugin (script does not reach back into the repo for it)");
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }

  return { ok: failures.length === 0, failures };
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  const { ok, failures } = verifyMarketplaceInstall((msg) => process.stdout.write(`${msg}\n`));
  if (ok) {
    process.stdout.write("\nKC1 fresh-environment check: PASS\n");
    process.exit(0);
  } else {
    process.stdout.write(`\nKC1 fresh-environment check: FAIL (${failures.length} failure(s))\n`);
    process.exit(1);
  }
}
