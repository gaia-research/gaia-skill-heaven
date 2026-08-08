# Delivery + Install Plan

> **This is a working prototype, not a finished product.** Everything below ships
> something a stranger can run. None of it is a stable interface, a support
> commitment, or a versioned API. Flag names, postures, and command surfaces are
> expected to change.

Scope: getting the five doors, the Claude plugin, the summon engine, and the
landing page into a stranger's hands by the shortest reliable route. Optimized
for fewest moving parts, not for architectural completeness.

Two repos are involved:

- **`gaia-research/skill-heaven`** — the doors, `packages/core`, the Claude
  plugin, the landing page. Not published to npm.
- **`gaia-research/gaia-mcp`** — the summon engine. Published to npm as
  `@gaia-research/mcp`. Ships the `skill-hell` binary the plugin needs.

---

## 1. How a stranger installs

### The Claude plugin — `/skill-heaven` and `/skill-hell`

This is the shortest path in the whole product and the one to lead with. The
repo already doubles as a Claude Code marketplace
(`.claude-plugin/marketplace.json`), and the plugin scripts are zero-dependency
`.mjs` that run on plain Node.

```bash
claude plugin marketplace add gaia-research/skill-heaven
claude plugin install claude-heaven@skill-heaven
```

Verified: both `render-posture.mjs` and `render-hell.mjs` run standalone on
Node 22 with only `node:` builtins and no `node_modules` beside them.

**Blocked on step P1 below.** `main` currently carries an older plugin with only
`commands/skill-heaven.md`. `skill-hell.md`, `render-hell.mjs`, and
`resolve-hell.mjs` exist only on `integration/program-3-prototypes`. Until that
merges, a marketplace install gives `/skill-heaven` and nothing else.

### The summon engine — required for `/skill-hell`

```bash
npm install -g @gaia-research/mcp
```

This puts `skill-hell` on `PATH`, which is rule 2 of the plugin's four
resolution rules (`plugin/scripts/resolve-hell.mjs`): `$SKILL_HELL_BIN` →
`skill-hell` on `PATH` → `$GAIA_MCP_HOME/dist/bin/skill-hell.js` →
`~/gaia-mcp/dist/bin/skill-hell.js`. No configuration needed; a global install
satisfies it.

**Blocked on step P2 below.** The published `@gaia-research/mcp@0.1.0` ships
**only** the `gaia-mcp` binary — verified against the live registry. It predates
summon entirely and cannot serve `/skill-hell`. `src/bin/skill-hell.ts` is on
`main` and will ship in 0.2.0.

### The five launcher doors

**Recommended path: source checkout.** This works today, unmodified, with no
publishing infrastructure of any kind.

```bash
git clone https://github.com/gaia-research/skill-heaven
cd skill-heaven
npm install

# then, per door:
node packages/claude-heaven/bin/claude-heaven.mjs  --level low --skill <path>
node packages/pi-heaven/bin/pi-heaven.mjs          --posture product-floor
node packages/codex-heaven/bin/codex-heaven.mjs    --posture product-floor
node packages/grok-heaven/bin/grok-heaven.mjs      --posture product-floor
node packages/hermes-heaven/bin/hermes-heaven.mjs  --posture product-floor
```

Add `--print` to any of them to see the composed recipe without launching.
Verified working from a clean checkout.

Each door execs the user's own installed `claude` / `pi` / `codex` / `grok` /
`hermes`. No harness is bundled or vendored.

**`npx` packaging gap closed; publication remains founder-only.** Core and all
five doors are public-package-ready at `0.1.0`. Each package directly depends on
`tsx`, and each door depends on `skill-heaven@^0.1.0`. Clean tarball installs
were run for all six entry points, and every `--print` succeeded. `pi-heaven`
keeps the runtime `pi-tui` peer but marks the type-only pi harness peer optional;
a clean install contains no `pi` binary and never bundles a harness.

After founder-approved publication — core first, then doors — verify with:

```bash
npx --yes skill-heaven@0.1.0 --posture product-floor --print
npx --yes <door>@0.1.0 --print
```

The npm names `skill-heaven`, `claude-heaven`, `pi-heaven`, `codex-heaven`,
`grok-heaven`, and `hermes-heaven` were unregistered when this plan was written.
Do not publish from an implementation session.

### The pi extension

`packages/pi-heaven/extension/pi-heaven.ts` is declared via the `pi` field in
`packages/pi-heaven/package.json` and loads from the same source checkout as the
pi door. It has no independent install path and is deliberately excluded from
this repo's `tsconfig.json` (pi type-checks it against its own SDK). Ships as
part of the checkout; not separately installable.

### Cursor

**Cannot ship, and should not pretend to.** Cursor is recipe-only (`--print`).
Tracked `.cursor/rules` cannot be suppressed per-session, so there is no
posture to launch. The launcher hard-errors rather than inventing one. That is
the documented M0 discipline, not a gap to paper over.

---

## 2. Publish order

Steps marked **[FOUNDER]** need a human — they cannot be automated away and
should not be.

### P1 — merge the integration branch into `main` (skill-heaven)

`integration/program-3-prototypes` is 71 commits ahead of `main` and carries the
three newest doors (codex, grok, hermes), the `/skill-hell` command, and the
plugin's hell renderer/resolver. Nothing else in this plan works without it.

1. **[FOUNDER]** Open the PR from `integration/program-3-prototypes` → `main`
   and review it. This is a frontend- and product-surface-bearing merge; it does
   not land on green CI alone.
2. Reconcile `main`'s pruned `packages/site` into the delivery branch before
   opening the PR. Resolve the real overlaps by preserving integration's newer
   product README, regenerating `package-lock.json`, and keeping both
   `packages/*/extension` and `packages/site` in `tsconfig.json` exclusions.
3. **[FOUNDER] Squash-merge the reviewed PR**, matching this repository's
   branch rules (`gh pr merge <n> --squash --delete-branch`). Never force-push
   or rebase `main`. A squash applies the branch diff to the existing `main`;
   it does not delete the reconciled site.
4. Confirm after merge: `packages/site` still present, and
   `packages/claude-heaven/plugin/commands/skill-hell.md` now present.

### P2 — publish `@gaia-research/mcp@0.2.0` (gaia-mcp)

The pipeline already exists and is correct. Nothing needs building.

5. **[FOUNDER]** Merge release-please PR
   [#8](https://github.com/gaia-research/gaia-mcp/pull/8)
   (`chore(main): release mcp 0.2.0`) into `main`. Currently open and
   `MERGEABLE`.
6. Automated: `.github/workflows/release.yml` runs `validate` (Node 22.14.0 and
   24), then `release_please` cuts the tag and GitHub Release.
7. **[FOUNDER]** Approve the `npm` deployment environment. The `publish` job
   runs under GitHub Environment `npm`, which carries a `required_reviewers`
   protection rule (reviewers: `mbtiongson1`, `nova-gaia`, `milim-gaia`).
   The run pauses until one of them clicks approve in the Actions tab.
   **Keep this gate.** Publishing uses npm trusted publishing over OIDC — there
   is no `NPM_TOKEN` — and the environment approval is the only human check
   between a merge and a public package.
8. Automated: the job re-runs checks, `npm pack --dry-run`, appends the
   compatibility table to the Release, generates a CycloneDX SBOM, and runs
   `npm publish --access public`.
9. Verify: `npm view @gaia-research/mcp version` returns `0.2.0`, and
   `npm view @gaia-research/mcp bin` lists **both** `gaia-mcp` and `skill-hell`.
   If `skill-hell` is missing, stop — the plugin's `/skill-hell` will not
   resolve for anyone.

### P3 — turn on GitHub Pages (skill-heaven)

See section 4. Do this after P1 so the workflow lands on a `main` that already
has everything.

10. **[FOUNDER]** Flip the Pages source to GitHub Actions in repo settings (one
   click, not scriptable through the normal flow).

### P4 — smoke-test as a stranger

11. On a machine that is **not** the dev box, and with `~/gaia-mcp` absent:
    run the two plugin commands from section 1, then `/skill-heaven` and
    `/skill-hell` in a fresh Claude Code session. `~/gaia-mcp` absent is the
    point — it forces resolution through `PATH` (rule 2) rather than the
    developer's local checkout (rule 4), which is what a stranger will hit.

Order matters: **P1 → P2 → P3 → P4.** P2 can run in parallel with P1 if
convenient — the two repos do not block each other until P4.

---

## 3. Keeping the two repos compatible

The doors resolve `skill-hell` at runtime from whatever is on disk. There is no
build-time link between the repos and there should not be one — that boundary is
deliberate (`resolve-hell.mjs` documents it as a D6-style split).

**A documented minimum version is the honest answer, and it is enough.** Do not
build a version-negotiation mechanism for a prototype.

- The plugin requires `@gaia-research/mcp >= 0.2.0`. Below that the `skill-hell`
  binary does not exist and resolution fails.
- `resolveHellEngine()` already fails loudly rather than silently no-opping. Its
  `HellEngineNotFoundError` prints all four checked locations and four concrete
  fixes. A stranger with no engine gets an actionable message, not a mystery.
- Record the minimum in the repo README next to the install command, and in
  `packages/claude-heaven/README.md`.

The one gap worth naming: if a stranger has `@gaia-research/mcp@0.1.0` already
installed globally, `skill-hell` is absent from it, so resolution falls through
to the error — correct behavior, clear message. There is no version *mismatch*
failure mode here, only a present/absent one. That is why this stays simple.

---

## 4. GitHub Pages

**Current state, verified** via `gh api repos/gaia-research/skill-heaven/pages`:

```json
{ "status": "errored", "build_type": "legacy",
  "source": { "branch": "main", "path": "/" },
  "html_url": "https://gaia-research.github.io/skill-heaven/" }
```

Pages is enabled but pointed at the monorepo root with the legacy Jekyll
builder. It is trying to publish a TypeScript monorepo as a static site, which
is why it errors. It has never served the landing page.

**Correction to the working assumption:** `packages/site` **is** on `main`
already, and `main`'s copy is the *newer* one — commit `b3a3ace feat(site): keep
production heroes only` pruned it to the two production heroes (33 files).
`feat/site-landing-prototype` is the *older* 8-variation version (58 files).
Deploy from `main`. The feat branch is not needed and merging it would undo the
prune.

**Good news:** the site needs no code changes for subpath hosting.
`vite.config.ts` already sets `base: './'`, and `src/main.tsx` uses `HashRouter`
specifically so it works on a static host with no server rewrites. It will serve
correctly from `https://gaia-research.github.io/skill-heaven/` as-is.

What to change:

1. **[FOUNDER]** Settings → Pages → Source: switch from **Deploy from a branch**
   to **GitHub Actions**. This replaces `build_type: legacy` and clears the
   error.
2. Add a workflow that builds `packages/site` and uploads `packages/site/dist`
   via `actions/upload-pages-artifact` + `actions/deploy-pages`, triggered on
   push to `main`. Build command is `npm ci` at the root, then
   `npm -w @skill-heaven/site run build` (`tsc -b && vite build`).
3. Verify `https://gaia-research.github.io/skill-heaven/` loads and redirects to
   `#/hero-a`.

**On a custom domain:** none exists and none is coming soon. Nothing here blocks
one later — `base: './'` and `HashRouter` are host-agnostic, so moving to a
domain is a CNAME plus a Pages setting, with no rebuild and no code change.

---

## 5. Where "working prototype" is stated

A stranger must not be able to miss it. These are the specific surfaces:

| Surface | State |
|---|---|
| `README.md` (repo root, first line under the title) | Already carries a **WORK IN PROGRESS** blockquote. Keep it; add "working prototype" wording so the phrase itself appears. |
| The landing page, persistent bar | Renders `SKILL HEAVEN · WORKING PROTOTYPE · ACTIVELY TESTED FOR PUBLIC USE` in the fixed `Switcher` bar on every route (`src/components/Switcher.tsx`). |
| Marketplace plugin description (`.claude-plugin/marketplace.json`) | Currently says "prototype" only about `/skill-hell`. Widen it to the plugin as a whole. |
| `plugin/.claude-plugin/plugin.json` description | Same — shown by `claude plugin details`. |
| `/skill-heaven` and `/skill-hell` command output | The renderers already print hedged, reviewed copy. Add one prototype line to the header block of each. |
| Each door's `packages/*/README.md` | Five of five already say `PROTOTYPE` or `WORK IN PROGRESS` in the package description. Keep. |
| `@gaia-research/mcp` npm page | Add the prototype statement to `README.md` before P2 — it becomes the npm landing page on publish. |

The install commands in section 1 should each sit under a line saying this is a
prototype. That is the one place a stranger definitely looks.

---

## 6. What this does not do yet

Honest gaps a stranger will hit:

- **The launcher doors are not published yet.** Their `0.1.0` tarballs and
  runtime loader are clean-install verified, but `npx` waits on founder-approved
  npm publication. Source checkout is the working path today.
- **Cursor has no door.** Recipe-only, by design and by evidence.
- **The pi extension has no standalone install.** Source checkout only.
- **Windows and Linux are unprobed.** Everything to date ran on one macOS
  machine, one operator. Path handling, shell quoting, `PATHEXT` resolution, and
  signal semantics are all suspect (issue #41).
- **Claude Desktop is unprobed.** Only the terminal harness has been exercised
  (issue #32).
- **Updates are fully manual.** `git pull` for the doors, `npm install -g` again
  for the engine, `claude plugin marketplace update` for the plugin. Three
  different mechanisms, none automatic (issue #34).
- **The plugin's posture chooser shows `med` as LOCKED (P2)**, while
  `docs/LADDER-FLOW.md` defines `med` as `native`, the top of Heaven and not a
  locked rung. A stranger running `/skill-heaven` sees the older gate data. This
  is display drift in `plugin/data/p2-gate.json`, not a mechanism bug — but it
  is the first thing the command prints, so it is worth a look before P4.
- **No automated door release pipeline yet.** Packages carry `0.1.0`, but
  publication, updates, and rollback remain manual (issue #34's audit-trail
  criterion).

---

## 7. Issue coverage

**Closes nothing outright.** This is a delivery plan for a prototype; every
issue below is a standing requirement broader than one ship.

| Issue | Effect |
|---|---|
| [#34](https://github.com/gaia-research/skill-heaven/issues/34) zero-manual-update delivery | **Partially addressed.** Gives every door and the engine *an* install path, and makes the plugin auto-updatable via the marketplace. Does **not** deliver zero-manual-update: doors need `git pull`, the engine needs a re-install, and there is no version reporting. Leaves the audit-trail and rollback criteria open. |
| [#41](https://github.com/gaia-research/skill-heaven/issues/41) cross-platform | **Partially addressed.** Step P4's off-box smoke test is the first non-dev-machine run. It is macOS-to-macOS, so it does not touch the Windows or Linux questions. |
| [#32](https://github.com/gaia-research/skill-heaven/issues/32) terminal vs desktop app | **Partially addressed.** P4 covers the terminal harness install path only. The desktop-app half of the matrix is untouched. |
| [#30](https://github.com/gaia-research/skill-heaven/issues/30) split plugin namespace | **Left alone.** P1 ships `/skill-heaven` and `/skill-hell` as two commands in one plugin. The issue asks whether they should be two *plugins* with namespaced sub-commands. This plan does not answer that and does not foreclose it. |
| [#40](https://github.com/gaia-research/skill-heaven/issues/40) Agent Plugins | **Left alone.** Ships the existing Claude marketplace path unchanged. The evaluate-and-decide question is untouched. |
