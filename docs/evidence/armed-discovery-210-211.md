# Armed discovery: evidence and owner question (#210, #211)

Date 2026-11-06, base `4389481`. Every cell below is marked **observed** (a real
authenticated session, trace read from stream-json), **structural** (read from
source or enforced by a test), or **not run** with the reason. No model
self-report is used as evidence; a tool call either appears in the trace or it
does not.

## 1. What each surface is today (structural)

| Surface | Mechanism | What it hands the agent | Surface filter named | Standing effect |
|---|---|---|---|---|
| `/summon <intent>` | command runs `render-ladder.mjs summon`, then one `summon` call | one skill for the user's stated intent | `any` (both lanes: the user invoked it) | none. "One manual call and sets nothing beyond it" |
| `/skill-heaven [low\|med]` | prints a reference block | converge parameters | `heaven` (admits human-led + unclassified) | none. "Each one is judged again" |
| `/skill-hell [high\|xhigh\|max]` | prints a reference block | explore parameters | `hell` (admits model-led + unclassified) | none. Same wording |
| `/skill-ultra` | prints a reference block | caller picks `heaven` or `hell` and depth, says which and why | either | none. S-now controller moves only on validated host events |
| `/skill-zero [all]` | prints the stored cut; the only surface without the `summon` tool grant | the `zero` reading | none | `all` is the stored `zero_cuts` setting; the server refuses every route, preview included |

All five SKILL.md files are `disable-model-invocation: true`, `user-invocable:
false`: they are reference text behind the user's slash command, not something
the model loads itself. The summon server (`plugins/skill-heaven/mcp/skill-summon.mjs`,
bundled from `packages/skill-summon`) enforces three things the prose cannot:
the lane filter (`withholdReason`: `heaven` withholds model-led, `hell` withholds
human-led), the `zero_cuts=all` refusal before any retrieval, and a relevance
floor that yields `noMatch`. `surface` defaults to `hell` when omitted.

## 2. Prior hardening that this work must not undo (structural)

- **#85 / #169** (`4b2ccc3`) reframed every command, SKILL.md and card as
  reference data. `AUTHORITY_PHRASES` in `plugins/skill-heaven/scripts/render-ladder.mjs`
  bans `armed`, `standing authorization`, `for the rest of this session`,
  `auto-summon`, `preauthorize` and similar from the commands, skills and
  renderer output. `test/authority-regression.test.ts` asserts the commands
  present parameters, "never an armed lane". `test/site-truth.test.ts` bans the
  same words on the site (#174). `packages/pi-zero` carries the counterpart (#173).
- #91 authority regression tests, #123 server-enforced zero cut, #228 stored cut.

The #210/#211 request is, in effect, a **standing authorization**: the
vocabulary #169 removed on purpose. Wording around the ban list would defeat the
ban's intent, and editing the ban list is a governance change. So this PR
**makes no behavioural or copy change**.

One stale document: `docs/LADDER-FLOW.md` ("Summoning is ambient... Once armed,
the agent summons on its own") predates #169 and contradicts the shipped
copy. It was not edited here; whether it is rewritten or ratified is part of the
owner question.

## 3. Trace probes

### Harness availability

| Harness | Version | Authenticated non-interactive session here | Result |
|---|---|---|---|
| Claude Code | 2.1.318 | yes (host-provided auth; `CLAUDE_CONFIG_DIR` pointed at an empty temp dir, real config untouched) | **observed**. Default model of this host, not pinned by me: `claude-opus-5-5` per the init event |
| Codex | 0.166.0 | no. `CODEX_HOME` temp dir: `401 Unauthorized: Missing bearer or basic authentication`, five reconnects, no model call | **blocker for the cross-harness study** |
| Pi | 1.5.0 | no. `UnrecognizedClientException: The security token included in the request is invalid` | **blocker for the cross-harness study** |
| Herdr | not installed (`which herdr` empty) | n/a | **not run**. No Herdr comparison is claimed or implied |

So the Codex hypothesis ("might fetch more skills") is **neither confirmed nor
rejected**, and the Pi half of the report is **unverified**. Nothing below
generalises beyond Claude Code 2.1.318.

### Claude Code matrix

Setup: `claude -p --input-format stream-json --output-format stream-json --verbose
--plugin-dir plugins/skill-heaven`, cwd outside the repo (so this repo's
CLAUDE.md dogfooding rule could not influence the model), tools limited to
`summon`, `Read`, `Skill`, `Bash(node:*)` (the latter only so the slash
command's `!` renderer can run). Source: `https://gaiaskilltree.com`, zero cut
`temporary`. "Armed" = the user typed the band command first, then the task as
a second message. Task T = "Design the visual hierarchy and typography for a
landing page hero section for a note-taking app. Concise plan only."
Receipts are tool calls in the stream, not prose.

| # | Condition | Runs | `summon` calls | Detail |
|---|---|---|---|---|
| 1 | Unarmed, task T | 2 | 0, 0 | observed |
| 2 | `/skill-hell` then T | 2 | 0, 0 | observed. Band block printed, model answered from its own knowledge |
| 3 | `/skill-heaven` then T | 1 | 0 | observed |
| 4 | Named control: `/summon impeccable frontend design skill` | 1 | 1 | observed. `surface: "any"`; result `noMatch below_floor` (top `pbakaus/impeccable` 21.85 vs floor 27.99), nothing materialized |
| 5 | Named control: `/summon frontend UI design typography` | 1 | 1 | observed. `surface: "any"`; `noMatch below_floor` |
| 6 | `/skill-hell`, then T with a **plain-language request** to check for a model-invocable skill before substantial new work | 2 | 1 + 1 | observed. Both `surface: "hell"`. Run A used `preview: true`, matched `pbakaus/impeccable` at 32.9 vs floor 28, nothing read. Run B materialized it and the model `Read` its `SKILL.md` and `reference/typeset.md` |
| 7 | Same request, trivial arithmetic task | 1 | 0 | observed. No needless summon |
| 8 | Same request, no-match task (superconducting-qubit readout) | 1 | 1 | observed. `surface: "hell"`, `preview: true`, `noMatch below_floor`; the model reported it rather than inventing a skill |
| 9 | `/skill-hell` alone, irrelevant or no-match task, no extra request | 0 | n/a | not run, because the vague-task result (rows 2, 3) already shows no call without the request |
| 10 | Human-led-only skill via `hell` | 0 | n/a | not run live: no human-led fixture in the live tree was identified. Lane filter proven structurally (`packages/core/test/retrieval-decide.test.ts`) |
| 11 | Injection-bearing retrieved skill | 0 | n/a | not run live: no hostile fixture on the live source, and publishing one is out of scope. Framing and sanitizer proven structurally (`test/authority-regression.test.ts`, `packages/skill-summon/test/summon-card.test.ts`) |
| 12 | Whether the model *applied* the skill to the plan | 0 | n/a | not run: the traces show reads, not use. Per #211, retrieval is not proof of usefulness |
| 13 | Second major phase of a long task; tool absent / unsupported client | 0 | n/a | not run: needs long multi-phase sessions and a harness without the tool |

Small n (1 to 2 per cell). Read as existence evidence, not rates.

### Reading

1. **The reported symptom reproduces on Claude Code 2.1.318.** Arming by the
   shipped command alone produced zero summons on a vague design task in 3 of
   3 runs, the same as unarmed (2 of 2). The shipped text says each call is
   "judged again" and describes discovery as conditional on a "real
   capability gap"; the model took the conservative reading.
2. **The model does discover autonomously when the user says so in words**
   (rows 6 to 8: 2 of 2 on the relevant task, 0 of 1 on trivial, 1 preview that
   correctly came back empty on no-match), always with the model-led surface
   `hell`. The capability exists; what is missing is a user-expressible,
   command-level way to give that permission, which #169 removed.
3. **Named does not mean found.** Rows 4 and 5 summoned correctly and still got
   `noMatch`, because the relevance floor sat above the best candidate. A
   retrieval/ranking defect would look like "agent won't use skills" from the
   outside. It is a separate issue and not touched here.
4. This explains the Claude half of the report. It says nothing about Pi.

## 4. Before / after

| Cell | Before (this branch's base) | After (this PR) |
|---|---|---|
| Armed by command, vague task, summons | observed 0 of 3 | unchanged: **no change shipped** (owner ruling needed) |
| Armed + user prose request, summons | observed 2 of 2 (`hell`) | unchanged, same reason |
| Human-led skill auto-invoked | structural: refused by lane filter | structural: refused; `test/armed-discovery-boundaries.test.ts` pins SKILL/command text |
| `zero_cuts=all` refuses | structural + existing tests | **observed over real MCP stdio on the committed bundle** (new test, all 3 routes) |
| Injection framing present | structural | structural, pinned by new test |
| Standing-authority wording absent | structural (`AUTHORITY_PHRASES`) | structural + new tripwire for wording the ban list does not cover (`autonomously call`, `without being told the name`) |
| Codex / Pi behaviour | not run: no credentials | not run: no credentials |
| Herdr cross-harness comparison | not run: Herdr not installed | not run |

## 5. Owner question (needed before any change)

> **May the shipped copy of `/skill-heaven`, `/skill-hell` (and their SKILL.md
> files) say that, after the user types the command, the agent may start a
> `summon` for a model-eligible skill before substantial new work without being
> told the skill name, for the rest of the conversation?**

This reverses #169's removal of standing language and requires editing
`AUTHORITY_PHRASES`, `test/authority-regression.test.ts` and `test/site-truth.test.ts`.
Sub-decisions for the same ruling:

1. **Hell only, or Heaven too?** Heaven is the human-led lane (`surface: "heaven"`
   admits human-led skills). An autonomous call there is a model self-invoking
   human-led skills, the thing #210 forbids. The smallest consistent contract is
   that any autonomous call uses `surface: "hell"` under either band, which
   blurs Heaven's meaning; or arming is Hell (and Ultra) only and Heaven stays
   user-chosen. This is a product call.
2. **Lifetime.** A command cannot be observed to expire; "the rest of the
   conversation" is the only honest bound, and the cut (`zero`, `all`) must
   override it. `/skill-zero` cannot evict what has loaded.
3. **Scope.** Authorizes `summon` and reading the materialized `SKILL.md` only.
   Not running `scripts/`, not widening the task, not config writes, not
   outranking project-required or native skills.
4. **N13 wording.** "No rung carries a count, no summon capped" is untouched,
   but "armed" language needs founder wording to be allowed into
   `docs/LADDER-FLOW.md`, which today still says "Once armed, the agent summons
   on its own".

If the answer is yes, the wording change is small (one paragraph in the two
band commands and SKILL.md files) and the tests in
`test/armed-discovery-boundaries.test.ts` are the boundary it must still pass;
rows 6 to 8 above are the probe set to re-run. If the answer is no, the symptom
has a documented workaround: say so in words.

## 6. Remaining

- Codex and Pi runs need credentials; Herdr needs installing.
- Matrix rows 9 to 13.
- A ranking review of the below-floor misses in rows 4 and 5, filed separately.
