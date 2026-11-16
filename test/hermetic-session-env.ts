/**
 * Inherited session variables that must never leak from a caller's host
 * harness (e.g. Claude Code setting CLAUDE_CODE_SESSION_ID or a shell having
 * SKILL_SUMMON_SESSION exported) into test fixtures. Kept in sync with
 * HARNESS_SESSION_ID_ENV_VARS without importing session.ts before per-file
 * vi.mock() hoists (e.g. node:fs/promises in summon-session.test.ts).
 */
export const HERMETIC_SESSION_ENV_VARS = Object.freeze([
  "CLAUDE_CODE_SESSION_ID",
  "SKILL_SUMMON_SESSION",
] as const);

export function scrubInheritedSessionEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of HERMETIC_SESSION_ENV_VARS) {
    delete env[key];
  }
}
