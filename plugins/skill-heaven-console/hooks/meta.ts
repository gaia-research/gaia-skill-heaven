// What the Trust section states about the installed code. A mod cannot read its
// own manifest, so these are written here and a repository test holds each to
// the version in its plugin.json.

/** plugins/skill-heaven/.claude-plugin/plugin.json `version`. */
export const SKILL_HEAVEN_VERSION = '0.1.2'

/** plugins/skill-heaven-console/.claude-plugin/plugin.json `version`. */
export const CONSOLE_VERSION = '0.1.0'

/** The pane's id, the status values' plugin name. */
export const PANE_ID = 'skill-heaven'

/** What a logged-in probe established about this console (PR #187), for Trust. */
export const CONSOLE_PROBE = 'the console was probed live in the terminal on 2.1.294; desktop paint is not probed'
