import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = join(REPO, "install-agent-plugin.sh");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("portable Agent Plugin installer", () => {
  it("installs, updates, rolls back, and safely uninstalls one local artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "skill-heaven-agent-plugin-installer-"));
    roots.push(root);
    const archiveRoot = join(root, "archive", "gaia-skill-heaven-probe");
    mkdirSync(archiveRoot, { recursive: true });
    cpSync(join(REPO, "plugins"), join(archiveRoot, "plugins"), { recursive: true });
    cpSync(join(REPO, ".claude-plugin"), join(archiveRoot, ".claude-plugin"), { recursive: true });
    const archive = join(root, "source.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", join(root, "archive"), "gaia-skill-heaven-probe"]);

    const hooks = join(root, "hostile-hooks");
    mkdirSync(hooks);
    const preCommit = join(hooks, "pre-commit");
    writeFileSync(preCommit, "#!/bin/sh\nexit 99\n");
    chmodSync(preCommit, 0o755);
    const gitConfig = join(root, "hostile-gitconfig");
    writeFileSync(
      gitConfig,
      `[commit]\n\tgpgsign = true\n[core]\n\thooksPath = ${hooks}\n`,
    );

    const installHome = join(root, "installed");
    const installEnv = {
      ...process.env,
      HOME: join(root, "home"),
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_DIR: join(root, "wrong-git-dir"),
      SKILL_HEAVEN_PLUGIN_HOME: installHome,
      SKILL_HEAVEN_ARCHIVE_URL: `file://${archive}`,
      SKILL_HEAVEN_REF: "probe",
    };
    const output = execFileSync("sh", [INSTALLER], {
      encoding: "utf8",
      env: installEnv,
    });
    const plugin = join(installHome, "marketplace", "plugins", "skill-heaven");

    expect(output).toContain(`Plugin directory: ${plugin}`);
    expect(existsSync(join(plugin, "plugin.json"))).toBe(true);
    expect(existsSync(join(plugin, "mcp.json"))).toBe(true);
    expect(existsSync(join(plugin, "skills", "summon", "SKILL.md"))).toBe(true);
    expect(existsSync(join(plugin, "mcp", "skill-summon.mjs"))).toBe(true);
    expect(existsSync(join(installHome, ".skill-heaven-agent-plugin-install"))).toBe(true);

    const unrelated = join(root, "unrelated");
    mkdirSync(unrelated);
    const linkedUninstaller = join(unrelated, "uninstall.sh");
    symlinkSync(join(installHome, "uninstall.sh"), linkedUninstaller);
    expect(() => execFileSync("sh", [linkedUninstaller], { stdio: "pipe" })).toThrow();
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(plugin)).toBe(true);

    const marketplace = JSON.parse(
      readFileSync(join(installHome, "marketplace", ".claude-plugin", "marketplace.json"), "utf8"),
    ) as { plugins: Array<{ source: string }> };
    expect(marketplace.plugins[0]?.source).toBe("./plugins/skill-heaven");

    const printed = execFileSync("sh", [INSTALLER, "--print-path"], {
      encoding: "utf8",
      env: { ...process.env, SKILL_HEAVEN_PLUGIN_HOME: installHome },
    }).trim();
    expect(printed).toBe(plugin);

    const stale = join(installHome, "stale-from-previous-install");
    writeFileSync(stale, "stale");
    execFileSync("sh", [INSTALLER], { env: installEnv, stdio: "pipe" });
    expect(existsSync(stale)).toBe(false);

    const preserve = join(installHome, "preserve-on-rollback");
    writeFileSync(preserve, "previous install");
    const fakeBin = join(root, "fake-bin");
    mkdirSync(fakeBin);
    const realMv = execFileSync("sh", ["-c", "command -v mv"], { encoding: "utf8" }).trim();
    const fakeMv = join(fakeBin, "mv");
    writeFileSync(
      fakeMv,
      `#!/bin/sh\ncase $1 in */install) exit 73 ;; esac\nexec '${realMv}' "$@"\n`,
    );
    chmodSync(fakeMv, 0o755);
    expect(() =>
      execFileSync("sh", [INSTALLER], {
        env: { ...installEnv, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
        stdio: "pipe",
      }),
    ).toThrow();
    expect(readFileSync(preserve, "utf8")).toBe("previous install");
    expect(existsSync(join(plugin, "plugin.json"))).toBe(true);

    const uninstallOutput = execFileSync("sh", [INSTALLER, "--uninstall"], {
      encoding: "utf8",
      env: installEnv,
    });
    expect(uninstallOutput).toContain("Client-managed plugin copies and registrations were not removed");
    expect(existsSync(installHome)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
  }, 30_000);
});
