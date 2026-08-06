# CLAUDE.md — skill-heaven

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

`skill-heaven` is the **product monorepo** for the Skill Heaven system and
doubles as the **Claude Code plugin marketplace** (root
`.claude-plugin/marketplace.json`; lists the Claude Code door `claude-heaven`).
Per-harness doors for other harnesses (`pi-heaven`, …) ship through their own
harness's channel, not this manifest. Two layers:

- **`packages/core`** — the shared profile-compiler engine and the
  **`skill-heaven` research driver** bin (`--print` recipes, `--record`
  benchmark arms for the Hell/Heaven benchmark). Zero runtime dependencies;
  TypeScript ESM.
- **`packages/claude-heaven`**, **`packages/pi-heaven`** — the per-harness
  **doors** (the user-facing installables). `claude-heaven` is the flagship
  (WS4); `pi-heaven` is the vanguard (WS5). Per N9 the marketing weight is on
  the doors; the engine is the research instrument they are built on.

**Core product model — one entropy ladder (N11).** The user-facing dial is a
single axis, `off · low · med · high · xhigh · max · ultra`, measuring **skill
entropy** — the disorder a skill loadout adds to a session's context. **Heaven
is the low-entropy region** (`off · low · med`), **Hell the high-entropy
region** (`high · xhigh · max`), **`ultra` above**; a mode is a *region* of the
ladder, not a second orthogonal dial. Up the ladder quality and cost rise
together — **Skill Hell routes summons through gaia mcp as a mixture-of-agents
for skills** (D5), so more summoned skills mean more experts in context, better
until it isn't. The benchmark shapes the **entropy curve** (quality and cost vs
skill entropy), not a token-savings headline (B6); hell-safe eligibility is
read from the Skill Tree stamps, not measured live. Public domain:
[`skill-heaven.dev`](https://skill-heaven.dev), served from `packages/site`
(N12).

## Layout

```
packages/core/           engine + skill-heaven bin + vendored pure helpers (src/vendor) + parity fixture/tests
packages/claude-heaven/  Claude Code door (native-default launcher, /skill-heaven + /skill-hell, statusline) — WIP (WS4)
packages/pi-heaven/      pi door — stub (WS5)
```

## Commands

```bash
npm install
npm test          # vitest across all packages (incl. the cross-repo parity fixture)
npm run typecheck # tsc --noEmit over packages/*
npm run launcher -- --posture floor --print   # drive the core skill-heaven bin
```

Node **≥ 22** (npm workspaces + the wider tooling assume it). **No runtime
dependencies — keep it that way.**

## Non-negotiables (decision authority: `gaia-research/founder/RATIFICATION.md`)

- **M0 discipline** — nothing load-bearing ships ahead of an empirical probe on
  a **pinned** harness version. A negative result is a first-class finding
  (D8): record it, don't paper over it. The T9/T9b Claude routes hinge on an
  **undocumented, version-pinned** env knob
  (`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`) — **re-verify on every Claude Code
  upgrade.**
- **P2 — hell is gated.** Every surface hard-errors on `med|high|xhigh|max`;
  `/skill-hell` is a **locked door**, not an activator, until P2 opens — and it
  is shown in *all* modes, which is P2's own "gated, and visibly so" reading.
- **P3 — never mutate shared state.** The launcher composes flags and execs; it
  never stashes, restores, or edits the user's `~/.claude`, settings, or
  skills. The only writes live inside a disposable `mkdtemp` session dir.
- **D6 — thin cross-repo contract.** This repo **never imports `gaia-research`
  code.** It vendors the small pure pieces in `packages/core/src/vendor/` (the
  `chars4` tokenizer, listing-line format, frontmatter reader, `sha256(SKILL.md)`
  ref, and the `hh-ledger/v1` type + validator). Parity is enforced two ways:
  `packages/core/test/parity.test.ts` (fixture generated from the real
  `gaia-research` `census.ts`) and the hard gate that every emitted record
  passes `gaia-research`'s `scripts/hell-heaven-bench/ledger.ts validate`. If
  you change a vendored helper, regenerate the fixture and keep both sides
  byte-identical.
- **Two-number doses** — never price a skill as one number: standing (listing
  line, paid every session) and invocation (full body, paid on invoke) are
  always reported separately; `tokens.system` stays `null` until M2a ratifies.

## Git & PR rules

- **Never commit to `main` directly.** Branch as `feat/<workstream>-<slug>`
  (e.g. `feat/ws2-monorepo-restructure`), open a PR, let CI + review gate it.
- **Preserve history on moves** — use `git mv`, never delete-and-readd.
- **One logical change per commit; commit frequently.** End commit messages
  with the Co-Authored-By / session trailer the environment provides.
- **Draft PRs stay draft** until the owner marks them ready. Ratification
  deltas ride the implementing PR (D9) — never split a decision from its code.
- **Never commit** `node_modules/`, build output, `.env*`, coverage, or session
  temp dirs (`.gitignore` covers these).
- **Stay in your lane** — don't touch the Milim tree or unrelated
  `gaia-research` surfaces from this repo.

### Merge verb (per-repo, and it is not the same one everywhere)

- **This repo squashes.** `gh pr merge <n> --squash --delete-branch`. A merge
  commit is **blocked by a branch protection ruleset on `main`** —
  `gh pr merge --merge` fails with `GraphQL: Merge commits are not allowed on
  this repository`.
- **`gaia-skill-tree` and `gaia-research` are the inverse** — merge commits,
  not squash. `gaia-skill-tree` has squash disabled outright; `gaia-research`
  follows the merge-commit convention its release auto-sync classifies. Agents
  routinely work across all three in one session, so **check the verb per repo,
  never per project.**
- **Check before merging:**
  `gh api repos/<owner>/<repo> --jq '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge}'`.
  Treat that as a floor, not the answer: **a ruleset on `main` can be stricter
  than repo settings report.** This repo is exactly that case — the API says
  `merge:true`, the ruleset rejects merge commits anyway.

## Where decisions and evidence live (this repo is downstream of them)

- Decisions: `gaia-research/founder/RATIFICATION.md`
- Plan of record: `gaia-research/docs/plans/skill-heaven-continuation-plan.md`
- Evidence matrix: `gaia-research/docs/labs/harness-capability-matrix.md`
- Ledger of record + validator: `gaia-research/scripts/hell-heaven-bench/`
