# Delivery + Install Plan

> **WORKING PROTOTYPE — actively tested for public use, not a finished product.**
> Interfaces, flags, postures, and command surfaces may change.

Status: all five launcher doors and both Claude commands are on `main`; GitHub
Pages is live; and published `@gaia-research/mcp@0.3.0` supplies a working
`skill-hell` binary. The launcher packages are deliberately not published to
npm. The one-command installer is therefore the public delivery path.

## 1. How a stranger installs everything

```bash
curl -fsSL https://gaia-research.github.io/skill-heaven/install.sh | sh
```

The command installs:

- `claude-heaven`
- `pi-heaven`
- `codex-heaven`
- `hermes-heaven`
- `grok-heaven`
- `skill-hell` from published `@gaia-research/mcp@0.3.0`
- the `claude-heaven@skill-heaven` Claude plugin, when the user's own `claude`
  binary is already on `PATH`

It never installs Claude Code, pi, Codex, Hermes, or Grok. A missing harness
does not block its door from installing. When Claude Code is absent, plugin
registration is the one operation that cannot run; the installer says so and
prints the exact two commands to run after the user installs that harness.

### Why this shape

The five door packages are not on npm, so `npx` would advertise an artifact
that does not exist. GitHub Pages is the repository's first-party HTTPS host,
and a POSIX `install.sh` can fetch the public source archive while installing
the independently published summon engine in the same transaction. The script
checks Node 22+, npm, curl, tar, and mktemp before changing the install, and its
source is inspectable at the same URL before execution.

### Install boundary and PATH

The default installation is `$HOME/.local/share/skill-heaven`; source, runtime
dependencies, engine, bins, ownership markers, and uninstaller all stay under
that directory. Claude plugin registration uses Claude Code's own supported
plugin commands and is ownership-tracked so uninstall never removes a plugin or
marketplace that predated this installer.

The script does not edit shell startup files. If needed, it prints the exact
line:

```bash
export PATH="$HOME/.local/share/skill-heaven/bin:$PATH"
```

Each door execs only a harness the user already owns. `--print` composes a plan
without starting that harness.

### Update and uninstall

Re-running the install command atomically replaces the source/runtime tree,
reinstalls the pinned working engine, updates the marketplace, and updates the
plugin instead of duplicating it.

```bash
$HOME/.local/share/skill-heaven/uninstall.sh
```

Uninstall removes all five doors, the locally installed engine, the install
directory, and only installer-owned Claude plugin state. The equivalent remote
path is:

```bash
curl -fsSL https://gaia-research.github.io/skill-heaven/install.sh | sh -s -- --uninstall
```

## 2. Delivery surfaces

### GitHub Pages

`https://gaia-research.github.io/skill-heaven/` is live and serves the Vite
site with relative assets. `.github/workflows/pages.yml` copies the reviewed
root `install.sh` byte-for-byte into the Pages artifact as `/install.sh`; a
change to the script triggers a deployment.

### Door source

The installer downloads the public `main` source archive and runs the package
lock's production install. The six npm-ready package manifests remain at
`0.1.0`, but publication remains founder-only and is not part of this delivery.
No installer step publishes them.

### Summon engine

`@gaia-research/mcp@0.3.0` is public and its npm `bin` map includes both
`gaia-mcp` and `skill-hell`. The installer pins that verified version, installs
it locally under the Skill Heaven directory rather than into npm's global
prefix, and refuses an engine package that lacks an executable `skill-hell`.

### Claude plugin

The repository is the `skill-heaven` Claude marketplace. Registration installs
`claude-heaven@skill-heaven`, which supplies `/skill-heaven` and `/skill-hell`.
The installer uses an HTTPS marketplace URL so public installation does not
depend on GitHub SSH credentials.

## 3. Verification contract

A release candidate is not complete until a visible herdr pane proves all of:

1. the six command names are absent from a sanitized starting `PATH`;
2. the real installer runs from a clean `HOME`;
3. all five `<door> --print` commands return product-floor plans;
4. `skill-hell` resolves to `@gaia-research/mcp@0.3.0` and performs a real
   summon;
5. a second install updates cleanly;
6. uninstall removes the five doors, engine, plugin, marketplace, and install
   directory.

WP18's literal run is recorded in [INSTALL-TRANSCRIPT.md](INSTALL-TRANSCRIPT.md).

## 4. Honest boundaries

- **Windows:** no PowerShell installer is shipped. It was not tested; issue #41
  remains the tracking issue. Untested `iex` copy would be worse than no copy.
- **Linux:** the script is POSIX `sh`, but WP18's empirical run was macOS. Linux
  remains part of issue #41.
- **Claude Desktop:** unprobed; issue #32 remains open.
- **Cursor:** recipe-only by M0 evidence; there is no launcher door to install.
- **pi extension:** ships in the source tree but has no independent install
  surface.
- **Engine help flag:** `skill-hell@0.3.0 --help` resolves the installed binary
  and prints usage, but the upstream CLI labels `--help` an unknown command and
  exits 1. `skill-hell summon "code review" --card` succeeds; the transcript
  records both results rather than hiding the help-flag behavior.

## 5. Issue coverage

| Issue | WP18 effect |
|---|---|
| #34 zero-manual-update delivery | Partially addressed: one rerunnable command atomically updates doors, engine, marketplace, and plugin. Release audit trail and rollback remain open. |
| #41 cross-platform | macOS path proved. POSIX Linux intent is implemented but unprobed; Windows is deliberately not shipped. |
| #32 terminal vs desktop app | Terminal install path only; desktop remains open. |
| #30 split plugin namespace | Unchanged: both commands remain in one plugin. |
| #40 Agent Plugins | Unchanged: existing Claude marketplace delivery remains in use. |
