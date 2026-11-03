# agy-zero

`agy-zero` is the **Google Antigravity door** to Skill Zero.

It boots `agy` without interfering with your existing login or macOS login keychain, while keeping the door open for dynamic, on-demand `/summon`.

## Usage

```bash
agy-zero                                          # product-floor (default, uses real HOME)
agy-zero --isolate-home                           # opt-in session HOME isolation (second account)
agy-zero --level native                           # Antigravity untouched
agy-zero --level low --skill /path --isolate-home # curated readmission (requires --isolate-home)
agy-zero --print                                  # print composed launch plan
agy-zero -p "hello"                               # headless prompt
```

## Postures

- **`floor`** (`--posture floor`): The doorless benchmark floor. Suppresses slash commands and skill expansion (in headless print mode). Runs against real HOME by default (or session HOME with `--isolate-home`).
- **`product-floor`** (`--level zero`): The default doorful floor. Preserves vanilla credentials and macOS login keychain without repeated auth dialogs.
- **`curated`** (`--level low --skill <path> --isolate-home`): Clean room with named skills copied into a temporary session profile. Requires `--isolate-home` to prevent mutating shared state (P3).
- **`native`** (`--level native`): Native Antigravity environment untouched.

