# PROBE: Linux portability pass (#41, Linux half only)

**Date:** 2026-11-05 · **Host:** `uname -sr` = `Linux 6.18.44-fc-v236` · Ubuntu 24.04.5 LTS ·
Node `v22.23.4` · base commit `a6962b0` (main).

**Scope.** Linux only. **Windows and macOS were not run here and nothing in this record
makes a claim about them.** #41 stays open for those hosts.

Harness versions on this host (`--version`): `claude` 2.1.318 (Claude Code), `pi` 1.5.0,
`codex` codex-cli 0.166.0. No authenticated harness session was started; every door cell
below is the credential-free `--print` composition. `hermes`, `grok`, `agy` binaries were
not run (composition only).

## Cells

| Cell | Command | Observed | Result |
|---|---|---|---|
| L1 install | `npm ci` | completed (npm audit advisories only) | pass |
| L2 tests | `npm test` | 89 files passed, 1 skipped; 1499 passed, 1 skipped (before fix) | pass |
| L3 types | `npm run typecheck` | exit 0 | pass |
| L4 core | `npm run launcher -- --posture floor --print` | exit 0; argv `--disable-slash-commands --strict-mcp-config ...`, no `$SESSION` writes | pass |
| L5 claude door | `node packages/claude-zero/bin/claude-zero.mjs --print` | exit 0; `--plugin-dir` and statusline are absolute POSIX paths under the worktree; `$SESSION/door-mcp.json` unexpanded in `--print` as designed | pass |
| L6 pi door | `node packages/pi-zero/bin/pi-zero.mjs --print` | exit 0; `--extension <abs path>` plus `--no-skills --no-context-files --no-prompt-templates` | pass |
| L7 codex door | `node packages/codex-zero/bin/codex-zero.mjs --print` | exit 0; `CODEX_HOME=$SESSION/codex`, `copyFileIfExists $HOME/.codex/auth.json` | pass |
| L8 hermes door | `node packages/hermes-zero/bin/hermes-zero.mjs --print` | exit 0; toolsets/ignore flags | pass |
| L9 grok door | `node packages/grok-zero/bin/grok-zero.mjs --print` | exit 0; `GROK_HOME=$SESSION/grok`, auth.json copy, `config.toml` with `\n` line endings | pass |
| L10 agy door | `node packages/agy-zero/bin/agy-zero.mjs --print` | exit 0; stderr warns about no `--isolate-home` | pass |
| L11 plugin validate | `claude plugin validate ./plugins/skill-heaven` and `./plugins/skill-heaven-console` | both `Validation passed` (ICON_MISSING directory warning only) | pass |
| L12 regression | `npx vitest run packages/skill-summon/test/summon-session.test.ts` | 12 passed incl. new inode-size test | pass |
| L13 full after fix | `npm test`, `npm run typecheck` | 1500 passed, 1 skipped; typecheck exit 0 | pass |

## Source audit against the #41 suspect list

| Suspect | Location | Verdict |
|---|---|---|
| Directory `stat.size` summed | `packages/skill-summon/src/summon/payload-cache.ts` `directorySize` | Linux-correct: already excludes the directory inode (comment cites 4096 on ext4). |
| Directory `stat.size` summed | `packages/skill-summon/src/summon/session.ts` `directorySize` (session reaper `reclaimedBytes`) | **Linux bug, fixed.** Started `bytes` at the directory's own `target.size`, so each directory added 4096 on ext4 (about 64 on APFS), making the reported reclaimed bytes host-dependent. Now counts file bytes only; regression test added (`reports reclaimed bytes as file bytes only ...`, expects 16 for 8+5+3 bytes across 3 directories). `plugins/skill-heaven/mcp/skill-summon.mjs` rebuilt with `npm run build:mcp` (CI diff gate). |
| Other `.size` hits | `statusline-cli.ts` (`statSync(path).size > maxBytes`), `console/reader.ts`, `fleet-source.ts`, `mcp/skills.ts` | Linux-correct: all are regular-file sizes against byte bounds. |
| `process.kill(pid, 0)` | `session.ts`, `payload-cache.ts` `isProcessLive` | Linux-correct: `ESRCH` means dead, any other error (`EPERM`) means live. Existing test uses a live pid (`process.pid`) and a dead one. |
| `$SESSION` / `$HOME` substitution | `packages/core/src/exec.ts` `subst` | Linux-correct: `mkdtemp` under `tmpdir()`; plain string replace. |
| Skill id `/` to `__` | `summon.ts` `safeId` | Linux-correct (`/` is the only separator on Linux). |
| auth.json copy permissions | `exec.ts` `materialize` via `cpSync` | Linux-correct: source mode is kept and the `mkdtemp` session dir is `0700`, so the copy is not world-readable. Not asserted by a test. |
| `chmod`/mode | `pi-zero/src/cli.ts` profile written `0o600` | Linux-correct. |
| Symlink handling | `confined-file.ts` (Linux branch uses a component-wise `O_NOFOLLOW` walk), `materialize.ts`, `session.ts` | Linux-correct; covered by existing tests. |
| Shell quoting | `codex-zero/src/launcher.ts`, `bin/skill-summon.ts` single-quote with `'\''` | POSIX-correct. Not valid for `cmd.exe`/PowerShell; that is the Windows half. |
| Line endings | generated files use `\n` (e.g. grok `config.toml`); no `\r\n` handling in `src` | Linux-correct. Windows checkout/autocrlf is out of scope. |
| `path.sep` | `session.ts`, `fleet-source.ts`, `mcp/skills.ts` | Linux-correct (`/`); `fleet-source` already normalises with `.split(path.sep).join("/")`. |
| PATH resolution of harness binaries | door bins spawn `claude`/`pi`/`codex` by bare name | Linux-correct (`spawnSync` resolves via PATH; all three found). |

## Findings

- 1 genuine Linux bug found and fixed (session reaper `reclaimedBytes` counted directory inodes).
- Everything else on the suspect list is Linux-correct on this host.
- Not exercised: authenticated sessions, `hermes`/`grok`/`agy` binaries, the pinned-version
  comparisons for codex (door notes cite 0.154.0/0.146.0; installed is 0.166.0, composition
  only, no live probe).

## Not covered

**Windows and macOS are not covered by this record.** No claim is made about them.
