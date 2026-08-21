import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INSTALL } from "../../site/src/product.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const installerPath = resolve(root, "install.sh");
const installer = readFileSync(installerPath, "utf8");
const pagesWorkflow = readFileSync(resolve(root, ".github/workflows/pages.yml"), "utf8");
const ps1InstallerPath = resolve(root, "install.ps1");
const ps1AgentPluginPath = resolve(root, "install-agent-plugin.ps1");
const ps1Installer = readFileSync(ps1InstallerPath, "utf8");
const ps1AgentPlugin = readFileSync(ps1AgentPluginPath, "utf8");

describe("one-command installer", () => {
  it("is valid POSIX-sh syntax and identifies itself as a working prototype", () => {
    execFileSync("sh", ["-n", installerPath]);
    const help = execFileSync("sh", [installerPath, "--help"], { encoding: "utf8" });
    expect(help).toContain("WORKING PROTOTYPE");
    expect(help).toContain("https://gaia-research.github.io/gaia-skill-heaven/install.sh");
  });

  it("installs every door and the bundled plugin's five commands without installing harnesses", () => {
    for (const door of ["claude", "pi", "codex", "hermes", "grok"]) {
      expect(installer).toContain(`$door-zero`);
    }
    for (const command of ["/summon", "/skill-zero", "/skill-heaven", "/skill-hell", "/skill-ultra"]) {
      expect(installer).toContain(command);
    }
    expect(installer).toContain("Harnesses are never installed");
  });

  it("never wires the deprecated external @gaia-research/mcp package", () => {
    expect(installer).not.toMatch(/@gaia-research\/mcp/);
    expect(installer).not.toMatch(/\bnpx\b/);
    expect(installer).not.toContain("node_modules/.bin/skill-hell");
    expect(installer).not.toMatch(/MCP_SPEC/);
    expect(installer).not.toMatch(/SKILL_HELL_PACKAGE/);
  });

  it("registers the Claude plugin idempotently and tracks only installer-owned state", () => {
    expect(installer).toContain(
      "claude plugin marketplace add https://github.com/gaia-research/gaia-skill-heaven.git",
    );
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

describe("windows PowerShell installers", () => {
  it("install.ps1 exists and contains expected structure", () => {
    expect(ps1Installer).toContain("[CmdletBinding()]");
    expect(ps1Installer).toContain("gaia-skill-heaven");
    expect(ps1Installer).toContain("npm ci");
    expect(ps1Installer).toContain("uninstall.ps1");
    for (const door of ["claude", "pi", "codex", "hermes", "grok"]) {
      expect(ps1Installer).toContain(door);
    }
    expect(ps1Installer).toContain("$door-zero");
  });

  it("install-agent-plugin.ps1 exists and contains expected structure", () => {
    expect(ps1AgentPlugin).toContain("[CmdletBinding()]");
    expect(ps1AgentPlugin).toContain("gaia-skill-heaven-agent-plugin");
    expect(ps1AgentPlugin).toContain("plugin.json");
    expect(ps1AgentPlugin).toContain("git");
    expect(ps1AgentPlugin).toContain("uninstall.ps1");
  });

  it("never references the deprecated external MCP package", () => {
    expect(ps1Installer).not.toMatch(/@gaia-research\/mcp/);
    expect(ps1Installer).not.toMatch(/\bnpx\b/);
    expect(ps1AgentPlugin).not.toMatch(/@gaia-research\/mcp/);
  });

  it("pages workflow copies PS1 files to dist", () => {
    expect(pagesWorkflow).toContain("- 'install.ps1'");
    expect(pagesWorkflow).toContain("- 'install-agent-plugin.ps1'");
    expect(pagesWorkflow).toContain("cp install.ps1 packages/site/dist/install.ps1");
    expect(pagesWorkflow).toContain(
      "cp install-agent-plugin.ps1 packages/site/dist/install-agent-plugin.ps1"
    );
  });

  it("INSTALL exports Windows PS1 commands", () => {
    expect(INSTALL.agentPluginPs1.command).toContain("irm");
    expect(INSTALL.agentPluginPs1.command).toContain("install-agent-plugin.ps1");
    expect(INSTALL.shPs1).toContain("irm");
    expect(INSTALL.shPs1).toContain("install.ps1");
  });
});

