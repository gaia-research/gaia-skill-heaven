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
// A5a: the copy source itself is now READ from marketplace.json's `source`
// field (`resolvePluginSource`, above `verifyMarketplaceInstall`) rather than
// hardcoded. A hardcoded `join(PKG_ROOT, "plugin")` only proved "this layout
// runs standalone" — a narrower claim than KC1's "installs cleanly from the
// marketplace", which is a claim about what the manifest routes to, not
// about what happens to exist on disk. If `source` ever drifts (typo, path
// move, a second plugin entry) a hardcoded path keeps copying the correct
// hand-picked directory and stays green while a real install breaks; reading
// `source` makes that drift a loud, specific failure instead.
//
// A negative control ("the command didn't error") is not a positive result,
// so this asserts on actual stdout content, not just exit codes.
//
// Run directly: `node packages/claude-heaven/scripts/verify-marketplace-install.mjs`
// Wrapped in CI by: packages/claude-heaven/test/verify-marketplace-install.test.ts

import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(HERE, ".."); // packages/claude-heaven
const REPO_ROOT = join(PKG_ROOT, "..", ".."); // packages/claude-heaven/../.. -> repo root
const DEFAULT_MARKETPLACE_PATH = join(REPO_ROOT, ".claude-plugin", "marketplace.json");
const PLUGIN_NAME = "claude-heaven"; // this package's entry name in marketplace.json

/** Everything a real marketplace install must NOT bring along. If any of
 * these leak into the copy, the "fresh environment" is a fiction. */
const FORBIDDEN_SIBLINGS = ["node_modules", "src", "bin", "package.json", "tsconfig.json"];

/**
 * A5a (KC1 narrowness fix): resolve the plugin source dir FROM
 * marketplace.json's `source` field, rather than asserting the layout
 * independently. Every failure mode is a specific, loud error rather than a
 * silent fallback to a hardcoded path — a manifest that lies must FAIL this
 * check, not be quietly worked around.
 * @param {string} marketplacePath
 * @param {string} repoRoot
 * @param {string} pluginName
 * @returns {{ ok: true, path: string } | { ok: false, error: string }}
 */
export function resolvePluginSource(
  marketplacePath = DEFAULT_MARKETPLACE_PATH,
  repoRoot = REPO_ROOT,
  pluginName = PLUGIN_NAME,
) {
  if (!existsSync(marketplacePath)) {
    return { ok: false, error: `marketplace.json not found at ${marketplacePath} — cannot verify a marketplace install without the manifest it installs from` };
  }
  /** @type {any} */
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(marketplacePath, "utf-8"));
  } catch (/** @type {any} */ err) {
    return { ok: false, error: `marketplace.json at ${marketplacePath} did not parse as JSON: ${err.message}` };
  }
  const entry = Array.isArray(manifest?.plugins)
    ? manifest.plugins.find((/** @type {any} */ p) => p && p.name === pluginName)
    : undefined;
  if (!entry) {
    return { ok: false, error: `marketplace.json has no plugin entry named "${pluginName}" (checked ${marketplacePath})` };
  }
  if (typeof entry.source !== "string" || entry.source.length === 0) {
    return { ok: false, error: `marketplace.json's "${pluginName}" entry has no (or an empty) "source" field (checked ${marketplacePath})` };
  }
  const resolved = join(repoRoot, entry.source);
  if (!existsSync(resolved)) {
    return { ok: false, error: `marketplace.json's "${pluginName}" source "${entry.source}" resolves to ${resolved}, which does not exist` };
  }
  return { ok: true, path: resolved };
}

/**
 * @param {(msg: string) => void} log
 * @param {{ marketplacePath?: string, repoRoot?: string, pluginName?: string }} [opts]
 *   Test-only overrides for resolvePluginSource's inputs — production callers
 *   (the CLI entry below, and the wrapping vitest suite's default case) rely
 *   on the real repo defaults.
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function verifyMarketplaceInstall(log = /** @param {string} _msg */ (_msg) => {}, opts = {}) {
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

  // A5a: derive the plugin source FROM marketplace.json's `source` field —
  // never assert the layout independently. A missing/unparseable manifest, a
  // missing plugin entry, a missing `source`, or a `source` that resolves
  // nowhere are all loud, specific failures here, not a silent fallback.
  const resolution = resolvePluginSource(opts.marketplacePath, opts.repoRoot, opts.pluginName);
  if (!resolution.ok) {
    log(`  FAIL ${resolution.error}`);
    failures.push(resolution.error);
    return { ok: false, failures };
  }
  const PLUGIN_SRC = resolution.path;
  log(`Plugin source resolved from marketplace.json's "source" field -> ${PLUGIN_SRC}`);

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
        assert(stdout.includes("Skill Heaven"), "output contains the Heaven chooser header");
        assert(stdout.includes("off · low · med"), "output renders only the Heaven half");
        assert(!stdout.match(/high|xhigh|max|ultra/), "output does not render Hell rungs");
        assert(stdout.includes("boot-time decisions"), "output explains that Heaven requires a launcher");
        assert(stdout.includes("--level low --skill <path>"), "output gives the exact launcher exit");
        assert(stdout.includes("did not change"), "output never implies the running session changed");
      }
    }

    // --- data/ladder.json shipped, so the script isn't reading it from ---
    // --- outside the copied dir (would be a false pass off the real repo) ---
    const ladderPath = join(installedPluginRoot, "data", "ladder.json");
    assert(existsSync(ladderPath), "data/ladder.json shipped inside the copied plugin (script does not reach back into the repo for it)");

    // --- /skill-hell's complete standalone route ships and renders success ---
    const hellCommandPath = join(installedPluginRoot, "commands", "skill-hell.md");
    const hellRenderer = join(installedPluginRoot, "scripts", "render-hell.mjs");
    const hellResolver = join(installedPluginRoot, "scripts", "resolve-hell.mjs");
    assert(existsSync(hellCommandPath), "commands/skill-hell.md shipped");
    assert(existsSync(hellRenderer), "scripts/render-hell.mjs shipped");
    assert(existsSync(hellResolver), "scripts/resolve-hell.mjs shipped");
    if (existsSync(hellCommandPath)) {
      const hellCommand = readFileSync(hellCommandPath, "utf-8");
      assert(
        hellCommand.includes('${CLAUDE_PLUGIN_ROOT}/scripts/render-hell.mjs'),
        "skill-hell command references its renderer through ${CLAUDE_PLUGIN_ROOT}",
      );
    }
    if (existsSync(hellRenderer) && existsSync(hellResolver)) {
      const fakeSkill = join(fresh, "fake-skill");
      mkdirSync(fakeSkill);
      writeFileSync(join(fakeSkill, "SKILL.md"), "# Marketplace verification skill\n");
      const fakeEngine = join(fresh, "skill-hell");
      writeFileSync(
        fakeEngine,
        `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({summoned:[{id:"verify-skill",level:"high",trustMagnitude:1,path:${JSON.stringify(fakeSkill)}}]}))\n`,
      );
      chmodSync(fakeEngine, 0o755);
      let hellStdout = "";
      let hellRanOk = false;
      try {
        hellStdout = execFileSync(process.execPath, [hellRenderer, "verification intent"], {
          cwd: fresh,
          env: { PATH: process.env.PATH, SKILL_HELL_BIN: fakeEngine },
          encoding: "utf-8",
        });
        hellRanOk = true;
      } catch (/** @type {any} */ err) {
        failures.push(`render-hell.mjs failed against the standalone fake engine: ${err.message}`);
      }
      assert(hellRanOk, "scripts/render-hell.mjs runs standalone through its shipped resolver");
      if (hellRanOk) {
        // Arrivals are CARDS, not pasted bodies. That is not a shortcut: a
        // card-only probe returned the canary on both Claude Code 2.1.224
        // (pane w8:p13) and pi (pane w8:p14), reading SKILL.md and a sibling
        // reference from the materialized directory on disk. So the contract to
        // verify is that the card names the directory — NOT that the body was
        // inlined, which is the pre-ladder behaviour this replaced.
        assert(hellStdout.startsWith("┌ summoned · "), "successful /skill-hell output leads with the summoned card");
        assert(hellStdout.includes("WORKING PROTOTYPE · actively tested for public use"), "successful /skill-hell output discloses public prototype status");
        assert(hellStdout.includes(fakeSkill), "successful /skill-hell card points at the materialized skill directory");
        assert(hellStdout.includes("inspect: "), "successful /skill-hell card carries an inspect link");
      }
    }
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }

  return { ok: failures.length === 0, failures };
}

/**
 * A5b: this script carried the exact bug class KC1 exists to catch. The
 * textbook `import.meta.url === \`file://${process.argv[1]}\`` idiom compares
 * a REALPATH-resolved import.meta.url against the RAW argv[1] path — weaker
 * than even the pre-fix idiom elsewhere in this door. On macOS (and some
 * container/sandbox setups) both `/tmp` and `/var` are symlinks to
 * `/private/tmp` / `/private/var`, so a plugin-cache path routed through
 * either one makes the two sides disagree: `invokedDirectly` comes back
 * false, the check body never runs, and the command exits 0 having verified
 * nothing — silently. That is precisely the failure render-posture.mjs hit
 * (see its header comment) and precisely what this script's own KC1 check
 * exists to catch elsewhere; it must not carry the bug itself.
 *
 * Realpathing argv[1] closes that gap, matching render-posture.mjs's fixed
 * idiom — but a naive copy of that idiom introduces a NEW failure: under
 * `import()` (as this module's own test suite does) with a `process.argv[1]`
 * that does not exist on disk, `realpathSync` throws ENOENT uncaught, where
 * the old (buggy) string-compare code silently evaluated to `false`. A
 * missing/unresolvable argv[1] must not be able to crash an import of this
 * module — it just means "this was not a direct invocation".
 * @returns {boolean}
 */
function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  /** @type {string} */
  let real;
  try {
    real = realpathSync(process.argv[1]);
  } catch {
    return false; // argv[1] doesn't resolve on disk — cannot be a direct invocation of THIS file
  }
  return import.meta.url === pathToFileURL(real).href;
}

if (isInvokedDirectly()) {
  const { ok, failures } = verifyMarketplaceInstall((msg) => process.stdout.write(`${msg}\n`));
  if (ok) {
    process.stdout.write("\nKC1 fresh-environment check: PASS\n");
    process.exit(0);
  } else {
    process.stdout.write(`\nKC1 fresh-environment check: FAIL (${failures.length} failure(s))\n`);
    process.exit(1);
  }
}
