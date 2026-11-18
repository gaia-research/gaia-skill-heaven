---
# Fixture setup: at run time, copy probes/p1/write-record.mjs into <run_dir>/write-record.mjs
# and replace <run_dir> with the mktemp -d absolute path when installing into
# <run_dir>/.claude/commands/probe-decide.md.
description: "P1 probe pre-execution command fixture"
allowed-tools: Bash(node:*)
---

!`node <run_dir>/write-record.mjs decide-x`

Report verbatim the line starting with `P1_PREEXEC_STDOUT` above (or state NONE if absent), then stop. Do not run any tools.
