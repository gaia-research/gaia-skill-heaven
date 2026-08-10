# PROBE — codex-cli 0.146.0 skill suppression (WP4, Step A1)

**Harness:** `codex` 0.146.0 (`codex --version` → `codex-cli 0.146.0`)
**Date:** 2026-08-07
**Model used for every probe:** `gpt-5.6-luna -c model_reasoning_effort=low` ("Luna Light" — there
is no `gpt-5.6-luna-light` model id; effort is a `-c` setting on `gpt-5.6-luna`, not a separate
model)
**cwd:** `/Users/marcotiongson/sh-wt-doors`
**Method:** every invocation run in a visible herdr pane (Rule 0), pane id `w8:pA`. Prompt:
`"List every skill you have available, by name. If none, say NONE."` Codex's own `tokens used`
trailer (ground truth, not self-report) is recorded alongside the listing for every cell.

## Cell 1 — baseline isolation flags (no `--ignore-user-config`, no `--ignore-rules`)

```
codex exec --skip-git-repo-check --ephemeral --sandbox read-only \
  --model gpt-5.6-luna -c model_reasoning_effort=low \
  "List every skill you have available, by name. If none, say NONE."
```

Result: a 46-item skill listing (`codex`, `imagegen`, `openai-docs`, `plugin-creator`,
`skill-creator`, `skill-installer`, `browser:control-in-app-browser`, `chrome:control-chrome`,
`computer-use:computer-use`, `documents:documents`, `firecrawl*` (14 items),
`frontend-design:frontend-design`, `github:*` (4 items), `grill-me`, `grill-with-docs`,
`grilling`, `hatch-pet`, `impeccable`, `improve-codebase-architecture`, `pdf:pdf`, `pi-config`,
`presentations:Presentations`, `resolving-merge-conflicts`, `sites:*` (2 items),
`spreadsheets:*` (2 items), `tdd`, `template-creator:template-creator`, `visualize:visualize`).
**`tokens used`: 10,092.**

## Cell 2 — `--ignore-user-config --ignore-rules` added

```
codex exec --skip-git-repo-check --ephemeral --sandbox read-only \
  --ignore-user-config --ignore-rules \
  --model gpt-5.6-luna -c model_reasoning_effort=low \
  "List every skill you have available, by name. If none, say NONE."
```

Result: **NOT suppressed.** The listing does not shrink to `NONE` or even shrink much — it
changes shape to a *different*, larger ~70-item set (`ask-matt`, `codebase-design`,
`decision-mapping`, `design-an-interface`, `diagnosing-bugs`, `domain-modeling`, `edit-article`,
`find-skills`, `firecrawl*` (23 items), `git-guardrails-claude-code`, `graphify`, `grill-me`,
`grill-with-docs`, `grilling`, `handoff`, `hatch-pet`, `impeccable`, `implement`,
`improve-codebase-architecture`, `migrate-to-shoehorn`, `obsidian-vault`, `pi-config`, `pi-cost`,
`prototype`, `qa`, `request-refactor-plan`, `resolving-merge-conflicts`, `review`,
`scaffold-exercises`, `setup-matt-pocock-skills`, `setup-pre-commit`, `tdd`, `teach`, `to-issues`,
`to-prd`, `triage`, `ubiquitous-language`, `writing-beats`, `writing-fragments`,
`writing-great-skills`, `writing-shape`, plus at least `codex`/`imagegen` scrolled out of the
captured pane buffer before the read). **`tokens used`: 6,294** — lower than cell 1, but this is
a *different skill source becoming visible*, not suppression: `--ignore-user-config` evidently
drops whichever config points at the cell-1 set (a bundled/marketplace-flavored list —
`imagegen`, `plugin-creator`, `skill-installer`, namespaced `browser:`/`chrome:`/
`computer-use:`/`documents:`/`github:`/`sites:`/`spreadsheets:` entries) and, with that config
gone, codex falls through to a different root entirely — one that reads like this machine's
general `~/.agents/skills`-flavored skill collection (`codebase-design`, `handoff`, `implement`,
`teach`, `triage`, `ubiquitous-language`, etc., none of which appeared in cell 1 at all). Either
way the model still sees a large, real, named skill listing. **Negative result, recorded
plainly (D8): `--ignore-user-config --ignore-rules` does not get codex to `NONE`.**

## Cell 3 — per-session `skills.config` toggle (finding A2, re-verified here on 0.146.0)

```
codex exec --skip-git-repo-check --ephemeral --sandbox read-only \
  --model gpt-5.6-luna -c model_reasoning_effort=low \
  -c 'skills.config=[{path="/Users/marcotiongson/.codex/skills/hatch-pet/SKILL.md", enabled=false}]' \
  "List every skill you have available, by name. If none, say NONE."
```

Result: the **same 46-item cell-1 listing, minus `hatch-pet`** — confirmed absent this run.
**`tokens used`: 10,058** (a 34-token drop off cell 1's 10,092, consistent with removing one
small skill's listing entry). **A2 holds on 0.146.0**, same as the 0.145.0 finding this brief
cites (gaia-research PR #133): the per-session `-c 'skills.config=[...]'` toggle reaches the
skills surface per invocation, nothing written to `config.toml`, no restart needed.

## What was NOT re-probed here (and why)

A fourth cell — scoping `CODEX_HOME` to an empty session dir (the actual `compileCodex()` route)
— was attempted to directly test whether `CODEX_HOME` scoping alone evicts the cell-1 set, but
copying `auth.json` into the scoped dir was blocked by this session's own tool-permission
classifier (copying a credentials file). Not re-attempted; not worked around. This does not
change the conclusion below — cell 2 already establishes, empirically, that a *much broader*
suppression than plain `CODEX_HOME` scoping (`--ignore-user-config` + `--ignore-rules`, which
subsumes anything `CODEX_HOME`-scoped config alone could do) still leaves a full, real skill
listing visible. If the broader flags can't reach `NONE`, `CODEX_HOME` scoping alone — which is
strictly weaker — cannot either.

## Conclusion

**No combination of CLI-level suppression flags tested (`--ignore-user-config`,
`--ignore-rules`, or both together) gets codex to `NONE`.** They only change *which* skill root
is visible, never zero out the surface. This matches — and re-confirms on 0.146.0 — the standing
conclusion already recorded in `packages/core/src/compile.ts`'s `compileCodex()` comment: codex
discovers skills from multiple independent roots (at least two are directly demonstrated here by
cells 1 vs. 2; the matrix additionally documents `.agents/skills`, `~/.agents/skills`,
`/etc/codex/skills`, and bundled system skills as further roots), and no flag or env var
suppresses all of them at once. The per-session `skills.config` toggle (cell 3, A2) is real and
reproduces cleanly — but it only removes skills named explicitly in that one flag, one at a time;
it does not compute a disable entry for every skill discovered across every root, so it cannot by
itself produce a clean `floor` or a leak-free `curated` set.

**`execSupport` stays `"recipe"` for codex.** See `compileCodex()`'s existing comment for the
full reasoning — this probe adds fresh, version-pinned (0.146.0) evidence for exactly that
conclusion rather than overturning it. A negative result is a first-class finding here (D8): the
honest outcome of Step A1 is "still cannot be spawned cleanly," not a promotion to `exec`.

## WP14 — exact-path clean-room re-probe (2026-08-07)

The earlier negative is retained above: isolation flags alone still do not suppress the
independent roots. WP14 answered the specific remaining gap rather than erasing that finding.
Codex 0.146.0's app-server exposes a disk-backed `skills/list` method with each discovered
`SKILL.md` path and an `enabled` field. This is the hard instrument for this cell; no model
self-report was used for the count. All cells below ran in visible pane **`w8:p11`**, twice.

The baseline app-server cell was:

```text
codex app-server --stdio
  initialize(clientInfo=wp14, experimentalApi=true)
  initialized
  skills/list(cwds=["/Users/marcotiongson/sh-wt-exec"], forceReload=true)
```

Literal repeated output:

```text
CODEX_APP_BASELINE_COUNT=90
CODEX_APP_BASELINE_ENABLED=45
CODEX_APP_BASELINE_REPEAT_COUNT=90
CODEX_APP_BASELINE_REPEAT_ENABLED=45
```

The composed cell created a disposable `$SCOPE/codex`, copied
`$HOME/.codex/auth.json` into it (**4224 bytes**), ran the same `skills/list` against that
scoped home, generated one `[[skills.config]]` `enabled = false` entry for each exact path
reported by that scan, and then rescanned. Literal output from both repetitions:

```text
CODEX_SCOPED_COUNT=76
CODEX_SCOPED_ENABLED=76
CODEX_SCOPED_SCOPES=system,user
CODEX_DISABLE_ENTRIES=76
CODEX_AUTH_BYTES=    4224
CODEX_COMPOSED_COUNT=76
CODEX_COMPOSED_ENABLED=0
```

The config entries are generated from Codex's own discovered paths, so this closes the old
"other roots are not computed" gap without assuming a portable root list. The total metadata
count remains 76, but **zero** entries are enabled; that distinction is the hard result. No
shared `~/.codex` file was written; each scope was removed after the cell.

A real scoped inference followed each composed scan:

```text
CODEX_HOME="$SCOPE/codex" codex exec --skip-git-repo-check --ephemeral \
  --sandbox read-only --ignore-rules --model gpt-5.6-luna \
  -c model_reasoning_effort=low "Reply with exactly: CODEX_COMPOSED_OK"
```

Both visible launches authenticated and exited 0:

```text
CODEX_COMPOSED_OK
tokens used
1,802
CODEX_COMPOSED_STATUS=0
```

For curated readmission, a disposable `wp14-canary` skill was copied under the scoped
`CODEX_HOME/skills`, the same exact-path scan disabled every other result, and macOS `/tmp`
was canonicalized to `/private/tmp` before matching. Both repetitions reported:

```text
CODEX_CURATED_DISCOVERED=77
CODEX_CURATED_DISABLED=76
CODEX_CURATED_COUNT=77
CODEX_CURATED_ENABLED=1
CODEX_CURATED_ENABLED_NAMES=wp14-canary
CODEX_CURATED_OK
tokens used
1,951
CODEX_CURATED_STATUS=0
```

**WP14 conclusion:** the route is now licensed for live exec when the launcher performs the
same session-local sequence: copy auth, materialize curated skills, ask `skills/list` for exact
discovered paths, write session-local `skills.config` disables for every non-readmitted path,
then spawn `codex exec`. The old flag-only negative remains true and is not a license by itself;
the dynamic exact-path discovery is what closes it. `execSupport` may move to `"exec"` only for
this composed launcher route, not for a bare `$CODEX_HOME` or `--ignore-user-config` recipe.

### Door smoke test

After the probe was recorded, the actual door was launched in the same visible pane
**`w8:p11`**:

```text
node packages/codex-zero/bin/codex-zero.mjs --posture product-floor \
  --model gpt-5.6-luna -- -c model_reasoning_effort=low \
  "Reply with exactly: CODEX_HEAVEN_OK"
```

The launcher performed the session-local discovery/config write, then spawned Codex and
returned:

```text
CODEX_HEAVEN_OK
tokens used
1,594
```
