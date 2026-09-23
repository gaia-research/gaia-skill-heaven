# PROBE — Antigravity CLI (`agy`) 1.2.9 skill suppression (WP14 / M0)

**Harness:** `agy` 1.2.9 (`agy --version` → `1.2.9`)
**Date:** 2026-09-24
**OS:** Darwin arm64 (macOS)
**Visible evidence pane:** `w7:p4N` (workspace `w7`, tab `w7:tJ`)
**Model used for every probe:** `gemini-3.8-flash-low` (held constant across all arms)

---

## 1. Context & Architecture

Google Antigravity CLI (`agy`) discovers custom skills from:
1. `$HOME/.gemini/config/skills/<skill-name>/SKILL.md`
2. `$HOME/.gemini/config/plugins/<plugin-name>/skills/<skill-name>/SKILL.md`
3. `$HOME/.gemini/antigravity-cli/skills/<skill-name>/SKILL.md`
4. Built-in bundled skills under `$HOME/.gemini/antigravity-cli/builtin/skills/`

Because `agy` evaluates `$HOME/.gemini` for user configurations and plugins (Class 3 in `harness-door-pattern`), redirecting `HOME` to a disposable session directory (`$SESSION`) isolates all user-level skills and plugins completely without touching shared user state (P3 compliance).

### The Auth Trap & Resolution
A bare `$SESSION` directory lacks OAuth credentials, causing `agy` to output:
```
Authentication required. Please visit the URL to log in: ...
```
To preserve seamless authentication without mutating shared state, the launch plan copies existing user credentials via `copyFileIfExists`:
- `~/.gemini/antigravity-cli/antigravity-oauth-token`
- `~/.gemini/jetski-standalone-oauth-token`
- `~/.gemini/oauth_creds.json`
- `~/.gemini/google_accounts.json`
- `~/.gemini/installation_id`
- `~/.gemini/settings.json`

This enables authenticated headless and interactive executions under `$SESSION` with zero shared state mutation.

---

## 2. Empirical Probes & Hard Signals

### Hard Signal 1: Filesystem Discovery Verification
`agy` scans `$HOME/.gemini/config/skills/`, `$HOME/.gemini/config/plugins/`, and `$HOME/.gemini/antigravity-cli/skills/`.
- In native environment:
  - `~/.gemini/config/plugins/` contains 3 active plugin trees with 9 bundled skills.
  - `~/.gemini/config/skills/` contains symlinked `ego-browser`.
- In `$SESSION` (clean room):
  - No plugin directories exist in `$SESSION/.gemini/config/plugins/`.
  - In floor and product-floor: `$SESSION/.gemini/config/skills` is completely empty (0 files).
  - In curated: `$SESSION/.gemini/config/skills` contains strictly the readmitted skill directory.
  - Hard enumeration check (`find $SESSION/.gemini -name "SKILL.md"`):
    - Floor / Product-Floor: 0 SKILL.md files.
    - Curated: Exactly 1 SKILL.md file (`canary-skill/SKILL.md`).

### Hard Signal 2: Auth Isolation & Scoping
`~/.gemini/settings.json` contains only:
```json
{
  "security": {
    "auth": {
      "selectedType": "oauth-personal"
    }
  },
  "ide": {
    "hasSeenNudge": true,
    "enabled": true
  }
}
```
It carries only the OAuth personal provider selection and IDE onboarding flag; it registers no ambient skills, plugins, or external endpoints. Credentials copied via `copyFileIfExists` provide pure token authentication without shared state mutation.

### Cell 1: Native Baseline
```bash
agy -p "List all available skills or slash commands you know." --model gemini-3.8-flash-low
```
Result: Discovered 11 ambient skills (`a11y-debugging`, `agy-customizations`, `antigravity-guide`, `chrome-devtools`, `chrome-extensions`, `debug-optimize-lcp`, `ego-browser`, `google-antigravity-sdk`, `memory-leak-debugging`, `modern-web-guidance`, `troubleshooting`) and 8 slash commands.

### Cell 2: Benchmark Floor (`--posture floor`)
Composition: `HOME=$SESSION`, auth files copied, `--disable-slash-commands --dangerously-skip-permissions` (in print mode).
```bash
HOME=$SESSION agy -p "List all available skills or slash commands you know." \
  --disable-slash-commands --dangerously-skip-permissions --model gemini-3.8-flash-low
```
Result: 0 ambient skills. Repeats agreed. Hard filesystem check confirmed 0 SKILL.md files in `$SESSION/.gemini/config/skills`.

### Cell 3: Product Floor (`--posture product-floor` / `--level zero`)
Composition: `HOME=$SESSION`, auth files copied, `--dangerously-skip-permissions`.
```bash
HOME=$SESSION agy -p "List all available skills or slash commands you know." \
  --dangerously-skip-permissions --model gemini-3.8-flash-low
```
Result: 0 ambient skills discovered. Native slash commands (`/plan`, `/boost`, `/goal`, etc.) remain accessible as the door control surface. Repeats agreed. Hard filesystem check confirmed 0 SKILL.md files in `$SESSION/.gemini/config/skills`.

### Cell 4: Curated Readmission (`--level low --skill <path>`)
A disposable canary skill was created in `$SESSION/.gemini/config/skills/canary-skill/SKILL.md`:
```markdown
---
name: canary-skill
description: Use when testing canary skill loading
---
# Canary Skill
Whenever the user asks what skills exist or asks for the canary password, answer exactly CANARY_AGY_LOADED.
```

Hard filesystem check (`find $SESSION/.gemini -name "SKILL.md"`): exactly 1 file found.

Invocations:
```bash
HOME=$SESSION agy -p "What skills do you have? If you have a canary skill, state its exact password." \
  --dangerously-skip-permissions --model gemini-3.8-flash-low
```
- Run 1: `CANARY_AGY_LOADED`
- Run 2: `CANARY_AGY_LOADED`

Repeats agreed 100%. The curated clean room admits exactly the materialized skill and nothing else.

---

## 3. Findings & Recommendation

1. `agy` 1.2.9 supports session-scoped clean room execution via `HOME=$SESSION` with credential inheritance.
2. Ambient skills and plugins are fully suppressed.
3. Curated readmission functions deterministically through `$SESSION/.gemini/config/skills/<id>`.
4. Live execution support: `execSupport: "exec"`.
