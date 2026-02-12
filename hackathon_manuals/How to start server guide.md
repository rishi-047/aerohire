# How to Start Server Guide

This guide explains how to start the AeroHire backend and frontend on your local machine without needing assistance.

## Prerequisites

Backend requirements:
- Python 3.10+
- `pip` installed
- SQLite (bundled with Python)

Frontend requirements:
- Node.js 18+ and npm

Optional:
- Docker for secure code execution in production‑like mode

## Backend Setup

From the repo root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Set environment variables in `backend/.env` if needed:
- `GEMINI_API_KEY` for AI audit
- `SECRET_KEY` for JWT

## Start Backend

From the repo root:

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Backend runs at:
- `http://127.0.0.1:8000`

## Frontend Setup

From the repo root:

```bash
cd frontend
npm install
```

## Start Frontend

```bash
cd frontend
npm run dev -- --port 5174 --host 127.0.0.1
```

Frontend runs at:
- `http://127.0.0.1:5174`

## Common Ports

Backend: `8000`
Frontend: `5174`

If a port is already in use, choose another, then update frontend API base in `frontend/src/lib/api.ts` if needed.

## Reset Database (Optional)

To wipe all data:

```bash
rm backend/aerohire.db
python backend/seed_db.py
```

This recreates the schema and seeds test users.

## Seeded Accounts

These appear when you run `python backend/seed_db.py`:

Recruiter:
- Email: `recruiter@aerohire.com`
- Password: `recruiter123`

Candidate:
- Email: `john.doe@example.com`
- Password: `candidate123`

## Notes on Camera Permissions

The integrity module uses webcam access.
Browsers only allow webcam access on `localhost` or HTTPS.
Use:
- `http://127.0.0.1:5174`
or
- `http://localhost:5174`

## Stop Servers

If running in terminal, press `Ctrl+C` in each window.

If running in background, use:

```bash
pkill -f uvicorn
pkill -f vite
```
