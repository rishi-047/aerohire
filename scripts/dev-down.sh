#!/usr/bin/env bash
set -euo pipefail

echo "=== AeroHire Dev Servers — Stopping ==="

for PORT in 8000 5174; do
  PIDS=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Killing process(es) on port $PORT: $PIDS"
    echo "$PIDS" | xargs kill 2>/dev/null || true
  else
    echo "Nothing running on port $PORT"
  fi
done

sleep 1

# Verify clean
for PORT in 8000 5174; do
  PIDS=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "WARNING: port $PORT still occupied — force-killing"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fi
done

echo "All servers stopped."
