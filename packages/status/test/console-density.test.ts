import { describe, expect, it } from "vitest";
import { HARNESS_PATHS, buildConsoleView, initialConsoleState, renderConsoleText, CONSOLE_SURFACES } from "../src/index.js";
import { consoleFixtures } from "../src/fixtures.js";

const hosts = HARNESS_PATHS.filter(host => host.id !== "other");
describe("concise defaults across all six harnesses (#196 UX acceptance)", () => {
  for (const host of hosts) {
    it(`${host.id}: default console is at most eight lines; diagnostics require inspection`, () => {
      for (const fixture of Object.values(consoleFixtures(host.console.observes))) {
        const view = buildConsoleView(fixture.state, host);
        const text = renderConsoleText(view);
        expect(text.split("\n").length).toBeLessThanOrEqual(8);
        expect(text).not.toMatch(/\{"query"|JSON arguments|via .*fallback|retrieval diagnostic|permission hooks|reads\s+.*reported|Supply the sessionRoot/);
        expect(text).toContain("Inspect:");
        for (const surface of CONSOLE_SURFACES) {
          expect(renderConsoleText(view, { surface }).split("\n").length).toBeLessThanOrEqual(3);
        }
      }
    });
    it(`${host.id}: a draft shows neither JSON nor an unusable submission recipe by default`, () => {
      const state = { ...initialConsoleState(), band: { kind: "draft" as const, query: "synthetic need" } };
      const view = buildConsoleView(state, host);
      const brief = renderConsoleText(view, { surface: "lens" });
      expect(brief).toContain("not submitted");
      expect(brief).not.toContain("preview\":true");
      expect(brief).not.toContain("Call the existing");
      const detail = renderConsoleText(view, { surface: "lens", details: true });
      expect(detail).toContain('"preview":true');
      expect(detail).toContain("nothing is submitted for you");
      expect(detail).not.toContain("To summon, type");
      expect(state.status.skills).toBe(0);
      expect(state.status.summons).toBe(0);
    });
  }
});
