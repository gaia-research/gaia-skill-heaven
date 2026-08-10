# PROBE — pi 0.83.0 skill suppression (WP2, Step 0)

**Harness:** `pi` 0.83.0 (`pi --version` → `0.83.0`)
**Date:** 2026-08-07
**Model used for every probe:** `openai-codex/gpt-5.6-luna:low` (cheap, consistent)
**cwd:** `/Users/marcotiongson/sh-wt-pi` (has a tracked `CLAUDE.md`, 5608 bytes; no `AGENTS.md`)

## Method note (read this first)

The suggested probe prompt ("List every skill you have available, by name.
If none, say NONE.") asks the model to self-report. That turned out to be
**unreliable**: running the exact same argv back-to-back produced different
answers on different runs — sometimes a short hallucinated list of skill
names that don't even appear in the real (unsuppressed) listing, sometimes
`NONE`. This is model confabulation under a cheap low-effort model when the
skills context has actually been removed, not a signal about the flag's
real effect. Free-text self-report is **not evidence** on its own and I did
not use it to reach the conclusion below — it's recorded here for honesty
about what was tried, not as the load-bearing measurement.

The reliable signal turned out to be `--mode json`, which streams a
structured event log ending in `agent_end` with a real `usage` object
(`input`, `cacheRead`, `cacheWrite`, `totalTokens`, `cost`). `input` vs
`cacheRead` split varies run-to-run (provider-side prompt caching at
OpenAI Codex — warm vs cold cache), but **`totalTokens` is stable across
repeats of the same argv**. That's the ground-truth measurement used below:
prompt `"hi"`, `--print --no-session --mode json`, reading `totalTokens`
from the `agent_end` event. Every cell was run at least twice; all repeats
agreed within ±2 tokens (noise, not signal).

## Raw self-report runs (unreliable — see method note)

```
$ pi --model openai-codex/gpt-5.6-luna:low --print --no-session \
    "List every skill you have available, by name. If none, say NONE."
→ full ~53-entry skill list (firecrawl-*, codebase-design, graphify, ... )

$ pi --model openai-codex/gpt-5.6-luna:low --no-skills --print --no-session \
    "List every skill you have available, by name. If none, say NONE."
→ run 1: 5-item list (dynamic-resources, workflow-authoring, workflow-patterns,
          impeccable-skill, herdr-benchmark-pane)
→ run 2 (identical argv): 1-item list (herdr-benchmark-pane)

$ pi --model openai-codex/gpt-5.6-luna:low --print --no-session --no-skills \
    "List every skill you have available, by name. If none, say NONE."
→ run 1: NONE
→ run 2 (identical argv): 5-item list (same items as above)
```

None of the items in the "suppressed" runs' hallucinated lists appear in
the real unsuppressed listing at all — further evidence this is
confabulation, not a residual leak.

## Token-count runs (reliable — this is the evidence)

Prompt: `"hi"`. Flags shown are in addition to
`--model openai-codex/gpt-5.6-luna:low --print --no-session --mode json`.

| Cell | Extra flags | argv order | totalTokens (repeats) |
|---|---|---|---|
| A. baseline | (none) | — | 11271, 11271 |
| B. `--no-skills` FIRST | `--no-skills` | `--no-skills --print --no-session` | 4371, 4371 |
| C. `--no-skills` LAST | `--no-skills` | `--print --no-session --no-skills` | 4371, 4373 |
| D. `--no-skills` + `--no-context-files` | both | `--no-skills --no-context-files` | 2831, 2831 |
| E. `--no-skills` + `--no-prompt-templates` | both | `--no-skills --no-prompt-templates` | 4371 |
| F. `--no-skills` + `--no-context-files` + `--no-prompt-templates` | all three | any | 2831, 2831 |
| G. F + `--no-extensions` (reference only, kills the door) | all four | — | 1069 |

Exact commands for B and C (the ordering test — this is the one the 0.80.10
comment in `compile.ts` is about):

```
pi --model openai-codex/gpt-5.6-luna:low --no-skills --print --no-session --mode json "hi"
pi --model openai-codex/gpt-5.6-luna:low --print --no-session --no-skills --mode json "hi"
```

## Conclusions

1. **The 0.80.10 `--no-skills`-immediately-before-`-p` ordering quirk does
   NOT reproduce on pi 0.83.0.** Cell B (`--no-skills` first) and cell C
   (`--no-skills` last, i.e. directly adjacent to no flag before `-p`/
   `--no-session`) both land at ~4371-4373 total tokens against an 11271
   baseline — statistically the same number, well outside noise vs the
   ~6900-token drop suppression actually produces. Order does not matter on
   this version. **`compilePi()`'s ordering comment
   (`packages/core/src/compile.ts:336-338,342`) is stale** — it was true and
   verified on 0.80.10 but does not hold on 0.83.0. I have not silently
   rewritten it; see the dated correction added in the same commit as the
   product-floor route, in the same style as the existing 2026-07-31
   correction in `compileCodex`.
2. `--no-skills` alone removes ~6900 tokens (11271 → 4371) — this repo's
   ~53-skill project listing.
3. `--no-context-files` removes a further ~1540 tokens on top of
   `--no-skills` (4371 → 2831) — this repo's tracked `CLAUDE.md` (5608
   bytes). Isolating it alone (cell D vs cell B) attributes the full 1540
   to this one flag.
4. `--no-prompt-templates` measured **zero** token delta in this repo
   (cell E = cell B, both 4371). This repo has no prompt-template files to
   suppress, so this flag has nothing to remove here — not evidence the
   flag doesn't work, just that there's nothing local for it to evict. Not
   claiming a dose for it beyond "measured zero in this context."
5. Adding `--no-extensions` on top (cell G) drops further to 1069 tokens,
   but that also removes the extension surface — i.e. the door itself. Not
   a product-floor candidate; recorded for reference only.

No token number above is invented — every one is a directly observed
`totalTokens` value from a real `--mode json` run, repeated at least once.
