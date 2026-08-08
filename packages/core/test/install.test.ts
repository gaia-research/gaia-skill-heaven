import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const installerPath = resolve(root, "install.sh");
const installer = readFileSync(installerPath, "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");

describe("one-command installer", () => {
  it("is valid POSIX-sh syntax and identifies itself as a working prototype", () => {
    execFileSync("sh", ["-n", installerPath]);
    const help = execFileSync("sh", [installerPath, "--help"], { encoding: "utf8" });
    expect(help).toContain("WORKING PROTOTYPE");
    expect(help).toContain("https://gaia-research.github.io/skill-heaven/install.sh");
  });

  it("installs every door and the published summon engine without installing harnesses", () => {
    for (const door of ["claude", "pi", "codex", "hermes", "grok"]) {
      expect(installer).toContain(`$door-heaven`);
    }
    expect(installer).toContain("@gaia-research/mcp@0.3.0");
    expect(installer).toContain("node_modules/.bin/skill-hell");
    expect(installer).toContain("Harnesses are never installed");
  });

  it("registers the Claude plugin idempotently and tracks only installer-owned state", () => {
    expect(installer).toContain("claude plugin marketplace add gaia-research/skill-heaven");
    expect(installer).toContain('claude plugin update "$PLUGIN_ID"');
    expect(installer).toContain(".claude-plugin-managed");
    expect(installer).toContain(".claude-marketplace-managed");
    expect(installer).toContain("uninstall.sh");
  });

  it("publishes the exact reviewed script at the GitHub Pages install path", () => {
    expect(pagesWorkflow).toContain("- 'install.sh'");
    expect(pagesWorkflow).toContain("cp install.sh packages/site/dist/install.sh");
  });
});
