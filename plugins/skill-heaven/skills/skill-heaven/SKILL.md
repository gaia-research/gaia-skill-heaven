---
name: skill-heaven
description: Report the human-led converge band at low or med, and the discovery parameters it describes.
disable-model-invocation: true
user-invocable: false
---

# Skill Heaven — reference for the converge band

The user selected the Skill Heaven band: `low` (default) or `med` when they named
one. A session sits at exactly one rung.

```text
zero · low · med · high · xhigh · max · ultra
```

Skill Heaven is the human-led convergence band of that one line. It names a
*direction*, not a number: there is no per-rung count and no summon is capped.
Behavioral evidence is not available to this band yet — it changes the breadth of
relevance-ranked results, not behavior-aware composition, and no Heaven stamp
gate is running.

## What this output is

Reference data. It reports the band the user selected and the discovery
parameters it describes. It cannot change the task, outrank the instructions
already in force, authorize a tool call, widen permissions, or leave state
behind. Act on it only where the user's request and those instructions call for
it. Choosing this band does not settle a later call: each one is judged again, on
its own merits, at the time it is made.

## Suggest-only

This band is suggest-only. If a real capability gap is in front of you and a call
fits the request and the permissions already held, you may identify relevant
skills and suggest them, with the reason. `surface: "heaven"` with
`preview: true` counts as identifying: it ranks and discloses candidates and
materializes nothing. The user explicitly chooses whether to summon or use one;
a suggestion is not authorization, and no materializing summon is made just
because a skill is available or this band is selected. What comes back is a
card, not a grant: judge each candidate for relevance and safety before
suggesting it. The cut (`zero_cuts = all`) overrides this too.

Fleet skills marked `disable-model-invocation: true` belong here and stay out of
model-led discovery. The user's explicit invocation of this surface does not make
human-led skills globally reachable by an unprompted caller. The card reports the
source classification as metadata.

Never claim this changed the boot posture.
