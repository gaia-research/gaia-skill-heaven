import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfiguredService } from "../src/configured-service.js";
import { loadArborIdentityContext, resetArborIdentityCache } from "../src/data/arbor-identity-source.js";
import { loadCommittedIndex } from "../src/data/skill-index-source.js";

const dirs: string[] = [];
beforeEach(() => { vi.stubEnv("ARBOR_IDENTITY_PATH", ""); resetArborIdentityCache(); });
afterEach(async () => {
  vi.unstubAllEnvs(); resetArborIdentityCache();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// All observations below are SYNTHETIC regression fixtures, never publications.
async function negativeFixture() {
  const index = await loadCommittedIndex();
  const { context } = await loadArborIdentityContext();
  const skill = index.docs.find((doc) => !doc.links.github && context?.skills[doc.id]?.sourceUrl === null)!;
  expect(skill).toBeDefined();
  const record = {
    state: "not-materializable", reason: "no-source",
    observationDigest: "a".repeat(64), observedAt: "2026-09-01T00:00:00Z",
    currentSourceRoute: null, currentSkillContentSha256: context!.skills[skill.id]!.contentSha256,
    observedSourceRoute: null, observedSkillContentSha256: null,
    resolvedRevision: null, deliveredContentSha256: null,
  };
  const projection = {
    schema: "gaia.installability/v1", indexPath: "docs/graph/named/index.json",
    observations: [{ digest: record.observationDigest, checkedAt: record.observedAt, runId: "synthetic-configured-service" }],
    skills: { [skill.id]: record },
  };
  const dir = await mkdtemp(join(tmpdir(), "configured-evidence-test-")); dirs.push(dir);
  const path = join(dir, "projection.json");
  await writeFile(path, JSON.stringify(projection));
  return { skill, path, projection };
}

describe("shared CLI/MCP service configuration", () => {
  it.each([undefined, "", "${SKILL_SUMMON_INSTALLABILITY}"])("stays offline and unconfigured for %s", async (value) => {
    const fetchFn = vi.fn<typeof fetch>();
    const resolved = await createConfiguredService({ env: { SKILL_SUMMON_INSTALLABILITY: value }, fetchFn }).skillIndex();
    expect(resolved.installability?.status).toBe("not-configured");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([false, true])("can apply an explicitly configured local projection (file URL %s)", async (asUrl) => {
    const f = await negativeFixture();
    const fetchFn = vi.fn<typeof fetch>();
    const resolved = await createConfiguredService({
      env: { SKILL_SUMMON_INSTALLABILITY: asUrl ? pathToFileURL(f.path).href : f.path }, fetchFn,
    }).skillIndex();
    expect(resolved.installability?.status).toBe("applied");
    expect(resolved.index.docs.find((doc) => doc.id === f.skill.id)?.installability).toMatchObject({
      state: "not-materializable", applicability: "verified",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("cannot borrow the observation's content hash as proof", async () => {
    const f = await negativeFixture();
    f.projection.skills[f.skill.id]!.currentSkillContentSha256 = "b".repeat(64);
    await writeFile(f.path, JSON.stringify(f.projection));
    const resolved = await createConfiguredService({ env: { SKILL_SUMMON_INSTALLABILITY: f.path } }).skillIndex();
    expect(resolved.index.docs.find((doc) => doc.id === f.skill.id)?.installability).toMatchObject({
      state: "unknown", applicabilityReason: "content-mismatch",
    });
  });

  it("degrades malformed configuration inside the optional boundary", async () => {
    const resolved = await createConfiguredService({ env: { SKILL_SUMMON_INSTALLABILITY: "file:///missing?query=bad" } }).skillIndex();
    expect(resolved.installability?.status).toBe("unavailable");
    expect(resolved.index.docs.every((doc) => doc.installability?.state === "unknown")).toBe(true);
  });

  it("fetches only an explicitly requested HTTP projection", async () => {
    const f = await negativeFixture();
    const url = "https://evidence.invalid/projection.json";
    const response = new Response(JSON.stringify(f.projection));
    Object.defineProperty(response, "url", { value: url });
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
    const resolved = await createConfiguredService({ env: { SKILL_SUMMON_INSTALLABILITY: url }, fetchFn }).skillIndex();
    expect(resolved.installability?.status).toBe("applied");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error" }));
  });
});
