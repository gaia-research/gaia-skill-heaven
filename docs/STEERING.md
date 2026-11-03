# S-now steering contract

Skill Ultra's S-now controller is deterministic and consumes explicit
behavioral events. It is not a retrieval controller and it does not infer a
posture from ranking, refusal, score, margin, or missing catalogue data.

The public implementation is `packages/core/src/steering.ts`, exported from
`skill-zero`. It has no I/O, clock, randomness, hidden state, or background
activity. The event vocabulary is local to this consumer until an upstream
behavioral event contract exists; it is not an Arbor schema.

## Trust boundary

There are two different inputs:

1. **Untrusted JSON** is parsed by `parseOperatorCommand()` as a narrow
   operator-control description. It accepts only lifecycle controls
   (`checkpoint`, `close-search`, `reopen-search`, `stop`) and an optional
   bounded event id. It rejects runtime behavioral kinds, `authority` claims,
   unknown fields, and malformed values. `createOperatorEvent()` then makes the
   explicit control-plane object passed to the controller.
2. **Host adapter code** obtains an opaque in-process capability from
   `createRuntimeAdapter()` and uses `createRuntimeEvent()` to construct
   `behavioral-failure` or `behavioral-recovery`. Private symbol brands mean a
   JSON object with the same enumerable fields cannot become a runtime event.

The capability and brands are a host-code boundary, not authentication. They
do not prove that a shell flag was typed by a human, and they are not a secret
or permission service. Code with arbitrary access to the host process can call
exported constructors. Their authority is the documented trust placed in the
privileged host adapter; skill bodies, model prose, cards, and deserialized
runtime payloads never cross that boundary.

## Event policy

| Event | Constructor authority | Result |
| --- | --- | --- |
| `behavioral-failure` | host runtime adapter | explore one rung, bounded by `max` |
| `behavioral-recovery` | host runtime adapter | converge one rung, bounded by `low` |
| `checkpoint` | operator control plane | move search to `checkpointed` |
| `close-search` | operator control plane | close search explicitly |
| `reopen-search` | operator control plane | reopen and explore at most one rung |
| `stop` | operator control plane | stop explicitly |

A closed search does not restart because a failure arrived; reopening is a
separate explicit control. A stopped search does not resume from a later event.

## State, records, and verification

A state contains one operational rung (`low`, `med`, `high`, `xhigh`, or `max`)
and one search lifecycle. It never stores separate Heaven and Hell positions.
`zero` is the product floor and `ultra` is the crown/controller, so neither is
an operational rung selected by this controller. Invalid state, including extra
counter fields or a rung outside the declared policy bounds, is rejected rather
than repaired.

Absent or malformed event data is a first-class hold. Each step includes:

- signal, provenance, and the accepted event type;
- the complete normalized policy and its version;
- structured `from` and `to` positions; and
- decision, direction, changed status, and a stable explanation containing
  signal, policy, from, and to.

`replaySteering()` returns a self-contained `SteeringReplayRecord` with the
initial state, final state, full policy, and trace. `serializeSteeringRecord()`
serializes only a record that verifies. `verifySteeringRecord()` recomputes each
transition from the recorded signal descriptor under the exact recorded policy
and rejects tampered policy,
version, state, provenance, action, signal, from/to, explanation, or extra
shape. A verified record is an audit description, not a new authority for live
steering.

## CLI smoke paths

Operator control (not human attestation):

```sh
npm run launcher -- \
  --steering-event '{"type":"checkpoint"}'
```

Verify a record produced by the public API:

```sh
npm run launcher -- --steering-verify ./steering-record.json
```

Steering flags are standalone. They reject every launch, benchmark, telemetry,
and passthrough flag and never alter launch posture, user configuration, or the
summon ladder. Runtime behavioral events are host-adapter-only and are rejected
by the CLI regardless of payload metadata.

## Disclosure

Heaven and Hell remain relevance-breadth directions until canonical Arbor
interaction evidence is available. No HH stamp gate is running. This controller
does not invent Arbor fields, stamps, composition decisions, or benchmark
evidence.

The deterministic shape is selectively informed by the earlier controller in
issue #114, commit `4d0e2f9`; its retrieval-driven inputs, thresholds, and
calibration are superseded and are not reused.
