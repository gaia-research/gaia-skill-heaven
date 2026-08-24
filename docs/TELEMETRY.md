# Skill Zero local runtime telemetry

Skill Zero can write one privacy-bounded runtime observation after an existing
launcher execution. It is **off by default** and writes only to the local file
named with `--telemetry-out`; there is no upload, endpoint, background sender,
or automatic benchmark execution.

```bash
skill-zero --posture curated --skill ./skills/diagnose \
  -p "the task passed to the harness" \
  --telemetry-out ./observation.json \
  --telemetry-task-family repository-debugging \
  --telemetry-invoked-skill diagnose

skill-zero --telemetry-validate ./observation.json
```

Only add `--telemetry-invoked-skill` when that invocation was actually observed.
Likewise, the optional task-family tag is emitted only when explicitly supplied;
use a coarse category, not task text. Optional known signals can be recorded with
`--telemetry-retry-count N`, `--telemetry-recovery observed|not-observed`, and
`--telemetry-churn-count N`. `--telemetry-model-version` may accompany `--model`
when the model version is known.

## Contract and privacy boundary

The versioned contract is
`gaia.skill-zero-runtime-observation/v1`; its public JSON Schema is
[`packages/core/schema/runtime-observation-v1.schema.json`](../packages/core/schema/runtime-observation-v1.schema.json).
Exports contain:

- a SHA-256 session pseudonym generated from fresh local randomness (the seed is
  discarded), never a session directory or user path;
- the selected posture/composition and each explicitly loaded skill's exact
  resolved ID plus `SKILL.md` content SHA-256;
- known harness/model identities and versions;
- observed invocation, outcome, retry, recovery, and churn signals, with `null`
  meaning unavailable rather than false or zero;
- wall-clock latency, and token fields only when the harness already returned
  structured usage.

The telemetry builder has no prompt, output, credential, environment, or path
fields. Unknown fields and absolute POSIX, Windows, UNC, and `file://` paths are
rejected during export and validation. Serialization validates first, sorts
object keys deterministically, and emits one trailing newline. The destination
is a normal local file under the caller's control.

## What an observation means

Telemetry identifies a concrete uncertainty worth investigating. It does not
prove, confirm, rank, or stamp a behavioral claim. A focused controlled receipt
may later answer the question, and Gaia's governed interpretation remains a
separate explicit step. A normal runtime observation is never promoted into a
benchmark or conclusion automatically.
