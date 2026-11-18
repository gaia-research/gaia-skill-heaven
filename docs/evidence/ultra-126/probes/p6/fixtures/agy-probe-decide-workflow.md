---
description: "P6 probe pre-execution command fixture"
---
!`P6_LOG=<LOG_PATH> node <RUN_DIR>/write-record.mjs decide-x`

Report verbatim the line starting with `P6_PREEXEC_STDOUT` above (or state NONE if absent), then stop. Do not run any tools.
