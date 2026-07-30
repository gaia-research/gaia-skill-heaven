// KC1 (Issue #8): "claude-heaven installs cleanly from the marketplace,
// verified from a fresh environment."
//
// .claude-plugin/marketplace.json declares this plugin's `source` as
// `./packages/claude-heaven/plugin` — a marketplace install copies ONLY that
// directory. This wraps scripts/verify-marketplace-install.mjs, which does
// the actual work: copy `plugin/` into a clean temp dir with no repo and no
// node_modules beside it, then prove the shipped command file resolves its
// script path and that the script renders the real posture block standalone.
//
// This is a process-level integration check (it copies files, spawns a real
// `node` child, and reads real stdout), not a unit test — that is the point.
// A negative control ("the child didn't throw") is not enough; the assertions
// below are on the actual rendered content, mirroring what the script itself
// checks internally.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePluginSource, verifyMarketplaceInstall } from "../scripts/verify-marketplace-install.mjs";

describe("KC1: marketplace install, verified from a fresh environment", () => {
  it("passes every check when the plugin dir is copied in isolation and run standalone", () => {
    const lines: string[] = [];
    const { ok, failures } = verifyMarketplaceInstall((msg: string) => lines.push(msg));

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

  it("FAILS when source points somewhere that does not exist — the fix's whole point", () => {
    const marketplacePath = writeMarketplace({
      plugins: [{ name: "claude-heaven", source: "./this-directory-does-not-exist" }],
    });

    const resolution = resolvePluginSource(marketplacePath, repoRoot, "claude-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.error).toMatch(/does not exist/);
    }

    const lines: string[] = [];
    const { ok, failures } = verifyMarketplaceInstall((msg) => lines.push(msg), { marketplacePath, repoRoot, pluginName: "claude-heaven" });
    expect(ok).toBe(false);
    expect(failures.some((f) => f.includes("does not exist"))).toBe(true);
  });

  it("FAILS loudly when marketplace.json is missing", () => {
    const marketplacePath = join(repoRoot, ".claude-plugin", "marketplace.json"); // never written
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "claude-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.error).toMatch(/not found/);
  });

  it("FAILS loudly when marketplace.json is unparseable", () => {
    const marketplacePath = writeMarketplace("{ not json");
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "claude-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.error).toMatch(/did not parse as JSON/);
  });

  it("FAILS loudly when the plugin entry has no source field", () => {
    const marketplacePath = writeMarketplace({ plugins: [{ name: "claude-heaven" }] });
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "claude-heaven");
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.error).toMatch(/no \(or an empty\) "source" field/);
  });

  it("SUCCEEDS when source correctly resolves to a real directory", () => {
    mkdirSync(join(repoRoot, "packages", "claude-heaven", "plugin"), { recursive: true });
    const marketplacePath = writeMarketplace({
      plugins: [{ name: "claude-heaven", source: "./packages/claude-heaven/plugin" }],
    });
    const resolution = resolvePluginSource(marketplacePath, repoRoot, "claude-heaven");
    expect(resolution.ok).toBe(true);
    if (resolution.ok) expect(resolution.path).toBe(join(repoRoot, "packages", "claude-heaven", "plugin"));
  });
});
