// KC1 (Issue #8): "skill-heaven installs cleanly from the marketplace,
// verified from a fresh environment."
//
// .claude-plugin/marketplace.json declares this plugin's `source` as
// `./plugins/skill-heaven` — a marketplace install copies ONLY that
// directory. This wraps scripts/verify-marketplace-install.mjs, which does
// the actual work: copy `plugins/skill-heaven/` into a clean temp dir with no repo and no
// node_modules beside it, then prove the shipped command file resolves its
// script path and that the script renders the real posture block standalone.
//
// This is a process-level integration check (it copies files, spawns a real
// `node` child, and reads real stdout), not a unit test — that is the point.
// A negative control ("the child didn't throw") is not enough; the assertions
// below are on the actual rendered content, mirroring what the script itself
// checks internally.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePluginSource, verifyMarketplaceInstall } from "../scripts/verify-marketplace-install.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../scripts/verify-marketplace-install.mjs", import.meta.url));

describe("KC1: marketplace install, verified from a fresh environment", () => {
  it("passes every check when the plugin dir is copied in isolation and run standalone", async () => {
    const lines: string[] = [];
    const { ok, failures } = await verifyMarketplaceInstall((msg: string) => lines.push(msg));

    if (!ok) {
      // Surface the full transcript (including the real stdout dump from the
      // standalone run) on failure so a CI log shows exactly what broke.
      console.error(lines.join("\n"));
    }

    expect(failures).toEqual([]);
    expect(ok).toBe(true);
  });
});

// A5a (Issue #8 narrowness fix): the check must prove the MARKETPLACE MANIFEST
// routes an installer to this plugin, not merely that a hardcoded directory
// happens to work standalone. These fixtures never touch the real repo's
// .claude-plugin/marketplace.json — each builds its own temp "repo root" with
// a deliberately broken manifest and points resolvePluginSource/
// verifyMarketplaceInstall at it via the marketplacePath/repoRoot overrides.
describe("A5a: plugin source is read FROM marketplace.json, not asserted independently", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "ch-marketplace-fixture-"));
  });
  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function writeMarketplace(contents: unknown) {
    const dir = join(repoRoot, ".claude-plugin");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "marketplace.json");
    writeFileSync(path, typeof contents === "string" ? contents : JSON.stringify(contents));
    return path;
  }

  it("FAILS when source points somewhere that does not exist — the fix's whole point", async () => {
    const marketplacePath = writeMarketplace({
      plugins: [{ name: "skill-heaven", source: "./this-directory-does-not-exist" }],
    });

    const resolution = resolvePluginSource(marketplacePath, repoRoot, "skill-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.error).toMatch(/does not exist/);
    }

    const lines: string[] = [];
    const { ok, failures } = await verifyMarketplaceInstall((msg) => lines.push(msg), { marketplacePath, repoRoot, pluginName: "skill-heaven" });
    expect(ok).toBe(false);
    expect(failures.some((f) => f.includes("does not exist"))).toBe(true);
  });

  it("FAILS loudly when marketplace.json is missing", () => {
    const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json"); // never written
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "skill-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.error).toMatch(/not found/);
  });

  it("FAILS loudly when marketplace.json is unparseable", () => {
    const marketplacePath = writeMarketplace("{ not json");
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "skill-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.error).toMatch(/did not parse as JSON/);
  });

  it("FAILS loudly when the plugin entry has no source field", () => {
    const marketplacePath = writeMarketplace({ plugins: [{ name: "skill-heaven" }] });
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "skill-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.error).toMatch(/no \(or an empty\) "source" field/);
  });

  it("SUCCEEDS when source correctly resolves to a real directory", () => {
    mkdirSync(join(repoRoot, "plugins", "skill-heaven"), { recursive: true });
    const marketplacePath = writeMarketplace({
      plugins: [{ name: "skill-heaven", source: "./plugins/skill-heaven" }],
    });
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "skill-heaven");
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.path).toBe(join(repoRoot, "plugins", "skill-heaven"));
  });
});

// A5b (Issue #8): the invocation guard that decides whether the CLI body runs
// at all must not carry the class of bug KC1 exists to catch. "Assert on
// content, never on exit status alone" is the whole lesson of the original
// bug (render-posture.mjs silently printing nothing at exit 0) — so these
// prove BOTH directions on real content/behavior, not on exit codes alone.
describe("A5b: the invokedDirectly guard is symlink-safe and does not throw on a bogus argv[1]", () => {
  it("direct invocation (`node verify-marketplace-install.mjs`) actually renders content", () => {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH], { encoding: "utf-8" });
    // Content, not just "didn't throw" or "exit 0" — the exact defect class
    // this script exists to catch (an old, weaker guard silently ran nothing).
    expect(stdout).toContain("KC1 fresh-environment check: PASS");
  });

  it("import() with a bogus argv[1] neither throws nor renders anything", async () => {
    const originalArgv1 = process.argv[1];
    process.argv[1] = "/definitely/does/not/exist/verify-marketplace-install.mjs";
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      // If the guard is wrong, this branch would tear down the test runner
      // for real; failing the assertion instead makes the wrong direction a
      // normal test failure rather than a crashed suite.
      throw new Error(`process.exit(${code}) called during import() — the guard ran the CLI body when it must not have`);
    }) as never);

    try {
      // Cache-bust: a bare re-import of the same specifier would hit ESM's
      // module cache and skip top-level execution entirely, proving nothing.
      // @vite-ignore: the specifier is intentionally dynamic (cache-bust
      // query varies per run) — Vite's static import-graph analysis can't
      // (and shouldn't) resolve it ahead of time.
      const specifier = `${SCRIPT_PATH.replace(/\\/g, "/")}?a5b-bogus-argv-${Date.now()}`;
      await expect(import(/* @vite-ignore */ specifier)).resolves.toBeDefined();
    } finally {
      process.argv[1] = originalArgv1;
      writeSpy.mockRestore();
      exitSpy.mockRestore();
    }

    // Neither throws (asserted above via `.resolves`) NOR renders: the CLI
    // body's distinctive output must never have been written.
    const written = writeSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(written).not.toContain("KC1 fresh-environment check");
  });
});
