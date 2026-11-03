#!/usr/bin/env node
// @ts-nocheck — an operator-run script (network + a logged-in claude); its pure helpers are unit-tested.
// Release acceptance (#172): a fresh install of what is on GitHub `main` behaves
// like the product the merged code describes.
//
// Nothing here trusts a developer cache. The install runs through the PUBLIC
// installer (`install.sh`, which downloads the GitHub archive and registers the
// Claude marketplace plugin) into a throwaway HOME and CLAUDE_CONFIG_DIR, then
// every claim is checked against that install:
//
//   phase 1  fresh install via install.sh (disposable HOME / CLAUDE_CONFIG_DIR)
//   phase 2  inventory: plugin listed+enabled, five commands, exactly one MCP,
//            installed bytes == the repo at the tested commit, MCP bundle
//            current (two rebuilds, no diff)
//   phase 3  the installed launcher's composed plan (`claude-zero --print`):
//            strict MCP allowlist admits exactly one skill-summon server,
//            explicit permission flags win, a configured defaultMode is the
//            ONLY thing inherited, malformed settings fail loudly
//   phase 4  the installed MCP bundle over stdio, no model: exactly one tool,
//            neutral server/tool/command text, Arbor cache = the governed
//            INCONCLUSIVE record, and ranking/refusal identical with or without it
//   phase 5  live Claude Code sessions through the installed claude-zero:
//            exactly one MCP tool, synthetic ambient MCP / skill / project
//            settings absent, one harmless summon returns a reference card,
//            permission modes behave as designed
//   phase 6  nothing was modified: installed plugin tree, install source tree,
//            and the operator's real settings.json hash identically before/after
//
// Phase 5 needs a logged-in `claude` (model calls; macOS keeps credentials in a
// keychain item keyed to the config dir, so a throwaway config dir is logged
// out). It therefore runs under the operator's real HOME, READ-ONLY with respect
// to settings, against the freshly installed plugin — and says so in the
// receipt. Skip it with --no-live.
//
// Usage:
//   node scripts/release-acceptance.mjs [--repo <checkout>] [--out <dir>] [--no-live] [--model <m>]
//
// <checkout> must be a clean checkout at the commit under test (default: the
// repository this script lives in) with `npm ci` done. Exit code 1 on any
// failed check; the receipt is printed either way.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── pure helpers (unit-tested in test/release-acceptance.test.ts) ──────────────

/** Parse `claude -p --output-format stream-json` output into events. Tolerant of
 * non-JSON noise lines; never throws on a partial last line. */
export function parseStreamJson(text) {
  const events = [];
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      /* partial line */
    }
  }
  return events;
}

/** The session-start `system/init` event, or undefined. */
export function initEvent(events) {
  return events.find((event) => event?.type === "system" && event?.subtype === "init");
}

/** Every tool_use block and the tool_result that answered it. */
export function toolCalls(events) {
  const uses = new Map();
  const calls = [];
  for (const event of events) {
    const content = event?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use") uses.set(block.id, { id: block.id, name: block.name, input: block.input });
      if (block?.type === "tool_result" && uses.has(block.tool_use_id)) {
        const text = Array.isArray(block.content)
          ? block.content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n")
          : String(block.content ?? "");
        calls.push({ ...uses.get(block.tool_use_id), isError: block.is_error === true, text });
      }
    }
  }
  return calls;
}

/** Lower-cased phrases from `list` that appear in `text`. */
export function authorityHits(text, list) {
  const haystack = String(text).toLowerCase();
  return list.filter((phrase) => haystack.includes(phrase.toLowerCase()));
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Deterministic {relativePath: sha256} for every regular file under `root`. */
export function treeHashes(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git") continue;
        walk(full);
      } else if (entry.isFile()) out[relative(root, full)] = sha256(readFileSync(full));
    }
  };
  walk(root);
  return out;
}

export function diffHashes(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((key) => a[key] !== b[key]).sort();
}

// ── receipt plumbing ───────────────────────────────────────────────────────────

const receipt = { checks: [], facts: {}, skipped: [] };
let failed = 0;

function fact(name, value) {
  receipt.facts[name] = value;
  console.log(`  · ${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

function check(name, ok, detail = "") {
  receipt.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failed++;
  console.log(`  ${ok ? "✔" : "✘"} ${name}${detail && !ok ? `\n      ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n── ${title}`);
}

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  return { code: result.status ?? -1, out: result.stdout ?? "", err: result.stderr ?? "" };
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(name);
  const option = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const repo = realpathSync(option("--repo", join(HERE, "..")));
  const live = !flag("--no-live");
  // sonnet, not haiku: `auto` permission mode is model-gated, and haiku silently falls back to `default`,
  // which would make an inherited `auto` look lost when Claude simply declined it for that model.
  const model = option("--model", "sonnet");
  const outDir = option("--out", mkdtempSync(join(tmpdir(), "release-acceptance-out-")));
  mkdirSync(outDir, { recursive: true });

  // realpath: on macOS tmpdir() is a symlink alias (/var → /private/var) and the tools report resolved paths.
  const work = realpathSync(mkdtempSync(join(tmpdir(), "release-acceptance-")));
  const freshHome = join(work, "home");
  const freshConfig = join(work, "cfg");
  mkdirSync(freshHome, { recursive: true });
  mkdirSync(freshConfig, { recursive: true });
  const isolated = {
    ...process.env,
    HOME: freshHome,
    CLAUDE_CONFIG_DIR: freshConfig,
    XDG_DATA_HOME: "",
    XDG_BIN_HOME: "",
    SKILL_HEAVEN_HOME: "",
    SKILL_SOURCE: "",
  };
  for (const key of ["XDG_DATA_HOME", "XDG_BIN_HOME", "SKILL_HEAVEN_HOME", "SKILL_SOURCE"]) delete isolated[key];

  section("pins");
  const head = sh("git", ["-C", repo, "rev-parse", "HEAD"]).out.trim();
  const dirty = sh("git", ["-C", repo, "status", "--porcelain", "--untracked-files=no"]).out.trim();
  const remote = sh("git", ["ls-remote", "https://github.com/gaia-research/gaia-skill-heaven.git", "refs/heads/main"]).out.split(/\s+/)[0];
  sh("git", ["-C", repo, "fetch", "-q", "https://github.com/gaia-research/gaia-skill-heaven.git", "main"]);
  const claudeVersion = sh("claude", ["--version"]).out.trim();
  // What gets installed is GitHub main. The checkout only has to CONTAIN the same product: this
  // script lives in the repo it tests, so HEAD may legitimately be main plus a commit that touches
  // neither the plugin, the packages nor the installers.
  const shipped = ["plugins", "packages", "install.sh", "install.ps1", "install-agent-plugin.sh", "install-agent-plugin.ps1", "package.json", "package-lock.json"];
  const sameProduct = sh("git", ["-C", repo, "diff", "--quiet", remote, "HEAD", "--", ...shipped]).code === 0;
  fact("tested commit (GitHub main)", remote);
  fact("checkout HEAD", head);
  fact("claude", claudeVersion);
  fact("node", process.version);
  fact("platform", `${process.platform} ${process.arch}`);
  fact("install.sh sha256", sha256(readFileSync(join(repo, "install.sh"))).slice(0, 16));
  check("repo checkout is clean", dirty === "", dirty);
  check("the checkout's shipped paths are identical to GitHub main", sameProduct, `HEAD ${head} differs from main ${remote} under: ${shipped.join(" ")}`);

  // Operator's real settings: hashed (never printed) so phase 6 can prove they were only read.
  const realSettingsPath = join(homedir(), ".claude", "settings.json");
  const realSettingsBefore = existsSync(realSettingsPath) ? sha256(readFileSync(realSettingsPath)) : null;
  // The operator's real plugin registries must be untouched by a throwaway install.
  const realRegistries = ["installed_plugins.json", "known_marketplaces.json"].map((name) => join(homedir(), ".claude", "plugins", name));
  // (Claude refreshes its own marketplaces in the background, so a content hash would flap;
  // what must hold is that nothing in the real registries points into the throwaway install.)
  const registryMentions = () => realRegistries.filter((file) => existsSync(file) && readFileSync(file, "utf8").includes("release-acceptance-"));
  let realDefaultMode = null;
  try {
    realDefaultMode = JSON.parse(readFileSync(realSettingsPath, "utf8"))?.permissions?.defaultMode ?? null;
  } catch {
    /* none */
  }

  // ── phase 1 ──
  section("1 · fresh install (public installer, disposable HOME + CLAUDE_CONFIG_DIR)");
  const install = sh("sh", [join(repo, "install.sh")], {
    env: { ...isolated, SKILL_HEAVEN_REF: remote },
    timeout: 600_000,
  });
  writeFileSync(join(outDir, "install.log"), install.out + install.err);
  check("install.sh exits 0", install.code === 0, install.err.slice(-500));
  check("installer registered the Claude plugin", /Successfully installed plugin: skill-heaven@gaia-skill-heaven/.test(install.out));
  const installHome = join(freshHome, ".local", "share", "gaia-skill-heaven");
  const launcher = join(freshHome, ".local", "bin", "claude-zero");
  check("claude-zero launcher linked", existsSync(launcher));

  // ── phase 2 ──
  section("2 · installed plugin inventory");
  const list = sh("claude", ["plugin", "list", "--json"], { env: isolated });
  let plugins = [];
  try {
    plugins = JSON.parse(list.out);
  } catch {
    /* reported below */
  }
  const plugin = plugins.find((entry) => entry.id === "skill-heaven@gaia-skill-heaven");
  check("plugin is listed and enabled", plugin?.enabled === true, list.out.slice(0, 300));
  fact("plugin version", plugin?.version ?? "?");
  check("exactly one MCP server, skill-summon", JSON.stringify(Object.keys(plugin?.mcpServers ?? {})) === '["skill-summon"]');
  const installPath = plugin?.installPath;
  check("plugin installed into the throwaway config dir", Boolean(installPath?.startsWith(freshConfig)), String(installPath));

  const expectedCommands = ["skill-heaven.md", "skill-hell.md", "skill-ultra.md", "skill-zero.md", "summon.md"];
  const commands = installPath ? readdirSync(join(installPath, "commands")).sort() : [];
  check("the five expected commands are present", JSON.stringify(commands) === JSON.stringify(expectedCommands), commands.join(","));
  const skillDirs = installPath ? readdirSync(join(installPath, "skills")).sort() : [];
  check("the five skills are present", skillDirs.length === 5, skillDirs.join(","));

  // Installed bytes == the repo at the tested commit (the marketplace copies ./plugins/skill-heaven).
  const repoPlugin = join(repo, "plugins", "skill-heaven");
  const repoHashes = treeHashes(repoPlugin);
  const installedHashes = installPath ? treeHashes(installPath) : {};
  const drift = diffHashes(repoHashes, installedHashes).filter((file) => !file.startsWith(".git"));
  check("installed plugin bytes equal the repo at the tested commit", drift.length === 0, drift.slice(0, 10).join(", "));
  const installedBundle = installPath ? join(installPath, "mcp", "skill-summon.mjs") : "";
  fact("MCP bundle sha256", existsSync(installedBundle) ? sha256(readFileSync(installedBundle)).slice(0, 16) : "missing");

  const build = () => sh("npm", ["run", "-s", "build:mcp"], { cwd: repo });
  build();
  const afterFirst = sh("git", ["-C", repo, "status", "--porcelain", "--untracked-files=no"]).out.trim();
  build();
  const afterSecond = sh("git", ["-C", repo, "status", "--porcelain", "--untracked-files=no"]).out.trim();
  check("MCP bundle is current: a rebuild from source changes nothing", afterFirst === "", afterFirst);
  check("a second rebuild also produces no diff", afterSecond === "", afterSecond);

  // ── phase 3 ──
  section("3 · the installed launcher's composed plan");
  const syntheticConfig = mkdtempSync(join(work, "syn-"));
  const SENTINEL = "LEAK-SENTINEL-7f3a";
  writeFileSync(
    join(syntheticConfig, "settings.json"),
    JSON.stringify({
      permissions: {
        defaultMode: "acceptEdits",
        allow: [`Bash(${SENTINEL}:*)`],
        deny: [`Read(${SENTINEL})`],
        additionalDirectories: [`/${SENTINEL}`],
      },
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: `touch /${SENTINEL}` }] }] },
      env: { [SENTINEL]: "1" },
      mcpServers: { [SENTINEL]: { command: "node" } },
      enabledPlugins: { [`${SENTINEL}@x`]: true },
    }),
  );
  const plan = (extra = [], configDir = syntheticConfig) => {
    const run = sh(launcher, ["--print", ...extra], { env: { ...isolated, CLAUDE_CONFIG_DIR: configDir } });
    let json = null;
    try {
      json = JSON.parse(run.out);
    } catch {
      /* reported by callers */
    }
    return { ...run, json };
  };

  const floor = plan();
  check("product-floor plan composes", floor.code === 0 && floor.json?.posture === "product-floor", floor.err.slice(0, 300));
  const planArgv = floor.json?.argv ?? [];
  check("strict MCP allowlist stays on", planArgv.includes("--strict-mcp-config"));
  check("exactly one --mcp-config, session-local", planArgv.filter((a) => a === "--mcp-config").length === 1 && planArgv[planArgv.indexOf("--mcp-config") + 1] === "$SESSION/door-mcp.json");
  const doorWrite = (floor.json?.fsPlan ?? []).find((op) => op.kind === "write" && op.path === "$SESSION/door-mcp.json");
  const doorServers = doorWrite ? JSON.parse(doorWrite.contents).mcpServers : {};
  check("the door MCP file declares exactly one server: skill-summon", JSON.stringify(Object.keys(doorServers)) === '["skill-summon"]');
  const doorArg = doorServers["skill-summon"]?.args?.[0];
  check("…and it points at the INSTALLED bundle", typeof doorArg === "string" && doorArg.startsWith(installHome) && existsSync(doorArg), String(doorArg));
  check("the clean room mounts the installed door plugin", planArgv.includes("--plugin-dir") && planArgv[planArgv.indexOf("--plugin-dir") + 1].startsWith(installHome));
  check("project/user setting sources stay evicted", planArgv[planArgv.indexOf("--setting-sources") + 1] === "");

  check("inherited permissions.defaultMode is carried on the session settings", floor.json?.settings?.permissions?.defaultMode === "acceptEdits");
  check("…and is the ONLY permissions key", JSON.stringify(Object.keys(floor.json?.settings?.permissions ?? {})) === '["defaultMode"]');
  check("…and the session settings hold nothing else but the statusline", JSON.stringify(Object.keys(floor.json?.settings ?? {}).sort()) === '["permissions","statusLine"]');
  const planText = JSON.stringify(floor.json ?? {});
  check("allow/deny rules, hooks, env, MCP, plugins and directories do not leak", !planText.includes(SENTINEL));
  check("the plan discloses what was inherited", /permissions\.defaultMode="acceptEdits"/.test(floor.json?.permissionDisclosure ?? ""));

  const explicitMode = plan(["--", "--permission-mode", "plan"]);
  check("an explicit --permission-mode is forwarded verbatim", JSON.stringify((explicitMode.json?.argv ?? []).slice(-2)) === '["--permission-mode","plan"]');
  check("…and wins: the configured mode is not injected", explicitMode.json?.settings?.permissions === undefined);
  const explicitBypass = plan(["--", "--dangerously-skip-permissions"]);
  check("an explicit --dangerously-skip-permissions is forwarded and wins", (explicitBypass.json?.argv ?? []).includes("--dangerously-skip-permissions") && explicitBypass.json?.settings?.permissions === undefined);
  const noConfig = plan([], mkdtempSync(join(work, "empty-")));
  check("no configured mode ⇒ nothing is injected", noConfig.json?.settings?.permissions === undefined && !(noConfig.json?.argv ?? []).some((a) => a.includes("permission")));

  const malformed = mkdtempSync(join(work, "bad-"));
  writeFileSync(join(malformed, "settings.json"), "{ this is not json");
  const bad = plan([], malformed);
  check("malformed settings fail clearly (exit 2, named reason) instead of degrading", bad.code === 2 && /claude-zero:/.test(bad.err) && /settings/i.test(bad.err), `${bad.code} ${bad.err.slice(0, 200)}`);
  check("…and no plan is emitted", bad.json === null);
  const native = plan(["--level", "native"]);
  check("native reads no user file and injects nothing", native.json?.settings?.permissions === undefined);

  // ── phase 4 ──
  section("4 · installed MCP bundle over stdio (no model)");
  const ladderPath = join(installPath ?? "", "scripts", "render-ladder.mjs");
  const { AUTHORITY_PHRASES, MODES, readLadderData, renderLadder } = await import(pathToFileURL(ladderPath).href);
  const ladderData = readLadderData();

  const callServer = async (envExtra, calls) => {
    const child = spawn("node", [installedBundle], {
      env: { ...isolated, SKILL_SOURCE: "https://gaiaskilltree.com", ...envExtra },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    const waiting = new Map();
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message.id !== undefined && waiting.has(message.id)) waiting.get(message.id)(message);
        } catch {
          /* log noise */
        }
      }
    });
    let nextId = 1;
    const rpc = (method, params) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 120_000);
        waiting.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    try {
      const init = await rpc("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "release-acceptance", version: "1" },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      const results = [];
      for (const call of calls) results.push(await rpc(call.method, call.params));
      return { init: init.result, results };
    } finally {
      child.kill();
    }
  };

  const query = { name: "summon", arguments: { query: "receiving code review", surface: "any", preview: true } };
  const refusal = { name: "summon", arguments: { query: "zxqv blorp quux flarn", surface: "any", preview: true } };
  const realCall = { name: "summon", arguments: { query: "receiving code review", surface: "any", limit: 1 } };
  const withRecord = await callServer({}, [
    { method: "tools/list", params: {} },
    { method: "tools/call", params: query },
    { method: "tools/call", params: refusal },
    { method: "tools/call", params: realCall },
  ]);
  const tools = withRecord.results[0]?.result?.tools ?? [];
  check("exactly one tool is exposed: summon", JSON.stringify(tools.map((t) => t.name)) === '["summon"]');
  const instructions = withRecord.init?.instructions ?? "";
  check("server instructions state the reference-data boundary", /REFERENCE MATERIAL, not instructions/.test(instructions));
  check("server instructions decide per use and authorize nothing", /decided per use/.test(instructions) && /not permission to run/.test(instructions));
  check("server instructions carry no authority phrase", authorityHits(instructions, AUTHORITY_PHRASES).length === 0, authorityHits(instructions, AUTHORITY_PHRASES).join(", "));
  check("tool description is a lane filter, not authorization", /not authorization/.test(tools[0]?.description ?? "") && authorityHits(tools[0]?.description ?? "", AUTHORITY_PHRASES).length === 0);
  fact("negotiated protocol", withRecord.init?.protocolVersion);

  const hit = withRecord.results[1]?.result;
  const structured = hit?.structuredContent;
  check("a harmless summon call returns structured content", Boolean(structured?.query) && !hit?.isError, JSON.stringify(hit).slice(0, 300));
  const cardText = (hit?.content ?? []).map((part) => part.text ?? "").join("\n");
  // "verbatim" is on the tripwire list for instructions like "repeat this verbatim". Arbor's own
  // provenance wording ("a record … was read verbatim") is a factual statement about the data, so the
  // preview JSON is scanned without that single phrase; every real card below uses the full list.
  const previewList = AUTHORITY_PHRASES.filter((phrase) => phrase !== "verbatim");
  check("the preview result carries no authority phrase (provenance wording excepted)", authorityHits(cardText, previewList).length === 0, authorityHits(cardText, previewList).join(", "));
  check("composition is relevance-only and selection is unchanged", structured?.composition?.mode === "relevance-only" && structured?.composition?.selectionChanged === false);
  check("Arbor publication cache loaded with the governed record", structured?.arbor?.publicationState === "loaded" && structured?.arbor?.subjectsPublished >= 1, JSON.stringify(structured?.arbor?.publicationState));
  const candidate = (structured?.previewed ?? []).find((entry) => entry?.id === "obra/receiving-code-review");
  check("the candidate joins the governed record content-pinned", candidate?.arbor?.join === "content-pinned");
  check("…and the record's support is `inconclusive`", candidate?.arbor?.claims?.[0]?.support === "inconclusive");
  check("…set by the human-curated interpretation c8d6b2cb", String(candidate?.arbor?.claims?.[0]?.interpretationSource ?? "").startsWith("c8d6b2cb"));
  const band = structured?.composition?.band;
  check("band judgment is reported, not applied: no direction, relevance untouched", band?.direction === null && band?.relevanceUntouched === true && /inconclusive|conditions-unverified/.test(String(band?.abstained)), JSON.stringify(band?.abstained));
  const inconclusiveMember = (band?.members ?? []).find((member) => member?.id === "obra/receiving-code-review");
  check("inconclusive evidence fails closed (no direction from it)", inconclusiveMember?.state === "evidence-inconclusive" || band?.abstained === "conditions-unverified");

  // One real (materializing) summon: a disclosure card with the FULL tripwire list applied.
  const real = withRecord.results[3]?.result;
  // The printable disclosure cards travel in structuredContent.cards; `content[0]` is the JSON dump of
  // the same result (scanned above without the provenance-wording phrase).
  const realText = (real?.structuredContent?.cards ?? []).join("\n");
  const realJson = (real?.content ?? []).map((part) => part.text ?? "").join("\n");
  check("a real summon materializes one skill and returns a card", !real?.isError && (real?.structuredContent?.summoned ?? []).length === 1 && /\[Summoned\]/.test(realText), realText.slice(0, 300));
  check("…the card states it is a listing entry, not a grant", /not authorization to execute or apply|nothing here has been executed/i.test(realText));
  // The Arbor disclosure line says a governed claim was "carried verbatim with their stated conditions":
  // a statement about how the DATA was handled, not an instruction to repeat anything. Every other line
  // of the card is held to the full tripwire list.
  const withoutArborLines = realText.split("\n").filter((line) => !/^\s*Arbor( claim)?:/.test(line)).join("\n");
  check("…the card carries no authority phrase (full tripwire list, Arbor provenance lines excepted)", authorityHits(withoutArborLines, AUTHORITY_PHRASES).length === 0, authorityHits(withoutArborLines, AUTHORITY_PHRASES).join(", "));
  check("…and it ranked by relevance only", /Ranking: relevance only/.test(realText));
  check("…the full result JSON carries no authority phrase (provenance wording excepted)", authorityHits(realJson, previewList).length === 0, authorityHits(realJson, previewList).join(", "));
  const sessionRoot = real?.structuredContent?.sessionRoot;
  if (typeof sessionRoot === "string" && sessionRoot.includes("skill-summon-session-")) rmSync(sessionRoot, { recursive: true, force: true });

  // Control: the same calls against an EMPTY Arbor publication.
  const emptyPublication = mkdtempSync(join(work, "arbor-empty-"));
  mkdirSync(join(emptyPublication, "runtime"), { recursive: true });
  writeFileSync(join(emptyPublication, "edges.json"), readFileSync(join(installPath, "data", "arbor", "edges.json")));
  writeFileSync(join(emptyPublication, "runtime", "index.json"), JSON.stringify({ runtimeVersion: "gaia.arbor-runtime/v1", schema: "gaia.arbor-runtime-index/v1", subjects: [] }));
  const without = await callServer({ ARBOR_PUBLICATION_PATH: emptyPublication }, [
    { method: "tools/list", params: {} },
    { method: "tools/call", params: query },
    { method: "tools/call", params: refusal },
  ]);
  const shape = (result) => {
    const s = result?.structuredContent ?? {};
    return {
      margin: s.margin,
      noMatch: s.noMatch,
      filtered: s.filtered,
      skipped: s.skipped,
      ranking: { ...s.ranking, indexAgeDays: null },
      previewed: (s.previewed ?? []).map(({ arbor: _arbor, ...rest }) => rest),
    };
  };
  const withoutStructured = without.results[1]?.result?.structuredContent;
  check("control: the empty publication really has no governed record", withoutStructured?.arbor?.subjectsPublished === 0, JSON.stringify(withoutStructured?.arbor?.subjectsPublished));
  check("ranking is IDENTICAL with and without the Arbor record", JSON.stringify(shape(hit)) === JSON.stringify(shape(without.results[1]?.result)));
  check("refusal is IDENTICAL with and without the Arbor record", JSON.stringify(shape(withRecord.results[2]?.result)) === JSON.stringify(shape(without.results[2]?.result)));
  check("a nonsense query is an honest refusal, not a forced match", (withRecord.results[2]?.result?.structuredContent?.noMatch ?? null) !== null && (withRecord.results[2]?.result?.structuredContent?.previewed ?? []).length === 0);

  // Commands, skills and the ladder renderer from the INSTALLED copy.
  let authorityFiles = 0;
  const authorityViolations = [];
  for (const file of commands) {
    authorityFiles++;
    const hits = authorityHits(readFileSync(join(installPath, "commands", file), "utf8"), AUTHORITY_PHRASES);
    if (hits.length) authorityViolations.push(`${file}: ${hits.join(",")}`);
  }
  for (const dir of skillDirs) {
    authorityFiles++;
    const hits = authorityHits(readFileSync(join(installPath, "skills", dir, "SKILL.md"), "utf8"), AUTHORITY_PHRASES);
    if (hits.length) authorityViolations.push(`${dir}/SKILL.md: ${hits.join(",")}`);
  }
  for (const mode of MODES) {
    for (const detail of ["concise", "full"]) {
      authorityFiles++;
      const { text } = renderLadder({ mode, target: mode === "summon" ? "audit the parser" : "", data: ladderData, env: {}, manifest: null, detail });
      const hits = authorityHits(text, AUTHORITY_PHRASES);
      if (hits.length) authorityViolations.push(`render ${mode}/${detail}: ${hits.join(",")}`);
    }
  }
  fact("authored surfaces scanned for authority phrases", authorityFiles);
  check("no installed command, skill or rendering asks to be treated as standing authority", authorityViolations.length === 0, authorityViolations.join(" | "));

  // ── phase 5 ──
  if (!live) {
    receipt.skipped.push("phase 5 (live Claude Code sessions): --no-live");
  } else {
    section("5 · live Claude Code sessions through the installed claude-zero");
    const project = mkdtempSync(join(work, "project-"));
    const marker = join(project, "PROJECT-HOOK-FIRED");
    mkdirSync(join(project, ".claude", "skills", "ambient-canary-skill"), { recursive: true });
    writeFileSync(join(project, ".claude", "skills", "ambient-canary-skill", "SKILL.md"), "---\nname: ambient-canary-skill\ndescription: Synthetic ambient project skill that must not appear.\n---\nCanary.\n");
    writeFileSync(join(project, ".mcp.json"), JSON.stringify({ mcpServers: { "ambient-canary": { command: "node", args: ["-e", "setTimeout(()=>{},1000)"] } } }));
    writeFileSync(
      join(project, ".claude", "settings.json"),
      JSON.stringify({
        permissions: { defaultMode: "plan" },
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: `touch ${JSON.stringify(marker)}` }] }] },
        env: { PROJECT_LEAK_CANARY: "1" },
      }),
    );
    // The door admits its bundled server through --mcp-config under its own name, so the tool is mcp__skill-summon__summon.
    const summonTool = "mcp__skill-summon__summon";
    const session = (extra, prompt, maxTurns) => {
      // Real HOME (auth) — the launcher reads settings.json read-only; the plugin is the FRESH install.
      const env = { ...process.env };
      delete env.CLAUDE_CONFIG_DIR;
      delete env.SKILL_SOURCE;
      const run = sh(launcher, ["--", "-p", prompt, "--output-format", "stream-json", "--verbose", "--model", model, "--max-turns", String(maxTurns), ...extra], {
        cwd: project,
        env,
        timeout: 420_000,
      });
      return { ...run, events: parseStreamJson(run.out) };
    };

    const promptSummon = `Call the ${summonTool} tool exactly once with query "receiving code review", surface "any" and limit 1. Then reply with the single word DONE.`;
    const l1 = session(["--allowedTools", summonTool], promptSummon, 6);
    writeFileSync(join(outDir, "live-product-floor.ndjson"), l1.out);
    const init = initEvent(l1.events);
    check("live: the session started", Boolean(init), l1.err.slice(-300));
    if (init) {
      const mcpTools = (init.tools ?? []).filter((name) => name.startsWith("mcp__"));
      check("live: exactly ONE MCP tool, and it is the bundled summon", JSON.stringify(mcpTools) === JSON.stringify([summonTool]), mcpTools.join(", "));
      const servers = (init.mcp_servers ?? []).map((server) => `${server.name}:${server.status}`);
      check("live: exactly one MCP server, connected", servers.length === 1 && /skill-summon:connected$/.test(servers[0]), servers.join(", "));
      check("live: the synthetic ambient MCP server is absent", !JSON.stringify(init).includes("ambient-canary"));
      check("live: the synthetic ambient project skill is absent", !JSON.stringify(init.skills ?? []).includes("ambient-canary-skill") && !JSON.stringify(init.slash_commands ?? []).includes("ambient-canary-skill"));
      const commandNames = JSON.stringify(init.slash_commands ?? []);
      check("live: the five plugin commands are present", ["summon", "skill-zero", "skill-heaven", "skill-hell", "skill-ultra"].every((name) => commandNames.includes(`skill-heaven:${name}`)), commandNames.slice(0, 400));
      const loaded = init.plugins ?? [];
      const nonBuiltin = loaded.filter((entry) => !String(entry.source ?? "").endsWith("@builtin"));
      check("live: the only non-builtin plugin is the door, mounted from the FRESH install", nonBuiltin.length === 1 && nonBuiltin[0].name === "skill-heaven" && String(nonBuiltin[0].path).startsWith(installHome), JSON.stringify(nonBuiltin));
      fact("live: builtin plugins Claude itself adds (not user/project settings)", loaded.filter((entry) => String(entry.source ?? "").endsWith("@builtin")).map((entry) => entry.name));
      const userPlugins = (() => {
        try {
          return Object.keys(JSON.parse(readFileSync(realSettingsPath, "utf8")).enabledPlugins ?? {}).map((id) => id.split("@")[0]);
        } catch {
          return [];
        }
      })();
      const leakedUserPlugins = userPlugins.filter((name) => name !== "skill-heaven" && loaded.some((entry) => entry.name === name));
      check(`live: none of the operator's ${userPlugins.length} user-enabled plugins leaked into the clean room`, leakedUserPlugins.length === 0, leakedUserPlugins.join(", "));
      check("live: the project SessionStart hook did not fire", !existsSync(marker));
      if (realDefaultMode) {
        check(`live: the user's configured defaultMode (${realDefaultMode}) is inherited`, init.permissionMode === realDefaultMode, String(init.permissionMode));
      } else {
        check("live: with no configured mode, the project's mode (plan) is NOT adopted", init.permissionMode !== "plan", String(init.permissionMode));
      }
      check("live: the project's permissions.defaultMode (plan) did not leak", realDefaultMode === "plan" || init.permissionMode !== "plan", String(init.permissionMode));
      fact("live: model", init.model ?? model);
      fact("live: inherited permissionMode", init.permissionMode);
    }
    const summonCalls = toolCalls(l1.events).filter((call) => call.name === summonTool);
    check("live: one summon call was made and returned a card", summonCalls.length >= 1 && !summonCalls[0].isError && /\[Summoned\]|Summoned/.test(summonCalls[0].text), summonCalls[0]?.text?.slice(0, 300));
    if (summonCalls[0]) {
      check("live: the card names its reference-data nature", /reference|nothing here has been executed|not authorization/i.test(summonCalls[0].text));
      // The tool result a model sees is the JSON dump; the printable-card scan with the full list is phase 4.
      check("live: the tool result carries no authority phrase (provenance wording excepted)", authorityHits(summonCalls[0].text, previewList).length === 0, authorityHits(summonCalls[0].text, previewList).join(", "));
    }

    const l2 = session(["--permission-mode", "plan"], "Reply with the single word OK. Do not call any tool.", 2);
    writeFileSync(join(outDir, "live-explicit-plan.ndjson"), l2.out);
    const init2 = initEvent(l2.events);
    check("live: an explicit --permission-mode plan wins over the inherited mode", init2?.permissionMode === "plan", String(init2?.permissionMode));

    const l3 = session(["--dangerously-skip-permissions"], "Reply with the single word OK. Do not call any tool.", 2);
    writeFileSync(join(outDir, "live-explicit-bypass.ndjson"), l3.out);
    const init3 = initEvent(l3.events);
    check("live: an explicit --dangerously-skip-permissions wins over the inherited mode", init3?.permissionMode === "bypassPermissions", `${init3?.permissionMode} ${l3.err.slice(-200)}`);
  }

  // ── phase 6 ──
  section("6 · nothing was modified");
  const installedAfter = installPath ? treeHashes(installPath) : {};
  check("the installed plugin tree is byte-identical after every run", diffHashes(installedHashes, installedAfter).length === 0, diffHashes(installedHashes, installedAfter).join(", "));
  const realSettingsAfter = existsSync(realSettingsPath) ? sha256(readFileSync(realSettingsPath)) : null;
  check("the operator's real settings.json is unchanged (read-only)", realSettingsBefore === realSettingsAfter);
  check("the operator's real plugin registries never reference the throwaway install", registryMentions().length === 0, registryMentions().join(", "));
  const repoAfter = sh("git", ["-C", repo, "status", "--porcelain", "--untracked-files=no"]).out.trim();
  check("the repository checkout is untouched", repoAfter === "", repoAfter);

  // ── receipt ──
  const summary = { when: new Date().toISOString(), commit: remote, checkout: head, claude: claudeVersion, node: process.version, failed, checks: receipt.checks, facts: receipt.facts, skipped: receipt.skipped };
  writeFileSync(join(outDir, "receipt.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n${receipt.checks.length - failed}/${receipt.checks.length} checks passed${receipt.skipped.length ? ` · skipped: ${receipt.skipped.join("; ")}` : ""}`);
  console.log(`receipt: ${join(outDir, "receipt.json")}`);
  rmSync(work, { recursive: true, force: true });
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
