#!/usr/bin/env bash
# Installs the Dev Master launcher into the user's application menu.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/applications"

mkdir -p "$DEST_DIR"
cp "$SCRIPT_DIR/dev-master.desktop" "$DEST_DIR/dev-master.desktop"
chmod +x "$SCRIPT_DIR/launch.sh"
update-desktop-database "$DEST_DIR" 2>/dev/null || true

echo "Installed. Search for 'Dev Master' in the KDE application launcher."
