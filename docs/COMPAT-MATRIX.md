# Harness compatibility matrix

[![Harness compat](https://github.com/gaia-research/gaia-skill-heaven/actions/workflows/harness-compat.yml/badge.svg)](https://github.com/gaia-research/gaia-skill-heaven/actions/workflows/harness-compat.yml)

This is the honest status of what is checked against which harness version (#35). The
badge above is GitHub's own workflow status for `.github/workflows/harness-compat.yml`; it
reports whether those CI cells ran green and nothing else. It is one badge for the whole
workflow (Claude Code, pi, codex, grok, agy jobs together), not one per harness.

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

## grok and agy

Probed 2026-11-06 on Linux x64 (Node 22), each installed into a scratch prefix with a
throwaway HOME. The CI cells run the same commands.

| Harness | Install route | Pinned version | Role in CI | Session-level behaviour |
|---|---|---|---|---|
| grok | npm `@xai-official/grok` | `1.0.77` | pinned, **blocking** | Not verified in CI |
| grok | same | `latest` (= `1.0.77` today) | informational | Unverified |
| agy | vendor release tarball, `sha512sum -c` against the vendor manifest | `1.5.2` | pinned, **blocking** | Not verified in CI |
| agy | latest per the vendor manifest, same checksum check | `latest` (= `1.5.2` today) | informational | Unverified |

Exact probe commands:

```bash
# grok
npm install --prefix "$P/grok-prefix" @xai-official/grok@1.0.77        # 3 packages, ~11 s
"$P/grok-prefix/node_modules/.bin/grok" --version                       # grok 1.0.77 (50ca579fa996)
# agy (the route install.sh at https://antigravity.google/cli/install.sh uses; read before use)
curl -fsSL -o agy.tgz https://storage.googleapis.com/antigravity-public/antigravity-cli/1.5.2-4951595792859136/linux-x64/cli_linux_x64.tar.gz
echo "aa876c08...a05baa  agy.tgz" | sha512sum -c -                      # OK (full digest in the workflow)
tar -xzf agy.tgz && mv antigravity agy && ./agy --version               # 1.5.2
```

`scripts/compat-check.mjs <grok|agy> --pin <version>` then checks, credential-free:
`--version` equals the pin (structural), the door `--print` exits 0 with a plan (dry-run), and
each long flag in the door's argv is accepted (structural). For agy that is `--help`
listing `--dangerously-skip-permissions`. For grok, `--no-subagents`, `--no-plan` and
`--disable-web-search` are listed in `grok --help`, but **`--no-memory` is not listed in
1.0.77 `--help`**; the parser accepts it (and rejects an unknown flag, used as a negative
control), so the check reports it as "unlisted in --help but accepted by the parser".

Caveats, stated rather than hidden:

- The agy pin is the **checksum-verified tarball**, not a vendor-published pin: the vendor
  serves the manifest for `latest` only. The pinned URL carries the version and the vendor's
  build id, and the sha512 is the manifest value observed on 2026-11-06. If the vendor ever
  withdraws that object the blocking cell fails loudly, which is the desired behaviour.
- agy `1.5.2` is what the host had at probe time; `packages/agy-zero/PROBE.md` and
  RELEASE-ACCEPTANCE record earlier agy versions for their live probes. The CI pin follows
  the version actually installed and checksum-verified, not those live probes.
- grok's `inspect --json` runs offline in a fresh `GROK_HOME` but is not used as a CI cell.

## hermes: no CI cell, and why

Installed on the probe host: hermes `0.22.7` (source install from the `v0.22.7` tag). Routes tried:

| Route | Result |
|---|---|
| PyPI `hermes-agent` | newest is `0.19.0`, behind `0.22.7`: not the same artifact |
| npm `hermes-agent` | `0.23.0` is an **unofficial bridge** (repo `wyrtensi/hermes-agent-npm`), not the Nous release: not used |
| `https://github.com/NousResearch/hermes-agent/archive/refs/tags/v0.22.7.tar.gz` | **HTTP 403** from this host (hermes itself reports "Could not resolve the stable source release: HTTP Error 403") |
| `git clone --depth 1 --branch v0.22.7 https://github.com/NousResearch/hermes-agent.git` | works (about 10 s), but building and installing it into a venv was **not run**: the session's permission classifier denied executing the external package build, so that step is unverified here |

So hermes stays at **blocked, not passing**. A cell would need the git-tag install proven
end to end (build into a venv, `hermes --version` equals the pin, door flags `--toolsets`,
`--ignore-user-config`, `--ignore-rules` present in `hermes --help`; those three do appear in
the host's installed `0.22.7`). Their `--print` compositions remain covered by
`packages/core/test/door-ladder.test.ts` and the door contract below.

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
# grok / agy (npm i -g @xai-official/grok@1.0.77; agy from the pinned tarball above)
node scripts/compat-check.mjs grok --pin 1.0.77
node scripts/compat-check.mjs agy --pin 1.5.2
npx vitest run packages/claude-zero packages/core/test/door-ladder.test.ts test/compat-matrix.test.ts
```
