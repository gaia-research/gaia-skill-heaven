import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contentSha256 } from "../src/vendor/census-pure.js";
import { stampTranscript, validateUltraStamp, type SkillStamp, type UltraStampDocument } from "../src/ultra-stamp/index.js";

const fx = (n: string) => readFileSync(resolve(import.meta.dirname, "fixtures/ultra-stamp", n), "utf8");
const SALT = "test-salt-not-stored";
const stamp = (n: string, skills?: Array<{ id: string; sha256: string }>) => stampTranscript(fx(n), { salt: SALT, skills });
const of = (d: UltraStampDocument, id: string): SkillStamp => d.stamps.find((s) => s.skillId === id)!;
const FIXTURE_SECRETS = ["SECRET-TOKEN-ZZ9", "alice@example.com", "/home/alice", "private", "does alpha things", "card text", "scripts/run.sh"];

const bin = resolve(import.meta.dirname, "../bin/skill-zero.mjs");
const tempDir = mkdtempSync(join(tmpdir(), "ultra-stamp-"));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("loaded != invoked (listed, mentioned, never called)", () => {
  const d = stamp("loaded-not-invoked.jsonl");
  it("treats the listing as installed only", () => {
    for (const id of ["alpha-skill", "beta-skill"]) {
      const s = of(d, id);
      expect(s.levels.installed.state).toBe("true");
      expect(s.levels.loaded.state).toBe("false");
      expect(s.levels.invoked.state).toBe("false");
      expect(s.levels.active.state).toBe("false");
      expect(s.levels.materially_used.state).toBe("false");
      expect(s.activationMode).toBe("listing-only");
    }
  });
  it("false-positive control: a plain-text mention (even a request in the user prompt) is not an invocation", () => {
    expect(of(d, "alpha-skill").levels.invoked.state).not.toBe("true");
    expect(of(d, "alpha-skill").levels.invoked.evidence).toEqual([]);
  });
});

describe("true invocation followed by later use", () => {
  const d = stamp("true-invocation.jsonl");
  const a = of(d, "alpha-skill");
  it("stamps every level it can support, each with evidence refs", () => {
    expect(a.levels.installed.state).toBe("true");
    expect(a.levels.invoked).toMatchObject({ state: "true", confidence: "high" });
    expect(a.levels.loaded).toMatchObject({ state: "true", confidence: "high" });
    expect(a.levels.active.state).toBe("true");
    expect(a.levels.materially_used).toMatchObject({ state: "true", confidence: "medium" });
    expect(a.levels.materially_used.evidence.map((e) => e.kind)).toContain("resource-reference");
    expect(a.levels.verified_outcome).toMatchObject({ state: "unknown", confidence: "none" });
    expect(a.activationMode).toBe("skill-tool");
  });
  it("cites line numbers and uuids only", () => {
    expect(a.levels.invoked.evidence).toEqual([{ line: 3, uuid: "bbbbbbbb-0003", kind: "skill-tool-use" }]);
  });
  it("leaves the uncalled sibling alone", () => {
    expect(of(d, "beta-skill").levels.invoked.state).toBe("false");
  });
  it("records harness and model, and a pseudonym that depends on the salt", () => {
    expect(d.harness).toEqual({ name: "claude-code", version: "2.1.318" });
    expect(d.models).toEqual(["fixture-model-1"]);
    const other = stampTranscript(fx("true-invocation.jsonl"), { salt: "a-different-salt" });
    expect(other.sessionPseudonym).not.toBe(d.sessionPseudonym);
    expect(d.sessionPseudonym).toMatch(/^usp_[a-f0-9]{64}$/);
    expect(JSON.stringify(d)).not.toContain(SALT);
    expect(JSON.stringify(d)).not.toContain("sess-fixture-2");
  });
  it("pins the source digest from a user-supplied SKILL.md hash and reports null otherwise", () => {
    const sha = contentSha256("---\nname: alpha-skill\n---\nbody\n");
    const pinned = stamp("true-invocation.jsonl", [{ id: "alpha-skill", sha256: sha }]);
    expect(of(pinned, "alpha-skill").sourceDigest).toBe(sha);
    expect(of(d, "alpha-skill").sourceDigest).toBeNull();
  });
});

describe("ambiguous trace stays unknown", () => {
  const d = stamp("ambiguous.jsonl");
  it("an unattributable summon leaves every listed skill's invoked level unknown, never false", () => {
    expect(d.unattributed).toHaveLength(1);
    expect(of(d, "alpha-skill").levels.invoked.state).toBe("unknown");
    expect(of(d, "alpha-skill").levels.loaded.state).toBe("unknown");
    expect(of(d, "alpha-skill").activationMode).toBe("unknown");
  });
  it("a call with no tool_result is invoked but not provably loaded", () => {
    const b = of(d, "beta-skill");
    expect(b.levels.invoked.state).toBe("true");
    expect(b.levels.loaded.state).toBe("unknown");
    expect(b.levels.active.state).toBe("unknown");
    expect(b.levels.materially_used.state).toBe("unknown");
  });
  it("counts malformed lines without echoing them", () => {
    expect(d.source.malformedLines).toBe(1);
  });
});

describe("false-negative control", () => {
  it("an invocation of a skill absent from the listing is still found; installed is false, not a reason to deny use", () => {
    const d = stamp("invoked-unlisted.jsonl");
    const g = of(d, "gamma-skill");
    expect(g.levels.invoked.state).toBe("true");
    expect(g.levels.loaded.state).toBe("true");
    expect(g.levels.installed.state).toBe("unknown"); // no listing in this transcript: unknown, not false
    expect(g.activationMode).toBe("summon");
    expect(d.source.skillListingSeen).toBe(false);
  });
  it("a skill-tool error result means not loaded, with the call still counted as invoked", () => {
    const jsonl = [
      '{"type":"attachment","uuid":"eeeeeeee-0001","attachment":{"type":"skill_listing","content":"- alpha-skill: x"}}',
      '{"type":"assistant","uuid":"eeeeeeee-0002","message":{"model":"m1","content":[{"type":"tool_use","id":"t1","name":"Skill","input":{"skill":"alpha-skill"}}]}}',
      '{"type":"user","uuid":"eeeeeeee-0003","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"nope"}]}}',
    ].join("\n");
    const a = of(stampTranscript(jsonl, { salt: SALT }), "alpha-skill");
    expect(a.levels.invoked.state).toBe("true");
    expect(a.levels.loaded.state).toBe("false");
    expect(a.levels.materially_used.state).toBe("false");
  });
  it("compaction after the load makes active unknown", () => {
    const jsonl = fx("true-invocation.jsonl") + '{"type":"system","subtype":"compact_boundary","uuid":"ffffffff-0001"}\n';
    expect(of(stampTranscript(jsonl, { salt: SALT }), "alpha-skill").levels.active.state).toBe("unknown");
  });
});

describe("redaction and validation", () => {
  it.each(["loaded-not-invoked", "true-invocation", "ambiguous", "invoked-unlisted"])("%s output carries no fixture secret", (n) => {
    const out = JSON.stringify(stamp(`${n}.jsonl`));
    for (const secret of FIXTURE_SECRETS) expect(out).not.toContain(secret);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(stamp("true-invocation.jsonl"))).toBe(JSON.stringify(stamp("true-invocation.jsonl")));
  });
  it("rejects a short or missing salt", () => {
    expect(() => stampTranscript(fx("ambiguous.jsonl"), { salt: "short" })).toThrow(/salt/);
  });
  it("validator rejects coercion, smuggled fields, and uncited truth", () => {
    const base = (): UltraStampDocument => JSON.parse(JSON.stringify(stamp("true-invocation.jsonl")));
    const bad = (mut: (d: any) => void) => { const d = base(); mut(d); expect(() => validateUltraStamp(d)).toThrow(); };
    expect(() => validateUltraStamp(base())).not.toThrow();
    bad((d) => { d.stamps[0].levels.invoked.state = true; });
    bad((d) => { d.stamps[0].levels.invoked.state = null; });
    bad((d) => { d.stamps[0].levels.invoked.evidence = []; d.stamps[0].levels.invoked.state = "true"; });
    bad((d) => { d.stamps[0].levels.invoked.evidence[0].text = "raw prompt"; });
    bad((d) => { d.stamps[0].levels.invoked.evidence[0].uuid = "SECRET TOKEN with spaces"; });
    bad((d) => { d.stamps[0].levels.verified_outcome.state = "false"; d.stamps[0].levels.verified_outcome.confidence = "none"; });
    bad((d) => { d.stamps[0].path = "/home/alice/x"; });
    bad((d) => { delete d.stamps[0].levels.active; });
    bad((d) => { d.sessionPseudonym = "szs_" + "0".repeat(64); });
    bad((d) => { d.schema = "skill-ultra-stamp/v2"; });
  });
});

describe("skill-zero --ultra-stamp CLI", () => {
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  const src = resolve(import.meta.dirname, "fixtures/ultra-stamp/true-invocation.jsonl");

  it("stamps a local file with the salt taken from the environment, and the output validates", () => {
    const out = join(tempDir, "out.json");
    const r = run(["--ultra-stamp", src, "--ultra-stamp-salt-env", "US_SALT", "--ultra-stamp-out", out], { US_SALT: SALT });
    expect(r.status).toBe(0);
    const v = run(["--ultra-stamp-validate", out]);
    expect(v.status).toBe(0);
    expect(v.stderr).toContain("valid skill-ultra-stamp/v1");
  });
  it("hashes --ultra-stamp-skill files into sourceDigest without emitting the path", () => {
    const skill = join(tempDir, "SKILL.md");
    writeFileSync(skill, "---\nname: alpha-skill\n---\nbody\n");
    const r = run(["--ultra-stamp", src, "--ultra-stamp-salt-env", "US_SALT", "--ultra-stamp-skill", `alpha-skill=${skill}`], { US_SALT: SALT });
    expect(r.status).toBe(0);
    const doc = JSON.parse(r.stdout) as UltraStampDocument;
    expect(of(doc, "alpha-skill").sourceDigest).toBe(contentSha256("---\nname: alpha-skill\n---\nbody\n"));
    expect(r.stdout).not.toContain(tempDir);
  });
  it("refuses without a salt and refuses to combine with other modes", () => {
    expect(run(["--ultra-stamp", src, "--ultra-stamp-salt-env", "US_SALT_UNSET"]).status).not.toBe(0);
    expect(run(["--ultra-stamp", src]).status).not.toBe(0);
    expect(run(["--ultra-stamp", src, "--ultra-stamp-salt-env", "US_SALT", "--print"], { US_SALT: SALT }).status).not.toBe(0);
  });
});

describe("skill_listing in the Claude Code 2.1.318 shape", () => {
  const d = stamp("listing-2.1.318-shape.jsonl");
  it("reads the structured names[] when present, including parenthetical-source entries", () => {
    expect(of(d, "plugin-skill").levels.installed.state).toBe("true");
    expect(of(d, "plain-skill").levels.installed.state).toBe("true");
  });
  it("falls back to rendered lines with an optional `(source)` parenthetical", () => {
    expect(of(d, "rendered-only").levels.installed.state).toBe("true");
    expect(of(d, "rendered-plain").levels.installed.state).toBe("true");
  });
  it("carries no fixture secret", () => {
    const out = JSON.stringify(d);
    for (const s of FIXTURE_SECRETS) expect(out).not.toContain(s);
  });
});

describe("compaction in the Claude Code 2.1.318 shape (synthetic, structure from a real /compact probe)", () => {
  const G = "fixture-plug:fixture-greeter";
  const raw = fx("compaction-2.1.318-shape.jsonl");
  const d = stampTranscript(raw, { salt: SALT });
  const g = of(d, G);
  it("a skill invoked before compaction is still invoked and loaded", () => {
    expect(g.levels.invoked).toMatchObject({ state: "true", confidence: "high" });
    expect(g.levels.loaded.state).toBe("true");
    expect(g.activationMode).toBe("skill-tool");
  });
  it("active after compaction is unknown when the body is neither preserved nor re-injected (summary prose is not evidence)", () => {
    expect(g.levels.active.state).toBe("unknown");
    expect(g.levels.active.evidence.map((e) => e.kind)).toEqual(["compaction"]);
    expect(g.levels.materially_used.state).not.toBe("true");
    expect(g.levels.verified_outcome.state).toBe("unknown");
  });
  it("the post-compaction skill_listing re-emission does not turn a listing into an invocation", () => {
    const u = of(d, "fixture-plug:fixture-unused");
    expect(u.levels.installed.state).toBe("true");
    expect(u.levels.invoked.state).toBe("false");
    expect(u.activationMode).toBe("listing-only");
  });
  it("body listed as preserved by the boundary keeps active true, with compaction-preserved evidence", () => {
    const kept = raw.replace(/"uuids":\["cccccccc-0006"\],"allUuids":\["cccccccc-0006"\]/, '"uuids":["cccccccc-0005","cccccccc-0006"],"allUuids":["cccccccc-0005","cccccccc-0006"]');
    expect(kept).not.toBe(raw);
    const a = of(stampTranscript(kept, { salt: SALT }), G).levels.active;
    expect(a.state).toBe("true");
    expect(a.evidence.map((e) => e.kind)).toContain("compaction-preserved");
  });
  it("body re-injected after the boundary keeps active true, with body-reinjection evidence", () => {
    const re = raw + JSON.stringify({ type: "user", uuid: "cccccccc-0013", isMeta: true, message: { role: "user", content: [{ type: "text", text: "Base directory for this skill: /synthetic/plug/skills/fixture-greeter\n\nSYNTHETIC BODY" }] } }) + "\n";
    const a = of(stampTranscript(re, { salt: SALT }), G).levels.active;
    expect(a.state).toBe("true");
    expect(a.evidence.map((e) => e.kind)).toContain("body-reinjection");
  });
  it("a re-injection of a different skill's directory is not evidence for this one", () => {
    const other = raw + JSON.stringify({ type: "user", uuid: "cccccccc-0013", isMeta: true, message: { role: "user", content: "Base directory for this skill: /synthetic/plug/skills/fixture-unused" } }) + "\n";
    expect(of(stampTranscript(other, { salt: SALT }), G).levels.active.state).toBe("unknown");
  });
  it("a fresh invocation after the boundary is a new load, so active is true", () => {
    const again = raw
      + JSON.stringify({ type: "assistant", uuid: "cccccccc-0013", message: { role: "assistant", content: [{ type: "tool_use", id: "toolu_c2", name: "Skill", input: { skill: G } }] } }) + "\n"
      + JSON.stringify({ type: "user", uuid: "cccccccc-0014", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_c2", content: "ok" }] } }) + "\n";
    expect(of(stampTranscript(again, { salt: SALT }), G).levels.active.state).toBe("true");
  });
  it("validates and carries no synthetic body or summary text", () => {
    expect(() => validateUltraStamp(d)).not.toThrow();
    const out = JSON.stringify(d);
    for (const t of ["SYNTHETIC BODY", "SYNTHETIC SUMMARY", "/synthetic/plug"]) expect(out).not.toContain(t);
  });
});
