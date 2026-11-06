# skill-ultra-stamp/v1

A local, opt-in, read-only reader that turns one user-selected Claude Code
transcript JSONL into **stamps**: per-skill observations of what the trace shows.
Implementation: `packages/core/src/ultra-stamp/` (contract + validator in
`contract.ts`, reader in `stamp.ts`). Issue #208.

## Use

```bash
export US_SALT='<your own secret salt>'          # supplied by you, never stored
skill-zero --ultra-stamp session.jsonl --ultra-stamp-salt-env US_SALT \
  [--ultra-stamp-skill alpha-skill=path/to/SKILL.md]... [--ultra-stamp-out stamps.json]
skill-zero --ultra-stamp-validate stamps.json
```

The flags are standalone (they refuse to combine with launch, record, telemetry
or steering flags). The reader does no network calls, uploads, hooks or model
calls, and writes nothing except the `--ultra-stamp-out` file you name.
`--ultra-stamp-skill` hashes `SKILL.md` with the vendored `contentSha256`
(`sha256(SKILL.md)`) into `sourceDigest`; the path is never emitted. Without it
`sourceDigest` is `null` (unknown).

## Levels

Six levels, each an independent tri-state `"true" | "false" | "unknown"` (strings,
so `"unknown"` cannot be coerced by truthiness) with its own `confidence`
(`high|medium|low|none`) and its own `evidence` refs (`{line, uuid?, kind}`: 1-based
JSONL line, event uuid, and an enum kind; never content).

| Level | Meaning | `true` when | `false` when |
|---|---|---|---|
| `installed` | available to the session | skill is in a `skill_listing` attachment (high) or user-pinned via `--ultra-stamp-skill` (medium) | a listing exists and omits it |
| `loaded` | the skill **body** entered context (the listing line does not count) | a `Skill`/summon `tool_use` got a non-error `tool_result` (high if the body-injection event is also seen) | call returned an error, or the skill was never invoked |
| `invoked` | the model or user actually called it | attributed `Skill`/summon `tool_use`, or a user `/command` naming a known skill | no call in a transcript that has assistant turns |
| `active` | body still in context at the end of the window | loaded and no later compaction; or, after a compaction, the boundary lists the body event as preserved verbatim, or the body is re-injected after it, or the skill is invoked again | not loaded |
| `materially_used` | work demonstrably touched the skill | a later tool call references the skill's own bundled directory (`Base directory for this skill`) | not loaded |
| `verified_outcome` | an outcome check ties the result to the skill | never set by this reader | not loaded |

`unknown` is kept wherever the trace cannot decide: a summon call that names no
skill (`unattributed[]`) leaves every candidate's `invoked` unknown; a call with no
result leaves `loaded` unknown; a compaction after the load with no preserved or re-injected body leaves `active` unknown (the summary text is never evidence; `invoked`/`loaded` stay true); later tool
calls without a bundled-directory reference leave `materially_used` unknown. A
skill name in plain text (prompt or reply) is never evidence.

Other fields: canonical `skillId` (regex-bounded), `sourceDigest`, `activationMode`
(`skill-tool|summon|user-slash|listing-only|none|unknown`), session-level
`sessionPseudonym` (`usp_` + HMAC-SHA256(your salt, session id)), `observer`
(name, version, parser `claude-code-jsonl/1`), `harness`, `models`, and `source`
counts. Manifest refs use `line: 1` as a placeholder (the pin came from you, not
from the transcript). Normative validator: `validateUltraStamp`.

## Redaction

Output is built only from enums, integers, regex-bounded ids, hex digests and
line numbers; transcript text is read to decide and never copied. Tests scan the
output of every fixture for planted secrets, emails and paths. A skill id
supplied by the transcript is emitted if it matches the id pattern, so
**review stamps before sharing them**; the stamper cannot tell a skill name from
a name that happens to be sensitive.

## Arbor boundary

Stamps are **inputs, not Arbor claims**. They make no statement about a skill's
quality, rank, or trust, and nothing here causes an auto-rank or Trust Magnitude
mutation. Arbor (gaia-skill-tree#2065; research side gaia-research#295) keeps its
own governed evidence and interpretation contracts. The fields Arbor would
consume are `skillId`, `sourceDigest` (to pin the stamp to a specific
`SKILL.md`), the six `levels` with their `confidence` and `evidence`, and
`observer`/`harness`/`models`/`sessionPseudonym` for provenance and de-duplication.
This repo does not read or modify those repos; the contract above is the boundary.

## Not implemented (seams)

- **`verified_outcome`** needs an external outcome check (tests, reviewer).
- **Graft vs Graft + Context Mode trial telemetry and cost accounting.** Cost
  must come from `gaia-research/skill-cost`, not from this reader.
- **Other harnesses' transcript shapes.** One parser, `claude-code-jsonl/1`.

## Evidence level and M0

Parser behaviour is verified against **synthetic fixtures only**
(`packages/core/test/fixtures/ultra-stamp/`). The transcript field names it reads
(`attachment.type == "skill_listing"`, `Skill` `tool_use.input.skill`, `tool_result`
with `tool_use_id`, `isMeta` body injection, `compact_boundary`) are written from
knowledge of the format, not re-probed against a pinned Claude Code build in this
change, so format drift degrades to `unknown`/`false` rather than being detected.
**Partial re-probe, Claude Code 2.1.318 (2026-11-06).** The `skill_listing` attachment
was checked against a real local 2.1.318 session log. Only field names and shapes were
inspected and nothing from it was committed. That log carries a structured
`names: string[]` beside the rendered `content`, and rendered lines can take a
parenthetical source (`- id (plugin): …`). The reader now prefers `names` and accepts
the parenthetical; see `listing-2.1.318-shape.jsonl`. Stamping that log listed 140
skills and found 0 invocations, which matches a session that made no Skill calls. The
`Skill` tool-use shape was then probed in a real session (below). The compaction
shape was probed afterwards (below).

**Invocation probe, Claude Code 2.1.318 (2026-11-06).** This was a real authenticated
`claude -p` with a throwaway `HOME`/`CLAUDE_CONFIG_DIR`, `--model haiku` and
`--allowedTools Skill`. A temp project held two synthetic skills: `fixture-greeter`,
which the prompt asked for, and `fixture-unused`, which was never relevant. The
stream showed `tool_use Skill {"skill":"fixture-greeter"}` followed by a non-error
`tool_result`. The persisted log contained one `skill_listing` attachment and one
`user` `isMeta` entry, the injected body. `skill-zero --ultra-stamp` on that log,
with `--ultra-stamp-skill fixture-greeter=<path>`, produced:

| skill | activation | installed | loaded | invoked | active | materially_used | verified_outcome |
|---|---|---|---|---|---|---|---|
| `fixture-greeter` | `skill-tool` | true (high) | true (high) | true (high) | true (medium) | **unknown** | **unknown** |
| `fixture-unused` | `listing-only` | true (high) | false | false | false | false | false |

`unattributed: 0`, and the output passes `--ultra-stamp-validate`. The account's
other listed skills also stamp as `listing-only`. `materially_used` stays `unknown`
even though the reply was the skill's exact phrase. That is the intended behaviour:
the stamper does not read reply text, so a match there is not evidence. Nothing from
the probe log is committed. Re-probe on each Claude Code upgrade. This reader
does not touch `~/.claude` or any user config.

## Compaction probe, Claude Code 2.1.318 (2026-11-06)

Real authenticated sessions, throwaway `HOME`/`CLAUDE_CONFIG_DIR`, synthetic prompts,
and a synthetic plugin (`fixture-plug` with skills `fixture-greeter` and `fixture-unused`)
loaded with `--plugin-dir`. Structure only was inspected; nothing from the logs is committed.

```
claude -p "Use the fixture-greeter skill and reply with its phrase." --plugin-dir <plug> \
  --model haiku --allowedTools Skill --output-format json --max-turns 4
claude -p "/compact" --resume <session-id> --plugin-dir <plug> --model haiku \
  --output-format json --max-turns 2
```

`/compact` in a headless `-p` turn on `--resume` works, and appends to the same JSONL
(`trigger: "manual"`). Observed shape, after the Skill `tool_use`/`tool_result`/`isMeta`
body (the tool_use input names the skill namespaced, `fixture-plug:fixture-greeter`):

| entry | shape |
|---|---|
| boundary | `type:"system", subtype:"compact_boundary", level:"info", logicalParentUuid, parentUuid:null, compactMetadata:{trigger, preTokens, postTokens, durationMs, cumulativeDroppedTokens, preservedSegment:{headUuid,anchorUuid,tailUuid}, preservedMessages:{anchorUuid, uuids[], allUuids[]}}` |
| summary | next `user` entry, `isCompactSummary:true, isVisibleInTranscriptOnly:true`, string content |
| command echo | `isMeta` `<local-command-caveat>`, `<command-name>/compact`, `<local-command-stdout>` user entries |
| listing | a fresh `skill_listing` attachment (`isInitial:true`, `names[]`, `digests[]`) after the boundary |

What survived: the preserved set held only the last assistant turn. The Skill
`tool_use`, its `tool_result` and the `isMeta` body were **not** preserved and the body
was **not** re-injected. The summary text mentioned the skill's reply phrase, which is
prose and not evidence. `compactMetadata` carries uuids only.

Stamper behaviour (observer 1.1.0, fixture `compaction-2.1.318-shape.jsonl`, synthetic content, faithful structure):
`invoked`/`loaded` stay true; `active` is `unknown` (low) citing a `compaction` ref;
`active` becomes `true` (medium) only on (a) the body event's uuid in the boundary's
`preservedMessages` (`compaction-preserved` evidence), (b) an `isMeta` body after the boundary with the
same `Base directory for this skill`, or (c) a fresh successful invocation after the boundary.
The listing re-emission is not an invocation. Two evidence kinds were added
(`compaction-preserved`, `body-reinjection`); the schema id stays `skill-ultra-stamp/v1`. The
change is additive, but a v1 validator from before observer 1.1.0 rejects those kinds and the
`advisory` key. Re-injection (b) and preservation (a) are covered by synthetic variants only; no real session showed either.

## Advisory adapter (opt-in, model-judged)

```bash
skill-zero --ultra-stamp session.jsonl --ultra-stamp-salt-env US_SALT \
  --advisory --advisory-runner claude-haiku [--advisory-skill ID] [--advisory-max-chars N] [--advisory-timeout-ms N]
```

Implementation: `packages/core/src/ultra-stamp/advisory.ts`. It adds an optional per-skill
`advisory` object and touches nothing else: `levels`, evidence and `activationMode` are
carried through unchanged, so it can never set `materially_used` or `verified_outcome` in
either direction (tested). Those still come from evidence only.

- Shape (enums only, no free text): `{label:"advisory-model-judged", status: ok|malformed|timeout|runner-error|no-excerpt, materiallyUsedJudgement: used|not_used|unknown, confidence, reason, model, excerptChars}`. The vocabulary differs from the tri-state on purpose.
- Eligible: skills with `loaded` true. One runner call per eligible skill, no retry, at most 3 skills (`maxCalls`).
- Input: a deterministic excerpt from the skill's load onward, default cap 6000 chars (hard max 20000), per-line clips, skill bodies and compaction summaries replaced by markers, best-effort pattern redaction (emails, URLs, paths, token-like strings, long blobs). Redaction is not a guarantee; review before using on real sessions.
- Output: parsed against a closed JSON schema (exactly three known keys, closed enums). Anything else is `malformed`, judged `unknown`. Timeouts and runner errors are `unknown` with a status.
- The runner is an injected function (`AdvisoryRunner`), so tests run offline with a fake. The one built-in, `claudeHaikuRunner`, spawns `claude -p --model haiku --output-format json --tools "" --disable-slash-commands --strict-mcp-config --mcp-config '{"mcpServers":{}}' --no-session-persistence --max-turns 1 --system-prompt <classifier>` with the prompt on stdin, in a mkdtemp `HOME`/`CLAUDE_CONFIG_DIR` that is removed afterwards. `--tools ""` removes built-ins only and leaves MCP, hence the explicit empty MCP config (docs/evidence/tools-147/PROBE.md, A1/A2).
- Usage from the JSON result is printed to stderr as model-reported and not a cost basis (`skill-cost` is).

Real run (Claude Code 2.1.318, synthetic fixture `true-invocation.jsonl`, 154-char excerpt): status `ok`,
judgement `unknown`, confidence `low`, reason `insufficient-excerpt`; the stamp's `materially_used` stayed
`true` (medium) and `verified_outcome` `unknown`, both from evidence. Usage: 2 input, 1706 cache-creation, 0 cache-read, 35 output tokens. The output validates.
