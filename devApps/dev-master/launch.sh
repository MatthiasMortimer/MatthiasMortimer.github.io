#!/usr/bin/env bash
# Starts the Dev Master dashboard (if not already running) and opens it in the browser.
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=4600
URL="http://localhost:$PORT"

if curl -s -o /dev/null "$URL/api/apps"; then
  xdg-open "$URL" >/dev/null 2>&1 &
  exit 0
fi

cd "$DIR"
if [ ! -d node_modules ]; then
  npm install --no-fund --no-audit
fi

nohup node server.js >/tmp/dev-master.log 2>&1 &
disown
sleep 1
xdg-open "$URL" >/dev/null 2>&1 &
