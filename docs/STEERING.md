# S-now steering contract

Skill Ultra's S-now controller is a deterministic consumer of **explicit
behavioral events**. It is not a retrieval controller and it does not infer a
posture from ranking, refusal, score, margin, or missing catalogue data.

The public implementation is `packages/core/src/steering.ts`, exported from
`skill-zero`. It has no I/O, clock, randomness, background activity, or shared
state.

## Caller authority

The event vocabulary is a local consumer contract until an upstream behavioral
event contract exists. A trusted runtime adapter may emit:

| Event | Authority | Result |
| --- | --- | --- |
| `behavioral-failure` | `runtime` | explore one rung, bounded by `max` |
| `behavioral-recovery` | `runtime` | converge one rung, bounded by `low` |
| `checkpoint` | `runtime` or `operator` | move search to `checkpointed` |
| `close-search` | `runtime` or `operator` | close search explicitly |
| `reopen-search` | `runtime` or `operator` | reopen and explore at most one rung |
| `stop` | `runtime` or `operator` | stop explicitly |

Short wire spellings (`failure`, `recovery`, `close`, and `reopen`) are
accepted aliases. Every event must carry its authority. The parser rejects
unknown fields, malformed values, and authority not allowed for that event.

This is caller metadata, not an Arbor field and not a license to interpret
skill text. Skill cards, `SKILL.md` bodies, model prose, and retrieval results
are never parsed as events. An adapter must construct the closed event object
from its own trusted runtime observation or an explicit operator action.

## State and explanations

A state contains one operational rung (`low`, `med`, `high`, `xhigh`, or `max`)
and one search lifecycle. It never stores separate Heaven and Hell positions.
`zero` is the product floor and `ultra` is the crown/controller, so neither is
an operational rung selected by this controller.

Absent or malformed evidence is a first-class hold. A closed search does not
restart because a failure arrived; reopening is an explicit event. A stopped
search does not resume from any later event.

Each `stepSteering()` result includes:

- `signal` and the accepted wire `eventType`;
- `policyVersion`;
- structured `from` and `to` positions;
- `decision`, `direction`, and `changed`; and
- a stable explanation containing `signal`, `policy`, `from`, and `to`.

`replaySteering()` returns both steps and a trace containing the policy version
for deterministic audit and replay.

## CLI smoke path

The core CLI exercises the same public controller path without launching a
harness:

```sh
npm run launcher -- \
  --steering-event '{"type":"behavioral-failure","authority":"runtime"}' \
  --steering-state '{"rung":"med","search":"open"}'
```

It prints the decision as JSON. Steering flags are standalone and do not alter
launch posture, user configuration, or the summon ladder.

## Disclosure

Heaven and Hell remain relevance-breadth directions until canonical Arbor
interaction evidence is available. No HH stamp gate is running. The controller
implemented here does not change that degraded state or claim behavior-aware
composition.

The deterministic shape is selectively informed by the earlier controller in
issue #114, commit `4d0e2f9`; its retrieval-score inputs, thresholds, and
calibration are superseded and are not reused.
