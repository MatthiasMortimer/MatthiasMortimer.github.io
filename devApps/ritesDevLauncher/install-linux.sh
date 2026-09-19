#!/bin/bash

# RitesDev Launcher Installation Script for Linux (Fedora Plasma)
# This script installs the RitesDev Launcher as a native desktop application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="RitesDev Launcher"
DESKTOP_FILE="$SCRIPT_DIR/ritesDevLauncher.desktop"
APPS_DIR="$HOME/.local/share/applications"
INSTALLED_DESKTOP="$APPS_DIR/ritesDevLauncher.desktop"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Installing RitesDev Launcher for Fedora Plasma               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if desktop file exists
if [ ! -f "$DESKTOP_FILE" ]; then
	echo "❌ Error: Desktop file not found at $DESKTOP_FILE"
	exit 1
fi

# Create applications directory if needed
mkdir -p "$APPS_DIR"

# Copy and customize desktop file
echo "📋 Creating desktop file..."
cp "$DESKTOP_FILE" "$INSTALLED_DESKTOP"

# Update the Exec path to absolute path
sed -i "s|Exec=.*|Exec=bash -c 'cd $SCRIPT_DIR \&\& npm start'|" "$INSTALLED_DESKTOP"

# Validate desktop file
echo "✓ Desktop file created"

# Validate the desktop file format
if command -v desktop-file-validate &>/dev/null; then
	echo "🔍 Validating desktop file..."
	if desktop-file-validate "$INSTALLED_DESKTOP" >/dev/null 2>&1; then
		echo "✓ Desktop file is valid"
	else
		echo "⚠️  Desktop file validation warnings (non-critical)"
	fi
fi

# Update desktop database
echo "🔄 Updating desktop database..."
if command -v update-desktop-database &>/dev/null; then
	update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

echo ""
echo "✨ Installation complete!"
echo ""
echo "The RitesDev Launcher is now installed as a desktop application."
echo ""
echo "You can launch it by:"
echo "  • Searching for 'RitesDev Launcher' in your applications menu"
echo "  • Double-clicking the launcher icon in Plasma"
echo "  • Running: npm start (from this directory)"
echo ""
echo "Or manually from the terminal:"
echo "  cd $SCRIPT_DIR && npm start"
echo ""
echo "📍 Installed at: $INSTALLED_DESKTOP"
echo ""
