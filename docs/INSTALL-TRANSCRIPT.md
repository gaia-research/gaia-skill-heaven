# WP18 install transcript

Visible herdr pane: `w8:p1B`

Clean test root: `/private/tmp/skill-heaven-wp18-final`

Remote script: branch copy byte-identical to reviewed `install.sh` at commit
`27d92cc56f06685d8fe13951901022ef5e64e4c4`.

The Pages workflow built the `/install.sh` artifact successfully in
[run 31239783816](https://github.com/gaia-research/skill-heaven/actions/runs/31239783816),
but the `github-pages` environment correctly rejected a deployment from a
non-`main` branch. The production Pages URL therefore remains 404 until this PR
merges and the `main` workflow deploys. The executable remote proof used the
pushed branch URL; the install itself downloaded door source from `main`.

```text
$ export HOME=/private/tmp/skill-heaven-wp18-final
$ mkdir -p "$HOME/tools" && ln -s /Users/marcotiongson/.local/bin/claude "$HOME/tools/claude"
$ export PATH="$HOME/tools:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
$ for cmd in claude-heaven pi-heaven codex-heaven hermes-heaven grok-heaven skill-hell; do command -v "$cmd" >/dev/null 2>&1 && printf 'PRECONDITION FAILED %s\n' "$cmd" || printf 'precondition %s: absent\n' "$cmd"; done
precondition claude-heaven: absent
precondition pi-heaven: absent
precondition codex-heaven: absent
precondition hermes-heaven: absent
precondition grok-heaven: absent
precondition skill-hell: absent
$ curl -fsSL https://raw.githubusercontent.com/gaia-research/skill-heaven/feat/one-command-install/install.sh | sh
SKILL HEAVEN — WORKING PROTOTYPE, actively tested for public use.
Installing all five doors, the Claude plugin, and the skill-hell summon engine.
Harnesses are never installed; every door uses the user's own harness binary.
Fetching Skill Heaven source (main) ...
Installing launcher runtime dependencies ...

added 22 packages in 1s
Installing the published summon engine (@gaia-research/mcp@0.3.0) ...

added 94 packages in 3s
Claude Code detected; installing its /skill-heaven and /skill-hell plugin ...
Refreshing marketplace cache (timeout: 120s)…
Cloning repository (timeout: 120s): https://github.com/gaia-research/skill-heaven.git
Clone complete, validating marketplace…
Cleaning up old marketplace cache…
✔ Successfully added marketplace: skill-heaven (declared in user settings)
✔ Successfully installed plugin: claude-heaven@skill-heaven (scope: user)
Claude plugin ready: /skill-heaven and /skill-hell.
Installed launcher doors:
  claude-heaven
  pi-heaven
  codex-heaven
  hermes-heaven
  grok-heaven
Installed summon engine: skill-hell (@gaia-research/mcp@0.3.0)
Harnesses detected (not installed by this script):
  claude: yes
  pi: yes
  codex: no
  hermes: no
  grok: no
Add the install directory to PATH (this installer does not edit shell rc files):
  export PATH="/private/tmp/skill-heaven-wp18-final/.local/share/skill-heaven/bin:$PATH"
Uninstall everything this command added with:
  /private/tmp/skill-heaven-wp18-final/.local/share/skill-heaven/uninstall.sh
Install complete. Re-run the same one-liner to update idempotently.

$ export PATH="$HOME/.local/share/skill-heaven/bin:$PATH"
$ claude-heaven --print >"$HOME/claude.json" && node -e 'const p=require(process.argv[1]); console.log("claude-heaven --print => posture="+p.posture+" command="+p.command)' "$HOME/claude.json"
claude-heaven --print => posture=product-floor command=claude
$ pi-heaven --print >"$HOME/pi.json" && node -e 'const p=require(process.argv[1]); console.log("pi-heaven --print => posture="+p.posture+" command="+p.command)' "$HOME/pi.json"
pi-heaven --print => posture=product-floor command=pi
$ codex-heaven --print >"$HOME/codex.json" && node -e 'const p=require(process.argv[1]); console.log("codex-heaven --print => posture="+p.posture+" command="+p.command)' "$HOME/codex.json"
codex-heaven --print => posture=product-floor command=codex
$ hermes-heaven --print >"$HOME/hermes.json" && node -e 'const p=require(process.argv[1]); console.log("hermes-heaven --print => posture="+p.posture+" command="+p.command)' "$HOME/hermes.json"
hermes-heaven --print => posture=product-floor command=hermes
$ grok-heaven --print >"$HOME/grok.json" && node -e 'const p=require(process.argv[1]); console.log("grok-heaven --print => posture="+p.posture+" command="+p.command)' "$HOME/grok.json"
grok-heaven --print => posture=product-floor command=grok
$ skill-hell --help >"$HOME/help.txt" 2>&1; help_code=$?; head -8 "$HOME/help.txt"
skill-hell: Unknown command: --help

Usage:
  skill-hell summon "<intent>" [--count N] [--card | --json]
  skill-hell list [--json]
  skill-hell sessions [--json]
  skill-hell attach <session-id|name|root> [--json]
  skill-hell path [--json]
$ printf 'skill-hell --help exit=%s; %s\n' "$help_code" "$(node -p '\"@gaia-research/mcp@\"+require(process.argv[1]).version' "$HOME/.local/share/skill-heaven/engine/node_modules/@gaia-research/mcp/package.json")"
skill-hell --help exit=1; @gaia-research/mcp@0.3.0
$ skill-hell summon "code review" --card
skill-hell: no active session; created one.
skill-hell: reuse it across commands with: export SKILL_HELL_SESSION=/var/folders/lx/k6kw155s56d7l_crqplcn8nw0000gn/T/skill-hell-2vuWZJ
[Summoned] Review
  ID: garrytan/review
  Trust: Level 3★ · Trust Magnitude 63.73 · Overall Trust Grade B
  Ranking: trust then relevance — level, trustMagnitude
  Install: 0.933s · warm/payload · 13 files
  Path: /var/folders/lx/k6kw155s56d7l_crqplcn8nw0000gn/T/skill-hell-2vuWZJ/skills/garrytan__review
  Inspect: https://github.com/garrytan/gstack/blob/main/review/SKILL.md

$ curl -fsSL https://raw.githubusercontent.com/gaia-research/skill-heaven/feat/one-command-install/install.sh | sh
SKILL HEAVEN — WORKING PROTOTYPE, actively tested for public use.
Installing all five doors, the Claude plugin, and the skill-hell summon engine.
Harnesses are never installed; every door uses the user's own harness binary.
Fetching Skill Heaven source (main) ...
Installing launcher runtime dependencies ...

added 22 packages in 428ms
Installing the published summon engine (@gaia-research/mcp@0.3.0) ...

added 94 packages in 663ms
Claude Code detected; installing its /skill-heaven and /skill-hell plugin ...
Refreshing marketplace cache (timeout: 120s)…
✔ Successfully updated marketplace: skill-heaven
Checking for updates for plugin "claude-heaven@skill-heaven" at user scope…
✔ claude-heaven is already at the latest version (44f0e9d7a920).
Claude plugin ready: /skill-heaven and /skill-hell.
Installed launcher doors:
  claude-heaven
  pi-heaven
  codex-heaven
  hermes-heaven
  grok-heaven
Installed summon engine: skill-hell (@gaia-research/mcp@0.3.0)
PATH already includes /private/tmp/skill-heaven-wp18-final/.local/share/skill-heaven/bin
Install complete. Re-run the same one-liner to update idempotently.

$ "$HOME/.local/share/skill-heaven/uninstall.sh"
Skill Heaven working prototype — uninstalling everything from /private/tmp/skill-heaven-wp18-final/.local/share/skill-heaven
Removing Claude plugin claude-heaven@skill-heaven ...
✔ Successfully uninstalled plugin: claude-heaven (scope: user)
Removing Claude marketplace skill-heaven ...
✔ Successfully removed marketplace: skill-heaven
Removed the five doors, skill-hell, and installer-managed Claude plugin state.
$ hash -r; for cmd in claude-heaven pi-heaven codex-heaven hermes-heaven grok-heaven skill-hell; do command -v "$cmd" >/dev/null 2>&1 && printf '%s: STILL PRESENT\n' "$cmd" || printf '%s: removed\n' "$cmd"; done
claude-heaven: removed
pi-heaven: removed
codex-heaven: removed
hermes-heaven: removed
grok-heaven: removed
skill-hell: removed
$ test ! -d "$HOME/.local/share/skill-heaven" && printf 'install directory: removed\n'
install directory: removed
$ printf 'plugins: '; claude plugin list --json; claude plugin marketplace list
plugins: []
No marketplaces configured
```
