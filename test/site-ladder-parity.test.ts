// The site is a THIRD renderer of the same numbers, and it used to disagree
// with the other two. It cannot import core (Vite app, bundler resolution, and
// core pulls tsx), so parity is enforced here instead — the same pattern the
// generated ladder artifact uses. If someone edits one table, this fails.

import { describe, expect, it } from "vitest";
import { BAND_INFO, LADDER_LEVELS, RUNG_BANDS, RUNG_SLOTS } from "skill-zero";
import { RUNGS, RUNG_BAND, SURFACES } from "../packages/site/src/product.js";

describe("site ↔ core ladder parity", () => {
  it("lists the same rungs, in the same order", () => {
    expect(RUNGS.map((rung) => rung.id)).toEqual([...LADDER_LEVELS]);
  });

  it("prices every rung at core's RUNG_SLOTS", () => {
    for (const rung of RUNGS) {
      const slots = RUNG_SLOTS[rung.id];
      if (slots === null) {
        // The crown rung has no count to render; the site marks it instead.
        expect(rung.crown, "ultra must be marked as the crown rung").toBe(true);
      } else {
        expect(rung.slots, `site prices ${rung.id} differently from core`).toBe(slots);
      }
    }
  });

  it("puts every rung in core's band", () => {
    for (const level of LADDER_LEVELS) {
      expect(RUNG_BAND[level], `site bands ${level} differently from core`).toBe(RUNG_BANDS[level]);
    }
  });

  it("names each surface's command exactly as core does", () => {
    for (const surface of SURFACES) {
      expect(surface.command).toBe(BAND_INFO[surface.id].command);
      expect(surface.name).toBe(BAND_INFO[surface.id].surface);
    }
  });

  it("opens the two banded surfaces on core's default rung", () => {
    // Zero and Ultra have no sub-ladder to open on — the site models that as
    // `ladder: null`, and the renderer arms the band's single rung directly.
    for (const surface of SURFACES) {
      if (surface.ladder === null) {
        expect(surface.defaultRung, `${surface.id} has no ladder, so no default rung`).toBeNull();
        continue;
      }
      expect(surface.defaultRung, `site default for ${surface.id}`).toBe(
        BAND_INFO[surface.id].defaultRung,
      );
    }
  });
});
