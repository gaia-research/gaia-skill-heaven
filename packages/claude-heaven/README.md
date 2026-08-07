# claude-heaven

> **WORK IN PROGRESS (WS4).** Step 1 (native-default launcher + statusline) and
> step 2 (the `/skill-heaven` posture command) are live, and the launcher now
> composes `curated` and `product-floor` as well as `native`; `/skill-hell` —
> the locked Hell door — lands in step 3.

The Claude Code **door** to Skill Heaven.

## The launcher — native by default, composed postures on request ✅

```bash
claude-heaven                 # launches `claude` at native posture + statusline
claude-heaven --print         # shows the launch plan (census, argv) — no spawn
claude-heaven -- -p "hi"      # everything after `--` passes through to claude

# the composed postures (the door calls core's compiler; it composes nothing itself)
claude-heaven --posture curated --skill ./skills/impeccable [--skill …]
claude-heaven --posture product-floor
```

- **`--posture`** takes `native` (default), `curated`, or `product-floor`. The
  doorless benchmark **`floor` is refused**: F6 established that
  `--disable-slash-commands` suppresses plugin *commands* too, so a door that
  launched it would be launching a session it cannot then talk to. It is core's
  to compose, for measurement runs only.
- **`--skill <path>`** is repeatable and takes a `SKILL.md` or its directory.
  Required by `curated`, rejected everywhere else — a dropped `--skill` would
  hand you a session quietly missing the skills you asked for. The id comes from
  frontmatter `name`, falling back to the directory name (core's `resolveSkill`).
- **Everything is composed by `packages/core`.** The launcher calls `compile()`,
  substitutes core's `$SESSION` placeholder, `materialize()`s the returned
  `fsPlan` into the session temp dir, and appends its own `--settings` file for
  the statusline. It never edits the compiled argv: if a route is wrong, it is
  wrong in core. `--print` shows the `fsPlan` and core's route notes verbatim.
- **P3 holds at every posture.** Every write lands in the session temp dir,
  including the materialized curated set — `copyDir` reads the source skill and
  writes the session copy, so no skill source is ever mutated, and `~/.claude` is
  never touched.

- **Native default (P1/P3).** `claude-heaven` runs Claude Code **untouched** — no
  eviction, no summoning, no flags injected beyond the statusline. It writes a
  session-scoped `--settings` file + a profile manifest to a **temp dir** and
  execs `claude`; `~/.claude` is never mutated (P3). Levels `med…max` (the Hell
  lane) **hard-error** (P2).
- **Standing-dose statusline** — renders
  `⚡ native · 4.8k standing (excl. bundled/plugin)` (`+ NN% ctx` when Claude
  passes live context-window usage). The standing number is **census-derived**
  over the launched profile (gate (b)): the **per-skill** dose reuses core
  `resolveSkill` → `makeListingLine` → `tokenize(chars4)`, the exact formula the
  bench uses (vendored + fixture-tested in `packages/core`), so each skill's
  number is byte-identical to `scripts/hell-heaven-bench/census.ts`. The
  **aggregate** here dedupes by skill **id** (user scope shadows project — the
  "one listing line per name" model), which differs from the bench script's
  content-hash dedupe; a test asserts the total equals the sum of core
  `resolveSkill` doses. The live `ctx%` is whole-session running usage — a
  **separate** readout, never conflated with the standing dose (B1).
  - **Census scope (disclosed, KC2 — Issue #9):** user (`~/.claude/skills`) +
    project (`.claude/skills`). Bundled CLI skills and plugin-provided skills
    are **not yet counted, and every surface that renders the standing dose
    says so** — a scope *name* alone ("user+project scope") does not tell a
    reader what is missing, so the exclusion itself is spelled out, not just
    implied: the statusline strip carries the compact `(excl. bundled/plugin)`
    form, `/skill-heaven`'s session line carries the fuller sentence
    ("`bundled CLI skills and plugin-provided skills are not counted`"), and
    this README states it in full. This is a **skills-only, two-root** figure —
    never "everything in context" — and non-native postures (`curated`,
    `product-floor`) carry `scope: "session"` instead: those enumerate the
    launched set exactly, and the session listing caveat discloses the bundled
    `doctor` residual that survives the harness's suppression knob. If a root
    exists but can't be read, the census sets `incomplete` and the statusline
    shows a trailing `+` (`4.8k+`) — an under-count is never presented as exact.
    Widening scope (counting bundled or plugin-provided skills) is a tracked
    follow-up and must not become load-bearing marketing copy until its own
    coverage check lands.

### Architecture split (launcher vs. plugin)

Boot-time wiring (the statusline, and the subtractive postures) is owned by
the **launcher** — it is the only thing that runs before the session exists.
In-session **slash commands** ship in the `plugin/` dir (installable via the
monorepo marketplace, gate (d)).

## Step 2 — `/skill-heaven`, the posture command ✅

```
/skill-heaven            # render the postures
/skill-heaven native     # render with one posture pointed out
```

The active **downward** control, summonable anytime. It renders where the
session sits, what its standing dose is, and the **exact command** for each
posture it can actually reach — and it never pretends to be able to move the
session itself.

- **Upward-only, launcher-locked below (D12).** Gate (a) came back **NEGATIVE**
  for in-session subtractive recomposition: on a continued session no flag or
  flag-combination evicts user/global skills. So the **clean room** is
  reachable **only at boot**. `native` is reachable in either direction and
  prints a real `claude --resume …` command.
- **Only ratified postures get a row.** The row set is `hell` (the gated lane
  marker core owns) plus postures core actually knows. An earlier draft carried
  **`lean`** and **`add-ons`** stops; both are **retired** — neither is a
  ratified term and neither is a posture, so they were in-session flag moves
  wearing posture clothing on a shipped control surface. They are gone with **no
  replacement**: the concept, not just the word. `/skill-heaven lean` gets the
  ordinary unknown-name miss rather than a bespoke explanation, so the retired
  word does not survive in shipped copy. A test holds the whole row set against
  core's `POSTURES`.
- **The control has no noun — deliberately.** The step-2 draft's names for this
  surface and for its stops are both banned in the federation lexicon (retired
  2026-07-24, oracle N1/N5), and the listed replacements (`ladder`/`rung`) name
  the `off…max` ladder — a *different* control. The name of this surface is
  open (founder ruling R2, 2026-07-29), so the copy lists the postures and
  describes moves without naming the widget, and the internals say "row".
- **A core-known posture name is never an unknown word.** One rule, no per-name
  prose: a name in core's `POSTURES` that has no row answers "not offered
  here" — with no claim about what it is or when that might change (`curated`'s
  standing is open, founder ruling R3) — and anything else is unknown. The
  posture list is machine-copied beside the P2 gate list into
  `plugin/data/p2-gate.json`; a freshness test byte-checks it.
- **The clean room is the PRODUCT floor, not the benchmark floor (V5-5).** Since
  the floor split landed, `POSTURES` carries both. The clean room here is
  **`product-floor`** — the doorful route keeps `--disable-slash-commands`
  absent and uses P8's empty setting-sources allowlist, with the locked F7
  evidence pricing the door at **+515 tok**. The doorless **benchmark** `floor`
  is the **placebo-of-record (B2)** and has no door to slide (F6), so it is
  deliberately **not a row**; the footer states the shipped mechanism fact —
  slash commands are off there, so this command does not exist there — and
  `/skill-heaven floor` answers "not offered here" rather than rendering a real
  posture name as an unknown word. The
  two floors are always priced as **separate arms (B1)** — never averaged. No
  path in this package records a benchmark arm at all; `--arm placebo` lives in
  core's CLI and is valid only at `--posture floor` (a test pins the absence).
- **Locked clean-room upsell (D12) — locked, with the boot command behind it.**
  Under vanilla `claude`, and under any `claude-heaven` session that did not
  launch there, the clean room renders `⊘` and says *why*: composed at boot,
  never mid-session. A session that launched at the **product floor** sees it
  `●` unlocked instead.
  - An earlier draft told the locked session to *"relaunch via `claude-heaven`"*
    while `src/cli.ts` refused every `--posture` outside `LAUNCHABLE_POSTURES`
    with a non-zero exit. Offering a door the tool then slams is claiming a
    transition the harness cannot perform (**KC7**). Of the two honest fixes —
    stop offering it, or widen what the CLI accepts — the offer was withdrawn
    until the CLI was widened. It has been, so the offer is back, and
    it is **derived** rather than hand-listed: `RELAUNCH_OFFERS` is the
    intersection of rows carrying a bare relaunch command with a machine-copy of
    `LAUNCHABLE_POSTURES` in `plugin/data/p2-gate.json`. Drop a posture from the
    CLI array, regenerate, and the offer withdraws itself — the affordance
    cannot outlive the capability. A test runs the **real CLI validator** over
    every entry, and the renderer **fails closed** to no offers at all if the
    artifact is unreadable.
  - **Every printed relaunch carries the D12 caveat** on the very next line:
    *"(a new session — this conversation does not carry over)"*. D12 makes
    subtractive recomposition and history survival mutually exclusive, so a boot
    into the clean room **cannot** bring the conversation. Printing the command
    without saying so would be offering a door while silently dropping the
    user's history — the KC7 defect in its purest form. The footer describes the
    two command shapes separately for the same reason: `claude --resume` carries
    the conversation, `claude-heaven` does not, and no single sentence is true of
    both.
  - **`curated` is launchable but still not offered here.** A curated launch
    needs a `--skill <path>` per skill, so the bare command this surface would
    print is **refused** by the CLI — offering it would be the very defect the
    offers map exists to prevent. Its row status also stays **open** (R3); the
    curated door is the CLI, not an affordance on this surface.
- **No magic respawn (D12 / B4).** Nothing in this surface claims a slash command
  can restart the process, because nothing can, and D12 rules the in-session
  control upward-only. The printed commands are for the user to run.
- **No behavioral row ships.** An earlier draft carried a below-vanilla
  `restraint` row rendered as *"coming — research"*, on the authority of the now
  **retired D13**. D13 was retired 2026-07-24 (never-reused list), gate (e) is
  still UNVERIFIED, and RATIFICATION.md OPEN 1 has an open proposal that behavioral
  restraint is *behavioral, not positional* — possibly not a posture stop at
  all. The
  row is gone rather than re-bound to nothing. Its absence is not a ruling on
  where restraint eventually lives; OPEN 1 and OPEN 3 stay open.
- **P2 is enforced, not restated.** `med|high|xhigh|max` and `hell` get a hard
  refusal with no posture list and no route around it. The gated list is
  **machine-copied** from core's `HELL_LEVELS` into `plugin/data/p2-gate.json`
  (regenerate with `npx tsx packages/claude-heaven/scripts/generate-p2-gate.ts`;
  a test byte-checks freshness, so adding a Hell level upstream fails CI here).
  If that artifact is ever unreadable the renderer **fails closed**.
- **One standing number, one source.** This surface does not re-census: it reads
  the launch manifest the launcher wrote — the same file the statusline renders
  — so the two readouts cannot disagree. Under vanilla `claude` there is no
  manifest, and it says so rather than inventing a number.
- **Self-dose:** the command's own standing line prices at **24 tok** (28 with a
  plugin-name-prefixed id), inside the ≈31 tok gate (c) budget; a test holds it
  there.

### Why the renderer is plain `.mjs`

`plugin/scripts/render-posture.mjs` runs with **zero dependencies** — once the
door is installed from the marketplace there is no `node_modules` beside it, so
it cannot import `skill-heaven`. It is still typechecked (`checkJs` + JSDoc) and
unit-tested directly, and the two things it would otherwise have to duplicate
from core — the P2 gate list plus the core posture list, and the standing dose
— are a generated artifact and a file the launcher writes, never hand-copied
values.

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

**Consequence, since resolved upstream.** F6 meant "launch at the floor, then
adjust from inside" was unreachable: at the T9b floor `/skill-heaven` does not
exist. That was an owner call, and the owner made it — **V5-5** split the floor
in two and **PR #14** landed it in `packages/core`. The doorless floor keeps its
byte-frozen T9b route as the placebo-of-record; the **F7 route is now a real,
separately-named posture**, `product-floor`. This package targets that one. Core's
`compile()` remains the single source of route composition; this package never
re-derives its flags, exactly as D9 requires.

**Zero-mutation check:** `~/.claude/skills` (67 entries) diffed clean before and
after every probe; `~/.claude/settings.json` SHA-256 unchanged; no new
`~/.claude` entries; no leftover session temp dirs; `git status` clean.

## KC6 — every refusal says which kind of "no" it is (Issue #12)

Two refusals used to read alike and are not alike:

1. **Gated by policy.** The Hell lane (`med|high|xhigh|max`, `/skill-hell`) is
   technically composable but deliberately locked behind P2 until it is proven
   safe. A key exists and can turn. Every Hell-lane refusal — `assertLevelAllowed`
   in `src/launcher.ts`, the `--level` lane in core's `src/cli.ts`, and
   `refusal()` in `plugin/scripts/render-posture.mjs` — now says **"withheld by
   policy, not a harness limit"** (or the row equivalent, **"policy hold, not a
   harness limit"**) in the message itself, not just in a comment.
2. **The harness cannot do it.** No key exists at all — nothing was decided to
   withhold. Three instances, all now labeled the same way in their own text:
   - The doorless benchmark `floor` is not launchable by `claude-heaven`
     (`src/cli.ts`): F6 established `--disable-slash-commands` suppresses
     plugin **commands** too, so a door launched there has nothing to talk to.
     The refusal says **"not a policy hold"** and cites F6 by name.
   - The clean room (`product-floor`) is reachable only at **boot**, never
     mid-session (D12): gate (a) came back NEGATIVE — no flag combination
     evicts skills on a running session. The locked row and the footer both
     say **"not a policy hold, a harness limit"**.
   - `product-floor` on a non-`claude` harness, and every non-native posture on
     `grok` (`packages/core/src/compile.ts`): no verified cell / mechanism
     exists. Both refusals now say **"harness-capability gap, not a policy
     hold"**.

Telling a user "locked" when the truth is "impossible" implies a key that does
not exist; telling them "impossible" when it is policy hides a decision behind
physics. Every refusal surface above now says which one it is, in its own
printed text — not only in source comments a user never sees.

### The curated door-absence disclosure

A **known honesty exposure**, flagged (not improvised around) in PR #18: a
curated launch composes `--setting-sources ''` (an intentionally empty
allowlist — the KC4 clean-room fix, 2026-07-30, superseding the earlier
`--setting-sources project`), which drops **every** setting-sourced install,
user scope included, and core mounts **only** `$SESSION/heaven-set` as
the sole `--plugin-dir` — the door's own plugin is never re-admitted. So
`/skill-heaven` does not exist inside a curated session. This is **neither**
of the two refusal classes above: it is not withheld by policy, and it is not
proven harness-incapable either (`--plugin-dir` is documented as repeatable,
so mounting the door alongside the curated set would likely work) — core just
refuses to guess an unprobed composition (M0 discipline), same restraint as
everywhere else in this door.

Once a curated session is running, nothing inside it can disclose this —
that is the exposure. So it is disclosed **at compose time**, the last moment
the door still exists to say so:

- `planLaunch()` (`src/launcher.ts`) appends the disclosure to the plan's
  `notes`, so `--print`'s JSON carries it for anyone inspecting the plan
  before launch.
- A **real** (non-`--print`) curated launch (`src/cli.ts`) prints the same
  note to stderr, on the CLI's own terminal, immediately before `claude`
  spawns — the only point left where the user is still looking at
  `claude-heaven` rather than at the session it started.

Nothing here mounts a second `--plugin-dir` to make `/skill-heaven` appear in
a curated session — that would be inventing a mechanism core has not probed.
Use `--posture product-floor` if in-session posture control matters more than
a curated skill set for a given session.

## Coming next (WS4 step 3)

- **`/skill-hell`** — a **locked door** shown in **all** modes (P2); surfaces
  benchmark status and opens only when Hell is proven safe. `/skill-heaven`
  already renders the Hell row as that locked door; step 3 gives it its own summonable
  command.

Built on `packages/core` (the `skill-heaven` engine). Per N9, marketing weight
lives here (the door is the product); the engine is the research instrument.
Nothing here rides an unverified cell (M0).
