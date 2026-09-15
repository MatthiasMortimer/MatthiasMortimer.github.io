#!/usr/bin/env bash
# Starts the BlogRites content editor server (if not already running) and opens it in the browser.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=4555
URL="http://localhost:$PORT"

if curl -s -o /dev/null "$URL/api/files"; then
  xdg-open "$URL" >/dev/null 2>&1 &
  exit 0
fi

cd "$DIR"
if [ ! -d node_modules ]; then
  npm install --no-fund --no-audit
fi

nohup node server.js >/tmp/blogrites-content-editor.log 2>&1 &
disown
