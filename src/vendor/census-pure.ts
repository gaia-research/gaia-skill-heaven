// VENDORED from gaia-research scripts/hell-heaven-bench/census.ts (pure pieces only).
// The cross-repo contract (M2 plan §2) is deliberately thin: no import of
// gaia-research code — these functions are copied and held identical by the
// parity fixture test (test/parity.test.ts). If a number here ever disagrees
// with census.ts output on the same input, the fixture test fails.

import { createHash } from "node:crypto";

// Tokenizer: chars4 — max(1, floor(len/4)); H1-prototype parity. Proxy, not
// the Claude tokenizer; backend name is recorded in every artifact.
export type TokenizerId = "chars4";

export function tokenize(text: string, backend: TokenizerId = "chars4"): number {
  if (backend !== "chars4") throw new Error(`unknown tokenizer backend: ${backend}`);
  return Math.max(1, Math.floor((text ?? "").length / 4));
}

// Minimal frontmatter reader (name/description/id; folded scalars + indented
// continuations) — identical to census.ts.
export function readFrontmatter(src: string): Record<string, string> {
  const lines = src.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const out: Record<string, string> = {};
  let key: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (key) out[key] = buf.join(" ").replace(/\s+/g, " ").trim();
    key = null;
    buf = [];
  };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (m) {
      flush();
      key = m[1];
      const v = m[2].trim();
      buf = v === ">-" || v === ">" || v === "|" || v === "|-" ? [] : [stripQuotes(v)];
    } else if (key && /^\s+\S/.test(line)) {
      buf.push(line.trim());
    } else if (key && line.trim() === "") {
      // blank line inside a folded scalar — keep collecting
    } else {
      flush();
    }
  }
  flush();
  return out;
}

function stripQuotes(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

// Listing-line format: `- ${id}: ${description}`, whitespace-collapsed.
export function makeListingLine(id: string, description: string): string {
  return `- ${id}: ${description}`.replace(/\s+/g, " ").trim();
}

// sha256 of the exact SKILL.md text — same shape as census ContractRecord
// .contentSha256 and ledger SkillRef.contentSha256.
export function contentSha256(src: string): string {
  return createHash("sha256").update(src).digest("hex");
}
