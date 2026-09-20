#!/usr/bin/env bash
# Installs/updates desktop launchers for every RitesDev-ecosystem devApp in one pass.
# Safe to re-run any time an app changes (idempotent: overwrites in place, removes known stale entries).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"

echo "== RitesDev-ecosystem: installing/updating devApp launchers =="

# --- 1. Remove known stale/legacy desktop entries that no longer match this repo ---
STALE_FILES=(
	"blogrites-content-editor.desktop"   # replaced by ritesdev-content-editor.desktop
	"ritesdev-content-editor.desktop"    # app removed from the repo
	"dev-master.desktop"                 # app removed from the repo
	"blog-post-manager.desktop"          # now a tab inside RitesDev App
	"ritesDevLauncher.desktop"           # renamed to ritesDevApp.desktop
)
for f in "${STALE_FILES[@]}"; do
	if [ -f "$APPS_DIR/$f" ]; then
		echo "🧹 Removing stale entry: $f"
		rm -f "$APPS_DIR/$f"
	fi
done

# --- 2. (name -> source .desktop file) pairs to install/refresh ---
declare -A APPS=(
	["ritesDevApp.desktop"]="$SCRIPT_DIR/ritesDevApp/ritesDevApp.desktop"
	["siteHosting.desktop"]="$SCRIPT_DIR/siteHosting/siteHosting.desktop"
)

for dest_name in "${!APPS[@]}"; do
	src="${APPS[$dest_name]}"
	dest="$APPS_DIR/$dest_name"

	if [ ! -f "$src" ]; then
		echo "⚠️  Skipping $dest_name — source not found at $src"
		continue
	fi

	cp "$src" "$dest"
	chmod 644 "$dest"
	echo "✓ Installed $dest_name"
done

# ritesDevApp uses `npm start` (not a static Exec path) — keep that override
if [ -f "$APPS_DIR/ritesDevApp.desktop" ]; then
	sed -i "s|Exec=.*|Exec=bash -c 'cd $SCRIPT_DIR/ritesDevApp \&\& npm start'|" "$APPS_DIR/ritesDevApp.desktop"
fi

chmod +x "$SCRIPT_DIR/ritesDevApp/launch.sh" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/siteHosting/launch.sh" 2>/dev/null || true

if command -v update-desktop-database &>/dev/null; then
	update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

echo ""
echo "✨ Done. Installed launchers:"
for dest_name in "${!APPS[@]}"; do
	[ -f "$APPS_DIR/$dest_name" ] && echo "  - $dest_name"
done
echo ""
echo "Re-run this script any time after moving/renaming devApps to keep the app menu in sync."
