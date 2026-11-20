#!/bin/sh
# Copy the Snake mod into a Herdr home. Refuses to overwrite an existing mods/herdr-snake
# unless --force is given. It doesn't touch any layout: add the two blocks from the
# README to yours afterwards.
#   ./scripts/install.sh            stop if mods/herdr-snake is already there
#   ./scripts/install.sh --force    replace it
# HERDR_APP_HOME picks another Herdr home (default ~/.config/herdr-app).
set -eu
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
FORCE="${1:-}"

case "$FORCE" in ""|--force) ;; *) echo "Usage: $0 [--force]" >&2; exit 2 ;; esac
[ -d "$HOME_DIR" ] || { echo "No Herdr home at $HOME_DIR. Open the Herdr app once first." >&2; exit 1; }
if [ "$FORCE" != "--force" ] && [ -e "$HOME_DIR/mods/herdr-snake" ]; then
  echo "$HOME_DIR/mods/herdr-snake exists. Re-run with --force to replace it." >&2; exit 1
fi
mkdir -p "$HOME_DIR/mods/herdr-snake"
for f in main.js mod.json snake.svg; do cp "$REPO/mods/herdr-snake/$f" "$HOME_DIR/mods/herdr-snake/"; done
if command -v herdr-app >/dev/null; then
  out=$(herdr-app check "$HOME_DIR/mods/herdr-snake" 2>&1) || { echo "check failed: herdr-snake" >&2; echo "$out" >&2; }
fi
echo "Installed Snake $(cat "$REPO/VERSION" 2>/dev/null) in $HOME_DIR/mods/herdr-snake."
echo "Next: add its panel block and its button block to your layout (see the README)."
