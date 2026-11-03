import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertArborIdentityContext, resolveArborIdentity } from "../src/arbor/identity.js";

const context: unknown = JSON.parse(readFileSync(new URL("../../../plugins/skill-heaven/data/arbor-identity.json", import.meta.url), "utf8"));
assertArborIdentityContext(context);
const id = Object.keys(context.skills).find((id) => context.skills[id]!.sourceUrl === null)!;

describe("canonical source absence is identity metadata, not a negative observation", () => {
  it("records source absence only for exact canonical bytes at the corpus revision", () => {
    expect(id).toBeDefined();
    expect(resolveArborIdentity(context, { skillId: id, sourceUrl: null, corpusRevision: context.commit })).toMatchObject({
      pinned: true, contentSha256: context.skills[id]!.contentSha256,
    });
  });
  it("does not conflate unprovided context with an explicitly absent route", () => {
    expect(resolveArborIdentity(context, { skillId: id, sourceUrl: undefined, corpusRevision: context.commit }).pinned).toBe(false);
  });
  it("cannot borrow source absence across revisions or source routes", () => {
    expect(resolveArborIdentity(context, { skillId: id, sourceUrl: null, corpusRevision: "0".repeat(40) }).pinned).toBe(false);
    expect(resolveArborIdentity(context, { skillId: id, sourceUrl: "https://github.com/elsewhere/other", corpusRevision: context.commit }).pinned).toBe(false);
  });
  it("does not accept an omitted route field as a validated null", () => {
    const changed = structuredClone(context);
    Reflect.deleteProperty(changed.skills[id]!, "sourceUrl");
    expect(() => assertArborIdentityContext(changed)).toThrow();
  });
});
