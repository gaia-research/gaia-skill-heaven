// IO entry for the statusline segment. Claude Code pipes its statusline JSON on
// stdin and renders our stdout (matrix gate (b), GB-1). We read the launched
// profile manifest from $CLAUDE_HEAVEN_PROFILE (written by the launcher) and the
// live context-window usage from stdin. Never throws: a broken manifest or empty
// stdin degrades to a minimal/no segment rather than breaking the user's prompt.

import { readFileSync } from "node:fs";
import { isProfileManifest, parseStatuslineInput, renderStatusline, type ProfileManifest } from "./statusline.js";

const PROFILE_ENV = "CLAUDE_HEAVEN_PROFILE";

function loadManifest(path: string | undefined): ProfileManifest | null {
  if (!path) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return isProfileManifest(parsed) ? parsed : null;
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
  // No manifest → we are not inside a claude-heaven launch (or it is malformed).
  // Emit nothing so a mis-wired statusline is silent, not noisy/misleading.
  if (!manifest) return;
  const input = parseStatuslineInput(readStdin());
  process.stdout.write(renderStatusline(manifest, input));
}

main();
