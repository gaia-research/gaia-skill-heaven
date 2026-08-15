![Skill Heaven decides what enters your agent's session. Skill Zero is the finished launcher that starts a harness clean (off, low, med); Heaven is the converge summon that curates the right few skills; Hell is the exploratory summon that reaches for more capability; Ultra is the future auto-switch across them.](docs/assets/entropy-ladder.svg)

# Skill Heaven

**Your AI coding agent is carrying skills it isn't using. Skill Heaven decides what actually enters a session — so the agent runs on the few skills that help, not the forty it's ignoring.**

Skill Heaven is the runtime layer for AI coding harnesses (**Claude Code, Codex, Pi, Hermes, Grok**). Instead of treating skills as permanent installs, it treats them as something you *start clean* and *summon on purpose*:

- **Skill Zero** — the launcher. Start any harness with a clean, minimal context in one command (`claude-zero`, `pi-zero`, …), shipping `/summon` by default. This is finished and usable today.
- **`/summon`** — the one mechanic underneath everything else: one skill into context, one session, nothing installed. Present at every rung, on every door — Heaven and Hell are just two directions of this same act, over one shared MCP.
- **Heaven** — the *converge* direction: bring back only the right few skills for the task at hand.
- **Hell** — the *exploratory* direction: reach out into the evidenced skill world for more capability when you need it (`skill-hell`).
- **Ultra** — the future controller that picks a direction and depth for you per gap, with no ladder of its own.

Heaven and Hell each carry the same discrete ladder — `off · low · med · high · xhigh · max` — setting how many skills the agent may auto-summon per capability gap. Counts and defaults are **PROVISIONAL** until the benchmark lands (working mapping: `off 0 · low 1 · med 2 · high 3 · xhigh 4 · max 5`; Heaven defaults `low`, Hell defaults `high`).

Skill Zero is the part you can use right now. Heaven, Hell, and Ultra are the summon directions of the same runtime — the behavior research (the **HH Index**) is still in the works.

> Repo: `gaia-research/gaia-skill-heaven` — the Skill Heaven monorepo and Claude Code plugin marketplace.

### Gaia ecosystem
[![Skill Tree](https://img.shields.io/badge/Skill_Tree-gaiaskilltree.com-f59e0b)](https://gaiaskilltree.com/)
[![Research](https://img.shields.io/badge/Research-research.gaiaskilltree.com-ec4899)](https://research.gaiaskilltree.com/)
[![Skill Heaven Preview](https://img.shields.io/badge/Skill_Heaven-gaia--research.github.io%2Fgaia--skill--heaven-a58ae0)](https://gaia-research.github.io/gaia-skill-heaven/)

---

## Why you'd want this

Every skill, rule file, and plugin your agent loads spends context you're paying for — and dilutes the ones that matter. Skill Heaven's answer:

1. **Start from Zero.** Launch the harness with a clean baseline instead of your whole catalogue.
2. **Summon toward Heaven.** Add back the small, curated set the task actually needs.
3. **Reach into Hell when you must.** Explore the wider evidenced skill world for capability you don't have yet.

You stay in charge — Skill Heaven never mutates your real config. It composes a temporary session and tears it down when you exit.

---

## Install

Requires **Node.js 22+**. Installs the launcher doors plus the Hell summon door:

```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

```text
claude-zero   codex-zero   pi-zero   hermes-zero   grok-zero   skill-hell
```

The installer does **not** install the harnesses themselves — install Claude Code, Codex, Pi, Hermes, or Grok as usual. Binaries land in `$HOME/.local/share/gaia-skill-heaven/bin`; add it to your `PATH` if needed:

```bash
export PATH="$HOME/.local/share/gaia-skill-heaven/bin:$PATH"
```

---

## Start clean — Skill Zero

Launch your harness with a clean context:

```bash
claude-zero          # or: codex-zero · pi-zero · hermes-zero · grok-zero
```

See exactly what a launch will compose, without spawning anything:

```bash
claude-zero --print
```

Pick how clean you want to start with `--level`:

| Level | You get |
|---|---|
| `off` | The cleanest launchable start for that harness |
| `low` | Clean, then only the skills you name (`--skill ./skills/my-skill`) |
| `med` | Your normal, native harness |

```bash
# start clean, then admit just one skill
claude-zero --level low --skill ./skills/my-skill
```

Skill suppression differs per harness, so Skill Zero is **fail-closed**: if it can't give you a genuinely clean launch, it tells you instead of pretending.

---

## Summon more — the Heaven and Hell directions

A clean start is only half of Skill Heaven. Once you're launched, you *summon* capability back in with `/summon` — in one of two directions, both over one shared MCP:

- **Heaven — converge.** Curate toward the right few skills for the task. *(In-session `/skill-heaven`; ladder default `low`, PROVISIONAL. The automated routing is HH-Index research, in the works.)*
- **Hell — explore.** Reach into the wider evidenced skill world for capability you don't already have. Ladder default `high`, PROVISIONAL. This is live today as the `skill-hell` summon door:

```bash
skill-hell summon "code review" --card
# or straight from npm:
npx --yes skill-hell@latest summon "code review" --card
```

`skill-hell` is the **exploratory side of Skill Heaven** — a per-session summon, not an install. It brings a skill into context once and leaves nothing behind. Today it's a manual surface; it does not yet auto-route from HH-Index results.

The launcher also ships the in-session command set for the whole runtime surface:

```text
/skill-zero     start / re-compose a clean launch — ships /summon by default
/summon         one skill into context, one session, nothing installed — the shared mechanic under everything below
/skill-heaven   converge — off…max ladder, curate the right few (default low, PROVISIONAL)
/skill-hell     explore — off…max ladder, summon more capability (default high, PROVISIONAL)
/skill-ultra    controller — picks direction + depth per gap, no ladder of its own (future)
```

---

## Harness support

| Harness | Status |
|---|---|
| Claude Code | Supported |
| Codex | Supported |
| Pi | Supported |
| Hermes | Supported |
| Grok | Supported |
| Cursor | Recipe / inspection only |

---

## How it works

Skill Zero never touches your normal agent installation. For each launch it creates a temporary session, composes the right harness flags and config, starts the original harness binary, and removes the temp state when the session exits. Your real configuration stays exactly as it was.

Under the hood the launcher composes named postures — `product-floor` (cleanest launchable), `curated` (only what you name), `native` (untouched), and an internal benchmark `floor`. `--level` is the user-facing dial over those.

---

## HH Index — the behavior research *(in the works)*

Heaven, Hell, and Ultra aren't just summon buttons — they're a behavioral axis Skill Heaven is measuring. The **Hell-Heaven (HH) Index** asks:

> **When does adding capability actually help, and when does it just add context entropy?**

That research lives in `gaia-research` and is still in progress. The launcher does **not** yet auto-route skills from HH-Index results.

[![Read the benchmark method →](https://img.shields.io/badge/Read%20the%20benchmark%20method%20%E2%86%92-WIP%20%C2%B7%20axis%20%2F%20research-ff4fa3?style=flat-square)](https://research.gaiaskilltree.com/research/hh-benchmark)

---

![Skill Heaven site preview](https://raw.githubusercontent.com/gaia-research/gaia-skill-heaven/main/docs/assets/site-preview.png)

---

## Uninstall

```bash
$HOME/.local/share/gaia-skill-heaven/uninstall.sh
```

## Docs & links

- [Vision](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/VISION.md) · [Mission](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/MISSION.md)
- [Hell / Heaven benchmark](https://research.gaiaskilltree.com/research/hh-benchmark)
- [Gaia Skill Tree](https://gaiaskilltree.com/) · [Gaia Research](https://research.gaiaskilltree.com/)

## Development

```bash
npm install
npm test
npm run launcher -- --level off --print
```

Node.js **22+**, TypeScript ESM. No harness binaries are installed as dependencies.
