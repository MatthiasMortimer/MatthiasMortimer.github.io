#!/usr/bin/env bash
# Installs the Blog Post Manager launcher into the user's application menu.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/applications"

mkdir -p "$DEST_DIR"
cp "$SCRIPT_DIR/blog-post-manager.desktop" "$DEST_DIR/blog-post-manager.desktop"
chmod +x "$SCRIPT_DIR/post_manager.py"
update-desktop-database "$DEST_DIR" 2>/dev/null || true

echo "Installed. Search for 'Blog Post Manager' in the KDE application launcher."
