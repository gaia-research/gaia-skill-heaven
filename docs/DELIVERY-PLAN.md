# Delivery + Install Plan

> **WORKING PROTOTYPE — actively tested for public use, not a finished product.**
> Interfaces, flags, postures, and command surfaces may change.

Status: five source-built launcher commands and one portable `skill-heaven`
Agent Plugin (five in-session commands — `/summon`, `/skill-zero`,
`/skill-heaven`, `/skill-hell`, `/skill-ultra`) are on `main`; GitHub Pages is
live. The plugin's summon engine is bundled inside it (`packages/skill-summon`,
an in-repo port — see `docs/AGENT-PLUGIN.md`); there is no external package to
install and no `npx` install path. Claude marketplace compatibility remains a
client delivery route, not the package identity. Live execution remains a
per-harness, probe-backed claim.

## 1. How a stranger installs everything

**Primary path — the portable Agent Plugin:**

**macOS / Linux (POSIX):**
```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://gaia-research.github.io/gaia-skill-heaven/install-agent-plugin.ps1 | iex
```

This installs one stable `skill-heaven` package and local marketplace without
silently editing a harness. Standards-conformant clients load the printed
plugin directory; pinned client registration commands live in the README.
Claude Code may still use its tested public marketplace two-liner. Frontend
surfaces are tracked separately in #79.

**Optional path — the standalone launcher doors**, for the five source-built
`*-zero` binaries independent of Claude Code:

**macOS / Linux (POSIX):**
```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
```

**Windows (PowerShell):**
```powershell
irm https://gaia-research.github.io/gaia-skill-heaven/install.ps1 | iex
```

The command installs:

- `claude-zero`
- `pi-zero`
- `codex-zero`
- `hermes-zero`
- `grok-zero`
- the `skill-heaven@gaia-skill-heaven` Claude plugin (the same plugin as the
  primary path above), when the user's own `claude` binary is already on `PATH`

It never installs Claude Code, pi, Codex, Hermes, or Grok. A missing harness
does not block its door from installing. When Claude Code is absent, plugin
registration is the one operation that cannot run; the installer says so and
prints the exact two commands to run after the user installs that harness.

### Why this shape

The five door packages are not on npm, so `npx` would advertise an artifact
that does not exist. GitHub Pages is the repository's first-party HTTPS host.
The POSIX plugin installer fetches the self-contained package and requires Node
22+, Git, curl, tar, and mktemp; the separate launcher installer additionally
uses npm. Neither installs a harness.

### Install boundary and PATH

The plugin artifact defaults to
`$HOME/.local/share/gaia-skill-heaven-agent-plugin` (or
`$env:LOCALAPPDATA\gaia-skill-heaven-agent-plugin` on Windows); its marketplace,
package, marker, and uninstaller stay under that directory. Client caches and
registrations remain client-owned. The optional launchers stay separately under
`$HOME/.local/share/gaia-skill-heaven` (or
`$env:LOCALAPPDATA\gaia-skill-heaven` on Windows).

The script does not edit shell startup files. If needed, it prints the exact
line:

**POSIX:**
```bash
export PATH="$HOME/.local/share/gaia-skill-heaven/bin:$PATH"
```

**Windows (PowerShell):**
```powershell
$env:Path = "$env:LOCALAPPDATA\gaia-skill-heaven\bin;$env:Path"
```

Each door execs only a harness the user already owns. `--print` composes a plan
without starting that harness.

### Update and uninstall

Re-running the Agent Plugin installer atomically replaces its local artifact.
Clients that cache plugins still need their own update/reinstall command.

**POSIX:**
```bash
$HOME/.local/share/gaia-skill-heaven-agent-plugin/uninstall.sh
```

**Windows (PowerShell):**
```powershell
& "$env:LOCALAPPDATA\gaia-skill-heaven-agent-plugin\uninstall.ps1"
```

That removes only the local artifact, never client-managed copies or
registrations. The optional launchers retain their separate uninstaller at
`$HOME/.local/share/gaia-skill-heaven/uninstall.sh` (or
`$env:LOCALAPPDATA\gaia-skill-heaven\uninstall.ps1` on Windows).

## 2. Delivery surfaces

### GitHub Pages

`https://gaia-research.github.io/gaia-skill-heaven/` is live and serves the Vite
site with relative assets. `.github/workflows/pages.yml` copies the reviewed
root installers byte-for-byte into the Pages artifact as `/install.sh`,
`/install.ps1`, `/install-agent-plugin.sh`, and `/install-agent-plugin.ps1`; a
change to any script triggers a deployment.

### Door source

The installer downloads the public `main` source archive and runs the package
lock's production install. The source-only door manifests remain unpublished;
their local `0.1.0` values are not public release claims. No installer step
publishes a door or a harness.

### Summon engine

The summon engine is `packages/skill-summon` — an in-repo TypeScript port,
not an external package. It ships as a committed MCP bundle inside the plugin
(`plugins/skill-heaven/mcp/`, wired through `.mcp.json`) — see
`docs/AGENT-PLUGIN.md` for the packaging contract. There is no `npx` install
path and no separate binary to select.

The bundle exposes one tool, `summon` (`{ query: string, limit?: positive
integer, surface?: "any" | "heaven" | "hell" }`). There is no upper cap —
nothing assigns a ceiling, so the engine must not invent one; a malformed
`limit` is refused, never clamped.
`gaia_search`, `gaia_inspect`, and `gaia_status` — tools the old external
package exposed — are not ported; whether dropping them degrades summon
quality is a benchmark question, filed upstream. One Skill URL resolves either
a tree website (derived generic plus named projections) or a flat GitHub
`SKILL.md` fleet. Flat fleets route by relevance and enforce Matt Pocock's
`disable-model-invocation` distinction: human-led skills route through Heaven;
model-led skills may route automatically through Hell. Benchmark trust scoring
and content-hash admission remain unshipped.

The external `@gaia-research/mcp` package (the `skill-hell` binary, the
sibling `gaia-mcp` repo) is **deprecated**. This repo's installer and plugin
no longer reference it; it is kept installable on npm only so that copies of
this repo's `install.sh` predating this change keep working.

### Client compatibility

The portable core is root `plugin.json`, `mcp.json`, and `skills/`. Thin
compatibility files serve pinned clients that still require their own package
shape. The repository remains the `gaia-skill-heaven` Claude marketplace, and
existing `claude-zero@gaia-skill-heaven` installs migrate through its `renames`
entry. See `plugins/skill-heaven/PROBE.md` for pinned hard signals.

## 3. Verification contract

A release candidate is not complete until a visible herdr pane proves all of:

1. the five door command names are absent from a sanitized starting `PATH`;
2. the real installer runs from a clean `HOME`;
3. all five `<door> --print` commands return product-floor plans;
4. the plugin's bundled summon engine performs a real summon via `/summon` in
   a live harness session;
5. a second install updates cleanly;
6. uninstall removes the five doors, plugin, marketplace, and install
   directory.

WP18's literal run is recorded in [INSTALL-TRANSCRIPT.md](INSTALL-TRANSCRIPT.md),
a dated historical transcript of the now-deprecated external-engine install
path — not current installation guidance. Its `@0.3.0` lines predate the
plugin-bundled summon engine described above.

## 4. Honest boundaries

- **Windows:** PowerShell installers shipped (`install.ps1`,
  `install-agent-plugin.ps1`); tested on PowerShell 5.1+ and 7+. Linux POSIX
  remains tested on macOS; Linux remains part of issue #41.
- **Linux:** the script is POSIX `sh`, but WP18's empirical run was macOS. Linux
  remains part of issue #41.
- **Claude Desktop:** unprobed; issue #32 remains open.
- **Cursor:** recipe-only by M0 evidence; there is no launcher door to install.
- **pi extension:** ships in the source tree but has no independent install
  surface.
- **Engine help flag (historical):** the now-deprecated external engine's
  observed `skill-hell --help` path resolved the installed binary and printed
  usage, but the upstream CLI labelled `--help` an unknown command and exited
  1. That binary is no longer installed by this repo's `install.sh`; the
  dated transcript records both results rather than hiding the help-flag
  behavior, but it is not current guidance.

## 5. Issue coverage

| Issue | WP18 effect |
|---|---|
| #34 zero-manual-update delivery | Partially addressed: one rerunnable command atomically updates doors, marketplace, and plugin. Release audit trail and rollback remain open. |
| #41 cross-platform | macOS path proved. POSIX Linux intent is implemented but unprobed; Windows PowerShell installers shipped (`install.ps1`, `install-agent-plugin.ps1`). |
| #32 terminal vs desktop app | Terminal install path only; desktop remains open. |
| #30 split plugin namespace | Unchanged: all five commands remain in one plugin. |
| #40 Agent Plugins | Portable package + harness-neutral artifact installer shipped; client registration remains client-owned. |
