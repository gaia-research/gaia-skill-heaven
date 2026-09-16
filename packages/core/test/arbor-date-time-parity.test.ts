// Differential parity for `date-time`, against the pinned upstream checker.
//
// The first version of this consumer used a loose RFC 3339 regex and accepted
// `2026-02-30T00:00:00Z`, `2026-09-01t00:00:00z` and `+99:99` — all of which the
// pinned upstream checker rejects. A record upstream would never publish could
// therefore reach a surface as a consulted claim.
//
// The fixture is not a reading of upstream's source; it is the OUTPUT of running
// upstream's own checker (`gaia_cli/arbor.py`, pinned by module digest) over
// every case below. Parity is asserted against those verdicts, in both
// directions, so neither a too-loose nor a too-strict mirror can pass.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { assertArborProfile, isUpstreamDateTime } from "../src/arbor/validate.js";
import { claim, profile } from "./fixtures/arbor/protocol.js";

const here = dirname(fileURLToPath(import.meta.url));
const differential = JSON.parse(
  readFileSync(join(here, "fixtures", "arbor", "date-time-differential.json"), "utf8"),
) as {
  commit: string;
  moduleSha256: string;
  cases: { value: string; accepted: boolean }[];
};

describe("date-time parity with the pinned upstream checker", () => {
  it("is pinned to a specific upstream module revision", () => {
    expect(differential.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(differential.moduleSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(differential.cases.length).toBeGreaterThan(40);
    // Both verdicts must be represented, or the table proves nothing.
    expect(differential.cases.some((entry) => entry.accepted)).toBe(true);
    expect(differential.cases.some((entry) => !entry.accepted)).toBe(true);
  });

  it.each(differential.cases)("agrees on $value", ({ value, accepted }) => {
    expect(isUpstreamDateTime(value)).toBe(accepted);
  });

  it("rejects the three values the independent review found accepted", () => {
    for (const rejected of [
      "2026-02-30T00:00:00Z",
      "2026-09-01t00:00:00z",
      "2026-09-01T00:00:00+99:99",
    ]) {
      expect(isUpstreamDateTime(rejected)).toBe(false);
      // ...and the claim carrying one is refused, so it can never be consulted.
      expect(() => assertArborProfile(profile([claim({ declaredAt: rejected })])))
        .toThrow(/not a date-time the pinned upstream checker accepts/u);
    }
  });

  it("still accepts every value upstream accepts, byte for byte", () => {
    for (const { value } of differential.cases.filter((entry) => entry.accepted)) {
      expect(() => assertArborProfile(profile([claim({ declaredAt: value })]))).not.toThrow();
    }
  });

  it("mirrors upstream's quirks rather than 'correcting' them", () => {
    // End-of-day is real, and is accepted only in this exact shape.
    expect(isUpstreamDateTime("2026-09-01T24:00:00Z")).toBe(true);
    expect(isUpstreamDateTime("2026-09-01T24:00:01Z")).toBe(false);
    expect(isUpstreamDateTime("9999-12-31T24:00:00Z")).toBe(false);
    // An offset's minute field carries into hours.
    expect(isUpstreamDateTime("2026-09-01T00:00:00+05:60")).toBe(true);
    expect(isUpstreamDateTime("2026-09-01T00:00:00+23:60")).toBe(false);
    // Leap days follow the proleptic Gregorian rule, including the century case.
    expect(isUpstreamDateTime("2024-02-29T00:00:00Z")).toBe(true);
    expect(isUpstreamDateTime("2000-02-29T00:00:00Z")).toBe(true);
    expect(isUpstreamDateTime("2100-02-29T00:00:00Z")).toBe(false);
    expect(isUpstreamDateTime("1900-02-29T00:00:00Z")).toBe(false);
    // No leap second is expressible.
    expect(isUpstreamDateTime("2026-09-01T23:59:60Z")).toBe(false);
  });
});
