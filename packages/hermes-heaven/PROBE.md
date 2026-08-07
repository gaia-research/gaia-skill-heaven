# PROBE — Hermes Agent 0.20.0 skill suppression (WP7)

**Harness:** `hermes` 0.20.0 (`Hermes Agent v0.20.0 (2026.8.3)`)
**Date:** 2026-08-07
**cwd:** `/Users/marcotiongson/sh-wt-doors`
**Visible evidence pane:** `w8:pD`
**Model/control:** `--provider openai-codex --model gpt-5.4 --reasoning low` on every successful inference probe. Reasoning was held constant; it is not a Skill Heaven posture.

## Method and authentication note

All Hermes invocations ran in the visible herdr pane above. The brief's exact commands were first run twice per cell without a provider/model override. Every run agreed, but failed before inference with:

```
hermes -z: agent failed: No access token found for Nous Portal login.
```

`hermes status` explained the failure: the configured default was `stepfun/step-3.7-flash:free` through Nous Portal, whose refresh token was invalid. An authenticated invocation was then established explicitly:

```
hermes -z "Reply exactly OK." --provider openai-codex --model gpt-5.4 --reasoning low
→ OK
```

The skill-list cells below use that fixed provider/model. Free-text self-report is not load-bearing by itself. I therefore compared it with the structured, offline `hermes skills list`, which reported **108 enabled installed skills** (`2 hub-installed, 70 builtin, 36 local`), and repeated every inference cell.

## Suppression cells

Prompt in every cell: `List every skill you have available, by name. If none, say NONE.`

### Native

```
hermes -z "List every skill you have available, by name. If none, say NONE." \
  --provider openai-codex --model gpt-5.4 --reasoning low
```

Two runs returned the installed skill names rather than `NONE`. The first omitted a count and did not reproduce the complete structured inventory; the second reported `Total: 108`. **Repeats did not agree exactly**, confirming the methodology warning about model self-report.

### `--safe-mode`

```
hermes -z "List every skill you have available, by name. If none, say NONE." \
  --safe-mode --provider openai-codex --model gpt-5.4 --reasoning low
```

Both runs returned the same installed names and `Total: 108`. **Repeats agreed.** Despite `--safe-mode` disabling customizations and implying `--ignore-rules`, it did **not** remove the skills index: the model still received the complete 108-name inventory.

### `--ignore-rules`

```
hermes -z "List every skill you have available, by name. If none, say NONE." \
  --ignore-rules --provider openai-codex --model gpt-5.4 --reasoning low
```

Both runs returned the same installed names and `Total: 108`. **Repeats agreed.** The flag may skip auto-injection of full preloaded skill bodies as documented, but it does not suppress the always-visible skills index.

### `--ignore-user-config`

```
hermes -z "List every skill you have available, by name. If none, say NONE." \
  --ignore-user-config --provider openai-codex --model gpt-5.4 --reasoning low
```

Both runs returned the same 108 installed names. One ended `Total: 108 skills.` and one added a conversational offer instead of a count. **The names agreed; formatting did not.** User-config suppression does not suppress the skills index.

### `--ignore-user-config --ignore-rules` composition

```
hermes -z "List every skill you have available, by name. If none, say NONE." \
  --ignore-user-config --ignore-rules \
  --provider openai-codex --model gpt-5.4 --reasoning low
```

Both runs returned the same 108 installed names. One added a conversational offer and one ended `Total: 108`. **The names agreed; formatting did not.** This composition suppresses user config plus auto-injected rules/memory/preloaded bodies while preserving plugins and MCP, but does not suppress the skills index.

## Harder structured signals

```
hermes skills --help
```

showed `list` as “List installed skills.”

```
hermes skills list
```

reported 108 enabled skills, with each name, source, trust, and status. `hermes prompt-size --json` reported a 10,883-byte skills index containing 107 entries in its breakdown; adding `--safe-mode` to that offline reporting subcommand produced the same values. Because `prompt-size` may not apply invocation-mode suppression flags to its simulation, this latter equality is corroborating rather than load-bearing evidence.

## Can `--skills` admit an arbitrary directory?

A disposable directory `/tmp/hermes-heaven-probe-skill` contained a valid `SKILL.md` whose only special instruction was to answer a marker question with `HERMES_PATH_SKILL_LOADED`. Exact probe, twice:

```
hermes -z "What is the path-probe marker? Reply with only the marker, or NONE if no path-probe skill is loaded." \
  --skills /tmp/hermes-heaven-probe-skill \
  --provider openai-codex --model gpt-5.4 --reasoning low
→ NONE
→ NONE
```

**Repeats agreed (`NONE` both times): arbitrary directory admission was not demonstrated.** Hermes 0.20.0 treats `--skills` as installed skill names/bundle aliases, not arbitrary filesystem directories. The help example is likewise name-based: `hermes -s hermes-agent-dev,github-auth`.

## Conclusion (negative result recorded plainly)

Hermes 0.20.0 has no demonstrated absolute-zero posture. `--safe-mode` maximally suppresses user config, rules/memory, plugins, and MCP, but the complete installed skills index remains visible (108 names in two agreeing runs). `--ignore-rules` and `--ignore-user-config` also leave it visible. Therefore floor/product-floor can only be **best-effort context suppression**, not a leak-free skill floor.

Curated cannot readmit the door's repeatable arbitrary `--skill <path>` inputs. It can only name skills already installed in the active Hermes profile, and `--ignore-rules`/`--safe-mode` document that they skip preloaded skills, so there is no demonstrated suppress-all-then-readmit primitive. The compile route must be **recipe-only**, disclose these constraints, and must not claim clean execution or measured token doses.

---

## 2026-08-07 follow-up — skill-tool gating and scoped-home clean room (WP8)

The negative findings above remain correct: none of the originally tested runtime customization flags suppresses the installed skills index. Source inspection supplied the missing explanation and two clean-room routes.

### Why the obvious flags failed

Installed Hermes 0.20.0 source shows:

- `hermes_cli/main.py:10850-10855`: `_apply_safe_mode()` sets only `HERMES_SAFE_MODE`, `HERMES_IGNORE_USER_CONFIG`, and `HERMES_IGNORE_RULES`.
- `hermes_cli/cli_agent_setup_mixin.py:509-510`: `ignore_rules` maps to `skip_context_files` and `skip_memory`; it does not alter enabled/disabled toolsets.
- `agent/system_prompt.py:299-327`: the skills prompt is built only when one of `skills_list`, `skill_view`, or `skill_manage` is in `agent.valid_tool_names`.
- `toolsets.py:195`: those three tools are exactly the `skills` toolset.
- `model_tools.py:391-424`: explicit `--toolsets` is an allowlist.
- `~/.hermes/.skills_prompt_snapshot.json` contains exactly 108 skill entries, matching `hermes skills list`.

This also establishes a documentation/behaviour mismatch: `--ignore-rules` help claims it skips “preloaded skills,” but the implementation only sets context-file/memory skips. A direct scoped-home `hermes chat --skills hermes-heaven-path-probe --ignore-rules ...` probe still loaded the marker skill and returned `HERMES_PATH_SKILL_LOADED` twice.

### Lever 1 — omit the `skills` toolset

The source-defined toolset names `terminal`, `web`, and `file` were used; none includes a skills tool. Fixed prompt `Reply exactly OK.`, fixed provider/model/reasoning, two runs:

```
hermes -z "Reply exactly OK." --toolsets terminal,web,file \
  --provider openai-codex --model gpt-5.4 --reasoning low
→ OK
→ OK
```

Hermes usage reports corroborated the source path. The default-toolset baseline had identical prompt-side usage (`input_tokens + cache_read_tokens`) of 22,089 in both runs. `--toolsets terminal,web,file` had 7,938 in both runs. These are diagnostic usage fields, not a priced Skill Heaven dose.

Exact floor composition, repeated:

```
hermes -z "Reply exactly OK." --toolsets terminal,web,file --safe-mode \
  --provider openai-codex --model gpt-5.4 --reasoning low
→ OK (prompt-side usage 7,938)
→ OK (prompt-side usage 7,938)
```

Exact product-floor composition, repeated:

```
hermes -z "Reply exactly OK." --toolsets terminal,web,file \
  --ignore-user-config --ignore-rules \
  --provider openai-codex --model gpt-5.4 --reasoning low
→ OK (prompt-side usage 7,938)
→ OK (prompt-side usage 7,938)
```

A free-text floor listing still invented four names, reinforcing the original warning that model self-report is not evidence. The load-bearing evidence is the implementation gate plus stable prompt-side usage. Both compositions authenticated and answered twice.

### Lever 2 — scoped `HERMES_HOME`

Source citations: `hermes_constants.py:63` resolves `HERMES_HOME` from the process environment; `tools/skills_sync.py:67,684-690,1269` defines and honors `HERMES_HOME/.no-bundled-skills`. No command touched the real profile.

```
SESS=$(mktemp -d)
mkdir -p "$SESS/hermes"
cp ~/.hermes/auth.json "$SESS/hermes/auth.json" 2>/dev/null
touch "$SESS/hermes/.no-bundled-skills"
```

Hard signal, twice per cell:

```
hermes skills list | tail -3
→ 2 hub-installed, 70 builtin, 36 local — 108 enabled, 0 disabled
→ 2 hub-installed, 70 builtin, 36 local — 108 enabled, 0 disabled

HERMES_HOME="$SESS/hermes" hermes skills list | tail -3
→ 0 hub-installed, 0 builtin, 0 local — 0 enabled, 0 disabled
→ 0 hub-installed, 0 builtin, 0 local — 0 enabled, 0 disabled
```

Scoped-home inference returned `NONE` twice for the skill-list prompt and `OK` twice for `Reply exactly OK.` after copying only `auth.json`. No `config.yaml` was needed; deliberately not copying it avoids re-importing behavioral customizations.

### Curated directory placement

Copying the disposable marker directory to `$SESS/hermes/skills/hermes-heaven-path-probe` changed the hard listing to `0 hub-installed, 0 builtin, 1 local — 1 enabled, 0 disabled` twice. Unlike `-z` (whose `hermes_cli/oneshot.py` path does not accept/pass a skills argument despite the top-level help), the normal chat path preloaded the copied skill correctly:

```
HERMES_HOME="$SESS/hermes" hermes chat -q "What is the path-probe marker? ..." \
  --skills hermes-heaven-path-probe --provider openai-codex --model gpt-5.4 \
  --reasoning low --quiet
→ HERMES_PATH_SKILL_LOADED
→ HERMES_PATH_SKILL_LOADED
```

**Revised conclusion:** Hermes has a verified clean floor through an explicit toolset allowlist that omits `skills`, without filesystem work. Scoped `HERMES_HOME` plus the opt-out marker is independently verified at 0 skills and enables a true curated route by copying arbitrary skill directories into the scoped profile, then preloading them by resolved name. These routes authenticate and answer, licensing live exec; no token dose is claimed.
