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
| `active` | body still in context at the end of the window | loaded and no later compaction | not loaded |
| `materially_used` | work demonstrably touched the skill | a later tool call references the skill's own bundled directory (`Base directory for this skill`) | not loaded |
| `verified_outcome` | an outcome check ties the result to the skill | never set by this reader | not loaded |

`unknown` is kept wherever the trace cannot decide: a summon call that names no
skill (`unattributed[]`) leaves every candidate's `invoked` unknown; a call with no
result leaves `loaded` unknown; compaction leaves `active` unknown; later tool
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

- **Cheap-model advisory classification.** Would run only on already-redacted
  stamp output, and could only annotate; it must never raise a level to `"true"`
  or manufacture evidence. Out of scope here.
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
`Skill` tool-use, injected-body and compaction shapes are **still unprobed**: that log
contained no Skill call. Re-probe those on a pinned version before relying on
invocation-level stamps as evidence. This reader
does not touch `~/.claude` or any user config.
