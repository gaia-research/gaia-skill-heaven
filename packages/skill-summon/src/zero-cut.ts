// The configured zero cut, enforced by the summon server itself (#123).
//
// `zero_cuts = all` means no skill is used: every route this server offers
// that would put a skill into a session is refused — the summon tool (including
// `preview`, which still returns catalogue cards), skills/get and resources/read
// — and the listings come back empty. `temporary` (the default, and the reading
// of anything unrecognised) changes nothing here: it describes what the zero
// rung cuts, which is routing, not this server.
//
// Where the value comes from — the stored setting, never a rung (founder ruling
// 2026-11-04: `/skill-zero all` is stored, and its store is the setting):
//   - Claude marketplace: `.mcp.json` passes `${user_config.zero_cuts}` as
//     SKILL_HEAVEN_ZERO_CUTS.
//   - claude-zero launcher: the door resolves SKILL_HEAVEN_ZERO_CUTS (explicit
//     env, else the manifest default) into its literal door-mcp.json.
//   - any other client: SKILL_HEAVEN_ZERO_CUTS in the server's environment.
// Read once at server start; a changed setting applies to the next session.

export type ZeroCut = "temporary" | "all";

export const ZERO_CUT_ENV = "SKILL_HEAVEN_ZERO_CUTS";

export function zeroCutFromEnv(env: NodeJS.ProcessEnv = process.env): ZeroCut {
  return normalizeZeroCut(env[ZERO_CUT_ENV]);
}

export function normalizeZeroCut(raw: unknown): ZeroCut {
  return typeof raw === "string" && raw.trim().toLowerCase() === "all" ? "all" : "temporary";
}

/** Constant text: nothing from a request or a catalogue is ever echoed into it. */
export const ZERO_CUT_REFUSAL =
  "Skill Heaven: nothing was summoned. zero_cuts = all is configured, which cuts every skill " +
  "summon, including manual /summon and previews. Summoning is available again in a new " +
  "session once zero_cuts is temporary (the user's plugin setting, or SKILL_HEAVEN_ZERO_CUTS " +
  "for a claude-zero launch).";
