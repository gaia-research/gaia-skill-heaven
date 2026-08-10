# PROBE — Grok 0.2.118 skill scoping (WP12)

**Harness:** `grok` 0.2.118 (`[unknown]` channel)
**Date:** 2026-08-07
**Visible evidence pane:** `w8:pQ`
**Account caveat:** this is the free-tier account without SuperGrok. A failure or missing capability below must not be promoted to a harness limitation when it may be an account-tier limitation.

All load-bearing Grok invocations in this probe were sent to the visible herdr pane with `herdr pane send-text`; the exact output files used while probing were under `/tmp/grok-zero-*` and are disposable.

## Baseline and scoped home

Exact baseline cell, repeated twice:

```text
grok inspect
```

Literal load-bearing output from both runs:

```text
  └ Version: 0.2.118 [unknown]
  Skills (110)
```

The skill-source breakdown was stable: **75 user**, **16 bundled**, **10 `plugin: cloudflare`**, **1 `plugin: frontend-design [claude]`**, and **8 `plugin: rock-favor`**. The full human reports differed only in nondeterministic MCP/plugin ordering; count and source counts agreed.

Exact scoped-home cell (two independent disposable homes, each with `cp ~/.grok/auth.json "$SCOPE/auth.json"`), repeated twice per home:

```text
GROK_HOME="$SCOPE" grok inspect
```

Literal comparison:

```text
  Skills (79)
```

Both scoped runs agreed on count/source: **70 user** skills from `~/.agents/skills`, **1 `plugin: frontend-design [claude]`, 8 `plugin: rock-favor`**; bundled skills and the Cloudflare plugin were absent. `Config Sources` reported `User: (none)`. A scoped home without the auth copy was not treated as a valid cell; the copied auth file is the exact Codex-shaped trap this probe was checking.

## Project scope

A disposable git repo `/tmp/grok-zero-project-scope` contained `.claude/skills/project-marker/SKILL.md`; `/tmp/grok-zero-bare-scope` had no `.claude/` directory. Exact cells, each repeated twice:

```text
grok --cwd /tmp/grok-zero-project-scope inspect
grok --cwd /tmp/grok-zero-bare-scope inspect
GROK_HOME="$SCOPE" grok --cwd /tmp/grok-zero-project-scope inspect
```

Results:

```text
project home:  Skills (111), └ project-marker ... project [claude]
bare home:     Skills (110)
scoped home:   Skills (80), └ project-marker ... project [claude]
```

`GROK_CLAUDE_SKILLS_ENABLED=false` and a scoped `[compat.claude] skills = false` config both kept the marker listed as `[disabled]` (80 skills), so compatibility-off is not listing eviction. A scoped config with `[skills] ignore = ["/tmp/grok-zero-project-scope/.claude/skills"]` removed the marker (79 skills) twice. **Conclusion:** project skills can be evicted without changing `--cwd` when the launcher writes an exact discovered-path ignore entry; compatibility-off alone cannot. There is no demonstrated generic wildcard that safely covers arbitrary external/plugin roots.

## Scoped session usability

Exact cell, repeated twice:

```text
GROK_HOME="$SCOPE" grok -p "Reply with exactly: OK"
```

Both exited 0 and printed `OK`. Auth survived: **yes**. The final clean-room composition below also answered `OK` twice.

## Floor composition probe

A disposable scoped home copied `auth.json` and wrote a session-only `config.toml` with:

```toml
[compat.claude]
skills = false
[compat.cursor]
skills = false
[skills]
ignore = [
  "/Users/marcotiongson/.agents/skills",
  "/Users/marcotiongson/.agents/skills/impeccable",
  "/Users/marcotiongson/.agents/skills/pi-config",
  "/Users/marcotiongson/.claude/skills",
  "/Users/marcotiongson/Documents/gaia-research/.claude/skills",
  "/Users/marcotiongson/Documents/pi-config/skills/pi-config",
  "/tmp/grok-zero-floor-final/bundled/skills",
  "/tmp/grok-zero-project-scope/.claude/skills"
]
[plugins]
disabled = ["frontend-design", "rock-favor", "claude-zero"]
```

The `$GROK_HOME/bundled/skills` ignore is load-bearing: a fresh home seeded 21 bundled skills after its first start. With that session path ignored, exact `GROK_HOME=/tmp/grok-zero-floor-final grok inspect` runs reported **`Skills (0)`** twice; the same composition with `--cwd /tmp/grok-zero-project-scope` also reported **`Skills (0)`** twice. `GROK_HOME=... grok -p "Reply with exactly: OK"` answered `OK` twice. This is a verified pinned-machine composition, but its absolute path and installed-plugin inventory are not portable evidence of a universal route; the implementation stays recipe-only for non-native postures rather than guessing.

The probe also tried `[plugins].disabled` plain names, `@marketplace` names, `user/...` names, and `"*"`. Plain observed names suppressed the observed plugin skills; the other spellings/wildcard did not. The plugin inventory is therefore an open portability boundary, not a reason to mutate global plugin state.

## Product-floor composition

The nearest launchable product composition used the same session config and auth copy but omitted `[plugins].disabled`, leaving the installed plugin surface as the door. Exact cells, repeated twice each:

```text
GROK_HOME=/tmp/grok-zero-product-final grok inspect
GROK_HOME=/tmp/grok-zero-product-final grok --cwd /tmp/grok-zero-project-scope inspect
GROK_HOME=/tmp/grok-zero-product-final grok -p "Reply with exactly: OK"
```

Both listing cells reported **`Skills (9)`** (the observed plugin skills: eight Rock skills plus the disabled frontend listing), including when the disposable project Claude skill was present. Both answer cells exited 0 and printed `OK`. This preserves the plugin/door surface but remains recipe-only in the compiled door because the portable installed-plugin inventory is not demonstrated.

## Curated readmission

A disposable `SKILL.md` named `grok-zero-path-probe` was copied to `$GROK_HOME/skills/grok-zero-path-probe` in the same clean-room config. Exact cells, repeated twice:

```text
GROK_HOME=/tmp/grok-zero-curated-final grok inspect
GROK_HOME=/tmp/grok-zero-curated-final grok -p "/grok-zero-path-probe"
```

`grok inspect` reported **`Skills (1)`** and the literal source line `grok-zero-path-probe user` in both runs. Both inference runs emitted the marker `GROK_PATH_SKILL_LOADED`; one added a short preamble, so exact prose did not byte-match, but discovery and marker agreement did. **Curated directory placement: yes**, with a session-scoped `GROK_HOME/skills/<name>` copy. No token dose was measured or claimed.

## Conclusion

`GROK_HOME` is a real session-scoping lever and auth survives when copied. Project Claude skills are not removed by compatibility-off, but exact `[skills].ignore` entries remove them without changing `--cwd`. A pinned-machine config can reach zero and a curated copy can reach exactly one, yet there is no verified portable all-plugin/absolute-path wildcard route. Floor/product-floor/curated therefore compile as **recipes**, not live exec routes; native remains untouched. `--no-memory`, `--no-subagents`, `--no-plan`, and `--disable-web-search` are documented session flags and are included in the recipes, but no dose is inferred from them.

## WP14 — inspect-derived exact-path route (2026-08-07)

The earlier negative is retained above: a static wildcard is not demonstrated, and a single
compatibility toggle is not eviction. WP14 tested the route the brief called for: create a
session-scoped `GROK_HOME`, copy auth (**1678 bytes**), ask Grok's disk enumerator
`grok inspect --json` for every discovered skill's `source.path`, and write exact path/parent
entries into `[skills].ignore`. No `grok plugin disable` command or global mutation was used.
All load-bearing cells below ran in visible pane **`w8:p12`**, with each composition repeated
twice.

A one-pass exact-path attempt is a useful negative finding. Starting from the scoped report
(79 skills: 70 user, 9 plugin), ignoring the 79 exact `SKILL.md` paths (or their 79 parent
directories) left 44 skills: 35 user skills from the newly exposed `.claude/skills` root and
all 9 plugin skills. Exact entries must therefore be accumulated across discovery passes, and
plugin skills need the observed plugin names in `[plugins].disabled` for the benchmark floor.

The final iterative floor cell kept the config entirely inside the disposable home. Literal
output from both repetitions:

```text
GROK_ITER_ROUND=1 COUNT=79 SOURCES=plugin:9,user:70
GROK_ITER_IGNORE_TOTAL=158 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_ROUND=2 COUNT=35 SOURCES=user:35
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_ROUND=3 COUNT=0 SOURCES=
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_ROUND=4 COUNT=0 SOURCES=
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_FINAL_COUNT=0
GROK_ITER_FINAL_SOURCES=
GROK_ITER_FINAL_NAMES=
GROK_ITER_OK
GROK_ITER_STATUS=0
```

The product-floor arm intentionally leaves observed plugins as the door surface and does not
claim zero skills. Both repetitions agreed:

```text
GROK_ITER_ROUND=1 COUNT=79 SOURCES=plugin:9,user:70
GROK_ITER_IGNORE_TOTAL=158 GROK_ITER_PLUGIN_DISABLE_TOTAL=0
GROK_ITER_ROUND=2 COUNT=44 SOURCES=plugin:9,user:35
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=0
GROK_ITER_ROUND=3 COUNT=9 SOURCES=plugin:9
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=0
GROK_ITER_ROUND=4 COUNT=9 SOURCES=plugin:9
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=0
GROK_ITER_FINAL_COUNT=9
GROK_ITER_FINAL_SOURCES=plugin:9
GROK_ITER_FINAL_NAMES=frontend-design,clear-rock-cache,resave-rock-route,rock-api,rock-favor,rock-merge-duplicates,rock-rostering-assignments,rock-ssh,rock-workflow-forms
GROK_ITER_OK
GROK_ITER_STATUS=0
```

Curated readmission copied a disposable `grok-zero-path-probe` skill into
`GROK_HOME/skills`, excluded its canonical path from the dynamic ignores, and disabled the
observed plugin names. Both repetitions agreed:

```text
GROK_ITER_ROUND=1 COUNT=80 SOURCES=plugin:9,user:71
GROK_ITER_IGNORE_TOTAL=158 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_ROUND=2 COUNT=36 SOURCES=user:36
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_ROUND=3 COUNT=1 SOURCES=user:1
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_ROUND=4 COUNT=1 SOURCES=user:1
GROK_ITER_IGNORE_TOTAL=228 GROK_ITER_PLUGIN_DISABLE_TOTAL=3
GROK_ITER_FINAL_COUNT=1
GROK_ITER_FINAL_SOURCES=user:1
GROK_ITER_FINAL_NAMES=grok-zero-path-probe
GROK_ITER_OK
GROK_ITER_STATUS=0
```

**WP14 conclusion:** discovery is reproducible on Grok 0.2.118, auth survives, and the exact
inspect-derived session config closes the old root/plugin gap. Floor reaches zero, product-floor
launches with its 9-skill installed-plugin door surface, and curated reaches exactly one named
skill. This licenses `execSupport: "exec"` for the composed launcher route. The old negative
still applies to a bare static config or wildcard; the launcher must re-discover and accumulate
exact paths each session, and only the benchmark/curated arms may disable the observed plugin
names.

### Door smoke test

After the WP14 probe, the actual door was launched in visible pane **`w8:p12`**:

```text
node packages/grok-zero/bin/grok-zero.mjs --posture product-floor -- \
  -p "Reply with exactly: GROK_HEAVEN_OK"
```

The launcher performed the iterative inspect/config composition and spawned Grok; the session
returned:

```text
GROK_HEAVEN_OK
```
