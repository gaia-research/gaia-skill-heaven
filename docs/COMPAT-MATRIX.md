# Harness compatibility matrix

[![Harness compat](https://github.com/gaia-research/gaia-skill-heaven/actions/workflows/harness-compat.yml/badge.svg)](https://github.com/gaia-research/gaia-skill-heaven/actions/workflows/harness-compat.yml)

This is the honest status of what is checked against which harness version (#35). The
badge above is GitHub's own workflow status for `.github/workflows/harness-compat.yml`; it
reports whether those CI cells ran green and nothing else. It is one badge for the whole
workflow (Claude Code, pi, codex jobs together), not one per harness.

**CI cannot run authenticated harness sessions.** Every cell below is credential-free. A
green CI cell is not evidence that a session behaves correctly on that version.

Every cell carries one evidence level:

- **structural**: reads the installed harness binary (`--version`, `--help`, a local
  protocol call) or a static validator. No model call, no credentials.
- **dry-run**: the door's `--print`. It composes a plan in this repo and never execs the
  harness, so it does **not** vary with the installed harness version.
- **session**: an authenticated model session. **No CI cell is at this level.** CI holds no
  harness credentials, and none is faked.

The Claude Code cells below are structural (`--version`, `plugin validate`) and dry-run
(`--print`, door tests).

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

## pi and codex

Both install from npm, so a pinned install is exact and cheap. The pins are the versions
recorded in [evidence/linux-41/PROBE.md](evidence/linux-41/PROBE.md) (Linux, credential-free);
`test/compat-matrix.test.ts` fails if the workflow pin and that record diverge.

| Harness | npm package | Version | Role in CI | Session-level behaviour |
|---|---|---|---|---|
| pi | `@earendil-works/pi-coding-agent` | `1.5.0` | pinned, **blocking** | Not verified in CI |
| pi | same | `latest` | informational (`continue-on-error`) | Unverified |
| codex | `@openai/codex` | `0.166.0` | pinned, **blocking** | Not verified in CI |
| codex | same | `latest` | informational (`continue-on-error`) | Unverified |

Checked by `scripts/compat-check.mjs <pi|codex> [--pin <version>]` (throwaway HOME):

| Check | Level | pi | codex | Does not check |
|---|---|---|---|---|
| `--version` equals the pin (pinned cell only) | structural | yes | yes | behaviour |
| door `--print` exits 0 with a plan | dry-run | yes | yes | version-independent by construction |
| every long flag in the door's argv appears in `<harness> --help` | structural | yes (4 flags) | n/a: the codex door emits no flags | that the flag does what the door needs |
| `codex app-server --stdio` answers the door's `skills/list` request with skill data | structural | n/a | yes | that the clean-room composition suppresses skills (needs a model session) |

Observed locally on Linux (Node 22, throwaway npm prefix, 2026-11-06): pi `1.5.0` all
checks pass; codex `0.166.0` all checks pass; codex `latest` (`0.167.0` at the time) passes.
pi `latest` was `1.5.0`, the same as the pin, so that cell adds nothing until pi releases.

## hermes, grok, agy: no CI cell, and why

Installed on the probe host: hermes `0.22.7` (source install from a release tag), grok
`1.0.77` (vendor binary installer), agy `1.5.1` (vendor standalone binary, about 240 MB).
None has a **verified pinned public install route** usable in CI: the PyPI package
`hermes-agent` stops at `0.19.0`, behind the installed `0.22.7`, so it is not the same
artifact; grok and agy are binary installers with no version-pinned URL that this repo has
verified. A cell that installed whatever the installer serves would not be pinned and would
not be a regression detector, so none is added. Their `--print` compositions remain covered
by `packages/core/test/door-ladder.test.ts` and the door contract matrix below, against this
repo's composition rather than an installed harness. Their live-probe versions are in each
door's `PROBE.md` and [RELEASE-ACCEPTANCE.md](RELEASE-ACCEPTANCE.md). Adding a cell needs a
reproducible pinned install first.

## Session cells: credentials checked on the probe host

Not added to CI. Observed 2026-11-06 on the probe host, each with a 25 to 60 second timeout:

| Harness | Command | Result |
|---|---|---|
| claude `2.1.318` | `claude -p "say ok"` | answered `ok`, using the cloud session's own credentials; those are not available to GitHub Actions |
| pi `1.5.0` | `pi -p "say ok"` | `UnrecognizedClientException: The security token included in the request is invalid.` |
| codex `0.166.0` | `codex exec "say ok"` | `401 Unauthorized: Missing bearer or basic authentication` |
| grok `1.0.77` | `grok -p "say ok"` | `Not signed in` |
| agy `1.5.1` | `agy -p "say ok"` | `Authentication required` (OAuth URL) |
| hermes `0.22.7` | `hermes -z "say ok"` | no output within 25 s (timeout); treated as unauthenticated, not diagnosed |

## Door behavioural contract

[DOOR-CONTRACT-MATRIX.md](DOOR-CONTRACT-MATRIX.md) is the generated per-door matrix from
`packages/core/test/door-contract.test.ts` (#33): composition, dry run, P3 snapshot diff,
manifest, session-dir containment, zero-cut env, for all six doors, against a recording stub
harness. Stubbed-launch evidence; not a real harness session.

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
# pi / codex (install the pin first, e.g. npm i -g @earendil-works/pi-coding-agent@1.5.0)
node scripts/compat-check.mjs pi --pin 1.5.0
node scripts/compat-check.mjs codex --pin 0.166.0
npx vitest run packages/claude-zero packages/core/test/door-ladder.test.ts test/compat-matrix.test.ts
```
