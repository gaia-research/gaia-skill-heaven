# Program 3 — Prototypes

Status: **in progress.** EPIC gaia-skill-tree#1336, Program 3.

Session goal: working prototypes the founder can actually use. Benchmarks come later.

## The ladder

One ladder, one line: `zero · low · med · high · xhigh · max · ultra` — seven
skill-entropy readings, not seven settings. The four surfaces are contiguous
**bands** on it, read from the current rung (N13 — `docs/LADDER-FLOW.md` is the
canonical statement of both the shape and what the ladder measures).

| Rung | Band | What it means |
|---|---|---|
| `zero` | Zero | nothing automatic — manual `/summon` only |
| `low` | Heaven | converge — the band opens here |
| `med` | Heaven | converge — further along the band |
| `high` | Hell | explore — the band opens here |
| `xhigh` | Hell | explore — further along the band |
| `max` | Hell | explore — further along the band |
| `ultra` | Ultra | sits at the top of the line, picks the entropy for you, gap by gap |

No rung carries a count and no summon is capped — how far a rung reaches on a
given gap is the agent's call, worked out in use while the benchmark is built.
Heaven's representative rung (`low`) and Hell's (`high`) are **PROVISIONAL**.
Nothing on the line refuses: `ultra` is ratified (N13), and what is
outstanding on the upper band is implementation, not permission.

`floor` (absolute zero, doorless) stays an internal benchmarking ruler and is never
product vocabulary.

## Doors

| Door | Harness | Status |
|---|---|---|
| claude-zero | Claude Code | shipped; polishing |
| pi-zero | pi | building |
| codex-zero | Codex CLI | building |
| hermes-zero | Hermes | building |
| grok-zero | Grok | stretch |

## Benchmarking visibility

All prototyping and benchmarking runs side-by-side in visible `herdr` panes.
Nothing runs hidden — including nested subagents. See `packages/core/skills/`.
