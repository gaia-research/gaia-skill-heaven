# Program 3 — Prototypes

Status: **in progress.** EPIC gaia-skill-tree#1336, Program 3.

Session goal: working prototypes the founder can actually use. Benchmarks come later.

## The ladder

One ladder, one line: `off · low · med · high · xhigh · max · ultra`. The four
surfaces are contiguous **bands** on it, read from the current rung (N13 —
`docs/LADDER-FLOW.md` is the current statement; the table below is kept in sync
with `RUNG_SLOTS` in `packages/core/src/compile.ts`).

| Rung | Band | Skills auto-summoned per capability gap |
|---|---|---|
| `off` | Zero | 0 — manual `/summon` only |
| `low` | Heaven (converge) | 1 |
| `med` | Heaven (converge) | 2 |
| `high` | Hell (explore) | 3 |
| `xhigh` | Hell (explore) | 4 |
| `max` | Hell (explore) | 5 |
| `ultra` | Ultra | controller — picks direction + depth per gap |

Counts are **PROVISIONAL** until the Hell/Heaven benchmark lands. Nothing on the
line refuses: `ultra` is ratified (N13), and what is outstanding on the upper
band is implementation, not permission.

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
