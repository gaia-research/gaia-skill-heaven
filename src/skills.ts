// Curated skill resolution (M2 plan §4): id from frontmatter `name` (fallback
// dir name), contentSha256 over the exact SKILL.md bytes, two-part dose via
// the vendored chars4 tokenizer.

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { contentSha256, makeListingLine, readFrontmatter, tokenize } from "./vendor/census-pure.js";

export interface ResolvedSkill {
  id: string;
  dir: string; // absolute dir containing SKILL.md
  skillMdPath: string;
  listingLine: string;
  standingTokens: number;
  invocationTokens: number;
  contentSha256: string;
}

// Accepts a SKILL.md path or its directory.
export function resolveSkill(path: string): ResolvedSkill {
  const p = resolve(path);
  let skillMdPath: string;
  if (statSync(p).isDirectory()) {
    skillMdPath = join(p, "SKILL.md");
  } else if (basename(p) === "SKILL.md") {
    skillMdPath = p;
  } else {
    throw new Error(`--skill must point at a SKILL.md or its directory: ${path}`);
  }
  const src = readFileSync(skillMdPath, "utf-8");
  const fm = readFrontmatter(src);
  const dir = dirname(skillMdPath);
  const id = fm.name || basename(dir);
  const listingLine = makeListingLine(id, fm.description ?? "");
  return {
    id,
    dir,
    skillMdPath,
    listingLine,
    standingTokens: tokenize(listingLine),
    invocationTokens: tokenize(src),
    contentSha256: contentSha256(src),
  };
}
