import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADVISORY_SYSTEM, applyAdvisory, buildExcerpt, parseAnswer, redactText, stampTranscript, validateUltraStamp,
  type AdvisoryRunner,
} from "../src/ultra-stamp/index.js";

const fx = (n: string) => readFileSync(resolve(import.meta.dirname, "fixtures/ultra-stamp", n), "utf8");
const SALT = "test-salt-not-stored";
const raw = fx("true-invocation.jsonl");
const base = () => stampTranscript(raw, { salt: SALT });
const ok = (j: string): AdvisoryRunner => async () => ({ text: j, model: "fake-cheap-1" });
const GOOD = '{"judgement":"used","confidence":"high","reason":"followed-skill-instructions"}';
const adv = async (r: AdvisoryRunner, o: object = {}) => (await applyAdvisory(base(), raw, { runner: r, ...o })).stamps.find((s) => s.skillId === "alpha-skill")!;

describe("advisory adapter (offline, fake runner)", () => {
  it("adds a labelled advisory and leaves every level byte-identical", async () => {
    const before = base().stamps.find((s) => s.skillId === "alpha-skill")!;
    const s = await adv(ok(GOOD));
    expect(s.advisory).toMatchObject({ label: "advisory-model-judged", status: "ok", materiallyUsedJudgement: "used", model: "fake-cheap-1" });
    expect(s.levels).toEqual(before.levels);
    expect(s.levels.verified_outcome.state).toBe("unknown");
  });
  it("a model verdict of not_used cannot lower materially_used, and used cannot raise an unknown", async () => {
    // beta-skill is not loaded -> no advisory at all; alpha materially_used stays what evidence decided
    const doc = await applyAdvisory(base(), raw, { runner: ok('{"judgement":"not_used","confidence":"high","reason":"no-visible-effect"}') });
    const a = doc.stamps.find((s) => s.skillId === "alpha-skill")!;
    expect(a.levels.materially_used).toEqual(base().stamps.find((s) => s.skillId === "alpha-skill")!.levels.materially_used);
    expect(doc.stamps.find((s) => s.skillId === "beta-skill")!.advisory).toBeUndefined();
  });
  it.each([
    ["prose", "yes it was used"],
    ["extra key", '{"judgement":"used","confidence":"high","reason":"other","note":"x"}'],
    ["bad enum", '{"judgement":"true","confidence":"high","reason":"other"}'],
    ["missing key", '{"judgement":"used","confidence":"high"}'],
    ["array", "[1]"],
    ["empty", ""],
  ])("malformed answer (%s) yields advisory unknown", async (_n, text) => {
    const s = await adv(ok(text));
    expect(s.advisory).toMatchObject({ status: "malformed", materiallyUsedJudgement: "unknown", confidence: null, reason: null });
  });
  it("accepts a fenced JSON answer", () => {
    expect(parseAnswer("```json\n" + GOOD + "\n```")).not.toBeNull();
  });
  it("runner rejection and timeout yield unknown with a status, never throw", async () => {
    expect((await adv(async () => { throw new Error("boom with SECRET-TOKEN-ZZ9"); })).advisory).toMatchObject({ status: "runner-error", materiallyUsedJudgement: "unknown" });
    const slow: AdvisoryRunner = () => new Promise(() => { /* never */ });
    expect((await adv(slow, { timeoutMs: 20 })).advisory).toMatchObject({ status: "timeout", materiallyUsedJudgement: "unknown" });
  });
  it("makes at most one call per eligible skill and respects maxCalls and only", async () => {
    let n = 0;
    const counting: AdvisoryRunner = async () => { n++; return { text: GOOD }; };
    await applyAdvisory(base(), raw, { runner: counting });
    expect(n).toBe(1); // only alpha-skill is loaded
    n = 0;
    await applyAdvisory(base(), raw, { runner: counting, maxCalls: 0 });
    expect(n).toBe(0);
    await applyAdvisory(base(), raw, { runner: counting, only: ["beta-skill"] });
    expect(n).toBe(0);
  });
  it("hands the runner a capped, redacted prompt: no secret, email, path, or skill body", async () => {
    let seen = "";
    const spy: AdvisoryRunner = async (i) => { seen = i.system + i.prompt; return { text: GOOD }; };
    await applyAdvisory(base(), raw, { runner: spy, maxExcerptChars: 300 });
    expect(seen).toContain(ADVISORY_SYSTEM);
    for (const t of ["SECRET-TOKEN-ZZ9", "alice@example.com", "/home/alice"]) expect(seen).not.toContain(t);
    expect(seen.length).toBeLessThan(ADVISORY_SYSTEM.length + 300 + 200);
  });
  it("output validates and carries no excerpt text; a smuggled field fails validation", async () => {
    const doc = await applyAdvisory(base(), raw, { runner: ok(GOOD) });
    expect(() => validateUltraStamp(doc)).not.toThrow();
    const bad = JSON.parse(JSON.stringify(doc));
    bad.stamps[0].advisory.rationale = "free text";
    expect(() => validateUltraStamp(bad)).toThrow();
    const bad2 = JSON.parse(JSON.stringify(doc));
    bad2.stamps.find((s: any) => s.advisory).advisory.status = "malformed";
    expect(() => validateUltraStamp(bad2)).toThrow(); // non-ok must be unknown/null
  });
  it("a stamp without advisory still validates (additive, optional)", () => {
    expect(() => validateUltraStamp(base())).not.toThrow();
  });
  it("redactText strips emails, urls, paths, tokens and long blobs", () => {
    const t = redactText("mail bob@example.org see https://x.example/p?k=1 at /home/bob/a.txt key sk-abcdefgh12345678 Bearer abcdefgh12345678 " + "A".repeat(40));
    for (const s of ["bob@example.org", "https://", "/home/bob", "sk-abcdefgh", "abcdefgh12345678", "AAAAAAAA"]) expect(t).not.toContain(s);
  });
  it("buildExcerpt omits skill bodies and compaction summaries and is empty for an unloaded skill", () => {
    const e = buildExcerpt(fx("compaction-2.1.318-shape.jsonl"), "fixture-plug:fixture-greeter");
    expect(e).toContain("[skill-call]");
    expect(e).toContain("[compaction-summary omitted]");
    expect(e).not.toContain("SYNTHETIC BODY");
    expect(e).not.toContain("SYNTHETIC SUMMARY");
    expect(buildExcerpt(raw, "beta-skill")).toBe("");
  });
});

describe("skill-zero --advisory CLI refusals (no model call)", () => {
  const bin = resolve(import.meta.dirname, "../bin/skill-zero.mjs");
  const src = resolve(import.meta.dirname, "fixtures/ultra-stamp/true-invocation.jsonl");
  const run = (a: string[]) => spawnSync(process.execPath, [bin, ...a], { encoding: "utf8", env: { ...process.env, US_SALT: SALT } });
  it("requires an explicit runner", () => {
    const r = run(["--ultra-stamp", src, "--ultra-stamp-salt-env", "US_SALT", "--advisory"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("--advisory-runner");
  });
  it("refuses advisory options without --advisory", () => {
    expect(run(["--ultra-stamp", src, "--ultra-stamp-salt-env", "US_SALT", "--advisory-runner", "claude-haiku"]).status).not.toBe(0);
  });
});
