// Installer and site facts now share a generated contract, not two hand-written
// epilogues. Exercise the real bootstrap with a sealed PATH; detection may not
// execute a host. Registration is a separate explicit operation.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HARNESS_PATHS } from "../packages/status/src/compat.js";
import { chipText, renderInstallEpilogue } from "../packages/status/src/install-epilogue.js";
import { planProfile } from "../packages/status/src/install-plan.js";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let root: string, archive: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "sh-epilogue-"));
  const source = join(root, "archive", "source"); mkdirSync(source, { recursive: true });
  for (const dir of ["plugins", ".claude-plugin", "scripts"]) cpSync(join(REPO, dir), join(source, dir), { recursive: true });
  archive = join(root, "source.tar.gz"); execFileSync("tar", ["-czf", archive, "-C", join(root, "archive"), "source"]);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
function run(harnesses: string[], args: string[] = []) {
  const dir = mkdtempSync(join(root, "run-")), bin = join(dir, "bin"), home = join(dir, "home"), installed = join(home, "custom location");
  mkdirSync(bin); mkdirSync(home); const marker = join(dir, "executed");
  for (const tool of ["node", "curl", "tar", "mktemp", "git", "rm", "mkdir", "sh", "gzip"]) {
    const real = execFileSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim(); symlinkSync(real, join(bin, tool));
  }
  for (const h of harnesses) writeFileSync(join(bin, h), `#!/bin/sh\necho executed >> '${marker}'\nexit 97\n`, { mode: 0o755 });
  const r = spawnSync("/bin/sh", [join(REPO, "install-agent-plugin.sh"), ...args], { encoding: "utf8", env: { PATH: bin, HOME: home, SKILL_HEAVEN_PLUGIN_HOME: installed, SKILL_HEAVEN_ARCHIVE_URL: `file://${archive}` } });
  return { ...r, home, installed, marker };
}
describe("canonical installer epilogue", () => {
  it("prints the exact canonical next commands without executing any detected harness", () => {
    const r = run(["claude", "codex", "pi", "grok", "hermes", "agy"]); expect(r.status, r.stderr).toBe(0);
    expect(existsSync(r.marker)).toBe(false);
    const paths = { pluginDir: join(r.installed, "marketplace/plugins/skill-heaven"), consoleDir: join(r.installed, "marketplace/plugins/skill-heaven-console"), marketplaceDir: join(r.installed, "marketplace") };
    for (const h of HARNESS_PATHS.filter(h => h.bin)) {
      expect(r.stdout).toContain(h.name); expect(r.stdout).toContain(chipText(h));
      const plan = planProfile(h, "core", "register", paths); expect(plan.kind).toBe("steps");
      if (plan.kind === "steps") for (const step of plan.steps) expect(r.stdout).toContain(step.run);
    }
    expect(r.stdout).toContain("No harness was installed or reconfigured.");
    expect(r.stdout).toContain("Artifact staged only"); expect(r.stdout).toContain("Profile: Core");
    expect(existsSync(join(r.installed, "marketplace/plugins/skill-heaven-console"))).toBe(false);
  }, 30_000);
  it("no harness is an honest empty state", () => {
    const r = run([]); expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("(none found)"); expect(r.stdout).toContain("it never installs one");
    expect(r.stdout).not.toContain("codex plugin add");
  }, 30_000);
  it("quiet is exactly two artifact paths; help and print-path need no download", () => {
    const r = run([], ["--quiet"]); expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([join(r.installed, "marketplace/plugins/skill-heaven"), join(r.installed, "marketplace")]);
    const help = run([], ["--help"]); expect(help.status).toBe(0); expect(help.stdout).toContain("--profile"); expect(existsSync(help.installed)).toBe(false);
    const path = run([], ["--print-path"]); expect(path.status).toBe(0); expect(existsSync(path.installed)).toBe(false);
    expect(run([], ["--profile"]).status).not.toBe(0); expect(run([], ["--surprise"]).status).not.toBe(0);
  }, 30_000);
  it("Full without a supported selected harness fails closed", () => {
    const r = run([], ["--profile", "full"]); expect(r.status).not.toBe(0); expect(existsSync(r.installed)).toBe(false);
    const other = run([], ["--profile", "full", "--harness", "other"]); expect(other.status).not.toBe(0); expect(existsSync(other.installed)).toBe(false);
  }, 30_000);
  it("both bootstrap scripts delegate profile facts to the same generated helper", () => {
    for (const file of ["install-agent-plugin.sh", "install-agent-plugin.ps1"]) {
      const s = readFileSync(join(REPO, file), "utf8"); expect(s).toContain("install-profile.mjs");
      expect(s).not.toContain("codex plugin add"); expect(s).not.toContain("grok plugin install");
    }
    const bundle = readFileSync(join(REPO, "scripts/install-profile.mjs"), "utf8");
    for (const h of HARNESS_PATHS) expect(bundle).toContain(h.name);
  });
  it("reports successful registration outcomes without re-offering completed commands", () => {
    const h = HARNESS_PATHS.find(h => h.id === "claude")!;
    const paths = { installHome: "/tmp/example", uninstall: "/tmp/example/uninstall.sh", pluginDir: "/tmp/example/core", consoleDir: "/tmp/example/console", marketplaceDir: "/tmp/example/marketplace" };
    const plan = planProfile(h, "core", "register", paths);
    if (plan.kind !== "steps") throw new Error("Core unexpectedly blocked");
    const runs = plan.steps.map(step => step.run);
    const out = renderInstallEpilogue({ profile: "core", previous: null, found: [h.id], ran: { [h.id]: runs.map(run => ({ run })) }, paths });
    expect(out).toContain("--register completed:");
    expect(out).not.toContain("No harness was installed or reconfigured.");
    const completed = out.split("--register completed:")[1]!.split("\n\n")[0]!;
    expect(completed.split("\n").map(line => line.trim().replace(/^ok\s+/, "")).filter(Boolean)).toEqual(runs);
    expect(out).not.toContain("Inside Claude Code, type:");
  });
  it("Full prints only the selected console and honest native limitations", () => {
    const h = HARNESS_PATHS.find(h => h.id === "claude")!;
    const paths = { installHome: "/tmp/example", uninstall: "/tmp/example/uninstall.sh", pluginDir: "/tmp/example/core", consoleDir: "/tmp/example/console", marketplaceDir: "/tmp/example/marketplace" };
    const out = renderInstallEpilogue({ profile: "full", previous: null, found: [h.id], paths });
    expect(out).toContain("Profile: Core + Console"); expect(out).toContain("skill-heaven-console@gaia-skill-heaven"); expect(out).toContain("Then add the console");
  });
});
