#!/usr/bin/env bash
set -euo pipefail

# Resolve project root (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

echo "=== AeroHire Dev Servers — Starting ==="

# Kill anything already on these ports
for PORT in 8000 5174; do
  PIDS=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Killing stale process(es) on port $PORT: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

# Start backend
echo "Starting FastAPI backend on 127.0.0.1:8000 ..."
cd "$PROJECT_ROOT/backend"
nohup python3 -m uvicorn app.main:app \
  --host 127.0.0.1 --port 8000 --reload \
  > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Start frontend
echo "Starting Vite frontend on 127.0.0.1:5174 ..."
cd "$PROJECT_ROOT/frontend"
nohup npx vite --host 127.0.0.1 --port 5174 \
  > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

# Wait for ports to bind
echo "Waiting for servers to bind ..."
for i in $(seq 1 15); do
  BACK=$(lsof -nP -iTCP:8000 -sTCP:LISTEN -t 2>/dev/null || true)
  FRONT=$(lsof -nP -iTCP:5174 -sTCP:LISTEN -t 2>/dev/null || true)
  if [ -n "$BACK" ] && [ -n "$FRONT" ]; then
    break
  fi
  sleep 1
done

# Verify
echo ""
echo "=== Verification ==="
echo "--- Port 8000 ---"
lsof -nP -iTCP:8000 -sTCP:LISTEN 2>/dev/null || echo "  FAILED: nothing listening on 8000"
echo "--- Port 5174 ---"
lsof -nP -iTCP:5174 -sTCP:LISTEN 2>/dev/null || echo "  FAILED: nothing listening on 5174"
echo ""
echo "--- curl backend ---"
curl -sI http://127.0.0.1:8000/docs | head -3
echo "--- curl frontend ---"
curl -sI http://127.0.0.1:5174 | head -3
echo ""
echo "=== URLs ==="
echo "  Backend API docs: http://127.0.0.1:8000/docs"
echo "  Frontend app:     http://127.0.0.1:5174"
echo ""
echo "Logs:"
echo "  Backend:  $LOG_DIR/backend.log"
echo "  Frontend: $LOG_DIR/frontend.log"
