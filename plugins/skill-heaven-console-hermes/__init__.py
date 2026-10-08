"""Native, explicit command-backed Hermes console. Stateless: no cross-session
buffer, database scan, injected context, permission decisions or shared writes.
The Node painter is bundled from packages/status, not a second semantic model.
"""
import json
import re
import shlex
import subprocess
from pathlib import Path

_CORE = re.compile(r"^mcp__agent_plugin_skill_heaven_[0-9a-f]{8}__skill_summon__summon$")
_SCRIPT = Path(__file__).parent / "scripts" / "heaven.mjs"
_SECTIONS = {"all", "status", "lens", "session", "scope", "flow", "trust"}


def _run(argv, frame=None):
    try:
        out = subprocess.run(
            ["node", str(_SCRIPT), "--host", "hermes", *argv],
            input=json.dumps(frame) if frame is not None else "",
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
        from tools.registry import registry
        # Exact Core namespace with the source hash Hermes assigns. Ambiguity fails closed.
        names = [n for n in registry.get_all_tool_names() if _CORE.fullmatch(n)]
        if len(names) != 1:
            return "Skill Heaven Lens: Core tool unavailable or ambiguous; no tool called."
        try:
            result = ctx.dispatch_tool(names[0], {"query": query, "surface": "any", "preview": True})
            if not isinstance(result, str) or len(result.encode("utf-8")) > 128 * 1024:
                return "Skill Heaven Lens: preview result unavailable or exceeds bound."
            # Only this command's exact result crosses the pipe. It is not the full
            # session history, so complete:false leaves session counts unknown.
            return _run(["--observations-stdin", "--surface", "lens"], {"rows": [{"result": result, "preview": True}], "complete": False})
        except Exception:
            return "Skill Heaven Lens: Core preview failed; nothing submitted."

    ctx.register_command("lens", handler=lens, description="Explicit preview on existing Core tool; printed handoff", args_hint="<need>")
