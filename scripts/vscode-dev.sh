#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root_dir"

vscode_dir="$(find .vscode-test -maxdepth 1 -type d -name 'vscode-linux-*' -print 2>/dev/null | sort | tail -n 1)"
if [[ -z "$vscode_dir" || ! -x "$vscode_dir/code" ]]; then
  echo "VS Code Linux não foi instalado em .vscode-test." >&2
  echo "Execute 'npm test' no WSL uma vez para baixar o VS Code Linux." >&2
  exit 1
fi

exec "$vscode_dir/code" \
  "$@" \
  --extensionDevelopmentPath="$root_dir" \
  --user-data-dir="$root_dir/.vscode-test/user-data-dev" \
  --extensions-dir="$root_dir/.vscode-test/extensions-dev" \
  "$root_dir"
