# claude-heaven

> **WORK IN PROGRESS (WS4).** Slice 1 (native-default launcher + statusline) is
> live; the `/skill-heaven` + `/skill-hell` slash commands are not built yet.

The Claude Code **door** to Skill Heaven.

## Slice 1 — native-default launcher + standing-dose statusline ✅

```bash
claude-heaven                 # launches `claude` at native posture + statusline
claude-heaven --print         # shows the launch plan (census, argv) — no spawn
claude-heaven -- -p "hi"      # everything after `--` passes through to claude
```

- **Native default (D10).** `claude-heaven` runs Claude Code **untouched** — no
  eviction, no summoning, no flags injected beyond the statusline. It writes a
  session-scoped `--settings` file + a profile manifest to a **temp dir** and
  execs `claude`; `~/.claude` is never mutated (P3). Levels `med…max` (the Hell
  lane) **hard-error** (P2).
- **Standing-dose statusline** — renders `⚡ native · 4.8k standing` (`+ NN% ctx`
  when Claude passes live context-window usage). The standing number is
  **census-derived** over the launched profile (gate (b)): reuses core
  `resolveSkill` → `makeListingLine` → `tokenize(chars4)`, so it cross-checks
  `scripts/hell-heaven-bench/census.ts` by construction. The live `ctx%` is
  whole-session running usage — a **separate** readout, never conflated with the
  standing dose (B1 two-number discipline).
  - **Census scope (disclosed):** user (`~/.claude/skills`) + project
    (`.claude/skills`). Bundled CLI skills and plugin-provided skills are **not
    yet counted** — the manifest carries `scope` so the readout never silently
    overclaims. Widening scope is a tracked follow-up and must not become
    load-bearing marketing copy until its own coverage check lands.

### Architecture split (launcher vs. plugin)

Boot-time wiring (the statusline now; the subtractive floor later) is owned by
the **launcher** — it is the only thing that runs before the session exists.
In-session **slash commands** (`/skill-heaven`, `/skill-hell`) will ship in the
`plugin/` dir (installable via the monorepo marketplace, gate (d)). Slice 1 is
launcher-only; the plugin stays a scaffold until step 2.

## Coming next (WS4 steps 2–3)

- **`/skill-heaven`** — the posture slider: the active **downward** control,
  summonable anytime. It moves the session **upward** from the launch floor
  (additive `--plugin-dir`, bundled toggle) and **cannot physically descend
  below** it — the subtractive floor is launcher-locked (gate (a) came back
  NEGATIVE for in-session subtractive recomposition). Under `claude-heaven`
  the lower notches unlock; under vanilla `claude` they render as a
  **locked-notch upsell** ("relaunch via `claude-heaven` to unlock the clean
  room").
- **`/skill-hell`** — a **locked door** shown in **all** modes (P2); surfaces
  benchmark status and opens only when Hell is proven safe.

Built on `packages/core` (the `skill-heaven` engine). Per N9, marketing weight
lives here (the door is the product); the engine is the research instrument.

The `plugin/` dir holds the Claude plugin manifest; the commands and statusline
assets land in WS4. Nothing here rides an unverified cell (M0).
