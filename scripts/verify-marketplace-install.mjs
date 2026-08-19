#!/usr/bin/env node
// KC1 fresh-environment check: "skill-heaven installs cleanly from the
// marketplace, verified from a fresh environment."
//
// .claude-plugin/marketplace.json declares this plugin's `source` as
// `./plugins/skill-heaven` — a marketplace install copies ONLY that
// directory. Nothing from `packages/` — no `src/`, `bin/`, `package.json` or
// `node_modules/` — is ever shipped to an installed user. This script proves
// that claim by *doing* the copy a marketplace install does — into a clean
// temp dir, with no repo, no node_modules, nothing beside it — and then
// exercising the two things a user actually touches:
//
//   1. the `/skill-zero` command file resolves its script path the way
//      Claude Code resolves it (via `${CLAUDE_PLUGIN_ROOT}`, which becomes
//      the copied plugin dir on a real install);
//   2. `scripts/render-posture.mjs` runs standalone under plain `node`, with
//      no `node_modules` beside it, and produces the real posture block.
//
// A5a: the copy source itself is now READ from marketplace.json's `source`
// field (`resolvePluginSource`, above `verifyMarketplaceInstall`) rather than
// hardcoded. A hardcoded plugin path only proved "this layout
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
// Run directly: `node scripts/verify-marketplace-install.mjs`
// Wrapped in CI by: test/verify-marketplace-install.test.ts

import { execFileSync, spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, ".."); // scripts/.. -> repo root
const DEFAULT_MARKETPLACE_PATH = join(REPO_ROOT, ".claude-plugin", "marketplace.json");
const PLUGIN_NAME = "skill-heaven"; // the sole entry name in marketplace.json

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
 * PR4: boot the bundled summon MCP server (plugins/skill-heaven/mcp/skill-summon.mjs)
 * as a real child process, over stdio, with a minimal env (no repo-derived
 * vars, nothing that could help Node resolve a bare package from outside the
 * copied plugin dir), and confirm it answers `initialize` then `tools/list`
 * with exactly `["summon"]`. Hand-rolled newline-delimited JSON-RPC framing —
 * zero dependencies, matching the rest of this file's style. Not a general
 * MCP client: just enough to prove the bundle boots standalone and answers
 * the two calls a real host makes first.
 * @param {string} serverPath
 * @param {string} cwd
 * @returns {Promise<{ ok: true, tools: string[] } | { ok: false, error: string }>}
 */
function bootBundledMcpServer(serverPath, cwd) {
  return new Promise((resolve) => {
    /** @type {import("node:child_process").ChildProcessWithoutNullStreams} */
    const child = spawn(process.execPath, [serverPath], {
      cwd,
      env: { PATH: process.env.PATH ?? "" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffered = "";
    let stderr = "";
    let settled = false;

    /** @param {{ ok: true, tools: string[] } | { ok: false, error: string }} result */
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: `bundled MCP server did not answer tools/list within 10s. stderr: ${stderr || "(empty)"}`,
      });
    }, 10_000);

    child.on("error", (/** @type {Error} */ err) => {
      finish({ ok: false, error: `failed to spawn bundled MCP server: ${err.message}` });
    });

    child.stderr.on("data", (/** @type {Buffer} */ chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.stdout.on("data", (/** @type {Buffer} */ chunk) => {
      buffered += chunk.toString("utf8");
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? ""; // keep any partial trailing line for the next chunk
      for (const line of lines) {
        if (!line.trim()) continue;
        /** @type {any} */
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // not a JSON-RPC line — ignore
        }
        if (message?.id === 2 && message?.result && Array.isArray(message.result.tools)) {
          finish({ ok: true, tools: message.result.tools.map((/** @type {any} */ t) => t.name) });
        }
      }
    });

    const send = (/** @type {object} */ msg) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "verify-marketplace-install", version: "0.0.0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  });
}

/**
 * @param {(msg: string) => void} log
 * @param {{ marketplacePath?: string, repoRoot?: string, pluginName?: string }} [opts]
 *   Test-only overrides for resolvePluginSource's inputs — production callers
 *   (the CLI entry below, and the wrapping vitest suite's default case) rely
 *   on the real repo defaults.
 * @returns {Promise<{ ok: boolean, failures: string[] }>}
 */
export async function verifyMarketplaceInstall(log = /** @param {string} _msg */ (_msg) => {}, opts = {}) {
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
  const fresh = mkdtempSync(join(tmpdir(), "skill-heaven-marketplace-install-"));
  const installedPluginRoot = join(fresh, "skill-heaven-plugin");

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

    // --- every shipped surface resolves its script under ${CLAUDE_PLUGIN_ROOT} ---
    // One mechanic, five entry points, ONE renderer (docs/AGENT-PLUGIN.md).
    // Claude Code interpolates ${CLAUDE_PLUGIN_ROOT} to the installed plugin
    // root before running the bash line (probed on 2.1.216). We don't have the
    // harness here, so we do the same substitution by hand and confirm the
    // resulting path is real — exactly what the harness would resolve to.
    const SURFACES = [
      { file: "skill-zero.md", mode: "zero" },
      { file: "skill-heaven.md", mode: "heaven" },
      { file: "skill-hell.md", mode: "hell" },
      { file: "skill-ultra.md", mode: "ultra" },
      { file: "summon.md", mode: "summon" },
    ];

    /** @type {string | null} */
    let renderer = null;
    for (const { file, mode } of SURFACES) {
      const commandPath = join(installedPluginRoot, "commands", file);
      assert(existsSync(commandPath), `commands/${file} shipped`);
      if (!existsSync(commandPath)) continue;
      const body = readFileSync(commandPath, "utf-8");
      const match = /\$\{CLAUDE_PLUGIN_ROOT\}\/(scripts\/[a-zA-Z0-9._-]+\.mjs)" ([a-z]+)/.exec(body);
      assert(match !== null, `${file} references its renderer through \${CLAUDE_PLUGIN_ROOT} with a surface argument`);
      if (!match) continue;
      const resolved = join(installedPluginRoot, match[1]);
      assert(existsSync(resolved), `${file}'s renderer resolves to a real file under the installed plugin root`);
      assert(match[2] === mode, `${file} renders the "${mode}" surface (got "${match[2]}")`);
      renderer = existsSync(resolved) ? resolved : renderer;
    }

    // The external-binary hunt is GONE. Summoning is an MCP tool call the agent
    // makes; nothing here shells out to a sibling checkout. Assert the absence,
    // so a reintroduction is a loud failure rather than a quiet regression.
    for (const gone of ["resolve-hell.mjs", "render-hell.mjs", "render-posture.mjs"]) {
      assert(
        !existsSync(join(installedPluginRoot, "scripts", gone)),
        `scripts/${gone} is gone (the external summon-engine hunt was removed)`,
      );
    }

    // --- data/ladder.json shipped, so the script isn't reading it from ---
    // --- outside the copied dir (would be a false pass off the real repo) ---
    const ladderPath = join(installedPluginRoot, "data", "ladder.json");
    assert(existsSync(ladderPath), "data/ladder.json shipped inside the copied plugin (script does not reach back into the repo for it)");

    // --- PR4: the summon MCP server is bundled in — no npx, no sibling ------
    // --- checkout, no external binary. ---------------------------------------
    const mcpConfigPath = join(installedPluginRoot, ".mcp.json");
    assert(existsSync(mcpConfigPath), ".mcp.json shipped at the plugin root");
    if (existsSync(mcpConfigPath)) {
      /** @type {any} */
      let mcpConfig = null;
      try {
        mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
      } catch (/** @type {any} */ err) {
        failures.push(`.mcp.json did not parse as JSON: ${err.message}`);
      }
      if (mcpConfig) {
        const server = mcpConfig?.mcpServers?.["skill-summon"];
        assert(!!server, '.mcp.json declares an mcpServers["skill-summon"] entry');
        assert(server?.command === "node", ".mcp.json's skill-summon server runs on plain node (no npx, no external binary)");
        assert(
          Array.isArray(server?.args) && server.args.some((/** @type {string} */ a) => a.includes("${CLAUDE_PLUGIN_ROOT}") && a.includes("mcp/skill-summon.mjs")),
          '.mcp.json points at "${CLAUDE_PLUGIN_ROOT}/mcp/skill-summon.mjs" — the bundle committed inside the plugin, not a sibling checkout',
        );
      }
    }

    const mcpServerPath = join(installedPluginRoot, "mcp", "skill-summon.mjs");
    assert(existsSync(mcpServerPath), "mcp/skill-summon.mjs (the bundled summon MCP server) shipped inside the copied plugin");
    if (existsSync(mcpServerPath)) {
      const boot = await bootBundledMcpServer(mcpServerPath, fresh);
      assert(
        boot.ok,
        `bundled MCP server boots over stdio on plain node with no node_modules reachable${boot.ok ? "" : ` (${boot.error})`}`,
      );
      if (boot.ok) {
        assert(
          JSON.stringify(boot.tools) === JSON.stringify(["summon"]),
          `bundled MCP server's tools/list is exactly ["summon"] (got ${JSON.stringify(boot.tools)})`,
        );
      }
    }

    // --- the one renderer actually runs standalone, with real output --------
    if (renderer) {
      /** @param {string} mode @returns {string | null} */
      const renderStandalone = (mode) => {
        try {
          return execFileSync(process.execPath, [renderer, mode], {
            cwd: fresh, // nowhere near the repo
            env: { PATH: process.env.PATH ?? "" }, // minimal env: no repo-derived vars
            encoding: "utf-8",
          });
        } catch (/** @type {any} */ err) {
          failures.push(`render-ladder.mjs ${mode} exited non-zero or threw when run standalone: ${err.message}`);
          return null;
        }
      };

      const zero = renderStandalone("zero");
      assert(zero !== null, "scripts/render-ladder.mjs runs under plain `node` with zero node_modules beside it");
      if (zero) {
        log("--- actual stdout of the standalone `zero` run ---");
        for (const line of zero.split("\n")) log(`  | ${line}`);
        log("--- end stdout ---");
        assert(zero.includes("Skill Zero"), "output contains the Skill Zero header");
        assert(zero.includes("Manual /summon still works"), "the floor keeps the manual summon it ships by default");
        assert(zero.includes("cannot be evicted mid-session"), "output never implies the cut emptied the running session (D12)");
        assert(zero.includes("WIP · PROVISIONAL"), "every rendering of a provisional count carries the WIP mark");
      }

      // Every rung command renders the SAME line — that is the product claim,
      // so verify it from the installed copy rather than trusting the unit test.
      const RUNGS = ["zero", "low", "med", "high", "xhigh", "max", "ultra"];
      for (const mode of ["zero", "heaven", "hell", "ultra"]) {
        const out = renderStandalone(mode);
        assert(out !== null, `render-ladder.mjs renders the ${mode} surface standalone`);
        if (!out) continue;
        for (const rung of RUNGS) {
          assert(new RegExp(`[●○] ${rung}\\b`).test(out), `${mode} renders rung ${rung} on the one line`);
        }
        assert(!/UNRATIFIED/.test(out), `${mode} refuses no rung (N13)`);
      }

      const summon = renderStandalone("summon");
      assert(summon !== null, "render-ladder.mjs renders the manual /summon surface standalone");
      if (summon) {
        assert(summon.includes("/summon <intent>"), "bare /summon prints usage rather than a refusal");
      }
      const armed = renderStandalone("hell");
      if (armed) {
        assert(armed.includes("`summon` tool"), "an armed lane names the summon tool the agent must call");
        assert(armed.includes("explore"), "an armed lane names its direction");
        assert(!/limit:\s*\d/.test(armed), "an armed lane attaches no count to the rung and no cap to a summon");
        assert(armed.includes("verbatim"), "an armed lane requires the card be printed verbatim (the disclosure)");
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
  const { ok, failures } = await verifyMarketplaceInstall((msg) => process.stdout.write(`${msg}\n`));
  if (ok) {
    process.stdout.write("\nKC1 fresh-environment check: PASS\n");
    process.exit(0);
  } else {
    process.stdout.write(`\nKC1 fresh-environment check: FAIL (${failures.length} failure(s))\n`);
    process.exit(1);
  }
}
