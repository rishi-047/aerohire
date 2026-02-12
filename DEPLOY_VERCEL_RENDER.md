# Deploy AeroHire: Vercel + Render

This project is now prepared for:
- Frontend on Vercel (`frontend/`)
- Backend on Render (`backend/`)

## What was already changed
- Frontend API URL is now env-driven:
  - `frontend/src/lib/api.ts` uses `VITE_API_BASE_URL` with localhost fallback.
- Backend CORS is now env-driven:
  - `backend/app/core/config.py` has `BACKEND_CORS_ORIGINS`.
  - `backend/app/main.py` reads comma-separated origins from env.
- Render Blueprint file added:
  - `render.yaml`
- Vercel SPA config added:
  - `frontend/vercel.json`

## Prerequisites
- Internet access from your terminal.
- Vercel account (CLI auth).
- Render account (Dashboard access).
- A Git repository remote (required by Render Blueprint deployment).

## 1) Deploy Backend on Render

### Option A: Blueprint (recommended)
1. Push this project to GitHub/GitLab/Bitbucket.
2. In Render Dashboard: New -> Blueprint -> select your repo.
3. Render detects `render.yaml`.
4. Set env vars in Render:
   - `GEMINI_API_KEY` (required for AI rationale)
   - `BACKEND_CORS_ORIGINS` (set after frontend URL is known, update later if needed)
5. Deploy and copy backend URL (example):
   - `https://aerohire-backend.onrender.com`

### Option B: Manual Web Service
1. New -> Web Service -> connect repo.
2. Root directory: `backend`
3. Build command:
   - `pip install -r requirements.txt`
4. Start command:
   - `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add env vars:
   - `DATABASE_URL=sqlite:///./aerohire.db`
   - `SECRET_KEY=<random-long-secret>`
   - `ACCESS_TOKEN_EXPIRE_MINUTES=30`
   - `GEMINI_API_KEY=<your-key>`
   - `BACKEND_CORS_ORIGINS=<vercel-url>`

## 2) Deploy Frontend on Vercel

Run from `frontend/`:

```bash
cd "/Users/junixr/Documents/SRM Innovation Hackathon V2/AeroHire Product/frontend"
npx vercel login
npx vercel link
npx vercel env add VITE_API_BASE_URL
# value should be: https://<your-render-backend>/api/v1
npx vercel deploy -y
```

For production promotion:

```bash
npx vercel deploy --prod -y
```

## 3) Final wiring check
- Open frontend URL from Vercel.
- Login/register flow should hit Render backend.
- If CORS fails, update Render env:
  - `BACKEND_CORS_ORIGINS=https://<your-vercel-domain>`
  - redeploy Render service.

## 4) Validate endpoints

```bash
curl -I https://<your-render-backend>/docs
curl -I https://<your-vercel-domain>
```

## Known production caveats
- SQLite on Render is ephemeral on free tiers; switch to Postgres for persistence.
- `frontend` bundle is large (~915KB JS); consider code splitting later.
