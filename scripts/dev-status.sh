#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"

echo "=== AeroHire Dev Servers — Status ==="
echo ""

echo "--- Port 8000 (Backend) ---"
lsof -nP -iTCP:8000 -sTCP:LISTEN 2>/dev/null || echo "  NOT RUNNING"
echo ""

echo "--- Port 5174 (Frontend) ---"
lsof -nP -iTCP:5174 -sTCP:LISTEN 2>/dev/null || echo "  NOT RUNNING"
echo ""

echo "--- HTTP checks ---"
printf "  Backend /docs: "
STATUS=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1:8000/docs 2>/dev/null || echo "FAIL")
echo "$STATUS"

printf "  Frontend /:    "
STATUS=$(curl -so /dev/null -w '%{http_code}' http://127.0.0.1:5174 2>/dev/null || echo "FAIL")
echo "$STATUS"

echo ""
if [ -f "$LOG_DIR/backend.log" ]; then
  echo "--- Backend log (last 20 lines) ---"
  tail -20 "$LOG_DIR/backend.log"
  echo ""
fi

if [ -f "$LOG_DIR/frontend.log" ]; then
  echo "--- Frontend log (last 20 lines) ---"
  tail -20 "$LOG_DIR/frontend.log"
fi
