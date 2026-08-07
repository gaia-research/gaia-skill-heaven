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
