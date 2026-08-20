---
name: summon
description: Summon the best-matching skill for a concrete capability gap into this session without installing it. Use when the user explicitly invokes summon or needs one missing capability.
---

# Summon

Summon one skill into context for this session. Nothing is installed into the user's agent configuration.

## Invocation

Treat text supplied with this skill as the intent. If there is no concrete intent, print this and stop:

`/summon <intent>` — one skill into context, one session, nothing installed.

Otherwise:

1. Call the `summon` tool exactly once with the intent as `query`. Do not pass `limit` unless the user explicitly requests a depth; no summon is capped.
2. From the result, print every returned card **verbatim** before using anything from the summoned skill. The card is the disclosure and listing entry, not the skill body.
3. Read the `SKILL.md` at each card's path and follow it. Resolve sibling `references/`, `reference/`, `scripts/`, assets, and fixtures from that same materialized directory.
4. If nothing could be summoned, print what the tool reported, including skipped candidates and reasons, then stop. Do not invent a skill or retry with a reworded query.

This is one manual call and arms nothing. It remains available at every rung, including `zero`, unless the user explicitly selected the `all` cut.

Never claim a summon changed the boot posture. Never present routing as trust- or Heaven/Hell-stamp-gated; stamps are not built, so routing uses relevance ranking.
