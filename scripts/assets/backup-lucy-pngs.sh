#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
backup_root="$repo_root/lucy-masters-backup"

mkdir -p "$backup_root"
cd "$repo_root"

copied=0
while IFS= read -r -d '' source; do
  relative="${source#./}"
  target="$backup_root/$relative"
  mkdir -p "$(dirname "$target")"
  cp -p "$source" "$target"
  copied=$((copied + 1))
done < <(
  find . -type f -iname '*.png' \
    -not -path './.git/*' \
    -not -path './node_modules/*' \
    -not -path './dist/*' \
    -not -path './lucy-masters-backup/*' \
    -print0
)

printf 'Backed up %d PNG files as-is under %s\n' "$copied" "$backup_root"
