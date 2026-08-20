![Skill Heaven's one line of seven rungs measures skill entropy — how much skill variety and volume enters a session. Zero is the human-led floor, Heaven converges narrowly on the gap, Hell explores widely around it, and Ultra picks the entropy for you, gap by gap.](docs/assets/entropy-ladder.svg)

# Skill Heaven

**Your coding agent is carrying skills it never uses. Skill Heaven decides what actually enters a session.**

Summon exactly the skills a task needs — one session, nothing installed. Or start the harness clean and add nothing at all.

[![Skill Tree](https://img.shields.io/badge/Skill_Tree-gaiaskilltree.com-f59e0b)](https://gaiaskilltree.com/)
[![Research](https://img.shields.io/badge/Research-research.gaiaskilltree.com-ec4899)](https://research.gaiaskilltree.com/)
[![Skill Heaven Preview](https://img.shields.io/badge/Skill_Heaven-gaia--research.github.io%2Fgaia--skill--heaven-a58ae0)](https://gaia-research.github.io/gaia-skill-heaven/)

Works with **Claude Code · Codex · Pi · Hermes · Grok**

---

## Install

Requires **Node.js 22+**. Two ways in — install the Agent Plugin, or just the launchers.

| | You get | Best if |
|---|---|---|
| **1 · The Agent Plugin** | All five surfaces + the summon engine | Any harness — **start here** |
| **2 · The launchers** | `claude-zero`, `pi-zero`, and three more | You want to start harnesses clean from your shell |

---

### 1 · The Agent Plugin — *recommended*

**One package, every harness.** Skill Heaven ships as an [Agent Plugin](https://agent-plugins.org) — the portable plugin standard: one manifest, the bundled MCP, and the skills, in a single install. Nothing in it is tied to one vendor; only the way each harness is told to load it differs.

**Claude Code** — two lines, typed in-session. No terminal, no build step, no `npx`:

```text
/plugin marketplace add gaia-research/gaia-skill-heaven
/plugin install skill-heaven@gaia-skill-heaven
```

**Any other harness** — clone the repo and load the same bundle:

```bash
git clone https://github.com/gaia-research/gaia-skill-heaven.git
```

```json
{
  "mcpServers": {
    "skill-summon": {
      "command": "node",
      "args": ["/path/to/gaia-skill-heaven/plugins/skill-heaven/mcp/skill-summon.mjs"]
    }
  }
}
```

Either way you get `/summon`, `/skill-zero`, `/skill-heaven`, `/skill-hell` and `/skill-ultra`, with the summon engine bundled in. There is no second package and no sibling repository.

📖 [`docs/AGENT-PLUGIN.md`](docs/AGENT-PLUGIN.md)

> **Just want `/summon`?** Install the full plugin anyway — that is the recommended path, and summon is the mechanic underneath every surface, so you lose nothing by taking all of them. A separate summon-only install is [tracked in #76](https://github.com/gaia-research/gaia-skill-heaven/issues/76).

---

### 2 · The Skill Zero launchers

Five shell commands that start a harness with a clean context, independent of any plugin.

```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

```text
claude-zero   codex-zero   pi-zero   hermes-zero   grok-zero
```

Run one instead of your usual harness command. The installer also registers the Agent Plugin above if your `claude` binary is already on `PATH`.

It does **not** install the harnesses themselves. Binaries land in `$HOME/.local/share/gaia-skill-heaven/bin`; add it to your `PATH` if your shell doesn't pick it up:

```bash
export PATH="$HOME/.local/share/gaia-skill-heaven/bin:$PATH"
```

---

## Try it in 60 seconds

Once the plugin is installed, in any session:

```text
/summon         pull one skill into context — this session only, nothing installed
/skill-heaven   converge — the right few skills for the gap in front of you
/skill-hell     explore — reach wide for capability you don't have yet
```

Nothing you summon is installed, and nothing is left behind when the session ends.

With the launchers, from your shell:

```bash
claude-zero --print   # see what a clean launch would compose — nothing is spawned
claude-zero           # start your harness with a clean context
```

---

## The four surfaces

One mechanic — **`/summon`**, one skill into context, one session, nothing installed. The four surfaces differ only in **who does the choosing**.

| Surface | Command | Who chooses | Who it's for |
|---|---|---|---|
| **Skill Zero** | `/skill-zero` | **You** — nothing is automatic | Minimalists and software doctors who want a precise, bloat-free harness |
| **Skill Heaven** | `/skill-heaven` | **You** — the agent converges on what you point at | Focused work where you stay the author of the context |
| **Skill Hell** | `/skill-hell` | **The model** — it reaches wider than you would | Unfamiliar territory, where you don't yet know which expert you need |
| **Skill Ultra** | `/skill-ultra` | **The model** — direction *and* depth, per gap | Engineers running a fleet of agents, each balancing Heaven against Hell |

**Heaven is human-led. Hell is model-led.** That is the distinction the whole product turns on. Heaven narrows onto the gap; Hell widens around it, putting more experts in context than you would have picked.

> **Status.** The launchers and all five in-session commands ship and work today, as actively tested prototypes — interfaces may still change. What is *not* built yet is the automatic routing: summons are ranked by relevance, not by Heaven/Hell trust stamps, and nothing auto-routes from benchmark results.

---

## The one line

All four surfaces are bands on a **single line** of seven rungs. A session sits at exactly one rung.

```text
zero  ·  low   med  ·  high   xhigh   max  ·  ultra
 └Zero┘   └─Heaven─┘   └────── Hell ──────┘   └Ultra┘
```

| Rung | Surface | What it means |
|---|---|---|
| `zero` | Zero | nothing automatic — manual `/summon` only |
| `low` `med` | Heaven | converge — narrow onto the gap |
| `high` `xhigh` `max` | Hell | explore — widen around the gap |
| `ultra` | Ultra | picks direction and depth for you, gap by gap |

The line measures **skill entropy** — how much skill variety and volume enters a session. Climbing it isn't switching modes; it's turning one dial. No rung carries a count and no summon is capped: how far to reach on a given gap is the agent's call.

Nothing on the line refuses — every rung is reachable. Heaven's representative rung (`low`) and Hell's (`high`) stay **provisional** until the benchmark lands.

📖 Full statement: [`docs/LADDER-FLOW.md`](docs/LADDER-FLOW.md)

---

## Start clean — Skill Zero

Launch any supported harness with a clean context:

```bash
claude-zero          # or: codex-zero · pi-zero · hermes-zero · grok-zero
```

Pick how clean you want the *launch* to be with `--level`:

| `--level` | You get |
|---|---|
| `zero` | The cleanest launchable start for that harness — **the default** |
| `low` | Clean, then only the skills you name with `--skill` |
| `med` · `native` | Your normal, untouched harness |

The upper rungs (`high` · `xhigh` · `max` · `ultra`) aren't boot settings — you arm them live with `/skill-hell` or `/skill-ultra` once the session is running.

```bash
# start clean, then admit exactly one skill
claude-zero --level low --skill ./skills/my-skill
```

Two things worth knowing:

- **Your config is never touched.** Each launch composes a temporary session and deletes it on exit. Your real `~/.claude`, settings, and skills are left exactly as they were.
- **It fails closed.** Harnesses hide their skills in different places. If Skill Zero can't give you a genuinely clean launch, it tells you instead of pretending.

---

## Harness support

| Harness | Launcher | In-session commands |
|---|---|---|
| Claude Code | ✅ `claude-zero` | ✅ plugin |
| Codex | ✅ `codex-zero` | — |
| Pi | ✅ `pi-zero` | — |
| Hermes | ✅ `hermes-zero` | — |
| Grok | ✅ `grok-zero` | — |
| Cursor | inspection only | — |

---

## The research behind it

Skill Heaven is also a measuring instrument. The **Hell–Heaven (HH) Index** asks one question:

> **When does adding capability actually help, and when does it just add noise?**

The benchmark's job is the **entropy curve** — how quality and cost move together as skill entropy rises. It's expected to rise and then turn, because Skill Hell puts more experts in context: better, until it isn't. Where "isn't" begins is what the benchmark exists to find.

**None of this is measured yet.** No curve has been plotted, and no rung has been shown to beat any other. The launcher does not auto-route from HH-Index results.

[![Read the benchmark method →](https://img.shields.io/badge/Read%20the%20benchmark%20method%20%E2%86%92-in%20progress-ff4fa3?style=flat-square)](https://research.gaiaskilltree.com/research/hh-benchmark)

---

![Skill Heaven site preview](https://raw.githubusercontent.com/gaia-research/gaia-skill-heaven/main/docs/assets/site-preview.png)

---

## Uninstall

```bash
$HOME/.local/share/gaia-skill-heaven/uninstall.sh
```

## Docs & links

| | |
|---|---|
| The ladder, in full | [`docs/LADDER-FLOW.md`](docs/LADDER-FLOW.md) |
| The Agent Plugin | [`docs/AGENT-PLUGIN.md`](docs/AGENT-PLUGIN.md) |
| Engine internals & harness quirks | [`docs/CORE-AND-QUIRKS.md`](docs/CORE-AND-QUIRKS.md) |
| What a real install looks like | [`docs/INSTALL-TRANSCRIPT.md`](docs/INSTALL-TRANSCRIPT.md) |
| Vision · Mission | [VISION](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/VISION.md) · [MISSION](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/MISSION.md) |
| Hell / Heaven benchmark | [research.gaiaskilltree.com](https://research.gaiaskilltree.com/research/hh-benchmark) |

## Development

```bash
npm install
npm test
npm run launcher -- --level zero --print
```

Node.js **22+**, TypeScript ESM. No runtime dependencies, and no harness binaries are installed as dependencies.
