# Harness compatibility matrix

[![Harness compat](https://github.com/gaia-research/gaia-skill-heaven/actions/workflows/harness-compat.yml/badge.svg)](https://github.com/gaia-research/gaia-skill-heaven/actions/workflows/harness-compat.yml)

This is the honest status of what is checked against which Claude Code version (#35). The
badge above is GitHub's own workflow status for `.github/workflows/harness-compat.yml`; it
reports whether those CI cells ran green and nothing else.

**CI cannot run authenticated harness sessions.** Every cell below is credential-free and
static. A green CI cell is not evidence that a session behaves correctly on that version.

## Claude Code

| Version | Role in CI | Live-probed? | Session-level behaviour |
|---|---|---|---|
| `2.1.318` | pinned, **blocking** | **Yes.** Probed live 2026-11-04: [docs/evidence/hooks-123/PROBE.md](evidence/hooks-123/PROBE.md); fresh-install receipt in [RELEASE-ACCEPTANCE.md](RELEASE-ACCEPTANCE.md) | Verified by the probe above, not by CI |
| `latest` | informational (`continue-on-error`) | No | Session-level behaviour for `latest` is unverified by CI (and by anything else in this repo) |

The pinned version is `RECEIPT.claude` in `packages/site/src/release.ts`.
`test/compat-matrix.test.ts` fails if the workflow's pinned cell drifts from it. Moving the
pin is a re-probe, not an edit: re-run `scripts/release-acceptance.mjs` and the #123 probe
first (the `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` knob is undocumented and version-pinned).

## What each CI cell checks

| Cell | Command | Checks | Does not check |
|---|---|---|---|
| version | `claude --version` | The requested version installed; for the pinned cell, that it equals the pin | Anything about behaviour |
| validate core | `claude plugin validate ./plugins/skill-heaven` | Manifest and layout accepted by that CLI's static validator | That the plugin loads or the MCP server starts in a session |
| validate console | `claude plugin validate ./plugins/skill-heaven-console` | Mods manifest and hooks module read the way the engine reads them | That any hook fires in a session |
| door `--print` | `node packages/claude-zero/bin/claude-zero.mjs --print` | The door composes a plan and exits 0 | The plan is composed by this repo and does not invoke `claude`, so this cell is independent of the installed version |
| door tests | `vitest run packages/claude-zero packages/core/test/door-ladder.test.ts` | Door composition and ladder tests; the same tests also run in `ci.yml` | Same as above: version-independent |

The last two cells are included for completeness, not because they vary with the matrix.
What actually varies with the Claude Code version in CI is the first three rows.

## Other harnesses

`pi`, `codex`, `hermes`, `grok` and `agy` have no version matrix in CI. Their `--print`
compositions are covered by `packages/core/test/door-ladder.test.ts` against whatever this
repo composes, not against an installed harness. Their live-probe versions are recorded in
each door's notes and in [RELEASE-ACCEPTANCE.md](RELEASE-ACCEPTANCE.md).

## Platforms

CI runs Linux (`ubuntu-latest`) for these cells; `ci.yml` also runs the Windows installer
tests. macOS is not run in CI. A Linux-only record is in
[evidence/linux-41/PROBE.md](evidence/linux-41/PROBE.md).

## Reproduce locally

```bash
claude --version
claude plugin validate ./plugins/skill-heaven
claude plugin validate ./plugins/skill-heaven-console
node packages/claude-zero/bin/claude-zero.mjs --print > /dev/null
npx vitest run packages/claude-zero packages/core/test/door-ladder.test.ts test/compat-matrix.test.ts
```
