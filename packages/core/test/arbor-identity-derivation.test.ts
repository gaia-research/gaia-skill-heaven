// Synthetic duplicate inputs only; these are not upstream observations.
import { describe, expect, it } from "vitest";
import { deriveCanonicalRoutes } from "../scripts/lib/arbor-identity-routes.js";

const sourced = { id: "synthetic/skill", links: { github: "https://github.com/example/skill/blob/main/SKILL.md" } };
const absent = { id: "synthetic/skill", links: {} };
const other = { id: "synthetic/skill", links: { github: "https://github.com/elsewhere/skill/blob/main/SKILL.md" } };

describe("canonical identity route derivation", () => {
  it("deduplicates identical routes regardless of duplicate order", () => {
    expect(deriveCanonicalRoutes([sourced, { ...sourced }]).get(sourced.id)).toBe(sourced.links.github);
    expect(deriveCanonicalRoutes([{ ...sourced }, sourced]).get(sourced.id)).toBe(sourced.links.github);
    expect(deriveCanonicalRoutes([absent, { ...absent }]).get(absent.id)).toBeNull();
  });

  it("fails closed for sourced-versus-absent duplicates in either order", () => {
    for (const records of [[sourced, absent], [absent, sourced]]) {
      const routes = deriveCanonicalRoutes(records);
      expect(routes.has(sourced.id)).toBe(true);
      expect(routes.get(sourced.id)).toBeUndefined();
    }
  });

  it("fails closed for two conflicting sourced routes in either order", () => {
    for (const records of [[sourced, other], [other, sourced]]) {
      expect(deriveCanonicalRoutes(records).get(sourced.id)).toBeUndefined();
    }
  });

  it("keeps an id absent from the projection distinct from explicit source absence", () => {
    const routes = deriveCanonicalRoutes([absent]);
    expect(routes.has(absent.id)).toBe(true);
    expect(routes.has("synthetic/missing")).toBe(false);
    expect(routes.get("synthetic/missing")).toBeUndefined();
  });
});
