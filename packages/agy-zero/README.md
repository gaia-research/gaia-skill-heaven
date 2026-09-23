# agy-zero

`agy-zero` is the **Google Antigravity door** to Skill Zero.

It boots `agy` into an isolated, session-scoped clean room where ambient user skills and plugins are suppressed by default, while keeping the door open for dynamic, on-demand `/summon`.

## Usage

```bash
agy-zero                                  # off/product-floor (default)
agy-zero --level native                   # Antigravity untouched
agy-zero --level low --skill /path/to/skill # curated readmission
agy-zero --print                          # print composed launch plan
agy-zero -p "hello"                       # headless prompt
```

## Postures

- **`floor`** (`--posture floor`): The doorless benchmark floor. Suppresses slash commands, skills, and plugins.
- **`product-floor`** (`--level zero`): The default doorful floor. Isolates ambient skills and plugins while leaving slash commands active.
- **`curated`** (`--level low --skill <path>`): Verified clean room with named skills copied into the session profile.
- **`native`** (`--level native`): Native Antigravity environment untouched.
