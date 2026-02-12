# Configuration and Secrets

This file lists environment settings and hidden routes used by the PoC.

## Backend Environment Variables

File:
- `backend/.env`

Keys:
- `DATABASE_URL` default `sqlite:///./aerohire.db`
- `GEMINI_API_KEY` for AI audit
- `SECRET_KEY` for JWT signing

## Frontend Configuration

File:
- `frontend/src/lib/api.ts`

Key values:
- `API_BASE_URL` is `http://localhost:8000/api/v1`
- `ADMIN_SECRET` defaults to `aerohire-internal-ops-2026`

## Secret Admin URL

Path:
- `/admin/aerohire-internal-ops-2026`

Recommendation:
- Change the secret in production
- Gate it behind proper auth
