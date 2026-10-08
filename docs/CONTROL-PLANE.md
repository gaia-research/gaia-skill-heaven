# The control plane — one status model, many projections

**Status: design of record for the end-user pass (#161 · #162 · #163 · #164 · #165 · #166 · #137).**
Implementation guidance, not ratification — decisions stay with
`gaia-research/founder/RATIFICATION.md`; the product model it serves is N13
(`docs/LADDER-FLOW.md`). Written 2026-10-07 against `main` @ `202f174`.

The target feeling is **a calm, native control plane with just enough
instrumentation to make an intelligent runtime legible** — not a dashboard for
agent internals. Every surface below is a *projection* of one semantic model.
None of them is an authority channel, none is required for correctness, and
every one of them can be turned off without changing what Skill Heaven does.

---

## 1. The user's questions, and where each is answered

| A new user needs to know… | Answered by | Surface |
|---|---|---|
| What do I install? Is the plugin the default? | Harness-first chooser | site `/start` |
| What is a launcher, and do I need one? | "Do I need a launcher?" block — no | site `/start` |
| Which command applies to *my* harness? | Per-harness path, exact commands only | site `/start`, installer epilogue |
| What changed on my machine? How do I update / remove? | "What changed" + update + remove, per path | site `/start`, installer epilogue |
| Is my harness verified, compatible, partial or unverified? | One verification chip per harness, evidence linked | site `/start`, console Trust |
| What if I have no supported harness? | Honest empty state — Skill Heaven never installs a harness | site `/start`, installer epilogue |
| Where am I on the line? How many skills are in this session? | The status instrument | status entry (terminal + desktop) |
| What just entered context — and is it a card or the body? | The pulse + Lens band | Lens (desktop), receipt line (terminal) |
| Why that skill, from where, at which commit? | Receipt | console › Session |
| What can Skill Heaven see / what is active / what is allowed? | Scope | console › Scope |
| Which agent summoned it? | Flow | console › Flow |
| What code am I trusting by installing the console? | Trust | console › Trust |
| Is Ultra running? | The Ultra slot — **provisioned, controller unavailable** | everywhere the line renders |

## 2. The model: state, event, evidence — never collapsed

```
RUNTIME FACTS                      ONE MODEL                         PROJECTIONS
─────────────                      ─────────                         ───────────
claude-zero profile manifest ─┐                                   ┌─ terminal line   (claude-zero statusline, ANSI/256/16/NO_COLOR)
summon tool structuredContent ┼──► SkillHeavenStatus  (STATE)  ──┼─ desktop status  (console mod $.ui.status — appends, never replaces)
summon session.json           │    SummonEvent        (EVENT)    ├─ Lens band       (console mod AbovePrompt)
observed /skill-* commands    │    receipt fields     (EVIDENCE) ├─ console pane    (Session · Scope · Flow · Trust)
observed Read of SKILL.md     │                                   ├─ site prototype  (/console, fixtures, labelled FIXTURE)
observed Agent/Task calls     ┘    pure · Node-free · no I/O      └─ screen reader   (describeStatus → one sentence)
```

`packages/status` owns the model, the segment renderer, the sanitizer and the
copy. It has **no `node:` imports and no I/O**, because the console mod runs in
an environment with no Node; readers live in the door adapters. The console mod
receives it as a committed, CI-checked bundle (`npm run build:status`), the same
discipline as the MCP bundle.

**State** is what *is*: the entropy reading, skills in session, controller.
**Event** is what *happened*: a summon, a no-match, an unavailable source.
**Evidence** is the full receipt: query, surface, ranking disclosure, provenance,
commit, cache, composition, Arbor disclosure. The status line shows state, the
pulse shows an event, the receipt shows evidence. A projection may drop
information to fit; it may never promote an event into state or a retrieval
number into behaviour (#137 K6).

### 2.1 The entropy reading — what the `[TOKEN]` means

The line is `zero · low · med · high · xhigh · max · ultra`. The token in
`‹‹ [TOKEN] ››` is a **reading**, and every reading names where it came from:

| Token | Meaning | Source | Available today |
|---|---|---|---|
| `ZERO` | Skill Zero floor at boot | claude-zero profile manifest, posture `product-floor` | yes (launcher) |
| `NATIVE` | the harness's own skill loadout; no floor applied, no rung recorded | launcher posture `native`, or no launcher | yes |
| `CURATED` | launcher boot posture `curated` (named skills readmitted) | profile manifest | yes (launcher) |
| `LOW` … `MAX`, `ULTRA` | the rung the user **selected** on the line | observed `/skill-heaven [low\|med]`, `/skill-hell [high\|xhigh\|max]`, `/skill-ultra`, `/skill-zero` | console mod only (observed command) |
| `?` | nothing reports a reading | — | fallback |

A selected rung is **a preference the user expressed, observed by the console**
— it is not enforced state, and the rung commands remain stateless reference
renderers (#85/#91). The inspector says exactly that: *"You selected HIGH.
Skill Heaven does not enforce a rung; each summon is still judged per use."*
The launcher's boot dial (`--level zero|low|med`) is a different question from
the line (LADDER-FLOW "Two dials"), so a curated launch reads `CURATED`, never
`LOW`.

### 2.2 `skills N` and `summons N`

`skills N` = skills **materialized in this session** — from the summon session
manifest (`session.json`) or, in the console, from observed summon results.
Suites count their components. A no-match, a preview or an error never changes
it. `summons N` = summon calls recorded this session (full mode only).
**Unknown is rendered as unknown** (`? skills`), never as `0`.

### 2.3 Card versus context — the distinction Lens exists for

A summon returns a **card**. The card is a listing entry, not the skill body,
and not a grant. The skill **enters context** only when the agent reads the
materialized `SKILL.md`. The console observes both facts:

| Stage | Observed by | Shown as |
|---|---|---|
| `previewed` | `/lens` preview call (`preview: true`; nothing materialized — the engine still logs the query in its own session directory) | "3 candidates · nothing materialized" |
| `materialized` | summon result, `summoned[]` | "card returned · body not read" |
| `in context` | a `Read` tool call whose path is that skill's materialized `SKILL.md` | "in context · body read by main agent" |
| `unknown` | terminal/CLI projections, which cannot observe reads | "materialized · read not observed" |

The terminal never claims a skill is "in context"; it says *materialized*.

### 2.4 The Ultra slot — provisioned, not built

```ts
controller:
  | { kind: "not-selected" }
  | { kind: "unavailable" }                 // ultra selected, no controller reports state — TODAY
  | { kind: "reported"; source: "steering-trace" | "campaign"; state; effective?; progress?; transition? }
  | { kind: "fixture"; … }                  // design states only; branded, always labelled FIXTURE
```

- **Today every runtime adapter emits `not-selected` or `unavailable`.** The
  S-now steering controller (`packages/core/src/steering.ts`) is deterministic
  and replayable but is not wired to any session, and the #126 campaign state
  machine does not exist.
- The `reported` arm is the binding point for #126. Its controller vocabulary
  is the steering decision set (`HOLD · EXPLORE · RECOVER · REOPEN · CHECKPOINT
  · CLOSE · STOP`); #126 may extend it (`RECON`, `RATIFY`, `CONVERGENCE · HUMAN`
  …) by adding members — the renderer prints unknown members verbatim
  (sanitized) rather than failing.
- **`[ULTRA]` is never replaced by an effective rung.** `now HIGH ›` is a
  separate field under Ultra (#137 K9).
- **Fixtures cannot leak.** `fixture` is produced only by
  `packages/status/src/fixtures.ts`; no adapter can construct it, and every
  projection prints `FIXTURE` beside it. A test asserts both.
- Campaign progress (`34/118`) renders only from `progress` on a `reported`
  controller. Nothing computes it.

Copy, everywhere Ultra appears today:

> **Skill Ultra · provisioned.** Controller unavailable — no controller is
> choosing direction or depth yet. Ultra is the rung you selected; each summon
> is still judged per use. The long-horizon controller is tracked in #126 and is
> not yet empirically validated.

Compact: `◆ entropy ‹‹ [ULTRA] ›› · 3 skills` — full adds `· controller unavailable`.

### 2.5 Evidence classes — every field says how it is known

| Class | Meaning | Visual |
|---|---|---|
| `observed` | the console saw it happen in this session | plain |
| `reported` | the summon engine / manifest stated it | plain, source named on inspect |
| `inferred` | derived by this UI (e.g. "body not read" because no read was seen) | italic + "inferred" |
| `unknown` | no source | `—` with "unknown" text, never blank |
| `fixture` | design data | `FIXTURE` chip, never mixed with runtime rows |

`composition` is always reported as **relevance-only** today. Arbor green
(`#55C878`) appears **only** when canonical Arbor evidence changed a
composition decision, which nothing does today — so no surface draws it.

## 3. The compact grammar (#137, adopted)

```
◇ entropy ‹‹ [NATIVE] ›› · 0 skills                         compact
◇ entropy ‹‹ [HIGH] ›› · 9 skills / 5 summons · +browser-security   full
◇ ‹‹ [HIGH] ›› · 9                                         narrowest
◆ entropy ‹‹ [ULTRA] ›› · 3 skills · controller unavailable
```

Degradation drops fields from the right; **the reading is the last thing
removed**. No percentage, no score, no count-per-rung, no "4/7" (K5).

Events (two lines, the second dim):

```
◇ summoned  impeccable            ‹ summoned  react-performance       › summoned  browser-security
  exact · .96 · Δ .41 · warm · 82ms · +1     ranked · .84 · Δ .29 · warm · +1     ranked · .78 · Δ .11 · cold · 1.31s · +1
◇ summon  × no match                          › summoned  db-migrations
  0 admitted · nothing cleared the relevance floor  ranked · .88 · Δ .27 · warm · 82ms · +1 · ? index stale
```

`◇` explicit human summon (`surface: any`) · `‹` converge (`heaven`) · `›`
explore (`hell`). A no-match never changes `skills N`, the reading, or the
direction. The engine does not report how many candidates it considered, so a
no-match names its reason instead of a count. A `/lens` no-match reads
`◇ lens  × no match · … · nothing materialized`. Two band states are not events
and come from `noticeLines`: `◇ lens  looking…` while a `/lens` call is in
flight, and `◇ summon  ? not connected` when the summon tool is absent.

## 4. Visual system — one set of tokens for site, desktop, terminal

The calm **document/instrument** palette from `packages/site/DESIGN.md`, which
#137 already adopted. The animated hero keeps its louder band motif; nothing
below applies to it.

| Role | Token | Hex | ANSI-256 | Used for |
|---|---|---|---|---|
| ground | `--sh-void` | `#1b1a1c` | — | page/pane ground (desktop + site) |
| ink | `--sh-bone` | `#eeebe6` | 255 | primary text |
| dim | `--sh-dim` | `#9a9691` | 246 | secondary text (≥4.5:1 on ground) |
| umbrella | `--sh-violet` | `#a58ae0` | 141 | `◇`, focus ring, interactive |
| zero | `--sh-zero` | `#5fc2d6` | 80 | `ZERO`, floor |
| heaven | `--sh-heaven` | `#6f96d8` | 68 | `‹‹`, converge |
| hell | `--sh-hell` | `#e094c8` | 175 | `››`, explore — **never red** (K8) |
| ultra | `--sh-ultra` | `#d9b25c` | 179 | `◆`, `ULTRA` — controller, not prestige |
| arbor | `--sh-arbor` | `#55c878` | 77 | canonical Arbor evidence only (K7) |
| failure | `--sh-stop` | `#c81e1e` | 160 | real failure / policy stop only — never Hell |
| provisional | `--sh-amber` | `#e0b45c` | 179 | `PROVISIONAL`, `FIXTURE`, `PREVIEW` chips |

Rules:
- **Colour never carries meaning alone.** Every state has a glyph and a word:
  `‹‹ ››` direction, `◇/◆` umbrella/Ultra, `×` refusal, `?` unknown/stale,
  `!` error, `+name` arrival.
- Terminal colour ladder: 24-bit → ANSI-256 → 16 → `NO_COLOR` → plain; never a
  background fill across the host bar.
- Type: JetBrains Mono for every instrument string (status, receipts, commands);
  Archivo for prose on the site. The desktop pane inherits the host font —
  Claude Code draws it; we do not ship fonts into the mod.
- Motion: none in the instrument. The site's impact frame stays scoped to the
  hero; `/start` and `/console` honour `prefers-reduced-motion` and have no
  decorative motion.
- Density: one line per fact; inspect expands in place, never a modal.

## 5. Surface inventory

### 5.1 Status entry — everywhere (#137)

| Door | Integration | Class | Status |
|---|---|---|---|
| Claude Code + console mod | `$.ui.status(text)` | **APPEND** — adds an entry; never touches `statusLine` settings | preview · terminal probed live on 2.1.294 (beside a user `statusLine`) · desktop paint not probed |
| claude-zero launcher | its own session `statusLine` (door-owned session settings, nothing in `~/.claude`) | NATIVE SLOT | implemented, deterministic tests |
| Pi | `ctx.ui.setStatus(key, text)` (plugin) · `pi-zero` widget | **APPEND** (setStatus) · NATIVE SLOT (widget) | setStatus carries the canonical line (probed 1.0.4, RPC hard signal); not wired into the plugin yet |
| Codex, Hermes | no public status contribution API | UNSUPPORTED — receipts in transcript only | honest degraded |
| Grok | command-backed status line | not built | later slice |
| Antigravity | stacked status command | not built; the plugin itself is **compatible** on 1.3.1 | not built |
| Cursor | replaces native footer | REPLACE-ONLY, explicit opt-in | not built |

Mode: `SKILL_HEAVEN_STATUS=off|compact|full` (console: a config row). `off`
removes the entry; `/summon` still prints its own receipt because an explicit
action must disclose what happened.

### 5.2 Lens — the smallest prompt-time intervention (#163)

An **AbovePrompt band** that is **empty by default**. It never opens a chooser
on its own and never runs a retrieval on its own.

| Situation | Band | Actions |
|---|---|---|
| idle | nothing | — |
| `/lens <intent>` (preview) — no match | `◇ lens  × no match · 0 admitted · <reason> · nothing materialized` | Dismiss |
| `/lens` — one strong candidate | `◇ lens  impeccable · exact · nothing materialized` | Summon · Inspect · Dismiss |
| `/lens` — several plausible | `◇ lens  3 candidates · top react-performance (Δ .04 — close call)` | Inspect · Dismiss |
| explicit `/summon` result | `◇ summoned  impeccable · card returned · body not read` | Inspect · Dismiss |
| Heaven-directed result | `‹ summoned  react-performance · …` | Inspect · Dismiss |
| Hell-directed result | `› summoned  browser-security · …` | Inspect · Dismiss |
| body read | `… · in context (main agent read SKILL.md)` | Inspect · Dismiss |
| stale / unavailable source | `◇ summon  ? source stale · index 41 days old` | Inspect · Dismiss |
| summon errored | `◇ summon  ! failed · <sanitized reason>` | Inspect · Dismiss |

- **Summon** never calls anything: it pre-fills `/skill-heaven:summon <name>` into the
  composer. The person submits it. The UI is not an authority channel.
- `/lens` calls the summon tool with `preview: true` from the plugin's own
  `$.tool.call` — nothing materializes. The command's own one-line result is a
  transcript row the model reads, so it is a **fixed sentence** ("Lens preview
  shown in the band. Nothing was summoned.") that never carries skill-supplied
  text, tool error text or a deny reason; the detail lives only in the band and
  pane. If a summon server ignores `preview` and materializes anyway, the band
  shows the real summon and the console counts it — it never claims otherwise.
- The summon tool is matched by its exact names
  (`mcp__plugin_skill-heaven_skill-summon__summon`, `mcp__skill-summon__summon`),
  never a suffix, so a look-alike server is neither observed nor sent a query.
- "close call" is a **retrieval** fact (margin < .10), labelled as such; it is
  never a behavioural claim (K6, INV-U3).
- The band hides after Dismiss, after the next prompt, and whenever the host
  shows a survey.

### 5.3 Console pane — `/heaven` (#165 · #166 · #164)

One pane, four sections, opened only by the person (command or button). Never
opened unasked.

**Session (Receipt).** A timeline of this session's summon events, newest first.
Each row expands to the receipt:

```
› summoned browser-security                       12:04:31 · main agent
  what entered     card returned · body read (in context)          observed
  why              query "audit cookie handling" · surface hell · ranked
                   .78 · Δ .11 (margin is a retrieval diagnostic)   reported
  from             gaiaskilltree.com · github.com/acme/skills@3f2a91c
                   skills/browser-security · sha256 9c1e…            reported
  lane             model-led (Skill Hell)                           reported
  installability   unknown (tree published no determination)        reported
  composition      relevance-only · Arbor: no governed record       reported
  cache            cold · 1.31s                                     reported
  on disk          /tmp/skill-summon-session-…/browser-security     reported
```

**Scope.** What Skill Heaven can see, what is active, what is allowed — and how
to keep context small. No catalogue browser.

```
can see      skill source  gaiaskilltree.com (tree) · index 2026-10-01 · fresh
active       3 skills materialized this session  (temporary — gone when the session ends)
inherited    boot reading ZERO (claude-zero product floor)   or   NATIVE (your harness's own skills)
selected     rung HIGH — observed from /skill-hell high · not enforced
allowed      /summon by hand: yes · zero cut: temporary (default)
keep small   /skill-zero cuts temporary skills · claude-zero --level zero starts clean
```

Controls are **pre-fills, never silent writes**: *Choose a rung* fills
`/skill-heaven:skill-heaven low` etc.; *Cut* fills `/skill-heaven:skill-zero` (Claude Code 2.1.294 refuses the bare spellings, §10); *Start clean* copies
`claude-zero --level zero`. Repo loadouts are **designed, not built** (§7).

**Flow.** Agents and the skills they summoned, read-only.

```
main                         2 summons · 1 in context
├─ Explore  "map the auth module"        returned · 1 summon
└─ general-purpose  "write tests"        running  · no skills
```

Only agents the host reported (`agentId`, Agent/Task tool calls) appear. A
summon with no agent id is attributed to *main*. Missing telemetry is said:
*"This host did not report agent ids."* Fan-out beyond 12 agents collapses to
`+N more`.

**Trust.** What you installed and what it can do.

```
skill-heaven      0.1.2 · gaia-research/gaia-skill-heaven · bundles one MCP server (skill-summon)
console (preview) 0.1.0 · same repository · runs inside Claude Code as local code
  reads           summon tool results · your /skill-* commands · Read/Agent tool calls (to observe, never to change)
  writes          nothing to disk · session-only $.state
  network         none of its own; /lens calls the bundled summon tool, which fetches the skill source
  disable         /plugin disable skill-heaven-console — the status entry, band and pane disappear; Skill Heaven is unchanged
harness           Claude Code <version> · verified for the plugin at 2.1.288; console needs a local probe
```

No "safe/unsafe" badge, no trust score, no ranking by stars (#165 non-goal).

### 5.4 Site — `/start` (install & onboarding)

Harness first, then the exact path. One screen, no tabs to discover.

1. **Which harness are you using?** Claude Code · Codex · Pi · Grok · Hermes ·
   Antigravity · Another Agent Plugins client · *I don't have one yet*.
2. **Your path**, with a verification chip and only commands the tool accepts.
3. **What changes on your machine**, **update**, **remove** — per path.
4. **First run:** `/summon <what you need>` and what you will see.
5. **Do I need a launcher?** No. The launcher (`claude-zero` …) is the optional
   clean-start floor; the plugin works in any session.

Verification chips (the only five):

| Chip | Means |
|---|---|
| **Verified** | fresh-install receipt on a pinned version (Claude Code 2.1.288, `docs/RELEASE-ACCEPTANCE.md`) |
| **Compatible** | a live probe passed on a pinned version; your version may differ |
| **Partial** | some of the plugin loads; something is proven missing |
| **Unverified** | not probed — the package is portable, the client is untested |
| **Needs local probe** | a result we could not establish without a logged-in session |

### 5.5 Site — `/console` (inspectable prototype)

Every state of every projection above, rendered from `packages/status`
fixtures, under a permanent `FIXTURE — design states, not your session` banner.
It is the hand-off for builders and the review surface for owners.

## 6. Interaction-state matrix

| State | Status entry | Lens | Session | Scope | Flow | Trust | `/start` |
|---|---|---|---|---|---|---|---|
| empty (fresh session) | `· 0 skills` | nothing | "Nothing summoned yet. Try `/summon <need>` or `/lens <need>`." | sources shown, active: none | main · no skills | normal | — |
| loading (`/lens` in flight) | unchanged | `◇ lens  looking…` (`noticeLines`; no spinner animation) | — | — | — | — | — |
| no-match | unchanged | `× no match · N considered` | row, refusal reason | — | — | — | — |
| stale source | unchanged | `? source stale` | flag on row | "index N days old" | — | — | — |
| unavailable source | unchanged | `? source unavailable` | row with reason | "unreachable" | — | — | — |
| disconnected (summon MCP not connected) | `◇ entropy ‹‹ [..] ›› · ? skills` | "summon tool not connected" | banner | "summon tool: not connected" | — | MCP: not connected | — |
| partially supported harness | — | — | — | — | — | chip **Partial** | Antigravity path |
| degraded (no agent ids, no read events) | unchanged | "read not observed" | inferred marks | — | "host did not report agent ids" | — | — |
| error (tool errored) | unchanged | `! failed` | row with sanitized error | — | — | — | — |
| offline | reading unaffected | `? unavailable` + the engine's reason (offline is one cause of unavailable) | — | "source unreachable" | — | — | copy still works offline |
| Ultra selected | `◆ … [ULTRA]` | — | — | "selected ULTRA · controller unavailable" | — | — | — |
| Ultra fixture | site only | — | — | — | — | — | — |

## 7. Feasibility matrix (Claude Code 2.1.293 Mods, early access; runtime facts probed on 2.1.294, §10)

| Behaviour | Mechanism | Class |
|---|---|---|
| status entry without touching settings | `$.ui.status` | **probed** (terminal, 2.1.294) · desktop paint not probed |
| observe summon results | `on('tool.call')` matching the exact summon names, `await next(e)` | **probed** — `result` is the JSON text as a string; no `structuredContent` |
| observe body read | `on('tool.call', {tool:'Read'})` path ∈ materialized paths | **probed** — materialized → in context |
| observe rung selection | `on('prompt.submit')` text starts with `/skill-` or `/skill-heaven:skill-` | **probed** — raw typed text, after `command.run`; `peer` origin ignored |
| agent attribution | `agentId` on `tool.call` input; Agent/Task calls | **probed** — subagent calls and `turn.complete` carry it; Agent result carries the same id |
| preview retrieval outside model context | `$.tool.call({ tool, preview:true })` | **probed** — no count change; `$.tool.list()` names the deferred tool once MCP connected |
| pre-fill a command | `$.prompt.fill` | Mod API now |
| Lens band / console pane | `ui.render` AbovePrompt / Pane | Mod API now |
| terminal status for the launcher | claude-zero `statusLine` command | built, deterministic |
| persisted rung across projections | runtime rung state | **needs core contract** (rung commands are stateless by design, #91) |
| repo loadouts / pins / exclusions | `.skill-heaven/scope.json` read by the engine | **do not build yet** — needs a core contract that cannot become a hidden authority boundary (#166) |
| Ultra controller state | #126 campaign state / steering trace | **not built** — slot provisioned |
| Arbor-informed composition | canonical Arbor edges | **not built** — never drawn |

## 8. Delivery slices (this PR) and what waits

| Slice | Owner surface | Acceptance |
|---|---|---|
| S1 `packages/status` model + renderer + fixtures | shared | parity tests, sanitizer, width, NO_COLOR, fixture labelling |
| S2 claude-zero statusline → canonical line | terminal | old facts preserved (standing, ctx%), canonical grammar, off mode |
| S3 console mod (status · Lens · pane) | desktop | `claude plugin validate` + `claude plugin test` pass; listed as preview |
| S4 site `/start` + front-door CTAs | web | every harness path; only accepted commands; a11y |
| S5 site `/console` prototype | web | every state in §6, fixture banner |
| S6 installer epilogue | terminal | detected harnesses → next step; none detected → honest message; no mutation |

**Waits:** persisted rung contract · repo loadouts · Ultra controller (#126) ·
Arbor-informed composition · Grok/Agy/Cursor status adapters · wiring Pi's
`setStatus` (feasible, §10) · desktop paint probe of the console (NEEDS DESKTOP
PROBE: requires a user-scope install) · native Windows installer run (#94,
NEEDS WINDOWS PROBE).

## 9. Non-goals

A catalogue browser · a trust score, "safe" badge, or prestige ordering ·
automatic retrieval on every prompt · a modal chooser · any write to
`~/.claude`, settings, or the repo · the console as a requirement for
correctness · fixture data in a runtime surface · an Ultra that looks
finished.

## 10. Runtime facts pinned by a logged-in probe (PR #187, 2026-10-08)

Claude Code **2.1.294**, terminal, macOS. Only facts a hard signal showed; the evidence is in
[`plugins/skill-heaven-console/README.md`](../plugins/skill-heaven-console/README.md) and
[`plugins/skill-heaven/PROBE.md`](../plugins/skill-heaven/PROBE.md).

- An MCP tool's result on `tool.call` / `$.tool.call`: `{ ref, result, text }`, with `result` the
  JSON text as a **string**. `structuredContent` is not passed through.
- `$.tool.list()`: no MCP tools at `session.start`; once connected it names the deferred summon
  tool.
- `agentId` is present on subagent `tool.call`s and `turn.complete`, and the Agent tool's result
  carries the same id.
- For a typed slash command, `command.run` fires before `prompt.submit`, and `prompt.submit.text`
  is the raw typed text. A subagent hand-back is a `prompt.submit` with `origin.kind: "peer"`.
- A bare `/skill-zero` or `/skill-hell …` resolves to the plugin's portable skill
  (`user-invocable: false`) and is refused. `/skill-heaven:<surface>` reaches the command. Every
  pre-fill and every printed Claude command uses the qualified spelling.
- The console wrote nothing to user settings or the plugin registry. Claude Code's own background
  marketplace refresh did touch `known_marketplaces.json`.

Pi **1.0.4**: the adapter stays (its own MCP route is not equivalent under an MCP replacement
extension), and `ctx.ui.setStatus` carries the canonical line. Antigravity **1.3.1**: plugin MCP
servers load only from `mcp_config.json`; with it, the plugin is compatible.

