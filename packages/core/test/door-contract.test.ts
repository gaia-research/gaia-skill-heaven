// Door behavioural contract (#33): ONE parametrized suite every door runs.
//
// Each cell is a behaviour a door must show when driven as a subprocess through
// its real bin shim (the same way a user runs it). Where a door genuinely lacks
// a capability the cell is marked n/a WITH A REASON, and the suite still asserts
// the absence (so an n/a cannot silently become a faked pass or a stale claim).
//
// Evidence level: structural + dry-run + a *stubbed* launch. The harness binary
// is replaced by a recording stub on PATH, so no model is called and no
// credentials are needed. A green cell here is NOT evidence about a real harness
// session; see docs/COMPAT-MATRIX.md for the evidence levels.
//
// Everything runs against mkdtemp HOME / config / TMPDIR roots. The suite never
// reads or writes the developer's real ~/.claude, ~/.pi, ~/.codex, etc.
//
// The pass/n/a matrix is rendered to docs/DOOR-CONTRACT-MATRIX.md and drift-
// checked; regenerate with `UPDATE_DOOR_MATRIX=1 npx vitest run packages/core/test/door-contract.test.ts`.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SKILL_FIXTURE = join(REPO, "packages/core/test/fixtures/impeccable-skill");
const MATRIX_DOC = join(REPO, "docs/DOOR-CONTRACT-MATRIX.md");

// ---------------------------------------------------------------------------
// The door table: the single place a new door declares what it exposes.
// ---------------------------------------------------------------------------

interface DoorSpec {
  /** package dir name and bin: packages/<id>/bin/<id>.mjs */
  id: string;
  /** the harness binary the door execs (stubbed on PATH here) */
  harness: string;
  /** env var naming the in-session manifest, or null when the door writes none */
  manifestEnv: string | null;
  /** manifest file basename inside the session dir */
  manifestFile: string | null;
  /** true when the door mounts the summon MCP itself and honours SKILL_HEAVEN_ZERO_CUTS */
  zeroCutEnv: boolean;
  /** extra argv the curated (`low`) rung needs beyond --skill (agy refuses without it) */
  lowArgs?: string[];
}

const DOORS: DoorSpec[] = [
  { id: "claude-zero", harness: "claude", manifestEnv: "CLAUDE_ZERO_PROFILE", manifestFile: "profile.json", zeroCutEnv: true },
  { id: "pi-zero", harness: "pi", manifestEnv: "PI_ZERO_PROFILE", manifestFile: "pi-zero-profile.json", zeroCutEnv: false },
  { id: "codex-zero", harness: "codex", manifestEnv: null, manifestFile: null, zeroCutEnv: false },
  { id: "hermes-zero", harness: "hermes", manifestEnv: null, manifestFile: null, zeroCutEnv: false },
  { id: "grok-zero", harness: "grok", manifestEnv: null, manifestFile: null, zeroCutEnv: false },
  { id: "agy-zero", harness: "agy", manifestEnv: null, manifestFile: null, zeroCutEnv: false, lowArgs: ["--isolate-home"] },
];

const CELLS = [
  "default-rung-composes",
  "each-rung-composes",
  "upper-rungs-route-live",
  "print-is-dry-run",
  "p3-no-shared-writes",
  "manifest-in-session-dir",
  "session-dir-contained",
  "zero-cut-env",
] as const;
type Cell = (typeof CELLS)[number];

type Result = { status: "pass" } | { status: "fail"; error: string } | { status: "n/a"; reason: string };
const results = new Map<string, Result>();

// ---------------------------------------------------------------------------
// Sandbox: temp HOME + config dirs + TMPDIR + a recording stub per harness.
// ---------------------------------------------------------------------------

interface Sandbox {
  root: string;
  home: string;
  tmp: string;
  stubs: string;
  records: string;
  env: NodeJS.ProcessEnv;
}

const HOME_SEED: Record<string, string> = {
  ".claude/settings.json": '{"permissions":{"defaultMode":"default"}}\n',
  ".claude/skills/seed/SKILL.md": "---\nname: seed\ndescription: seed\n---\n",
  ".pi/agent/settings.json": "{}\n",
  ".codex/auth.json": '{"token":"fixture"}\n',
  ".codex/config.toml": "# fixture\n",
  ".grok/auth.json": '{"token":"fixture"}\n',
  ".hermes/config.yaml": "# fixture\n",
  ".gemini/settings.json": "{}\n",
  ".config/agy/settings.json": "{}\n",
};

function makeSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "door-contract-"));
  const home = join(root, "home");
  const tmp = join(root, "tmp");
  const stubs = join(root, "stubs");
  const records = join(root, "records");
  for (const d of [home, tmp, stubs, records]) mkdirSync(d, { recursive: true });
  for (const [rel, body] of Object.entries(HOME_SEED)) {
    mkdirSync(dirname(join(home, rel)), { recursive: true });
    writeFileSync(join(home, rel), body);
  }
  // The stub records argv, a selection of env, the session temp listing (taken
  // while the "harness" runs, i.e. while the door's session dir must exist) and a
  // copy of any manifest the door pointed it at. Then exits 0: no model, no auth.
  for (const d of DOORS) {
    const manifestEnv = d.manifestEnv ?? "";
    const script = [
      "#!/bin/sh",
      // Door-internal discovery probes (codex app-server skills/list, grok inspect
      // --json) answer with an empty skill list and are not recorded as the launch.
      ...(d.harness === "codex"
        ? ['if [ "$1" = "app-server" ]; then cat >/dev/null; echo \'{"id":2,"result":{"data":[{"skills":[]}]}}\'; exit 0; fi']
        : []),
      ...(d.harness === "grok" ? ['if [ "$1" = "inspect" ]; then echo \'{"skills":[]}\'; exit 0; fi'] : []),
      `R="${records}/${d.harness}"`,
      `echo "$@" > "$R.args"`,
      `env | sort > "$R.env"`,
      `ls "$TMPDIR" > "$R.tmplist"`,
      `if [ -n "${manifestEnv}" ]; then eval "M=\\$${manifestEnv}"; if [ -n "$M" ] && [ -f "$M" ]; then cp "$M" "$R.manifest"; fi; fi`,
      "exit 0",
      "",
    ].join("\n");
    const p = join(stubs, d.harness);
    writeFileSync(p, script);
    chmodSync(p, 0o755);
  }
  const env: NodeJS.ProcessEnv = {
    PATH: `${stubs}:${process.env.PATH ?? ""}`,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: tmp,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    XDG_CACHE_HOME: join(root, "cache"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CODEX_HOME: join(home, ".codex"),
    LANG: "C",
  };
  return { root, home, tmp, stubs, records, env };
}

/** Deterministic content snapshot of a tree (relative path -> sha256 | "dir"). */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const rel = relative(dir, full);
      if (statSync(full).isDirectory()) {
        out[rel] = "dir";
        walk(full);
      } else out[rel] = createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

async function runDoor(sb: Sandbox, door: DoorSpec, args: string[], extraEnv: NodeJS.ProcessEnv = {}): Promise<Run> {
  const bin = join(REPO, "packages", door.id, "bin", `${door.id}.mjs`);
  try {
    const r = await exec(process.execPath, [bin, ...args], {
      env: { ...sb.env, ...extraEnv },
      cwd: sb.root,
      encoding: "utf8",
      timeout: 60_000,
    });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

const sessionDirs = (sb: Sandbox, door: DoorSpec): string[] =>
  readdirSync(sb.tmp).filter((n) => n.startsWith(`${door.id}-`));

// ---------------------------------------------------------------------------
// Cell implementations. Each throws on failure; n/a is decided by `applicable`.
// ---------------------------------------------------------------------------

type Check = (sb: Sandbox, door: DoorSpec) => Promise<void>;

const parse = (r: Run): { posture: string } & Record<string, unknown> => {
  expect(r.code, r.stderr).toBe(0);
  return JSON.parse(r.stdout);
};

const checks: Record<Cell, Check> = {
  "default-rung-composes": async (sb, door) => {
    const plan = parse(await runDoor(sb, door, ["--print"]));
    expect(plan.posture).toBe("product-floor"); // the zero rung is the default
  },

  "each-rung-composes": async (sb, door) => {
    // zero / med / native boot without a skill; low (curated) needs one.
    const expected: Array<[string[], string]> = [
      [["--level", "zero"], "product-floor"],
      [["--level", "med"], "native"],
      [["--level", "native"], "native"],
      [["--level", "low", "--skill", SKILL_FIXTURE, ...(door.lowArgs ?? [])], "curated"],
    ];
    for (const [args, posture] of expected) {
      const plan = parse(await runDoor(sb, door, [...args, "--print"]));
      expect(plan.posture, `${door.id} ${args.join(" ")}`).toBe(posture);
    }
  },

  "upper-rungs-route-live": async (sb, door) => {
    // N13: nothing refuses. high..max and ultra are live summon rungs: exit 2 with
    // the in-session command, never gate/policy language.
    for (const [level, arm] of [
      ["high", "/skill-hell high"],
      ["xhigh", "/skill-hell xhigh"],
      ["max", "/skill-hell max"],
      ["ultra", "/skill-ultra"],
    ] as const) {
      const r = await runDoor(sb, door, ["--level", level, "--print"]);
      expect(r.code, `${door.id} --level ${level}`).toBe(2);
      expect(r.stderr).toContain("live summon rung, not a boot posture");
      expect(r.stderr).toContain(arm);
      expect(r.stderr).not.toMatch(/UNRATIFIED|P2|gated|policy/i);
    }
  },

  "print-is-dry-run": async (sb, door) => {
    const before = snapshot(sb.home);
    for (const args of [["--print"], ["--level", "native", "--print"]]) {
      const r = await runDoor(sb, door, args);
      expect(r.code, r.stderr).toBe(0);
      expect(() => JSON.parse(r.stdout)).not.toThrow();
    }
    expect(existsSync(join(sb.records, `${door.harness}.args`)), "harness binary must not be executed").toBe(false);
    expect(sessionDirs(sb, door), "dry run must not create a session dir").toEqual([]);
    expect(snapshot(sb.home)).toEqual(before);
  },

  "p3-no-shared-writes": async (sb, door) => {
    const before = snapshot(sb.home);
    for (const args of [[], ["--level", "native"]]) {
      rmSync(join(sb.records, `${door.harness}.args`), { force: true });
      const r = await runDoor(sb, door, args);
      expect(r.code, `${door.id} ${args.join(" ")}: ${r.stderr}`).toBe(0);
      // the stub ran: this really was a launch, not a silent no-op
      expect(existsSync(join(sb.records, `${door.harness}.args`)), "stub harness was not exec'd").toBe(true);
    }
    expect(snapshot(sb.home), "HOME / config dirs changed during launch (P3)").toEqual(before);
  },

  "manifest-in-session-dir": async (sb, door) => {
    const r = await runDoor(sb, door, []);
    expect(r.code, r.stderr).toBe(0);
    const copy = join(sb.records, `${door.harness}.manifest`);
    expect(existsSync(copy), "manifest was not readable at the path the door handed the harness").toBe(true);
    const env = readFileSync(join(sb.records, `${door.harness}.env`), "utf8");
    const line = env.split("\n").find((l) => l.startsWith(`${door.manifestEnv}=`));
    expect(line).toBeDefined();
    const path = line!.slice(door.manifestEnv!.length + 1);
    expect(path.startsWith(sb.tmp), "manifest path is outside the session temp root").toBe(true);
    expect(path.endsWith(door.manifestFile!)).toBe(true);
    const manifest = JSON.parse(readFileSync(copy, "utf8"));
    expect(manifest).toBeTypeOf("object");
  },

  "session-dir-contained": async (sb, door) => {
    const r = await runDoor(sb, door, []);
    expect(r.code, r.stderr).toBe(0);
    // while the harness ran, the session dir existed under TMPDIR ...
    const during = readFileSync(join(sb.records, `${door.harness}.tmplist`), "utf8").split("\n");
    expect(during.some((n) => n.startsWith(`${door.id}-`)), "no session dir under TMPDIR during the run").toBe(true);
    // ... and it is gone afterwards.
    expect(sessionDirs(sb, door), "session dir leaked after exit").toEqual([]);
  },

  "zero-cut-env": async (sb, door) => {
    const cutOf = (out: string): string | undefined => {
      const plan = JSON.parse(out) as { fsPlan: Array<{ kind: string; path?: string; contents?: string }> };
      const mcp = plan.fsPlan.find((op) => op.kind === "write" && op.path?.endsWith("door-mcp.json"));
      const env = mcp?.contents ? JSON.parse(mcp.contents).mcpServers["skill-summon"].env : {};
      return env.SKILL_HEAVEN_ZERO_CUTS;
    };
    const all = await runDoor(sb, door, ["--print"], { SKILL_HEAVEN_ZERO_CUTS: "all" });
    expect(all.code, all.stderr).toBe(0);
    expect(cutOf(all.stdout)).toBe("all");
    const unset = await runDoor(sb, door, ["--print"]);
    expect(unset.code, unset.stderr).toBe(0);
    expect(cutOf(unset.stdout)).not.toBe("all");
  },
};

/** Returns the n/a reason, or null when the cell applies to this door. */
function notApplicable(door: DoorSpec, cell: Cell): string | null {
  if (cell === "manifest-in-session-dir" && !door.manifestEnv) {
    return "door writes no manifest: its plan carries only env + fsPlan (verified: no *_PROFILE env reaches the harness)";
  }
  if (cell === "zero-cut-env" && !door.zeroCutEnv) {
    return "door does not mount the summon MCP itself, so SKILL_HEAVEN_ZERO_CUTS has nothing to configure (verified: --print never mentions it)";
  }
  return null;
}

/** Assertions that keep an n/a honest: the claimed absence must still be true. */
const absenceGuards: Partial<Record<Cell, Check>> = {
  "manifest-in-session-dir": async (sb, door) => {
    const r = await runDoor(sb, door, []);
    expect(r.code, r.stderr).toBe(0);
    const env = readFileSync(join(sb.records, `${door.harness}.env`), "utf8");
    expect(env, `${door.id} now exports a profile env var: promote this cell from n/a`).not.toMatch(/^(?!USERPROFILE)[A-Z_]*PROFILE=/m);
  },
  "zero-cut-env": async (sb, door) => {
    const r = await runDoor(sb, door, ["--print"], { SKILL_HEAVEN_ZERO_CUTS: "all" });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout, `${door.id} now honours the zero cut: promote this cell from n/a`).not.toContain("ZERO_CUTS");
  },
};

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe.concurrent("door behavioural contract (#33)", () => {
  for (const door of DOORS) {
    describe(door.id, () => {
      for (const cell of CELLS) {
        const na = notApplicable(door, cell);
        const key = `${door.id}/${cell}`;
        // One sandbox per cell, so cells are independent and run concurrently.
        it(na ? `${cell} [n/a]` : cell, async () => {
          const sb = makeSandbox();
          try {
            if (na) {
              expect(na.length).toBeGreaterThan(20);
              await absenceGuards[cell]?.(sb, door);
              results.set(key, { status: "n/a", reason: na });
            } else {
              await checks[cell](sb, door);
              results.set(key, { status: "pass" });
            }
          } catch (e) {
            results.set(key, { status: "fail", error: (e as Error).message.split("\n")[0] });
            throw e;
          } finally {
            rmSync(sb.root, { recursive: true, force: true });
          }
        }, 120_000);
      }
    });
  }

  afterAll(() => {
    const md = renderMatrix();
    if (process.env.UPDATE_DOOR_MATRIX === "1") {
      writeFileSync(MATRIX_DOC, md);
      return;
    }
    if (results.size === DOORS.length * CELLS.length) {
      const onDisk = existsSync(MATRIX_DOC) ? readFileSync(MATRIX_DOC, "utf8") : "";
      expect(onDisk, "docs/DOOR-CONTRACT-MATRIX.md is stale: rerun with UPDATE_DOOR_MATRIX=1").toBe(md);
    }
  });
});

function renderMatrix(): string {
  const sym = (r: Result | undefined): string =>
    !r ? "?" : r.status === "pass" ? "pass" : r.status === "fail" ? "FAIL" : "n/a";
  const lines: string[] = [
    "# Door behavioural contract matrix",
    "",
    "Generated by `packages/core/test/door-contract.test.ts` (#33); do not edit by hand.",
    "Regenerate: `UPDATE_DOOR_MATRIX=1 npx vitest run packages/core/test/door-contract.test.ts`.",
    "The suite fails if this file is stale.",
    "",
    "Evidence level: each door is driven as a subprocess through its real bin shim against a",
    "recording stub harness on PATH, with a throwaway HOME, config dirs and TMPDIR. This is",
    "structural + dry-run + stubbed-launch evidence. It is **not** an authenticated session and",
    "says nothing about how a real harness behaves; see [COMPAT-MATRIX.md](COMPAT-MATRIX.md).",
    "",
    `| Cell | ${DOORS.map((d) => d.id).join(" | ")} |`,
    `|---|${DOORS.map(() => "---").join("|")}|`,
  ];
  for (const cell of CELLS) {
    lines.push(`| \`${cell}\` | ${DOORS.map((d) => sym(results.get(`${d.id}/${cell}`))).join(" | ")} |`);
  }
  lines.push("", "## Not applicable, and why", "");
  for (const d of DOORS) {
    for (const cell of CELLS) {
      const r = results.get(`${d.id}/${cell}`);
      if (r?.status === "n/a") lines.push(`- \`${d.id}\` / \`${cell}\`: ${r.reason}`);
    }
  }
  lines.push(
    "",
    "## Cells",
    "",
    "- `default-rung-composes`: `--print` with no flags exits 0 and composes `product-floor` (the zero rung).",
    "- `each-rung-composes`: `zero`, `med`, `native` and `low` (with a `--skill`) each compose; `med` is `native` today.",
    "- `upper-rungs-route-live`: `high`, `xhigh`, `max`, `ultra` exit 2 naming the in-session command; no gate language (N13).",
    "- `print-is-dry-run`: `--print` creates no session dir, never execs the harness, leaves HOME untouched.",
    "- `p3-no-shared-writes`: a real (stubbed-harness) launch at the default and `native` rungs leaves a seeded HOME and config tree byte-identical.",
    "- `manifest-in-session-dir`: the manifest is written under the session temp dir and readable at the path handed to the harness.",
    "- `session-dir-contained`: a session dir exists under TMPDIR while the harness runs and is removed after exit.",
    "- `zero-cut-env`: `SKILL_HEAVEN_ZERO_CUTS` reaches the door's mounted summon MCP config.",
    "",
  );
  return lines.join("\n");
}
