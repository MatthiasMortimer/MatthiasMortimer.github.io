#!/usr/bin/env bash
# Launches the Site Hosting desktop app.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec npm start
