// Loading the canonical identity context from disk, offline and confined.
//
// Same posture as the publication cache: the committed artifact is the read
// path, a summon never fetches it, and a missing or malformed context degrades
// to "no pin could be proven" — which leaves the Arbor join exactly as unknown
// as it was before this file existed.

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertArborIdentityContext, type ArborIdentityContext } from "skill-zero";

import { readConfinedArborFile } from "./arbor-file.js";

/** Where the committed identity context lives relative to the repository root. */
const IDENTITY_RELATIVE_PATH = join("plugins", "skill-heaven", "data", "arbor-identity.json");

export type ArborIdentityLoad = {
  context: ArborIdentityContext | null;
  /** Present when a context was found but could not be used. Disclosed, never thrown. */
  problem: string | null;
  /** sha256 of the exact bytes read, so a surface can name what it consulted. */
  sha256: string | null;
};

let cached: Promise<ArborIdentityLoad> | undefined;

export function loadArborIdentityContext(): Promise<ArborIdentityLoad> {
  cached ??= readIdentityFromDisk();
  return cached;
}

/** Test seam — drops the process-level cache. */
export function resetArborIdentityCache(): void {
  cached = undefined;
}

/** Exported for tests: read one explicit identity file. */
export async function readArborIdentityFile(path: string): Promise<ArborIdentityLoad> {
  const directory = dirname(path);
  try {
    const bytes = await readConfinedArborFile(directory, path);
    const digest = createHash("sha256").update(bytes).digest("hex");
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      return { context: null, problem: describe(error), sha256: digest };
    }
    try {
      assertArborIdentityContext(parsed);
    } catch (error) {
      return { context: null, problem: describe(error), sha256: digest };
    }
    return { context: parsed, problem: null, sha256: digest };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return absent();
    return { context: null, problem: describe(error), sha256: null };
  }
}

async function readIdentityFromDisk(): Promise<ArborIdentityLoad> {
  for (const candidate of candidatePaths()) {
    const load = await readArborIdentityFile(candidate);
    if (load.context !== null || load.problem !== null) return load;
  }
  return absent();
}

function candidatePaths(): string[] {
  const configured = process.env.ARBOR_IDENTITY_PATH?.trim();
  const here = dirname(fileURLToPath(import.meta.url));
  const paths = configured ? [configured] : [];

  // Bundled: plugins/skill-heaven/mcp/skill-summon.mjs -> ../data/arbor-identity.json
  paths.push(join(here, "..", "data", "arbor-identity.json"));

  let directory = here;
  for (let depth = 0; depth < 8; depth++) {
    paths.push(join(directory, IDENTITY_RELATIVE_PATH));
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return paths;
}

function absent(): ArborIdentityLoad {
  return { context: null, problem: null, sha256: null };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
