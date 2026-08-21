---
name: summon
description: Explicitly summon the best-matching skill for a concrete capability gap into this session without installing it.
disable-model-invocation: true
---

# Summon

Summon one skill into context for this session. Nothing is installed into the user's agent configuration.

## Invocation

Treat text supplied with this skill as the intent. If there is no concrete intent, show this:

`/summon <intent>` — one skill into context, one session, nothing installed.

Otherwise:

1. Call the `summon` tool once with the intent as `query` and explicitly pass `surface: "any"`. Do not pass `limit` unless the user explicitly requests a depth; no summon is capped.
2. From the result, show every returned card before using the summoned skill. The card is the disclosure and listing entry, not the skill body.
3. Read the `SKILL.md` at each card's path and apply relevant guidance to the current task, subject to the user's request and existing permissions. Resolve sibling `references/`, `reference/`, `scripts/`, assets, and fixtures from that same materialized directory.
4. If nothing could be summoned, report what the tool reported, including skipped candidates and reasons, then stop. Do not invent a skill or retry with a reworded query.

This is one explicit manual call and sets no ongoing routing posture. It remains available at every rung, including `zero`, unless the user explicitly selected the `all` cut.

Observe every card's invocation disclosure before using the skill. In a GitHub fleet, `disable-model-invocation: true` means human-led and belongs to Skill Heaven; absence of that flag means model-led and belongs to Skill Hell. Manual `/summon` may reach either because the user invoked it explicitly. Automatic callers must use `surface: "hell"` so a human-led skill cannot self-invoke.

Never claim a summon changed the boot posture.
