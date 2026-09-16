import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { identityArtifactIsCurrent } from "../scripts/lib/arbor-identity-freshness.js";
import { assertArborIdentityContext } from "../src/arbor/identity.js";

const serialized = readFileSync(new URL("../../../plugins/skill-heaven/data/arbor-identity.json", import.meta.url), "utf8");
const recorded: unknown = JSON.parse(serialized);
assertArborIdentityContext(recorded);

describe("identity artifact freshness", () => {
  it("preserves the original capture receipt across days", () => {
    expect(identityArtifactIsCurrent({ ...recorded, capturedAt: "2040-01-01" }, serialized)).toBe(true);
  });
  it("still rejects a different source revision", () => {
    expect(identityArtifactIsCurrent({ ...recorded, commit: "0".repeat(40) }, serialized)).toBe(false);
  });
  it("still rejects different content pins", () => {
    const changed = structuredClone(recorded);
    const id = Object.keys(changed.skills)[0]!;
    changed.skills[id]!.contentSha256 = "0".repeat(64);
    expect(identityArtifactIsCurrent(changed, serialized)).toBe(false);
  });
  it("rejects malformed receipts rather than ignoring arbitrary fields", () => {
    expect(identityArtifactIsCurrent(recorded, "{}")).toBe(false);
    expect(identityArtifactIsCurrent(recorded, "not JSON")).toBe(false);
    expect(identityArtifactIsCurrent(recorded, JSON.stringify({ ...recorded, capturedAt: null }))).toBe(false);
  });
});
