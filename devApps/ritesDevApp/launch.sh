#!/bin/bash

# Quick launch script for the RitesDev App
# Usage: ./launch.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
	echo "📦 Installing dependencies..."
	npm install
fi

# Start the app
echo "🚀 Starting RitesDev App..."
npm start
