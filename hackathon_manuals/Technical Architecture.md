# Technical Architecture

This document describes the system architecture and design decisions.

## Stack Overview

Frontend:
- React 19
- Vite 7
- TypeScript
- Tailwind CSS 4
- Recharts
- Monaco Editor
- Framer Motion

Backend:
- FastAPI
- SQLAlchemy
- SQLite
- Google Gemini SDK
- pdfplumber
- Docker SDK

## System Boundaries

The frontend is a single page application.
The backend is a REST API with JWT auth.
The database is local SQLite.
AI calls are server‑side.

## Major Subsystems

Assessment engine:
- Executes code in a Docker sandbox
- Records submissions and test results

Resume parser:
- Extracts sections from PDF using anchors
- Produces skills, experience, education zones

Integrity system:
- Logs telemetry events
- Computes integrity score
- Visualizes timeline

Glass Box AI:
- Gemini prompt with strict output format
- Cached using data hashes
- Includes resume alignment checks

## Key Files

Backend:
- `backend/app/main.py` app init and CORS
- `backend/app/api/api.py` router aggregator
- `backend/app/api/v1/assessment.py` assessment APIs
- `backend/app/api/v1/dashboard.py` recruiter APIs
- `backend/app/services/glass_box.py` AI logic
- `backend/app/services/zone_parser.py` resume parsing
- `backend/app/services/docker_sandbox.py` secure code execution

Frontend:
- `frontend/src/App.tsx` routes
- `frontend/src/lib/api.ts` API client
- `frontend/src/pages/Assessment.tsx` assessment UI
- `frontend/src/pages/CandidateDetail.tsx` recruiter detail view

## Design Choices and Tradeoffs

Resume parsing:
- Chosen: anchor‑based parsing for speed and transparency
- Alternative: heavy NLP models, higher accuracy but more cost and complexity

Code execution:
- Chosen: Docker sandbox for isolation
- Alternative: third‑party judge, but higher latency and cost

Face detection:
- Chosen: browser `FaceDetector` + motion diff fallback
- Alternative: MediaPipe or face‑api, but requires network install or heavier bundles

AI audit:
- Chosen: Gemini with strict formatting and resume comparison
- Alternative: rule‑based only, but less convincing to judges

## Security Notes

JWT auth protects all user routes except the secret admin console.
The secret admin URL is intentionally hidden and should not be exposed publicly.
