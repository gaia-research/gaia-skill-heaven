# Delivery + Install Plan

> **WORKING PROTOTYPE — actively tested for public use, not a finished product.**
> Interfaces, flags, postures, and command surfaces may change.

Status: five source-built launcher commands and the `skill-heaven` Claude
plugin (five in-session commands — `/summon`, `/skill-zero`, `/skill-heaven`,
`/skill-hell`, `/skill-ultra`) are on `main`; GitHub Pages is live. The
plugin's summon engine is bundled inside it (`packages/skill-summon`, an
in-repo port — see `docs/AGENT-PLUGIN.md`); there is no external package to
install and no `npx` install path. The launcher door packages are
deliberately not published to npm. Live execution remains a per-harness,
probe-backed claim rather than a five-door universal guarantee.

## 1. How a stranger installs everything

**Primary path — the plugin**, two lines, no terminal beyond Claude Code
itself (`docs/AGENT-PLUGIN.md` settles this as the primary install against
issues #47/#53):

```
/plugin marketplace add gaia-research/gaia-skill-heaven
/plugin install skill-heaven@gaia-skill-heaven
```

This installs the one `skill-heaven` plugin with its summon engine bundled
inside it — no sibling repository, no external binary, no `npx`, no build
step.

**Optional path — the standalone launcher doors**, for the five source-built
`*-zero` binaries independent of Claude Code:

```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh
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
that does not exist. GitHub Pages is the repository's first-party HTTPS host,
and a POSIX `install.sh` can fetch the public source archive for the optional
launcher doors — there is no separate engine package to install alongside it,
since the summon engine ships bundled inside the plugin. The script checks
Node 22+, npm, curl, tar, and mktemp before changing the install, and its
source is inspectable at the same URL before execution.

### Install boundary and PATH

The default installation is `$HOME/.local/share/gaia-skill-heaven`; source, runtime
dependencies, bins, ownership markers, and uninstaller all stay under
that directory. Claude plugin registration uses Claude Code's own supported
plugin commands and is ownership-tracked so uninstall never removes a plugin or
marketplace that predated this installer.

The script does not edit shell startup files. If needed, it prints the exact
line:

```bash
export PATH="$HOME/.local/share/gaia-skill-heaven/bin:$PATH"
```

Each door execs only a harness the user already owns. `--print` composes a plan
without starting that harness.

### Update and uninstall

Re-running the install command atomically replaces the source/runtime tree,
updates the marketplace, and updates the plugin instead of duplicating it.

```bash
$HOME/.local/share/gaia-skill-heaven/uninstall.sh
```

Uninstall removes all five doors, the install directory, and only
installer-owned Claude plugin state. The equivalent remote path is:

```bash
curl -fsSL https://gaia-research.github.io/gaia-skill-heaven/install.sh | sh -s -- --uninstall
```

## 2. Delivery surfaces

### GitHub Pages

`https://gaia-research.github.io/gaia-skill-heaven/` is live and serves the Vite
site with relative assets. `.github/workflows/pages.yml` copies the reviewed
root `install.sh` byte-for-byte into the Pages artifact as `/install.sh`; a
change to the script triggers a deployment.

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
integer }`). There is no upper cap — nothing assigns a ceiling, so the engine
must not invent one; a malformed `limit` is refused, never clamped.
`gaia_search`, `gaia_inspect`, and `gaia_status` — tools the old external
package exposed — are not ported; whether dropping them degrades summon
quality is a benchmark question, filed upstream. Hell/Heaven scoring, routing
eligibility, and content-hash admission or verification are not shipped —
routing falls back to relevance ranking.

The external `@gaia-research/mcp` package (the `skill-hell` binary, the
sibling `gaia-mcp` repo) is **deprecated**. This repo's installer and plugin
no longer reference it; it is kept installable on npm only so that copies of
this repo's `install.sh` predating this change keep working.

### Claude plugin

The repository is the `gaia-skill-heaven` Claude marketplace. Registration installs
`skill-heaven@gaia-skill-heaven`, the one plugin, which supplies the ladder
commands. Existing `claude-zero@gaia-skill-heaven` installs migrate on
`/plugin marketplace update` via the `renames` entry in `marketplace.json`.
The installer uses an HTTPS marketplace URL so public installation does not
depend on GitHub SSH credentials.

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

- **Windows:** no PowerShell installer is shipped. It was not tested; issue #41
  remains the tracking issue. Untested `iex` copy would be worse than no copy.
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
| #41 cross-platform | macOS path proved. POSIX Linux intent is implemented but unprobed; Windows is deliberately not shipped. |
| #32 terminal vs desktop app | Terminal install path only; desktop remains open. |
| #30 split plugin namespace | Unchanged: all five commands remain in one plugin. |
| #40 Agent Plugins | Unchanged: existing Claude marketplace delivery remains in use. |
