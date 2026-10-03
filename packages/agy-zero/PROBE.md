# PROBE — Antigravity CLI (`agy`) 1.2.13 skill suppression and keychain-safe launch (WP14 / M0)

**Harness:** `agy` 1.2.13 (`agy --version` → `1.2.13`)
**Date:** 2026-09-24 (initial 1.2.9 probe); updated 2026-09-30 (1.2.13 keychain-safe invariant verification)
**OS:** Darwin arm64 (macOS)
**Model used for every probe:** `gemini-3.8-flash-low` (held constant across all arms)

---

## 1. Context & Architecture

Google Antigravity CLI (`agy`) discovers custom skills from:
1. `$HOME/.gemini/config/skills/<skill-name>/SKILL.md`
2. `$HOME/.gemini/config/plugins/<plugin-name>/skills/<skill-name>/SKILL.md`
3. `$HOME/.gemini/antigravity-cli/skills/<skill-name>/SKILL.md`
4. Built-in bundled skills under `$HOME/.gemini/antigravity-cli/builtin/skills/`

### The Keychain Defect & Root Cause

Running `agy-zero` with `HOME=$SESSION` redirects `$HOME` to a temporary directory. On macOS Darwin, `security list-keychains` evaluates `$HOME/Library/Keychains/login.keychain-db`.
When `HOME` is redirected:
- `security list-keychains` drops `login.keychain-db` from the search list, listing only `/Library/Keychains/System.keychain`.
- Keyring queries (`github.com/zalando/go_keyring/v0`) fail with "The specified item could not be found in the keychain."
- `agy` logs `Failed to load token from keyring, falling back to file: %v` and attempts interactive re-authentication.
- Every run with a fresh `mkdtemp` directory prompts the user again with keychain authorization dialogs and generates a distinct session account ("second agy account").

### Invariant & Architecture Resolution

**agy-zero must never redirect HOME unless the operator explicitly opts in.**
- **Default route (`isolateHome: false`):** runs against the user's real `HOME`. No `env.HOME` override, no auth copying. Existing vanilla credentials and the macOS login keychain remain completely intact.
- **Opt-in route (`--isolate-home` / `isolateHome: true`):** directs `HOME` to `$SESSION` with auth file copying. On Darwin, a warning is emitted noting that the login keychain is unreachable and execution runs as a distinct account.
- **Curated (`--level low`):** Writing into the user's real `~/.gemini/config/skills` is forbidden by P3 (never mutate shared state). Therefore, curated without `--isolate-home` is rejected with exit code 2, instructing the operator to either pass `--isolate-home` (accepting the keychain trade-off) or use an in-session summon rung.

---

## 2. Empirical Probes & Hard Signals

### Probe 1: Version Verification
```bash
agy --version
```
- Exit: 0
- Output: `1.2.13`

### Probe 2: Flag Inspection
```bash
agy --help
```
- Exit: 0
- Findings: Confirmed `--disable-slash-commands` and `--dangerously-skip-permissions` remain present. No new skill-directory redirection flags were added. Subcommands `agent`, `agents`, `changelog`, `help`, `install`, `mcp`, `mic-serve`, `models`, `plugin`, `plugins`, `remote-control`, `update` inspected.

### Probe 3: Keychain Mechanism (macOS Darwin)
```bash
security list-keychains
HOME=/tmp/agy-probe-fake security list-keychains
```
- Under real HOME:
  ```
  "/Users/marcotiongson/Library/Keychains/login.keychain-db"
  "/Library/Keychains/System.keychain"
  ```
- Under fake HOME (`/tmp/agy-probe-fake`):
  ```
  "/Library/Keychains/System.keychain"
  ```
- Verification: Verifies that redirecting `HOME` evicts the user's login keychain from the search list.

### Probe 4: Flag-Based Suppression under Real HOME
```bash
agy -p "List every skill and slash command you can see. Answer with counts only." \
  --disable-slash-commands --dangerously-skip-permissions --model gemini-3.8-flash-low
```
- Run 1 (Exit 0): `- **Skills:** 16`, `- **Slash commands:** 8`
- Run 2 (Exit 0): `- **Skills:** 16`, `- **Slash commands:** 8`
- Finding: In `agy` 1.2.13, `--disable-slash-commands` disables slash command expansion in print mode, but does not suppress ambient filesystem skills under real `HOME`.

### Probe 5: Ambient Skills Control under Real HOME
```bash
agy -p "List every skill and slash command you can see. Answer with counts only." \
  --dangerously-skip-permissions --model gemini-3.8-flash-low
```
- Exit: 0
- Output: `- **Skills:** 16`, `- **Slash commands:** 8`, `- **Total:** 24`

### Probe 6: Filesystem Discovery Root Enumeration
```bash
find ~/.gemini -name SKILL.md
```
- Exit: 0
- Total count: 157 `SKILL.md` files located across `~/.gemini/antigravity`, `~/.gemini/antigravity-cli`, `~/.gemini/antigravity-ide`, `~/.gemini/config`, and `~/.gemini/skills`.

### Probe 7: Config and Skills Directory Override Inspection
- Checked `agy --help`, `agy plugin --help`, `agy mcp --help`.
- Grepped strings of the 180MB `agy` binary: `strings -a "$(which agy)" | grep -iE "CONFIG_DIR|SKILLS_DIR|HOME"`.
- Findings: Found no environment variable or CLI flag that overrides the skills directory without redirecting `HOME`. `HOME` redirection is the sole mechanism available in `agy` for filesystem skill scoping.

---

## 3. Findings & Implementation

1. **Vanilla Login Invariant Preserved:** The default `agy-zero` launch plan maintains the real `HOME` and does not mutate shared state.
2. **Keychain Protection:** Real `HOME` execution prevents macOS login keychain disappearance, avoiding auth prompts and duplicate account creation.
3. **Explicit Isolation (`--isolate-home`):** Clean-room isolation is available as an explicit opt-in for users requiring a distinct sandbox.
4. **P3 Enforced:** Curated mode without `--isolate-home` fails fast with exit code 2, strictly prohibiting mutations to `~/.gemini`.
