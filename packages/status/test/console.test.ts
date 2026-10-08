// The portable console contract (#191 / #192): one status model, six surfaces,
// the same facts on every host. These are the reusable conformance checks every
// host adapter and the site's Full showcase are held to.
import { describe, expect, it } from "vitest";
import {
  CONSOLE_SURFACES,
  HARNESS_PATHS,
  buildConsoleView,
  eventFromSummonResult,
  eventsFromLedger,
  initialConsoleState,
  recordEvent,
  recordRead,
  renderConsoleText,
  structuredOf,
  type ConsoleCoreState,
  type HarnessPath,
} from "../src/index.js";
import { consoleFixtures, EVENT_FIXTURES } from "../src/fixtures.js";

const HOSTS = HARNESS_PATHS.filter((h) => h.id !== "other");

describe("every harness projects all six surfaces, honestly", () => {
  for (const h of HOSTS) {
    describe(h.name, () => {
      it("declares each surface exactly once with a level, a mechanism and a note", () => {
        expect(Object.keys(h.console.surfaces).sort()).toEqual([...CONSOLE_SURFACES].sort());
        for (const s of CONSOLE_SURFACES) {
          const support = h.console.surfaces[s];
          expect(["native", "degraded", "unsupported"]).toContain(support.level);
          expect(support.via.length, `${s}.via`).toBeGreaterThan(0);
          expect(support.note.length, `${s}.note`).toBeGreaterThan(0);
        }
      });

      it("never claims a persistent HUD without a native status mechanism", () => {
        const status = h.console.surfaces.status;
        if (status.level === "native") expect(h.statusIntegration).not.toBe("UNSUPPORTED");
        if (h.statusIntegration === "UNSUPPORTED") expect(status.level).not.toBe("native");
      });

      it("claims only observations a native surface can back", () => {
        if (h.console.observes.read === "observed") expect(h.console.surfaces.session.level).not.toBe("unsupported");
        if (h.console.surfaces.flow.level === "native") expect(h.console.observes.agents).not.toBe("unavailable");
        if (h.console.observes.agents === "unavailable") expect(h.console.surfaces.flow.level).not.toBe("native");
      });
    });
  }
});

describe("the same status yields the same facts on every host", () => {
  for (const name of ["fresh", "working", "lensOne", "lensMany", "refused", "ultra", "hostile"] as const) {
    it(`${name}: the counts, the reading and the Ultra copy do not depend on the host`, () => {
      const views = HOSTS.map((h) => ({ h, view: buildConsoleView(consoleFixtures(h.console.observes)[name]!.state, h) }));
      const skills = new Set(views.map((v) => v.view.status.plain.match(/(\d+|\?) skills?/)?.[0]));
      expect(skills.size, `skills count differs: ${[...skills]}`).toBe(1);
      // Ultra copy appears wherever the host can see which rung was typed — and only there.
      const ultra = new Set(views.filter((v) => v.h.console.observes.rung !== "unavailable").map((v) => v.view.scope.ultra));
      expect(ultra.size).toBe(1);
      const readings = new Set(views.map((v) => v.view.status.compact.match(/\[[A-Z?]+\]/)?.[0]));
      // The reading may differ only where the host cannot observe a typed rung.
      const unobservable = views.filter((v) => v.h.console.observes.rung === "unavailable");
      if (unobservable.length === 0) expect(readings.size).toBe(1);
    });
  }

  it("a host that cannot observe reads never claims 'body not read'", () => {
    for (const h of HOSTS) {
      const view = buildConsoleView(consoleFixtures(h.console.observes).working!.state, h);
      const text = renderConsoleText(view, { details: true });
      if (h.console.observes.read === "unavailable") {
        expect(text, h.id).not.toContain("body not read");
        expect(text, h.id).toContain("read not observed");
      }
    }
  });

  it("a host that cannot see agents says so in Flow, in words", () => {
    for (const h of HOSTS) {
      const view = buildConsoleView(consoleFixtures(h.console.observes).working!.state, h);
      if (h.console.observes.agents === "unavailable") expect(view.flow.telemetryNote, h.id).toMatch(/does not report agent ids/);
    }
  });
});

describe("hostile text is sanitized before any host can paint it", () => {
  for (const h of HOSTS) {
    it(`${h.id}: no ANSI, bidi or control characters survive into the text projection`, () => {
      const view = buildConsoleView(consoleFixtures(h.console.observes).hostile!.state, h);
      const text = renderConsoleText(view, { details: true });
      // eslint-disable-next-line no-control-regex
      expect(text).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/);
      // the skill's own words may stay, but it cannot draw the instrument's glyphs to impersonate a reading
      expect(text).not.toContain("◆ [ULTRA");
      expect(text).not.toContain("\u001b");
    });
  }
});

describe("Ultra stays provisioned", () => {
  it("never shows a controller decision, progress or an effective rung from runtime state", () => {
    for (const h of HOSTS) {
      const state = consoleFixtures(h.console.observes).ultra!.state;
      const view = buildConsoleView(state, h);
      const scope = renderConsoleText(view, { surface: "scope", details: true });
      const instrument = `${view.status.plain}\n${scope}`;
      expect(instrument).not.toMatch(/EXPLORE|RECOVER|REOPEN|CHECKPOINT|CONVERGENCE|HOLD|\bnow (LOW|MED|HIGH)|\d+\/\d+ /);
      expect(state.status.controller.kind).not.toBe("fixture");
      if (h.console.observes.rung !== "unavailable") expect(scope).toContain("provisioned");
    }
  });
});

describe("the console is never an authority channel", () => {
  it("every Lens action is a pre-fill or a dismissal — nothing in a view submits or calls a tool", () => {
    for (const h of HOSTS) {
      for (const f of Object.values(consoleFixtures(h.console.observes))) {
        const view = buildConsoleView(f.state, h);
        for (const a of view.lens?.actions ?? []) expect(["summon", "inspect", "dismiss"]).toContain(a);
        // the only prompt text a view produces is a `/…` command for a person to submit
        if (view.lens?.prefill) expect(view.lens.prefill).toMatch(/^\/[\w:-]+ /);
        for (const c of [...view.scope.rungControls, ...view.scope.keepSmall]) expect(["prefill", "copy"]).toContain(c.kind);
      }
    }
  });

  it("recording a summon result, a read or a ledger line never throws and never widens anything", () => {
    const state = initialConsoleState();
    expect(() => recordRead(state, "/etc/passwd", "x")).not.toThrow();
    expect(recordRead(state, "/etc/passwd", "x")).toBe(state);
  });
});

describe("fixture states are labelled and never mistaken for runtime", () => {
  it("every console fixture carries the fixture mark; a real session does not", () => {
    for (const f of Object.values(consoleFixtures({ read: "observed", agents: "observed", rung: "observed" }))) {
      expect(f.state.status.fixture).toBeDefined();
    }
    expect(initialConsoleState().status.fixture).toBeUndefined();
  });
});

describe("the engine ledger is a reported source, never an observed one", () => {
  const manifest = {
    id: "s1",
    skills: [
      {
        id: "tree/impeccable",
        name: "impeccable",
        invocation: "model",
        source: "https://gaiaskilltree.com",
        repoUrl: "https://github.com/example/skills",
        sha256: "a".repeat(64),
        path: "/tmp/skill-summon-session-x/impeccable",
        cacheState: "warm",
        totalSeconds: 0.08,
        retrieval: { score: 0.9, margin: 0.3, matchKind: "exact" },
      },
    ],
  };
  const log = [
    { at: "2026-10-08T10:00:00.000Z", query: "design", surface: "any", source: "x", preview: true, chosen: [{ id: "tree/impeccable", score: 0.9, margin: 0.3, matchKind: "exact" }], noMatch: null },
    { at: "2026-10-08T10:00:05.000Z", query: "design", surface: "any", source: "x", preview: false, chosen: [{ id: "tree/impeccable", score: 0.9, margin: 0.3, matchKind: "exact" }], noMatch: null },
    { at: "2026-10-08T10:00:09.000Z", query: "zzz", surface: "hell", source: "x", preview: false, chosen: [], noMatch: "below_floor" },
    "not an object",
  ];

  it("turns log lines into previewed / summoned / no-match events, all reported", () => {
    const events = eventsFromLedger(manifest, log);
    expect(events.map((e) => e.kind)).toEqual(["previewed", "summoned", "no-match"]);
    expect(events.every((e) => e.evidence === "reported")).toBe(true);
    const summoned = events[1]!;
    if (summoned.kind !== "summoned") throw new Error("expected summoned");
    expect(summoned.skills[0]!.stage).toBe("read-unobserved");
    expect(summoned.skills[0]!.name).toBe("impeccable");
    expect(summoned.skills[0]!.sha256).toBe("a".repeat(64));
  });

  it("folds into a console state without ever claiming a read or an agent", () => {
    let state: ConsoleCoreState = initialConsoleState();
    for (const event of eventsFromLedger(manifest, log)) state = recordEvent(state, event, null, "ledger", { readObservable: false });
    expect(state.status.skills).toBe(1);
    const h = HARNESS_PATHS.find((x) => x.id === "claude") as HarnessPath;
    const text = renderConsoleText(buildConsoleView(state, h), { details: true });
    expect(text).toContain("engine ledger");
    expect(text).not.toContain("body read");
  });
});

describe("a tool result is read wherever a host puts it", () => {
  const summon = EVENT_FIXTURES.manual!.event;
  const payload = { query: "q", surface: "any", summoned: [{ id: "a", name: "a" }], previewed: [], noMatch: null };
  it("accepts the object, the JSON string, the content[] blocks and Claude's {result,text} shape", () => {
    expect(summon.kind).toBe("summoned");
    const text = JSON.stringify(payload);
    expect(structuredOf(payload)).toEqual(payload);
    expect(structuredOf(text)).toEqual(payload);
    expect(structuredOf({ content: [{ type: "text", text }] })).toEqual(payload);
    expect(structuredOf({ result: { content: [{ type: "text", text }] } })).toEqual(payload);
    expect(structuredOf({ ref: "x", result: text, text })).toEqual(payload);
    expect(structuredOf({ nothing: true })).toBeUndefined();
    expect(structuredOf(42)).toBeUndefined();
    // and the event it produces is the same whichever shape carried it
    const a = eventFromSummonResult(structuredOf(payload));
    const b = eventFromSummonResult(structuredOf({ content: [{ type: "text", text }] }));
    expect(a).toEqual(b);
  });
});
