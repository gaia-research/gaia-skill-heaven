// IO entry for the statusline segment. Claude Code pipes its statusline JSON on
// stdin and renders our stdout (matrix gate (b), GB-1). We read the launched
// profile manifest from $CLAUDE_ZERO_PROFILE (written by the launcher) and the
// live context-window usage from stdin. Never throws: a broken manifest or empty
// stdin degrades to a minimal/no segment rather than breaking the user's prompt.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isHellSessionManifest,
  isProfileManifest,
  parseStatuslineInput,
  renderStatusline,
  type HellSessionManifest,
  type ProfileManifest,
} from "./statusline.js";

const PROFILE_ENV = "CLAUDE_ZERO_PROFILE";
const SUMMON_SESSION_ENV = "SKILL_SUMMON_SESSION";
const HELL_MANIFEST_FILE = "session.json";

function loadManifest(path: string | undefined): ProfileManifest | null {
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return isProfileManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Reads the summon engine's own session.json directly off disk — no subprocess, no
// network (the statusline runs on every prompt render, so this must stay
// cheap), and no session is ever created here: unlike the engine's own session
// resolution, resolveSession() would materialize a fresh session root as a side
// effect of merely asking, which a passive statusline read must never do. Absent
// or unreadable degrades silently to no segment, same discipline as the profile
// manifest above.
function loadHellManifest(sessionRoot: string | undefined): HellSessionManifest | null {
  if (!sessionRoot) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(sessionRoot, HELL_MANIFEST_FILE), "utf-8"));
    return isHellSessionManifest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStdin(): string {
  // Claude Code writes-then-closes stdin before invoking the statusline command
  // (matrix gate (b), GB-1), so a blocking read is safe there. Guard the other
  // cases: an interactive TTY (manual testing, a future interactive invocation)
  // would never close fd 0 and a synchronous read would hang the render tick.
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(0, "utf-8"); // fd 0; empty string if nothing piped
  } catch {
    return "";
  }
}

export function main(): void {
  const manifest = loadManifest(process.env[PROFILE_ENV]);
  // No manifest → we are not inside a claude-zero launch (or it is malformed).
  // Emit nothing so a mis-wired statusline is silent, not noisy/misleading.
  if (!manifest) return;
  const input = parseStatuslineInput(readStdin());
  const hellManifest = loadHellManifest(process.env[SUMMON_SESSION_ENV]);
  process.stdout.write(renderStatusline(manifest, input, hellManifest));
}

main();
