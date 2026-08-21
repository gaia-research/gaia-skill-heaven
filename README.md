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

Requires **Node.js 22+ and Git**. Two ways in — install the Agent Plugin, or just the launchers.

| | You get | Best if |
|---|---|---|
| **1 · The Agent Plugin** | All five surfaces + the summon engine | Any harness — **start here** |
| **2 · The launchers** | `claude-zero`, `pi-zero`, and three more | You want to start harnesses clean from your shell |

---

### 1 · The Agent Plugin — *recommended*

**One package, every harness.** Skill Heaven ships as an [Agent Plugin](https://agent-plugins.org) — the portable package standard: one manifest, the bundled MCP, and the skills. Install that package once:

**macOS / Linux (POSIX):**
```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.ps1 | iex
```

The script puts the plugin at
`$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven` (or `%LOCALAPPDATA%\gaia-skill-heaven-agent-plugin\marketplace\plugins\skill-heaven` on Windows)
and prints that path. Point any **standards-conformant Agent Plugins client** at it. The standard intentionally leaves installation and enablement to each client, so the script delivers one stable package without guessing at or silently editing an unknown harness's configuration. Clients outside the pinned probe remain unverified.

The clients pinned in the compatibility probe use these registration commands:

| Client | Register the installed package |
|---|---|
| Codex 0.146.0 | `codex plugin marketplace add "$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace"` then `codex plugin add skill-heaven@gaia-skill-heaven` |
| Grok 1.0.5 | `grok plugin install "$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven" --trust` |
| Hermes 0.20.0 | `hermes plugins install "file://$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven" --enable` |
| Pi 0.84.2 | `pi install "$HOME/.local/share/gaia-skill-heaven-agent-plugin/marketplace/plugins/skill-heaven" --approve` |

**Claude Code marketplace compatibility still works** on 2.1.237. Use the public marketplace directly — no local install is required:

```text
/plugin marketplace add gaia-research/gaia-skill-heaven
/plugin install skill-heaven@gaia-skill-heaven
```

Run `/reload` in a Pi session that was already open; other clients pick up the plugin in a new session. Then `/summon`, `/skill-zero`, `/skill-heaven`, `/skill-hell`, and `/skill-ultra` are available. There is no second engine or sibling repository.

Some clients copy plugins into their own cache. Re-running the script updates the stable local artifact; run that client's update or reinstall command to refresh its cached copy.

📖 [Agent Plugin details](docs/AGENT-PLUGIN.md) · [pinned harness probe](plugins/skill-heaven/PROBE.md)

> **Just want `/summon`?** Install the full plugin anyway — that is the recommended path, and summon is the mechanic underneath every surface, so you lose nothing by taking all of them. A separate summon-only install is [tracked in #76](https://github.com/gaia-research/gaia-skill-heaven/issues/76).

---

### 2 · The Skill Zero launchers

Five shell commands that start a harness with a clean context, independent of any plugin.

**macOS / Linux (POSIX):**
```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://gaia-research.github.io/gaia-skill-heaven/install.ps1 | iex
```

```text
claude-zero   codex-zero   pi-zero   hermes-zero   grok-zero
```

Run one instead of your usual harness command. The installer also registers the Agent Plugin above if your `claude` binary is already on `PATH`.

It does **not** install the harnesses themselves. Binaries land in `$HOME/.local/share/gaia-skill-heaven/bin` (or `%LOCALAPPDATA%\gaia-skill-heaven\bin` on Windows); add it to your `PATH` if your shell doesn't pick it up:

**macOS / Linux (POSIX):**
```bash
export PATH="$HOME/.local/share/gaia-skill-heaven/bin:$PATH"
```

**Windows (PowerShell):**
```powershell
$env:Path = "$env:LOCALAPPDATA\gaia-skill-heaven\bin;$env:Path"
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

### One Skill URL

The plugin reads one `skill_url` (`SKILL_SOURCE` outside Claude settings):

- A Skill Tree website root such as `https://gaiaskilltree.com` derives its generic and named projections.
- A GitHub repository such as `https://github.com/mattpocock/skills` is a flat fleet: directories containing `SKILL.md` become relevance-routed summon candidates, with no generic map required.

Fleet invocation follows Matt Pocock's convention. `disable-model-invocation: true` marks a human-led **Skill Heaven** skill that requires explicit authorization. A fleet skill without that flag is model-led **Skill Hell** and may be reached automatically. Manual `/summon` is explicit and may reach either; materialization remains atomic and session-only.

The old `TREE_URL` + `TREE_NAMED_URL` pair remains a deprecated migration fallback. Configure one Skill URL for new installs.

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
| **Skill Zero** | `/skill-zero` | **You** — temporary skills are cut by default | Minimalists and software doctors who want a precise, bloat-free harness |
| **Skill Heaven** | `/skill-heaven` | **You** — the agent converges on what you point at | Focused work where you stay the author of the context |
| **Skill Hell** | `/skill-hell` | **The model** — it reaches wider than you would | Unfamiliar territory, where you don't yet know which expert you need |
| **Skill Ultra** | `/skill-ultra` | **The model** — direction *and* depth, per gap | Engineers running a fleet of agents, each balancing Heaven against Hell |

**Heaven is human-led. Hell is model-led.** That is the distinction the whole product turns on. Heaven narrows onto the gap; Hell widens around it, putting more experts in context than you would have picked.

> **Status.** The launchers and all five in-session commands ship and work today as actively tested prototypes. GitHub fleets now route invocation safety from `SKILL.md` metadata and route candidates by relevance. Benchmark-derived trust routing is still not built.

---

## The one line

All four surfaces are bands on a **single line** of seven rungs. A session sits at exactly one rung.

```text
zero  ·  low   med  ·  high   xhigh   max  ·  ultra
 └Zero┘   └─Heaven─┘   └────── Hell ──────┘   └Ultra┘
```

| Rung | Surface | What it means |
|---|---|---|
| `zero` | Zero | temporary skills cut — manual `/summon` only |
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
| Claude Code | ✅ `claude-zero` | ✅ marketplace compatibility (2.1.237) |
| Codex | ✅ `codex-zero` | ✅ plugin compatibility (0.146.0) |
| Pi | ✅ `pi-zero` | ✅ Agent Plugin adapter (0.84.2) |
| Hermes | ✅ `hermes-zero` | ✅ Agent Plugins v1 (0.20.0) |
| Grok | ✅ `grok-zero` | ✅ plugin compatibility (1.0.5) |
| Other conformant Agent Plugins clients | — | ◻️ load the same directory; not yet pinned here |

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

Remove the recommended Agent Plugin artifact:

**macOS / Linux (POSIX):**
```bash
$HOME/.local/share/gaia-skill-heaven-agent-plugin/uninstall.sh
```

**Windows (PowerShell):**
```powershell
& "$env:LOCALAPPDATA\gaia-skill-heaven-agent-plugin\uninstall.ps1"
```

This does not remove copies or registrations managed by Codex, Grok, Hermes, Pi, or Claude; use that client's plugin remove command too. If you also installed the standalone launchers, remove those separately:

**macOS / Linux (POSIX):**
```bash
$HOME/.local/share/gaia-skill-heaven/uninstall.sh
```

**Windows (PowerShell):**
```powershell
& "$env:LOCALAPPDATA\gaia-skill-heaven\uninstall.ps1"
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
