// Standing-dose census for the launched profile — the number the statusline
// segment renders (matrix gate (b): census-derived, NOT read from Claude's
// statusline input; gate (c) method: makeListingLine → tokenize(chars4), the
// same proxy every R0 number uses). Reuses core `resolveSkill` so the per-skill
// standing dose is byte-identical to `scripts/hell-heaven-bench/census.ts`.
//
// SCOPE (honest, disclosed — B4/M0). We census the skill roots we can enumerate
// without replicating Claude Code's full discovery: user scope (~/.claude/skills)
// and project scope (<cwd>/.claude/skills). Bundled CLI skills and
// plugin-provided skills are NOT yet counted — the census carries `scope` so the
// readout can never silently overclaim completeness. Widening scope is a tracked
// follow-up (see README) and must not become load-bearing marketing copy until
// its own coverage check lands.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveSkill } from "skill-heaven";

export interface CensusedSkill {
  id: string;
  dir: string;
  standingTokens: number;
}

export interface RootCensus {
  root: string;
  exists: boolean;
  /** false when the root exists but could not be read (permissions, bad mount).
   * Distinguishes a genuine empty root from a failed read so the census never
   * silently under-claims a `0` it did not actually verify (B4). */
  readable: boolean;
  skillCount: number;
}

export interface NativeCensus {
  tokenizer: "chars4";
  standingTotal: number;
  skillCount: number;
  skills: CensusedSkill[];
  roots: RootCensus[];
  scope: "user+project";
  /** true when at least one existing root could not be read — the standing total
   * is a floor, not a complete count. Consumers should disclose, not assume 0. */
  incomplete: boolean;
}

/** The native skill roots we can enumerate. Order matters: earlier roots win on
 * id collision (project overrides are rare; first-wins keeps the census stable). */
export function nativeSkillRoots(opts: { home?: string; projectDir?: string } = {}): string[] {
  const home = opts.home ?? homedir();
  const project = opts.projectDir ?? process.cwd();
  return [join(home, ".claude", "skills"), join(project, ".claude", "skills")];
}

/** Returns the skill dirs under `root`, and whether the root was readable at all.
 * `readable:false` (root exists but readdir threw) is reported distinctly from an
 * empty readable root so the caller can flag an incomplete census (B4). */
function skillDirsUnder(root: string): { dirs: string[]; readable: boolean } {
  if (!existsSync(root)) return { dirs: [], readable: true }; // absent ≠ unreadable
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return { dirs: [], readable: false };
  }
  const dirs: string[] = [];
  for (const entry of entries) {
    const dir = join(root, entry);
    try {
      if (statSync(dir).isDirectory() && existsSync(join(dir, "SKILL.md"))) dirs.push(dir);
    } catch {
      /* unreadable entry — skip, never throw the whole census */
    }
  }
  return { dirs: dirs.sort(), readable: true }; // deterministic order (no readdir-ordering reliance)
}

export function censusStandingDose(roots: string[]): NativeCensus {
  const skills: CensusedSkill[] = [];
  const rootCensus: RootCensus[] = [];
  const seenIds = new Set<string>();

  let incomplete = false;
  for (const root of roots) {
    const { dirs, readable } = skillDirsUnder(root);
    if (!readable) incomplete = true;
    let counted = 0;
    for (const dir of dirs) {
      let resolved;
      try {
        resolved = resolveSkill(dir);
      } catch {
        continue; // malformed SKILL.md — skip, don't poison the total
      }
      if (seenIds.has(resolved.id)) continue;
      seenIds.add(resolved.id);
      skills.push({ id: resolved.id, dir: resolved.dir, standingTokens: resolved.standingTokens });
      counted++;
    }
    rootCensus.push({ root, exists: existsSync(root), readable, skillCount: counted });
  }

  return {
    tokenizer: "chars4",
    standingTotal: skills.reduce((sum, s) => sum + s.standingTokens, 0),
    skillCount: skills.length,
    skills,
    roots: rootCensus,
    scope: "user+project",
    incomplete,
  };
}
