"""Native, explicit command-backed Hermes console. Stateless: no cross-session
buffer, database scan, injected context, permission decisions or shared writes.
The Node painter is bundled from packages/status, not a second semantic model.
"""
import shlex
import subprocess
from pathlib import Path

_SCRIPT = Path(__file__).parent / "scripts" / "heaven.mjs"
_SECTIONS = {"all", "status", "lens", "session", "scope", "flow", "trust"}


def _run(argv):
    try:
        out = subprocess.run(
            ["node", str(_SCRIPT), "--host", "hermes", *argv],
            input="",
            text=True, capture_output=True, timeout=15, check=False,
        )
        return out.stdout if out.returncode == 0 else "Skill Heaven console: session source unavailable; no session guessed."
    except (OSError, subprocess.TimeoutExpired):
        return "Skill Heaven console: Node painter unavailable."


def _report(raw_args=""):
    try:
        args = shlex.split(raw_args or "")
    except ValueError:
        return "Usage: /heaven [section] [--session-root <exact Core sessionRoot>]"
    section = args.pop(0) if args and args[0] in _SECTIONS else "all"
    if args and (len(args) != 2 or args[0] != "--session-root"):
        return "Usage: /heaven [section] [--session-root <exact Core sessionRoot>]"
    # One caller-supplied root, in one argument. Never newest-session discovery.
    return _run(["--surface", section, *args])


def register(ctx):
    ctx.register_command("heaven", handler=_report, description="Read-only Skill Heaven console; exact Core sessionRoot required for counts", args_hint="[section] [--session-root <root>]")

    def lens(raw_args):
        query = (raw_args or "").strip()
        if not query or len(query) > 4096:
            return "Usage: /lens <need> (preview only)"
        # Public dispatch_tool reaches the registry, not the normal agent's
        # pre-tool policy/approval path. A human submits this printed draft;
        # ordinary host tool policy governs the call. No network or Core call.
        return _run(["--preview-draft", query, "--surface", "lens"])

    ctx.register_command("lens", handler=lens, description="Preview draft only; submit the handoff yourself", args_hint="<need>")
