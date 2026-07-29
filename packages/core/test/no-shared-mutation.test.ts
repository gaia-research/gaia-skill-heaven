// Issue #11 (P1) — Verify zero shared-state mutation (P3).
//
// KC5 (verbatim): "No shared config or skill directory is mutated (P3),
// verified by before/after diff."
//
// Governing decision, P3 (INVARIANT): "Modes are per-session, never a config
// mutation. Compiled per invocation; project defaults with session overrides;
// nothing writes to shared config; exiting a mode is switching modes, never a
// restore."
//
// Two layers, both required:
//   1. STATIC — every FsOp any compile() call can produce, across all four
//      postures, both claude mechanisms, and every harness compile() handles,
//      must write only inside "$SESSION/...". `from` (a read source) may
//      legitimately be a shared path (credentials, auth, a skill's own
//      source dir) — only `to` / `path` (the write target) is asserted.
//   2. DYNAMIC — a real before/after filesystem diff against a throwaway
//      fixture tree standing in for a founder's real $HOME, run through every
//      posture and every posture TRANSITION (P3's claim is specifically that
//      switching modes never restores or mutates anything).
//
// Fixtures only. This test never touches the real ~/.claude, ~/.codex,
// ~/.pi, ~/.grok, or ~/.cursor — everything lives under a mkdtemp'd root
// that is created and torn down here.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HARNESSES, MECHANISMS, POSTURES, compile, type CompileInput, type FsOp } from "../src/compile.js";
import { materialize } from "../src/exec.js";
import { resolveSkill, type ResolvedSkill } from "../src/skills.js";

// ---------------------------------------------------------------------------
// Layer 1: static — every FsOp's write target must be session-scoped.
// ---------------------------------------------------------------------------

function assertSessionScopedWrite(op: FsOp, ctx: string): void {
  if (op.kind === "write") {
    expect(op.path.startsWith("$SESSION/"), `${ctx}: write path "${op.path}" is not session-scoped`).toBe(true);
  } else {
    // copyDir / copyFileIfExists: `to` is the write target, `from` is a read
    // source and MAY legitimately be a shared path (credentials, auth.json,
    // a skill's own source dir) — never assert on `from`.
    expect(op.to.startsWith("$SESSION/"), `${ctx}: ${op.kind} target "${op.to}" is not session-scoped`).toBe(true);
  }
  // Belt and suspenders: no write target may literally name a shared root,
  // however it got there.
  const forbidden = ["$HOME", "~/.claude", "~/.codex", "~/.pi", "~/.grok", "~/.cursor"];
  const target = op.kind === "write" ? op.path : op.to;
  for (const bad of forbidden) {
    expect(target.includes(bad), `${ctx}: ${op.kind} target "${target}" references shared path "${bad}"`).toBe(false);
  }
}

describe("KC5 static: every fsPlan op across every posture x harness x mechanism is session-scoped", () => {
  const fixturesDir = join(import.meta.dirname, "fixtures");
  const skill = resolveSkill(join(fixturesDir, "impeccable-skill"));

  // grok only compiles at posture "native" (M0 discipline — no verified
  // suppression mechanism); product-floor only compiles for harness "claude"
  // (F7 — only claude was probed). Everything else in POSTURES x HARNESSES is
  // expected to compile.
  function expectedToThrow(posture: string, harness: string): boolean {
    if (posture === "product-floor" && harness !== "claude") return true;
    if (harness === "grok" && posture !== "native") return true;
    return false;
  }

  let opsChecked = 0;
  let combosCompiled = 0;
  let combosThrown = 0;

  for (const posture of POSTURES) {
    for (const harness of HARNESSES) {
      const mechanisms = harness === "claude" && posture === "curated" ? MECHANISMS : [undefined];
      for (const mechanism of mechanisms) {
        const label = `posture=${posture} harness=${harness} mechanism=${mechanism ?? "n/a"}`;
        it(`${label}`, () => {
          const skills: ResolvedSkill[] = posture === "curated" ? [skill] : [];
          const input: CompileInput = { posture, harness, mechanism, skills, homeDir: "/fixture/home" };
          if (expectedToThrow(posture, harness)) {
            expect(() => compile(input)).toThrow();
            combosThrown++;
            return;
          }
          const r = compile(input);
          combosCompiled++;
          for (const op of r.fsPlan) {
            assertSessionScopedWrite(op, label);
            opsChecked++;
          }
        });
      }
    }
  }

  it("sanity: the sweep actually compiled a nonzero number of combos and inspected a nonzero number of ops", () => {
    // combosCompiled/combosThrown/opsChecked are populated by the `it` blocks
    // above, which vitest runs before this one (declaration order within a
    // describe). Guards against the sweep silently degenerating into a no-op.
    expect(combosCompiled).toBeGreaterThan(0);
    expect(combosThrown).toBeGreaterThan(0);
    expect(opsChecked).toBeGreaterThan(0);
  });

  it("product-floor's caller-supplied doorPluginDir is passed through argv only — never an fsPlan target", () => {
    const r = compile({ posture: "product-floor", harness: "claude", skills: [], doorPluginDir: "/fixture/door" });
    expect(r.argv).toContain("/fixture/door");
    expect(r.fsPlan).toEqual([]); // product-floor never writes fsPlan ops at all
  });
});

// ---------------------------------------------------------------------------
// Layer 2: dynamic — real before/after diff against a fixture tree.
// ---------------------------------------------------------------------------

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** path (relative to root) -> content hash, recursive. Throwaway fixture trees
 * only — never point this at a real home directory. */
function snapshotTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (st.isFile()) {
        out[relative(root, full)] = sha(readFileSync(full, "utf-8"));
      }
    }
  };
  walk(root);
  return out;
}

describe("KC5 dynamic: before/after fixture diff across every posture and every posture transition", () => {
  let fixtureRoot: string;
  let home: string;
  let doorDir: string;
  let skill: ResolvedSkill;

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "kc5-fixture-"));
    home = join(fixtureRoot, "home");
    doorDir = join(fixtureRoot, "door");

    // A fixture $HOME standing in for the founder's real one — the shared
    // roots KC5 names, plus a skill living inside the shared skills root
    // (proving the READ side of a copy from a skill dir is safe; the op's
    // `to` is what must never target it).
    mkdirSync(join(home, ".claude", "skills", "fixture-skill"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "skills", "fixture-skill", "SKILL.md"),
      "---\nname: fixture-skill\ndescription: kc5 fixture\n---\n# fixture-skill\nbody\n",
    );
    writeFileSync(join(home, ".claude", ".credentials.json"), '{"token":"fixture"}\n');
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "auth.json"), '{"auth":"fixture"}\n');
    mkdirSync(join(home, ".pi"), { recursive: true });
    writeFileSync(join(home, ".pi", "config.toml"), "# fixture pi config\n");
    mkdirSync(join(home, ".grok"), { recursive: true });
    writeFileSync(join(home, ".grok", "config.toml"), "# fixture grok config\n");
    mkdirSync(join(home, ".cursor"), { recursive: true });
    writeFileSync(join(home, ".cursor", "config.json"), "{}\n");

    mkdirSync(doorDir, { recursive: true });
    writeFileSync(join(doorDir, ".claude-plugin.json"), '{"name":"door"}\n');

    skill = resolveSkill(join(home, ".claude", "skills", "fixture-skill"));
  });

  afterAll(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  /** Compiles+materializes every reachable posture/harness/mechanism combo
   * against a single fresh session dir, using the fixture home as the
   * (explicit, never-"$HOME"-literal) homeDir/skill source. Mirrors the exact
   * combo matrix from the static sweep above, minus the expected-throw ones. */
  function materializeEverything(): void {
    for (const posture of POSTURES) {
      for (const harness of HARNESSES) {
        if (posture === "product-floor" && harness !== "claude") continue;
        if (harness === "grok" && posture !== "native") continue;
        const mechanisms = harness === "claude" && posture === "curated" ? MECHANISMS : [undefined];
        for (const mechanism of mechanisms) {
          const skills: ResolvedSkill[] = posture === "curated" ? [skill] : [];
          const input: CompileInput = {
            posture,
            harness,
            mechanism,
            skills,
            homeDir: home, // real fixture path, not the "$HOME" placeholder — exec.ts's
            // subst() only rewrites the literal string "$HOME"; passing the resolved
            // path here means materialize() never falls back to the process's real
            // homedir() no matter what harness/posture is exercised.
            ...(posture === "product-floor" ? { doorPluginDir: doorDir } : {}),
          };
          const r = compile(input);
          const sessionDir = mkdtempSync(join(tmpdir(), "kc5-session-"));
          try {
            materialize(r.fsPlan, sessionDir);
          } finally {
            rmSync(sessionDir, { recursive: true, force: true });
          }
        }
      }
    }
  }

  it("single pass over every posture leaves the fixture ($HOME-equivalent) and door dir byte-identical", () => {
    const before = { home: snapshotTree(home), door: snapshotTree(doorDir) };
    materializeEverything();
    const after = { home: snapshotTree(home), door: snapshotTree(doorDir) };
    expect(after).toEqual(before);
    // Sanity: the snapshot function itself isn't vacuously empty.
    expect(Object.keys(before.home).length).toBeGreaterThan(0);
  });

  it("posture TRANSITIONS (floor -> product-floor -> curated -> native -> floor) never mutate or restore the fixture", () => {
    // P3, verbatim: "exiting a mode is switching modes, never a restore." If
    // any posture stashed-and-restored shared state, a full transition cycle
    // back to the starting posture would be the place it would show up.
    const before = snapshotTree(home);
    const cycle: Array<CompileInput["posture"]> = ["floor", "product-floor", "curated", "native", "floor"];
    for (const posture of cycle) {
      const skills: ResolvedSkill[] = posture === "curated" ? [skill] : [];
      const r = compile({
        posture,
        harness: "claude",
        skills,
        homeDir: home,
        ...(posture === "product-floor" ? { doorPluginDir: doorDir } : {}),
      });
      const sessionDir = mkdtempSync(join(tmpdir(), "kc5-transition-"));
      try {
        materialize(r.fsPlan, sessionDir);
      } finally {
        rmSync(sessionDir, { recursive: true, force: true });
      }
      // Diff after EVERY step in the transition, not just at the end — a
      // stash-then-restore-later bug could otherwise cancel out by the time
      // the cycle completes.
      expect(snapshotTree(home)).toEqual(before);
    }
  });

  it("curated (plugin-dir) actually writes something into the session — the diff above isn't trivially vacuous", () => {
    const r = compile({ posture: "curated", harness: "claude", mechanism: "plugin-dir", skills: [skill], homeDir: home });
    const sessionDir = mkdtempSync(join(tmpdir(), "kc5-sanity-"));
    try {
      materialize(r.fsPlan, sessionDir);
      const written = snapshotTree(sessionDir);
      expect(Object.keys(written).length).toBeGreaterThan(0); // proves materialize() did real work
    } finally {
      rmSync(sessionDir, { recursive: true, force: true });
    }
    // ...and the fixture home the skill was copied FROM is still untouched.
    expect(existsSync(join(home, ".claude", "skills", "fixture-skill", "SKILL.md"))).toBe(true);
  });
});
