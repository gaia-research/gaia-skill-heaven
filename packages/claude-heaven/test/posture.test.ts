// The /skill-heaven posture renderer (WS4 step 2). It lives in
// plugin/scripts/render-posture.mjs — it must run dependency-free once the door
// is installed from the marketplace — so these tests import the shipped .mjs
// directly rather than a TypeScript mirror of it.

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HELL_LEVELS, POSTURES } from "skill-heaven";
import { censusStandingDose, nativeSkillRoots } from "../src/census.js";
import { LAUNCHABLE_POSTURES, run } from "../src/cli.js";
import { planNativeLaunch } from "../src/launcher.js";
import { formatTokens as formatTokensTs, renderStatusline } from "../src/statusline.js";
import {
  POSTURE_ROWS,
  RELAUNCH_OFFERS,
  buildRelaunchOffers,
  formatTokens,
  isLaunchManifest,
  loadManifest,
  normalizeTarget,
  readGatedLevels,
  readKnownPostures,
  readLaunchablePostures,
  renderPosture,
} from "../plugin/scripts/render-posture.mjs";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");

const nativeManifest = {
  schema: "claude-heaven/profile@1",
  posture: "native",
  standingTokens: 4823,
  skillCount: 12,
  scope: "user+project",
  launcherLocked: true,
} as const;

const productFloorManifest = { ...nativeManifest, posture: "product-floor" } as const;
// The doorless benchmark floor. This command does not exist there (F6), so this
// manifest is a "cannot happen" input kept as a regression guard: the renderer
// must not treat it as a launched clean room.
const benchmarkFloorManifest = { ...nativeManifest, posture: "floor" } as const;

/** Runs the real CLI without letting its diagnostics pollute the test log. */
function silenceStderr(fn: () => number): number {
  const outw = process.stdout.write.bind(process.stdout);
  const errw = process.stderr.write.bind(process.stderr);
  (process.stdout.write as unknown as (s: string) => boolean) = () => true;
  (process.stderr.write as unknown as (s: string) => boolean) = () => true;
  try {
    return fn();
  } finally {
    process.stdout.write = outw;
    process.stderr.write = errw;
  }
}

const render = (opts: Record<string, unknown> = {}) =>
  renderPosture({ sessionId: "sess-123", ...opts }).text as string;

describe("P2 gate (the Hell lane is gated on every surface)", () => {
  it("refuses every core HELL_LEVEL, sourced from core — not a literal in this file", () => {
    for (const level of HELL_LEVELS) {
      const r = renderPosture({ target: level });
      expect(r.refused, `${level} must be refused`).toBe(true);
      expect(r.text).toMatch(/Hell-lane and gated \(P2\)/);
    }
  });

  it("refuses the `hell` row itself and never prints a way to reach it", () => {
    const r = renderPosture({ target: "hell" });
    expect(r.refused).toBe(true);
    expect(r.text).not.toMatch(/claude --resume/);
    expect(r.text).toMatch(/locked door, not an activator/);
  });

  it("keeps the shipped gate list byte-identical to core's HELL_LEVELS", () => {
    // The plugin cannot import `skill-heaven` once installed (no node_modules),
    // so the list is machine-copied by scripts/generate-p2-gate.ts. This is the
    // freshness gate: add or rename a Hell level upstream and CI fails here.
    expect(readGatedLevels()).toEqual([...HELL_LEVELS]);
  });

  it("keeps the shipped posture list byte-identical to core's POSTURES", () => {
    // Same machine-copy pattern, same artifact: the renderer answers a
    // core-known posture name with "not offered here" instead of treating it
    // as an unknown word, and this pins the list it consults to core's.
    expect(readKnownPostures()).toEqual([...POSTURES]);
  });

  it("keeps the shipped launchable list byte-identical to the CLI's LAUNCHABLE_POSTURES", () => {
    // Third machine-copy on the same artifact, for the same reason: the plugin
    // cannot import src/cli.ts once installed. This is the freshness gate that
    // makes removing a posture from the CLI a one-line change — the offer this
    // surface prints is derived from the copy, so it withdraws with it.
    expect(readLaunchablePostures()).toEqual([...LAUNCHABLE_POSTURES]);
  });

  it("derives the relaunch offers from that list, and offers nothing without it", () => {
    // Fail-closed: no readable capability list => no offers at all. A locked row
    // with no command claims nothing; a command the CLI refuses claims a
    // transition the harness cannot perform (KC7).
    expect(buildRelaunchOffers(null)).toEqual({});
    expect(buildRelaunchOffers([])).toEqual({});
    expect(Object.keys(buildRelaunchOffers(["product-floor"]))).toEqual(["product-floor"]);
    // …and a launchable posture with no row still gets no offer.
    expect(buildRelaunchOffers(["curated"])).toEqual({});
  });

  it("fails CLOSED when the gate artifact is unreadable", () => {
    // Unknown gate list => anything that is not a known heaven row is refused,
    // rather than a Hell posture being rendered as available.
    expect(renderPosture({ target: "max", gatedLevels: null }).refused).toBe(true);
    expect(renderPosture({ target: "native", gatedLevels: null }).refused).toBe(false);
  });

  it("renders the hell row as a locked door in every mode (P2)", () => {
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).toMatch(/⊘ {2}hell {8}/);
      expect(text).toMatch(/LOCKED \(P2\)/);
    }
  });

  // KC6 (Issue #12): the Hell refusal must read as the POLICY class, not just
  // as a bare "locked" that could be misread as "harness cannot do this" — a
  // reader must be able to tell, from the text alone, that a key exists here
  // and could turn, as opposed to the clean-room lock (D12) below, where none
  // does.
  it("marks the Hell refusal as a policy hold, not a harness limit (KC6)", () => {
    const r = renderPosture({ target: "med" });
    expect(r.refused).toBe(true);
    expect(r.text).toContain("policy hold, not a harness limit");
    expect(r.text).not.toContain("harness limit: no flag");
  });
});

describe("locked clean room (D12)", () => {
  it("locks the clean room under vanilla claude, and says why", () => {
    const text = render({ manifest: null });
    expect(text).toMatch(/⊘ {2}clean room/);
    expect(text).toContain("Composed at boot, never mid-session");
  });

  it("locks the clean room under a claude-heaven launch that did not launch there", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toMatch(/⊘ {2}clean room/);
    expect(text).toContain("Composed at boot, never mid-session");
  });

  it("unlocks the clean room for a session that launched at the product floor", () => {
    const text = render({ manifest: productFloorManifest });
    expect(text).toMatch(/● {2}clean room/);
    expect(text).not.toContain("Composed at boot, never mid-session");
    expect(text).toContain("you launched here");
  });

  // KC6 (Issue #12): D12's lock is the OTHER refusal class — harness-
  // incapable, not policy. Gate (a) came back NEGATIVE: no flag combination
  // reaches this on a running session, so unlike Hell there is no key that a
  // future decision could turn. The text must say so, and must not borrow the
  // Hell row's policy vocabulary.
  it("marks the clean-room lock as a harness limit, not a policy hold (KC6)", () => {
    const text = render({ manifest: null });
    expect(text).toContain("not a policy hold, a harness limit");
    expect(text).toContain("no flag or flag-combination evicts skills on a running session");
    expect(text).not.toContain("gated (P2)");
  });

  it("offers no relaunch the launcher would refuse (KC7) — checked against the real validator", () => {
    // The affordance bug this pins: the surface used to tell a locked
    // clean-room session to "relaunch via `claude-heaven`", while src/cli.ts
    // refuses every --posture outside LAUNCHABLE_POSTURES with exit 2. Offering
    // a door the tool slams is claiming a transition the harness cannot
    // perform.
    //
    // Both directions are held, so the copy and the validator cannot drift:
    //   (1) every relaunch this surface may print must be a posture the CLI takes;
    //   (2) the clean room is NOT such a posture today, so nothing is printed for it.
    for (const [rowId, build] of Object.entries(RELAUNCH_OFFERS)) {
      expect(LAUNCHABLE_POSTURES, `${rowId} is offered but the launcher refuses it`).toContain(
        rowId,
      );
      // run the REAL validator, not a mirror of it — and on the BARE command,
      // which is what this surface prints. A posture that needs more arguments
      // to compile has no bare command and must not be offered.
      expect(silenceStderr(() => run(["--print", "--posture", rowId]))).toBe(0);
      expect(typeof build).toBe("function");
    }

    // The clean room is now composed by the launcher, so it is offered — with
    // its D12 caveat, asserted separately below.
    expect(LAUNCHABLE_POSTURES).toContain("product-floor");
    expect(silenceStderr(() => run(["--print", "--posture", "product-floor"]))).toBe(0);
    expect(Object.keys(RELAUNCH_OFFERS)).toContain("product-floor");

    // The doorless benchmark floor is not a door posture and never becomes one
    // (F6/B2): core composes it for measurement runs only.
    expect(LAUNCHABLE_POSTURES).not.toContain("floor");
    expect(silenceStderr(() => run(["--print", "--posture", "floor"]))).toBe(2);
    expect(Object.keys(RELAUNCH_OFFERS)).not.toContain("floor");

    // Curated IS launchable, and is still never offered here: a curated launch
    // needs a `--skill <path>` per skill, so the BARE command this surface would
    // print is refused. Launchable is necessary for an offer, not sufficient.
    expect(LAUNCHABLE_POSTURES).toContain("curated");
    expect(silenceStderr(() => run(["--print", "--posture", "curated"]))).toBe(2);
    expect(Object.keys(RELAUNCH_OFFERS)).not.toContain("curated");

    // …and no rendered mode may print a claude-heaven --posture the CLI refuses.
    const targets = [
      "",
      ...POSTURE_ROWS.map((r: { id: string }) => r.id),
      ...POSTURES,
      "lean",
      "turbo",
    ];
    for (const manifest of [null, nativeManifest, productFloorManifest, benchmarkFloorManifest]) {
      for (const target of targets) {
        const text = render({ manifest, target });
        expect(text).not.toContain("relaunch via `claude-heaven`");
        for (const m of text.matchAll(/claude-heaven\b[^\n]*?--posture\s+([a-z-]+)/g)) {
          expect(LAUNCHABLE_POSTURES, `offered --posture ${m[1]} is refused by the CLI`).toContain(
            m[1],
          );
        }
      }
    }
  });

  it("never claims a slash command can restart the process (D12 / B4)", () => {
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).toContain("cannot restart Claude Code for you");
      expect(text).not.toMatch(/restart(ing)? (the session|for you) automatically/i);
      expect(text).not.toMatch(/\bI (will|can) (relaunch|restart)/i);
    }
  });
});

describe("the floor split (V5-5): the clean room is the PRODUCT floor", () => {
  it("names product-floor as the clean-room row, and lists no benchmark floor", () => {
    expect(POSTURE_ROWS.map((r: { id: string }) => r.id)).toContain("product-floor");
    expect(POSTURE_ROWS.map((r: { id: string }) => r.id)).not.toContain("floor");
    // Every row id shipped must be a posture core actually knows, or the one
    // lane marker core owns (`hell`, gated by P2). Nothing else gets a row —
    // that rule is what retired `lean` and `add-ons`.
    for (const row of POSTURE_ROWS as { id: string }[]) {
      if (row.id === "hell") continue;
      expect(POSTURES, `${row.id} is not a ratified posture`).toContain(row.id);
    }
  });

  it("answers a core-known posture name with 'not offered here' — one rule, no per-name prose", () => {
    // Founder ruling (2026-07-29): the per-name branches carried status claims
    // that rot when a status moves. One rule instead — core-known: not offered
    // here; otherwise: unknown. No status assertions in either line.
    for (const target of ["floor", "curated"]) {
      const r = renderPosture({ sessionId: "sess-123", manifest: nativeManifest, target });
      expect(r.refused).toBe(false); // heaven-lane, not a P2 refusal
      expect(r.text).toContain(`\`${target}\` is not offered here`);
      expect(r.text).not.toContain(`nothing called "${target}"`);
      // No command is printed FOR THE REQUESTED posture (KC7). Anchored on the
      // exact name: the clean room's own offer is `--posture product-floor`, and
      // a substring match on "floor" would hit it and assert the wrong thing.
      expect(r.text).not.toMatch(new RegExp(`--posture ${target}(\\s|$)`, "m"));
      expect(r.text).not.toMatch(new RegExp(`→ [^\\n]*(?<![\\w-])${target}(?![\\w-])`));
      // and no status claim that would need re-ratifying (R3)
      expect(r.text).not.toMatch(/real posture|ratified|later (WS4 )?slice|coming/i);
    }
  });

  it("never renders a core-known posture name as an unknown word (refusal transparency)", () => {
    // The generalized property: every posture core ships is either a row here
    // or answered "not offered here". If a posture is ever added upstream
    // without handling, this fails rather than shipping the unknown-name line.
    const rowIds = POSTURE_ROWS.map((r: { id: string }) => r.id);
    for (const posture of POSTURES) {
      if (rowIds.includes(posture)) continue;
      const text = render({ manifest: nativeManifest, target: posture });
      expect(text, `${posture} is core-known but rendered as an unknown word`).not.toContain(
        `nothing called "${posture}"`,
      );
      expect(text).toContain(`\`${posture}\` is not offered here`);
    }
  });

  it("degrades to the unknown-name line when the posture list is unreadable", () => {
    // Without the machine-copied list nothing can be told apart, and the
    // unknown-name line claims nothing — while P2 gating is untouched (it
    // rides its own list, checked first, failing closed).
    const r = renderPosture({ manifest: nativeManifest, target: "curated", knownPostures: null });
    expect(r.refused).toBe(false);
    expect(r.text).toContain('nothing called "curated"');
    expect(renderPosture({ target: "max", knownPostures: null }).refused).toBe(true);
  });

  it("never renders the benchmark floor as a launched or reachable stop", () => {
    // Cannot happen in practice (F6); guarded anyway.
    const text = render({ manifest: benchmarkFloorManifest });
    expect(text).toMatch(/⊘ {2}clean room/);
    expect(text).not.toContain("you launched here");
  });

  it("states the benchmark floor's mechanism in the footer without printing a route to it", () => {
    // The footer carries the shipped fact (F6): slash commands are off at the
    // benchmark floor, so this command does not exist there. Mechanism, not
    // status — and never a command that would take the user to it.
    const text = render({ manifest: nativeManifest });
    expect(text).toContain("slash commands off, so this command does not exist");
    expect(text).not.toContain("--disable-slash-commands");
  });

  // KC6 (Issue #12): the benchmark floor's absence is the harness-incapable
  // class too — there is no door composed there at all (F6), so nothing was
  // withheld from the user by a decision.
  it("marks the benchmark floor's absence as a harness fact, not a policy choice (KC6)", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toContain("a harness fact, not a policy choice");
  });

  it("prices the two floors as separate arms and never averages them (B1/B2)", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toContain("priced as separate arms, never averaged");
    expect(text).toContain("measurement placebo, not a place to sit");
  });

  it("records no benchmark arm anywhere in claude-heaven — placebo is core's, at --posture floor", () => {
    // `--arm placebo` hard-errors on product-floor upstream. The guard that keeps
    // this package from ever tripping it is that it has no arm-recording path at
    // all; assert that rather than trusting a comment.
    const root = PKG;
    const files = [
      ...readdirSync(join(root, "src")).map((f) => join(root, "src", f)),
      ...readdirSync(join(root, "plugin", "scripts")).map((f) => join(root, "plugin", "scripts", f)),
    ].filter((f) => /\.(ts|mjs)$/.test(f));
    for (const f of files) {
      const body = readFileSync(f, "utf-8");
      expect(body, `${f} must not compose a benchmark arm`).not.toContain("--arm");
    }
  });

  it("ships no `lean` and no `add-ons` stop, in the set or in the copy (V5-6 follow-up)", () => {
    // Founder ruling: both are RETIRED as stops. Neither is a ratified term and
    // neither is a posture — they were in-session flag moves wearing posture
    // clothing on a shipped control surface. Recorded here (and as a `banned`
    // lexicon entry with no replacement) so nobody re-adds them from memory.
    // The old flags they stood for must not survive in the copy either.
    const ids = POSTURE_ROWS.map((r: { id: string }) => r.id);
    expect(ids).not.toContain("lean");
    expect(ids).not.toContain("add-ons");
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).not.toMatch(/\blean\b/i);
      expect(text).not.toMatch(/add-ons/i);
      expect(text).not.toContain("--setting-sources");
      expect(text).not.toContain("--plugin-dir");
    }
  });

  it("names the control with no noun — no banned lexicon word in any rendered mode", () => {
    // `slider` and `notch` are banned (retired 2026-07-24, oracle N1/N5), and
    // their listed replacements name the off…max ladder — a different control.
    // The name of this surface is OPEN (founder ruling R2), so rendered copy
    // must carry neither the banned words nor a coined substitute for them.
    const targets = ["", ...POSTURES, "hell", "turbo", "lean"];
    for (const manifest of [null, nativeManifest, productFloorManifest, benchmarkFloorManifest]) {
      for (const target of targets) {
        const text = render({ manifest, target });
        expect(text, `banned word in mode ${manifest?.posture ?? "vanilla"} target "${target}"`)
          .not.toMatch(/\bslider\b|\bnotch(es)?\b|\bladder\b|\brung(s)?\b|\bpicker\b/i);
      }
    }
  });

  it("gives a retired stop no bespoke explanation — it is simply not offered", () => {
    // `lean` is not a posture at all, so it gets the ordinary unknown-name
    // miss: a bespoke message would keep the retired word alive in shipped
    // copy.
    for (const retired of ["lean", "add-ons"]) {
      const text = render({ manifest: nativeManifest, target: retired });
      expect(text).toContain(`nothing called "${retired}"`);
      expect(text).not.toContain("you asked for this one");
    }
  });

  it("drops the retired-D13 behavioral row entirely — no research row, no ⋯ state", () => {
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      const text = render({ manifest });
      expect(text).not.toContain("restraint");
      expect(text).not.toContain("⋯");
      expect(text).not.toContain("coming — research");
    }
    expect(POSTURE_ROWS.map((r: { id: string }) => r.id)).not.toContain("restraint");
  });
});

describe("no retired decision id survives anywhere in the repo (D9 / V5-6)", () => {
  it("cites no id on RATIFICATION.md's never-reused list", () => {
    // A PR citing a retired decision id is a defect (Federation Invariant 4).
    // Ids are never reused, so a retired id resolves to nothing — the whole
    // point of the never-reused rule. This walks the repo rather than a list,
    // so a new file cannot reintroduce one unnoticed.
    const RETIRED = ["D7", "D10", "D11", "D13"];
    const REPO = join(PKG, "..", "..");
    const SKIP = new Set(["node_modules", ".git", "dist", "coverage"]);
    /** @returns every source/doc file in the repo */
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (SKIP.has(e.name)) return [];
        const full = join(dir, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.(ts|mjs|md|json)$/.test(e.name) && e.name !== "package-lock.json" ? [full] : [];
      });
    const files = walk(REPO);
    expect(files.length).toBeGreaterThan(20);
    for (const rel of files) {
      const body = readFileSync(rel, "utf-8");
      for (const id of RETIRED) {
        // A retired id may only appear as an explicit retirement note.
        for (const line of body.split("\n").filter((l) => new RegExp(`\\b${id}\\b`).test(l))) {
          expect(line, `${rel}: ${id} is retired — re-bind it`).toMatch(/RETIRED|retired/);
        }
      }
    }
  });
});

describe("reachable rows print an exact, runnable command", () => {
  it("uses the real session id when the harness provides one", () => {
    // From the product floor, `native` is the one stop that is genuinely
    // reachable in-session, and it prints the exact command.
    const text = render({ manifest: productFloorManifest, sessionId: "abc-def" });
    expect(text).toContain("→ claude --resume abc-def");
  });

  it("falls back to a placeholder + the resume-picker hint with no session id", () => {
    const text = render({ manifest: productFloorManifest, sessionId: "" });
    expect(text).toContain("claude --resume <session-id>");
    expect(text).toContain("pick this conversation from the list");
  });

  it("prints only the two runnable command shapes, and nothing else", () => {
    // Every arrow line must be a command the user can actually run, and there
    // are exactly two shapes: a `claude --resume` for a stop reachable from
    // this session, and a `claude-heaven --posture <p>` BOOT for a locked stop
    // the launcher composes. Anything else is an affordance with no mechanism.
    for (const manifest of [null, nativeManifest, productFloorManifest]) {
      for (const line of render({ manifest })
        .split("\n")
        .filter((l) => /^\s+→ /.test(l))) {
        expect(line, `unrunnable arrow line: ${line}`).toMatch(
          /^\s+→ (claude --resume |claude-heaven --posture )/,
        );
      }
    }
  });

  it("never prints a relaunch without the D12 no-history caveat on the next line", () => {
    // D12: a boot cannot carry this conversation. Offering the door while
    // silently dropping the user's history is the KC7 defect in its purest
    // form — the command is honest, the omission is not.
    for (const manifest of [null, nativeManifest, benchmarkFloorManifest]) {
      const lines = render({ manifest }).split("\n");
      const relaunches = lines.filter((l) => /^\s+→ claude-heaven /.test(l));
      expect(relaunches.length, "the clean room is composed, so it is offered").toBeGreaterThan(0);
      for (const line of relaunches) {
        expect(lines[lines.indexOf(line) + 1]).toContain(
          "a new session — this conversation does not carry over",
        );
      }
    }
  });

  it("never promises a relaunch carries the conversation forward", () => {
    // The footer used to make one blanket claim about every `→` command
    // ("starts a RESUMED session that carries this conversation forward").
    // With a boot command on screen that sentence would be false for it, so
    // the two kinds are described separately and only when present.
    const nativeText = render({ manifest: nativeManifest }); // relaunch, no resume
    expect(nativeText).not.toMatch(/carries this[\s\n]+conversation forward/);
    expect(nativeText).toContain("It does not carry this conversation");
    expect(nativeText).toContain("cannot restart Claude Code for you");

    // From the clean room, `native` is genuinely resumable, and that promise is
    // true for it.
    const floorText = render({ manifest: productFloorManifest }); // resume, no relaunch
    expect(floorText).toMatch(/carries this[\s\n]+conversation forward/);
    expect(floorText).not.toContain("It does not carry this conversation");
  });

  it("marks the launched posture and does not offer it as a move", () => {
    const lines = render({ manifest: nativeManifest }).split("\n");
    const i = lines.findIndex((l) => l.includes("●  native"));
    expect(i).toBeGreaterThan(-1);
    expect(lines[i + 1]).toContain("you launched here (via claude-heaven)");
  });
});

describe("standing-dose readout", () => {
  it("reports the launch manifest's dose with scope disclosed, two numbers never one (B1)", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toContain("4.8k standing (user+project scope");
    expect(text).toContain("charged separately, on invoke");
  });

  // KC2 (Issue #9): a scope NAME ("user+project scope") does not tell a
  // reader what is missing — the exclusion itself must be spelled out so
  // nobody has to already know census.ts to understand the number is partial.
  it("discloses bundled and plugin-provided skills as excluded, not just the scope name (KC2)", () => {
    const text = render({ manifest: nativeManifest });
    expect(text).toContain(
      "4.8k standing (user+project scope — bundled CLI skills and plugin-provided skills are not counted)",
    );
  });

  // A3/KC4 correction: a "session" scope (curated/product-floor) enumerates
  // the launched skill SET exactly, but a bundled `doctor` skill was MEASURED
  // to survive every posture (probe-kc4-listing-residual.sh) — a permanent,
  // founder-ruled harness residual, not a defect this door can fix. The old
  // "nothing excluded" claim for session scope was false; this caveat
  // replaces it.
  // Vehicle is `curated`, not `product-floor`: both carry scope "session", but
  // product-floor now takes its own branch in sessionLine (its dominant
  // exclusion is project scope, not `doctor`), so it can no longer be used to
  // exercise the scope-keyed path. Using it here tested the branch, not the note.
  it("discloses the doctor residual for a fully-enumerated session scope", () => {
    const text = render({ manifest: { ...nativeManifest, posture: "curated", scope: "session" } });
    expect(text).toContain("4.8k standing (session scope — bundled `doctor` skill is not counted");
  });

  // P8: product-floor is "off" — the nearest zero the harness can be LAUNCHED
  // at — and it currently inherits project-scope skills from cwd (measured 2/2,
  // claude 2.1.220), an amount that scales with the user's repo. The scope-keyed
  // note under-discloses that: it names `doctor` and omits the larger omission.
  // This must stay in step with src/statusline.ts's product-floor branch; the
  // two surfaces describing the same posture differently is the defect.
  it("names project scope for product-floor and prints NO token figure", () => {
    const text = render({ manifest: { ...nativeManifest, posture: "product-floor", scope: "session" } });
    expect(text).toContain("0 of your own skills selected");
    expect(text).toContain("project-scope skills in this directory are still loaded");
    expect(text).toContain("not knowable from here");
    // A number here would imply a measurement we do not have.
    expect(text).not.toContain("4.8k standing");
  });
  it("keeps product-floor's session line stable across scope values", () => {
    for (const scope of ["session", "user+project", "some-future-scope"]) {
      const text = render({ manifest: { ...nativeManifest, posture: "product-floor", scope } });
      expect(text).toContain("project-scope skills in this directory are still loaded");
      expect(text).not.toContain("4.8k standing");
    }
  });

  // A5c (fail closed): scopeNote is an explicit allowlist. A scope value this
  // door has never named must still disclose that its coverage is unknown —
  // never render as if it excluded nothing.
  it("fails closed on an unrecognized scope: discloses 'coverage unknown', never silence", () => {
    const text = render({ manifest: { ...nativeManifest, posture: "curated", scope: "some-future-scope" } });
    expect(text).toContain("4.8k standing (some-future-scope scope — coverage unknown");
    expect(text).not.toContain("4.8k standing (some-future-scope scope)");
  });

  it("marks an incomplete census with a trailing + rather than presenting it as exact (B4)", () => {
    expect(render({ manifest: { ...nativeManifest, incomplete: true } })).toContain("4.8k+ standing");
  });

  it("claims no standing number at all under vanilla claude", () => {
    const text = render({ manifest: null });
    expect(text).toContain("no launch manifest, so no standing-dose readout here");
    expect(text).not.toMatch(/\d+k? standing/);
  });

  it("formats tokens identically to the statusline (one readout, two renderers)", () => {
    for (const n of [0, 57, 999, 1000, 4823, 14200, -1, Number.NaN]) {
      expect(formatTokens(n)).toBe(formatTokensTs(n));
    }
  });

  // KC2 (Issue #9), corrected under A3/KC4: two renderers, two mediums, one
  // honest fact. BOTH must name the same exclusions whenever scope is
  // "user+project" (bundled AND plugin-provided skills), and BOTH must now
  // ALSO disclose the measured `doctor` residual whenever scope is "session"
  // (bundled, but not plugin-provided — no plugin leak was ever measured). A
  // future edit that adds a caveat to one renderer and forgets the other, or
  // that silently drops the session-scope caveat again, fails here rather
  // than in a founder review.
  it("agrees with the statusline renderer on WHAT is disclosed for each scope (KC2 parity)", () => {
    const partialProfile = { schema: "claude-heaven/profile@1", posture: "native", standingTokens: 4823, skillCount: 12, scope: "user+project", launcherLocked: true } as const;
    const fullProfile = { ...partialProfile, scope: "session" } as const;

    // Isolate the `session:` line — the render also has an unrelated "clean
    // room ... bundled skills" row blurb (what product-floor evicts), which
    // would false-positive a whole-text match either way.
    const sessionLineOf = (text: string) => text.split("\n").find((l) => l.trim().startsWith("session:")) ?? "";

    const statuslinePartial = renderStatusline(partialProfile);
    const postureLinePartial = sessionLineOf(render({ manifest: partialProfile }));
    expect(statuslinePartial).toMatch(/bundled/i);
    expect(statuslinePartial).toMatch(/plugin/i);
    expect(postureLinePartial).toMatch(/bundled/i);
    expect(postureLinePartial).toMatch(/plugin/i);

    const statuslineFull = renderStatusline(fullProfile);
    const postureLineFull = sessionLineOf(render({ manifest: fullProfile }));
    expect(statuslineFull).toMatch(/bundled/i);
    expect(statuslineFull).not.toMatch(/plugin/i);
    expect(postureLineFull).toMatch(/bundled/i);
    expect(postureLineFull).not.toMatch(/plugin/i);
  });
});

describe("manifest contract with the launcher", () => {
  let sessionDir: string;
  let home: string;

  beforeAll(() => {
    sessionDir = mkdtempSync(join(tmpdir(), "ch-posture-"));
    home = mkdtempSync(join(tmpdir(), "ch-posture-home-"));
  });
  afterAll(() => {
    rmSync(sessionDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("accepts a manifest the launcher actually writes, and reports core's census total", () => {
    // The acceptance cross-check: the number this surface prints is the number
    // packages/core's census produces for the same loadout — by construction,
    // because both read the one manifest the launcher wrote.
    const plan = planNativeLaunch({ home, projectDir: home, sessionDir, statuslineBin: "/abs/s.mjs" });
    expect(isLaunchManifest(plan.manifest)).toBe(true);

    const census = censusStandingDose(nativeSkillRoots({ home, projectDir: home }));
    expect(plan.manifest.standingTokens).toBe(census.standingTotal);

    const path = join(sessionDir, "profile.json");
    writeFileSync(path, `${JSON.stringify(plan.manifest, null, 2)}\n`);
    const loaded = loadManifest(path) as { standingTokens: number } | null;
    expect(loaded?.standingTokens).toBe(census.standingTotal);
    expect(render({ manifest: loaded })).toContain(`${formatTokens(census.standingTotal)} standing`);
  });

  it("degrades to vanilla rendering on a missing or malformed manifest", () => {
    expect(loadManifest(undefined)).toBeNull();
    expect(loadManifest(join(sessionDir, "does-not-exist.json"))).toBeNull();
    const bad = join(sessionDir, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(loadManifest(bad)).toBeNull();
    const wrongSchema = join(sessionDir, "wrong.json");
    writeFileSync(wrongSchema, JSON.stringify({ schema: "other@9", posture: "native" }));
    expect(loadManifest(wrongSchema)).toBeNull();
  });
});

describe("argument handling", () => {
  it("accepts plain posture names and points at the row", () => {
    expect(normalizeTarget("  NATIVE ")).toBe("native");
    expect(render({ manifest: nativeManifest, target: "native" })).toContain(
      "you asked for this one",
    );
  });

  it("refuses to interpret anything exotic as a posture, and never reflects it back", () => {
    for (const raw of ["a b", "rm -rf /", "$(id)", "x".repeat(64), "--plugin-dir"]) {
      expect(normalizeTarget(raw)).toBeNull();
    }
    const text = render({ manifest: nativeManifest, target: "$(id)" });
    expect(text).toContain('nothing called "?"');
    expect(text).not.toContain("$(id)");
  });

  it("still renders every row for an unknown posture name", () => {
    const text = render({ manifest: nativeManifest, target: "turbo" });
    expect(text).toContain('nothing called "turbo"');
    for (const row of POSTURE_ROWS) expect(text).toContain(row.label);
  });
});
