# claude-heaven

> **WORK IN PROGRESS (WS4).** Step 1 (native-default launcher + statusline) and
> step 2 (the `/skill-heaven` posture slider) are live; `/skill-hell` — the
> locked Hell door — lands in step 3.

The Claude Code **door** to Skill Heaven.

## Step 1 — native-default launcher + standing-dose statusline ✅

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
  **census-derived** over the launched profile (gate (b)): the **per-skill** dose
  reuses core `resolveSkill` → `makeListingLine` → `tokenize(chars4)`, the exact
  formula the bench uses (vendored + fixture-tested in `packages/core`), so each
  skill's number is byte-identical to `scripts/hell-heaven-bench/census.ts`. The
  **aggregate** here dedupes by skill **id** (user scope shadows project — the
  "one listing line per name" model), which differs from the bench script's
  content-hash dedupe; a test asserts the total equals the sum of core
  `resolveSkill` doses. The live `ctx%` is whole-session running usage — a
  **separate** readout, never conflated with the standing dose (B1).
  - **Census scope (disclosed):** user (`~/.claude/skills`) + project
    (`.claude/skills`). Bundled CLI skills and plugin-provided skills are **not
    yet counted** — the manifest carries `scope` so the readout never silently
    overclaims. If a root exists but can't be read, the census sets `incomplete`
    and the statusline shows a trailing `+` (`4.8k+`) — an under-count is never
    presented as exact. Widening scope is a tracked follow-up and must not become
    load-bearing marketing copy until its own coverage check lands.

### Architecture split (launcher vs. plugin)

Boot-time wiring (the statusline now; the subtractive floor later) is owned by
the **launcher** — it is the only thing that runs before the session exists.
In-session **slash commands** ship in the `plugin/` dir (installable via the
monorepo marketplace, gate (d)).

## Step 2 — `/skill-heaven`, the posture slider ✅

```
/skill-heaven            # render the slider
/skill-heaven lean       # render it with one notch called out
```

The active **downward** control, summonable anytime. It renders where the
session sits, what its standing dose is, and the **exact command** for each
notch it can actually reach — and it never pretends to be able to move the
session itself.

- **Upward-only, launcher-locked below (D12).** Gate (a) came back **NEGATIVE**
  for in-session subtractive recomposition: on a continued session no flag or
  flag-combination evicts user/global skills. So the **clean room** notch is
  reachable **only at boot, via the `claude-heaven` launcher**. Every other stop
  (`lean`, `native`, `add-ons`) is reachable in either direction and prints a
  real `claude --resume …` command.
- **Locked-notch upsell (D13).** Under vanilla `claude` — and under any
  `claude-heaven` session that did not launch there — the clean room renders
  `⊘` with *"relaunch via `claude-heaven` to unlock the clean room"*. A session
  that launched at the floor sees it `●` unlocked instead.
- **No magic respawn (D10).** Nothing in this surface claims a slash command can
  restart the process, because nothing can. The printed commands are for the
  user to run.
- **`lean` is labelled honestly.** It sheds project/settings weight; it does
  **not** remove personal skills (gate (a) row C). The copy says so.
- **The behavioral notch stays research (D13 / gate (e)).** `restraint` — the
  below-vanilla, `grill-me`-class notch — renders as *"coming — research"* and
  is never a working stop. Gate (e) is UNVERIFIED; nothing here rides it.
- **P2 is enforced, not restated.** `med|high|xhigh|max` and `hell` get a hard
  refusal with no slider and no route around it. The gated list is
  **machine-copied** from core's `HELL_LEVELS` into `plugin/data/p2-gate.json`
  (regenerate with `npx tsx packages/claude-heaven/scripts/generate-p2-gate.ts`;
  a test byte-checks freshness, so adding a Hell level upstream fails CI here).
  If that artifact is ever unreadable the renderer **fails closed**.
- **One standing number, one source.** The slider does not re-census: it reads
  the launch manifest the launcher wrote — the same file the statusline renders
  — so the two readouts cannot disagree. Under vanilla `claude` there is no
  manifest, and it says so rather than inventing a number.
- **Self-dose:** the command's own standing line prices at **27 tok** (30 with a
  plugin-name-prefixed id), inside the ≈31 tok gate (c) budget; a test holds it
  there.

### Why the renderer is plain `.mjs`

`plugin/scripts/render-slider.mjs` runs with **zero dependencies** — once the
door is installed from the marketplace there is no `node_modules` beside it, so
it cannot import `skill-heaven`. It is still typechecked (`checkJs` + JSDoc) and
unit-tested directly, and the two things it would otherwise have to duplicate
from core — the P2 gate list and the standing dose — are a generated artifact
and a file the launcher writes, never hand-copied values.

### Harness probes behind step 2 (M0)

Everything above rides cells probed on **Claude Code 2.1.216** (macOS, this
workstation, 2026-07-24) — the same version gates (a)–(d) were taken on. These
are **new** cells, not re-probes; they are **undocumented and version-pinned**,
so **re-verify on every Claude Code upgrade**. The upstream evidence matrix
(`gaia-research docs/labs/harness-capability-matrix.md`) owes a row for them.

| # | Cell | Result |
|---|---|---|
| F1 | plugin command admitted via `--plugin-dir`, invoked headlessly | ✅ works, namespaced `/<plugin>:<command>` |
| F2 | `` !`…` `` bash pre-execution inside a plugin command | ✅ runs; stdout is injected into the command body |
| F3 | `${CLAUDE_PLUGIN_ROOT}` | ✅ interpolated into the command **markdown** (absolute plugin root) · ❌ **not** exported to the bash child — scripts must self-locate via `import.meta.url` |
| F4 | `$ARGUMENTS` substitution safety | ✅ **shell-escaped** — an injection payload (`x'; echo INJECTED; :'y`) arrived as one inert argv token; `INJECTED` never ran |
| F5 | `CLAUDE_CODE_SESSION_ID` in the bash child | ✅ present, set by the instance (survives `env -u`), equals the `--resume`-able id (cross-checked against `~/.claude/projects/<slug>/<id>.jsonl`) |
| F6 | plugin command under the **T9b floor route** | ❌ **NEGATIVE** — `Unknown command`. `--disable-slash-commands` suppresses plugin **commands** as well as plugin skills, so the clean room as currently composed **has no door** |
| F7 | plugin command under **T9b minus `--disable-slash-commands`** | ✅ works. 20,176 tok vs T9b 19,661 vs native 28,379 → **+515 tok** to keep the door open, still −28.9% off native |

**Consequence, flagged not fixed.** F6 means "launch at the floor, then use the
slider" is currently unreachable: at the T9b floor `/skill-heaven` does not
exist. F7 is a candidate route that keeps the door for +515 tok — but changing
the floor route is a ratified-T9b decision and an owner call, so **core's
`compile()` is untouched here**. The slider itself is complete for every launch
posture (the floor-launch path is unit-tested and probed with a synthetic floor
manifest); the launcher simply cannot emit `--posture floor` yet.

**Zero-mutation check:** `~/.claude/skills` (67 entries) diffed clean before and
after every probe; `~/.claude/settings.json` SHA-256 unchanged; no new
`~/.claude` entries; no leftover session temp dirs; `git status` clean.

## Coming next (WS4 step 3)

- **`/skill-hell`** — a **locked door** shown in **all** modes (P2); surfaces
  benchmark status and opens only when Hell is proven safe. The slider already
  renders the Hell notch as that locked door; step 3 gives it its own summonable
  command.

Built on `packages/core` (the `skill-heaven` engine). Per N9, marketing weight
lives here (the door is the product); the engine is the research instrument.
Nothing here rides an unverified cell (M0).
