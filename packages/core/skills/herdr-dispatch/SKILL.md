---
name: herdr-dispatch
description: Dispatch coding workers into visible Herdr panes instead of hidden in-harness subagents. Use whenever you need to hand work to another agent (Claude, pi, codex, hermes, grok) and the operator must be able to watch it happen. Covers pane layout, agent start, prompting, waiting, reading results, and teardown.
---

# Herdr Dispatch — visible workers

Every dispatched worker runs in a pane the operator can see. **Nothing runs hidden.**
This applies to nested subagents too: a worker that dispatches further work uses this
same skill, so the whole tree stays on screen.

An in-harness subagent (the `Agent`/`Task` tool) is invisible to the operator. Use one only
for **read-only scouting**. Anything that writes code, commits, or opens a PR goes into a pane.

---

## Rule 0 — every harness invocation runs in a pane

**Never invoke `claude`, `pi`, `codex`, `hermes`, or `grok` through your Bash tool.**
Run them in a herdr pane so the full argv — especially `--model` — appears on screen.

A probe the operator could not see is not evidence. This applies to workers as much as to
orchestrators, and it is the single most common thing a dispatched worker gets wrong.

Create one probe pane and reuse it:

```bash
PROBE_PANE=$(herdr pane split --current --direction down --ratio 0.4 --cwd "$PWD" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['pane']['pane_id'])")

herdr pane run "$PROBE_PANE" pi --model openai-codex/gpt-5.6-luna:low --print --no-session "probe text"
herdr pane read "$PROBE_PANE"
```

Record the pane id alongside any result you rely on, so the run stays auditable.

Ordinary shell work — `git`, `npm`, `node`, `curl`, file inspection — stays on the Bash tool.
The rule is about **harness invocations**, where the model identity is the thing at stake.

---

## 0. Verify the environment

```bash
herdr status
```

Proceed only if `server.status: running`. Every command below speaks to that server over its
socket and prints JSON on stdout.

Useful one-liner to pull a field out of the JSON:

```bash
herdr pane split --current --direction right --ratio 0.5 --cwd "$PWD" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['pane']['pane_id'])"
```

---

## 1. Lay out the panes

Find where you are:

```bash
herdr pane current
```

Split. `--cwd` is **mandatory** — it is what stops state leaking between workers.

```bash
# worker 1: right half
herdr pane split --current --direction right --ratio 0.5 --cwd /path/to/repo-a

# worker 2: stacked under worker 1, so both stay visible
herdr pane split <WORKER1_PANE_ID> --direction down --ratio 0.5 --cwd /path/to/repo-b
```

The resulting layout — orchestrator on the left, workers stacked on the right — keeps every
worker on screen at once. Prefer it over opening new tabs, which hide work behind a switch.

**Two workers is the working default.** Beyond that panes get too narrow to read, which
defeats the purpose.

---

## 2. Start an agent in the pane

The pane must be sitting at an interactive shell prompt.

```bash
herdr agent start <NAME> --kind <KIND> --pane <PANE_ID> --timeout 120000 -- <AGENT_ARGS...>
```

- `<NAME>` is your handle for the worker — use a task name (`hell-engine`, `pi-door`), not `agent1`.
- `--kind` supported values include: `claude`, `pi`, `codex`, `hermes`, `grok`, `gemini`,
  `cursor`, `copilot`, `opencode`, `droid`, `amp`, and others.
- Everything after `--` is passed to the agent binary verbatim.

Success means the agent was detected in that terminal and is ready for input
(`interactive_ready: true` in the response).

### Claude workers

```bash
herdr agent start my-task --kind claude --pane w8:p4 --timeout 120000 \
  -- --model sonnet --permission-mode auto
```

`--permission-mode` choices: `acceptEdits`, `auto`, `bypassPermissions`, `manual`,
`dontAsk`, `plan`. Use **`auto`** for dispatched workers — a worker stuck on a permission
prompt is a stalled worker, and you will not notice quickly.

Model tiers: `sonnet` for high-volume implementation, `opus` for judgement-heavy work,
`haiku` only for repetitive mechanical passes.

### pi workers

```bash
herdr agent start pi-task --kind pi --pane w8:p5 --timeout 120000 \
  -- --model openai-codex/gpt-5.6-luna:low
```

### codex workers

```bash
herdr agent start codex-task --kind codex --pane w8:p6 --timeout 120000
```

---

## 3. Send the work

Long prompts do not belong on a command line — quoting will eventually bite you. Write the
brief to a file, then point the worker at it:

```bash
herdr agent prompt <NAME> "Read the file /abs/path/to/brief.md in full and execute it exactly as written. It is your complete dispatch brief. Begin now."
```

Add `--wait` to block until the worker settles:

```bash
herdr agent prompt <NAME> "<text>" --wait --until idle --timeout 600000
```

Without `--timeout`, `--wait` waits indefinitely. `--wait` does **not** track turns: if the
agent was already working, that in-flight turn's completion can satisfy the match. For a
long dispatch, prefer to fire without `--wait` and poll (§4).

### What belongs in a dispatch brief

A worker inherits none of your working memory. Every brief needs:

- **Working directory and branch**, stated explicitly, with a warning not to wander into
  a sibling checkout.
- **Commit discipline** — commit and push after each logical unit, never batch, commit under
  the approved git identity, do not gate commits on tests passing.
- **Ground truth you already verified**, so the worker does not re-derive it.
- **Constraints** — style, dependencies, what must not be touched.
- **Success criteria that require running the thing**, not just building it.
- **An exact return shape.**

---

## 4. Watch and collect

```bash
herdr agent list                       # all agents + their status
herdr agent read <NAME>                # terminal buffer for one worker
herdr agent wait <NAME> --until idle --timeout 600000
```

`herdr agent read | tail -40` is the cheap progress check — it shows the live tail without
pulling a whole transcript into your context.

Agent states: `idle`, `working`, `blocked`, `done`, `unknown`. **`blocked` means the worker
is waiting on a human** — go look at it immediately.

Poll loop for a long dispatch:

```bash
herdr agent read <NAME> | tail -30
```

Do not sit in a tight wait. Check in, then do other work.

---

## 5. Follow-ups and teardown

The agent stays alive after its turn, so you can iterate without re-onboarding it:

```bash
herdr agent prompt <NAME> "Build failed on X. Fix it, commit, push, report the SHA."
```

That is the main advantage of a pane worker over a one-shot subagent — the context survives.

When finished:

```bash
herdr agent release-agent <PANE_ID>   # release lifecycle authority
herdr pane close <PANE_ID>
```

Leave a pane open if its output is still evidence the operator has not reviewed.

---

## 6. Anti-patterns

- **Dispatching real work to a hidden in-harness subagent.** Scouting only.
- **Omitting `--cwd` on split.** The worker inherits your directory and edits the wrong tree.
- **A brief with no return shape.** You get a wall of prose instead of a result.
- **Batching commits.** A worker that dies with uncommitted work loses all of it.
- **More than two concurrent workers.** Panes get unreadable and review quality drops.
- **Re-doing a worker's output yourself.** Fix the brief and re-dispatch, or send a follow-up.
