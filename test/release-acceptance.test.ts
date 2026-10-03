import { describe, expect, it } from "vitest";
import {
  authorityHits,
  diffHashes,
  initEvent,
  parseStreamJson,
  toolCalls,
} from "../scripts/release-acceptance.mjs";

// The acceptance script itself needs network and a logged-in claude, so CI cannot run it.
// What CI can pin is the pure parsing it relies on: a mis-parse here would silently turn a
// failed live check into a pass.
describe("release-acceptance helpers", () => {
  const ndjson = [
    "not json noise",
    JSON.stringify({ type: "system", subtype: "init", permissionMode: "auto", tools: ["mcp__skill-summon__summon"] }),
    JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "t1", name: "mcp__skill-summon__summon", input: { query: "x" } }] },
    }),
    JSON.stringify({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "[Summoned] card" }] }] },
    }),
    '{"type":"assistant","message":{"content":[{"type":"tool_u', // truncated last line
  ].join("\n");

  it("parses NDJSON tolerantly and finds the init event", () => {
    const events = parseStreamJson(ndjson);
    expect(events).toHaveLength(3);
    expect(initEvent(events)).toMatchObject({ permissionMode: "auto" });
    expect(initEvent([])).toBeUndefined();
  });

  it("pairs a tool_use with its tool_result and keeps the error flag", () => {
    const calls = toolCalls(parseStreamJson(ndjson));
    expect(calls).toEqual([
      { id: "t1", name: "mcp__skill-summon__summon", input: { query: "x" }, isError: false, text: "[Summoned] card" },
    ]);
    const errored = toolCalls(
      parseStreamJson(
        [
          JSON.stringify({ message: { content: [{ type: "tool_use", id: "e", name: "n", input: {} }] } }),
          JSON.stringify({ message: { content: [{ type: "tool_result", tool_use_id: "e", is_error: true, content: "denied" }] } }),
        ].join("\n"),
      ),
    );
    expect(errored[0]).toMatchObject({ isError: true, text: "denied" });
  });

  it("finds authority phrases case-insensitively and reports only the hits", () => {
    expect(authorityHits("The lane stays ARMED for the rest of this session", ["armed", "preauthorize", "rest of this session"])).toEqual([
      "armed",
      "rest of this session",
    ]);
    expect(authorityHits("neutral reference data", ["armed"])).toEqual([]);
  });

  it("diffs tree hashes in both directions", () => {
    expect(diffHashes({ a: "1", b: "2" }, { a: "1", b: "3", c: "4" })).toEqual(["b", "c"]);
    expect(diffHashes({ a: "1" }, {})).toEqual(["a"]);
    expect(diffHashes({}, {})).toEqual([]);
  });
});
