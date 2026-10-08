---
description: Explicit read-only Skill Heaven console report (model-mediated).
---
# Skill Heaven console (preview)
This command is model-mediated, not a native pane or persistent HUD.
Run `node "${GROK_PLUGIN_ROOT}/scripts/heaven.mjs" --host grok` and print stdout verbatim. A person may supply `--session-root`; use only the exact Core sessionRoot returned by the summon tool in THIS conversation. Never look for a newest directory, scan unrelated session logs or infer a session from the working directory. Without a binding the report says unknown, not zero. No raw transcript export, shared config edits or hidden submission. Printed commands are suggestions only.

Only on explicit `/heaven lens <need>`: call the existing Core skill-summon tool once with query <need>, surface any and preview:true. Never start another summon server or call without preview. Run the report using the exact sessionRoot from that result, if present. The human types a printed /summon suggestion; you never submit it or read a candidate body automatically. Disclose that this preview and report are model-mediated. If Core is missing, say unavailable.
