![The entropy ladder. Heaven is subtractive and holds off, low, and med (which equals native); it is served by /skill-heaven and needs a launcher. Hell is additive in the current prototype: high is the default, xhigh and max broaden the request, and ultra remains unratified.](docs/assets/entropy-ladder.svg)

# Skill Heaven

**Run your AI coding agent with less context bloat, or deliberately summon more capability when you need it.**
Skill Heaven is an experimental launcher for AI coding harnesses including **Claude Code, Codex, Pi, Hermes, and Grok**.

Instead of permanently installing more and more skills into every session, Skill Heaven lets you control how much skill context your agent starts with.

> **Working prototype**
>
> Skill Heaven is actively being tested for public use. Commands and behavior may still change.

### Gaia Ecosystem
[![Skill Tree](https://img.shields.io/badge/Skill_Tree-gaiaskilltree.com-f59e0b)](https://gaiaskilltree.com/)
[![Research](https://img.shields.io/badge/Research-research.gaiaskilltree.com-ec4899)](https://research.gaiaskilltree.com/)
[![Skill Heaven Preview](https://img.shields.io/badge/Skill_Heaven_Preview-gaia--research.github.io%2Fskill--heaven-a58ae0)](https://gaia-research.github.io/skill-heaven/)

---

## Why Skill Heaven?

Agent sessions accumulate context quickly:

- installed skills
- project instructions
- plugins
- tool definitions
- harness-specific defaults

Sometimes you want all of that.

Sometimes you want almost none of it.

Skill Heaven gives you a simple spectrum for controlling that tradeoff:

```text
HEAVEN                                      HELL
cleaner                                      richer
context                                      context

off ─── low ─── med ─── high ─── xhigh ─── max ─── ultra
```

**Heaven** removes or limits ambient skill context before the agent starts.

**Hell** adds skills on demand when you want more capability.

`ultra` is experimental and not yet part of the stable product.

---

## Install

Requires **Node.js 22 or newer**.

```bash
curl -fsSL https://gaia-research.github.io/skill-heaven/install.sh | sh
```

This installs the Skill Heaven launchers:

```text
claude-heaven
codex-heaven
pi-heaven
hermes-heaven
grok-heaven
skill-hell
```

Skill Heaven **does not install the agent harnesses themselves**. You still install Claude Code, Codex, Pi, Hermes, or Grok normally.

The default install location is:

```bash
$HOME/.local/share/skill-heaven/bin
```

If needed, add it to your `PATH`:

```bash
export PATH="$HOME/.local/share/skill-heaven/bin:$PATH"
```

Re-run the installer anytime to update.

---

## Quick start

Launch Claude Code with a cleaner environment:

```bash
claude-heaven
```

Or Codex:

```bash
codex-heaven
```

Pi:

```bash
pi-heaven
```

Hermes:

```bash
hermes-heaven
```

Grok:

```bash
grok-heaven
```

Want to see what the launcher would do without actually starting the agent?

```bash
claude-heaven --print
codex-heaven --print
pi-heaven --print
hermes-heaven --print
grok-heaven --print
```

---

## Summon a skill

Skill Hell is the additive side of the system.

Instead of loading everything up front, ask for capability when you need it:

```bash
skill-hell summon "code review" --card
```

You can also run the published engine directly:

```bash
npx --yes skill-hell@latest summon "code review" --card
```

The current Skill Hell implementation is a **prototype summon system**. It does not yet use Hell/Heaven benchmark scores to automatically decide which skills are safe or optimal to load.

---

## Heaven levels

The user-facing Heaven controls are intentionally small:

| Level | What it means |
|---|---|
| `off` | Start from the cleanest supported product environment |
| `low` | Start clean, then admit only a curated skill set |
| `med` | Use the harness normally |

The exact mechanics differ between harnesses because Claude, Codex, Pi, Hermes, and Grok expose different ways to control skills and configuration.

Skill Heaven handles those differences for you.

---

## Load specific skills

For a curated launch, provide one or more `SKILL.md` files or skill directories:

```bash
skill-heaven \
  --posture curated \
  --harness claude \
  --skill ./skills/my-skill
```

You can inspect the resulting launch plan first:

```bash
skill-heaven \
  --posture curated \
  --harness claude \
  --skill ./skills/my-skill \
  --print
```

For most users, the per-harness commands such as `claude-heaven` are the simpler entry point.

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

Skill suppression is not equally powerful on every harness.

Skill Heaven favors **fail-closed behavior**: if a clean launch cannot be performed reliably, it should tell you rather than pretending the environment is clean.

---

## How it works

Skill Heaven does not modify your normal agent installation.

The launcher creates a temporary session environment, composes the appropriate harness flags and configuration, and starts the original harness binary.

Your normal configuration remains intact.

Temporary Skill Heaven sessions are designed to be disposable.

---

## The Hell / Heaven Index

Skill Heaven is also part of an ongoing research project studying what happens as agents receive progressively more skill context.

The question is simple:

> **When does adding more capability help, and when does it just add context entropy?**

The research measures quality, cost, and behavior across the Heaven → Hell spectrum.

The current launcher does **not** automatically route skills using these benchmark results yet.

[![Read the benchmark method →](https://img.shields.io/badge/Read%20the%20benchmark%20method%20%E2%86%92-WIP%20%C2%B7%20help%20wanted-ff4fa3?style=flat-square)](https://research.gaiaskilltree.com/research/hh-benchmark)

---

![Skill Heaven site preview](https://raw.githubusercontent.com/gaia-research/skill-heaven/main/docs/assets/site-preview.png)

---

## Uninstall

```bash
$HOME/.local/share/skill-heaven/uninstall.sh
```

This removes files installed by the Skill Heaven installer.

---

## Research & project docs

Want the deeper machinery?

- [Hell / Heaven benchmark](https://research.gaiaskilltree.com/research/hh-benchmark)
- [Gaia Skill Tree](https://gaiaskilltree.com/)
- [Gaia Research](https://research.gaiaskilltree.com/)
- [Vision](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/VISION.md)
- [Mission](https://github.com/gaia-research/gaia-research/blob/main/docs/skill-heaven/MISSION.md)

Implementation details, harness probes, benchmark recording, launcher composition, and historical design decisions live under `docs/` and the individual package documentation.

---

## Development

```bash
npm install
npm test
npm run launcher -- --posture floor --print
```

Skill Heaven uses Node.js 22+ and TypeScript ESM.

Harnesses are never installed as package dependencies.

